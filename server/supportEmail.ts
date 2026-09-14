import nodemailer, { SendMailOptions } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface EmailThreadItem {
  id: string;
  sender: string;
  senderEmail: string;
  recipientEmail: string;
  body: string;
  html?: string;
  date: string;
  isReply: boolean;
  adminName?: string;
}

export interface SupportEmailMessage {
  id: string;
  uid?: number;
  messageId?: string;
  from: string;
  fromEmail: string;
  fromName?: string;
  to: string;
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  read: boolean;
  replies: EmailThreadItem[];
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'support_messages.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache synced to filesystem
let cachedMessages: SupportEmailMessage[] = [];

function loadStoredMessages(): SupportEmailMessage[] {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const raw = fs.readFileSync(MESSAGES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[Support Email] Error loading stored messages:', err);
  }
  return [];
}

function persistStoredMessages(messages: SupportEmailMessage[]) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Support Email] Error saving messages to file:', err);
  }
}

// Initialize messages on module load
cachedMessages = loadStoredMessages();

export function getEmailConfig() {
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@piflixplus.network';
  const password = process.env.SUPPORT_EMAIL_PASSWORD || process.env.IMAP_PASSWORD || process.env.SMTP_PASSWORD || '';
  const imapHost = process.env.IMAP_HOST || 'imap.piflixplus.network';
  const imapPort = parseInt(process.env.IMAP_PORT || '993', 10);
  const imapSecure = process.env.IMAP_SECURE !== 'false';
  
  const smtpHost = process.env.SMTP_HOST || 'smtp.piflixplus.network';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpSecure = process.env.SMTP_SECURE !== 'false';
  const smtpUser = process.env.SMTP_USER || supportEmail;
  const smtpPassword = process.env.SMTP_PASSWORD || password;

  const isConfigured = Boolean(password && password.trim().length > 0);

  return {
    supportEmail,
    password,
    imapHost,
    imapPort,
    imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    isConfigured
  };
}

export function getEmailStatus() {
  const config = getEmailConfig();
  const unreadCount = cachedMessages.filter(m => !m.read).length;
  const totalCount = cachedMessages.length;

  return {
    configured: config.isConfigured,
    supportEmail: config.supportEmail,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    totalMessages: totalCount,
    unreadMessages: unreadCount,
    missingConfiguration: config.isConfigured
      ? []
      : [
          'SUPPORT_EMAIL_PASSWORD (or IMAP_PASSWORD / SMTP_PASSWORD)',
          'IMAP_HOST (default: imap.piflixplus.network)',
          'SMTP_HOST (default: smtp.piflixplus.network)'
        ]
  };
}

export function getAllMessages(): SupportEmailMessage[] {
  // Sort descending by receivedAt
  return [...cachedMessages].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
}

export async function syncMailbox(): Promise<{
  success: boolean;
  newCount: number;
  totalCount: number;
  error?: string;
}> {
  const config = getEmailConfig();

  if (!config.isConfigured) {
    return {
      success: false,
      newCount: 0,
      totalCount: cachedMessages.length,
      error: 'Mailbox provider credentials are not configured in environment variables. Please set SUPPORT_EMAIL_PASSWORD in Secrets/Settings to synchronize real emails.'
    };
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.supportEmail,
      pass: config.password
    },
    logger: false
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const mailbox = client.mailbox;
      if (!mailbox || mailbox.exists === 0) {
        return {
          success: true,
          newCount: 0,
          totalCount: cachedMessages.length
        };
      }

      // Fetch the most recent up to 50 messages
      const startSeq = Math.max(1, mailbox.exists - 49);
      const fetchRange = `${startSeq}:*`;

      let newlyAdded = 0;

      for await (const message of client.fetch(fetchRange, {
        envelope: true,
        flags: true,
        source: false,
        bodyStructure: true
      })) {
        const envelope = message.envelope;
        if (!envelope) continue;

        const rawMessageId = envelope.messageId || `msg_${message.uid}_${message.seq}`;
        // Deterministic ID safe for file system and database keys
        const cleanId = 'mail_' + crypto.createHash('sha256').update(rawMessageId).digest('hex').substring(0, 24);

        const fromAddress = envelope.from?.[0]?.address || 'unknown@sender.com';
        const fromName = envelope.from?.[0]?.name || fromAddress;
        const subject = envelope.subject || '(No Subject)';
        const receivedAt = envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString();

        // Check if message already exists
        const existingIdx = cachedMessages.findIndex(m => m.id === cleanId || m.messageId === rawMessageId);

        if (existingIdx >= 0) {
          // Keep existing read state and replies! Never overwrite admin conversation
          continue;
        }

        // Download body text parts
        let bodyText = '';
        try {
          const download = await client.download(message.seq.toString(), undefined, { maxBytes: 100000 });
          if (download && download.content) {
            const chunks: Buffer[] = [];
            for await (const chunk of download.content) {
              chunks.push(Buffer.from(chunk));
            }
            bodyText = Buffer.concat(chunks).toString('utf-8');
            // Clean basic mime headers if present
            const headerEnd = bodyText.indexOf('\r\n\r\n');
            if (headerEnd > 0) {
              bodyText = bodyText.substring(headerEnd + 4).trim();
            }
          }
        } catch (downloadErr) {
          console.warn(`[Support Email] Could not download full body for ${message.seq}:`, downloadErr);
          bodyText = `Email received from ${fromAddress} on ${new Date(receivedAt).toLocaleString()}. Subject: ${subject}`;
        }

        const snippet = bodyText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 140) || subject;

        const isSeen = message.flags ? message.flags.has('\\Seen') : false;

        const newMessage: SupportEmailMessage = {
          id: cleanId,
          uid: message.uid,
          messageId: rawMessageId,
          from: fromName,
          fromEmail: fromAddress,
          fromName,
          to: config.supportEmail,
          subject,
          snippet,
          bodyText: bodyText || `(No body text preview available)`,
          receivedAt,
          read: isSeen,
          replies: [],
          inReplyTo: envelope.inReplyTo || undefined
        };

        cachedMessages.push(newMessage);
        newlyAdded++;
      }

      if (newlyAdded > 0) {
        persistStoredMessages(cachedMessages);
      }

      return {
        success: true,
        newCount: newlyAdded,
        totalCount: cachedMessages.length
      };
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.error('[Support Email] IMAP sync error:', err);
    return {
      success: false,
      newCount: 0,
      totalCount: cachedMessages.length,
      error: `IMAP connection error to ${config.imapHost}: ${err?.message || 'Failed to authenticate with mailbox server'}`
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout cleanup error
    }
  }
}

export async function sendReply(params: {
  messageId: string;
  to: string;
  subject: string;
  replyBody: string;
  adminEmail: string;
}): Promise<{
  success: boolean;
  reply?: EmailThreadItem;
  message?: SupportEmailMessage;
  error?: string;
}> {
  const { messageId, to, subject, replyBody, adminEmail } = params;

  if (!replyBody || !replyBody.trim()) {
    return { success: false, error: 'Reply message body cannot be empty.' };
  }

  if (!to || !to.includes('@')) {
    return { success: false, error: 'Recipient email address is invalid.' };
  }

  const targetMessage = cachedMessages.find(m => m.id === messageId);
  if (!targetMessage) {
    return { success: false, error: 'Target email record not found.' };
  }

  const config = getEmailConfig();

  if (!config.isConfigured) {
    return {
      success: false,
      error: 'SMTP email provider not configured. Please add SUPPORT_EMAIL_PASSWORD to Secrets/Settings to send outgoing emails from support@piflixplus.network.'
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword
      }
    });

    const cleanSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    const mailOptions: SendMailOptions = {
      from: `"PiFlix+ Support" <${config.supportEmail}>`,
      to,
      subject: cleanSubject,
      text: replyBody,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="border-bottom: 2px solid #8b5cf6; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #6d28d9; font-size: 20px;">PiFlix+ Support</h2>
            <p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">Pioneer Customer Support</p>
          </div>
          <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #0f172a;">
${replyBody}
          </div>
          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0;">This email was sent by PiFlix+ Support in response to your inquiry.</p>
            <p style="margin: 4px 0 0;">Official Support: <a href="mailto:${config.supportEmail}" style="color: #8b5cf6; text-decoration: none;">${config.supportEmail}</a> &bull; Website: <a href="https://piflixplus.network" style="color: #8b5cf6; text-decoration: none;">piflixplus.network</a></p>
          </div>
        </div>
      `,
      inReplyTo: targetMessage.messageId || undefined,
      references: targetMessage.messageId ? [targetMessage.messageId] : undefined
    };

    await transporter.sendMail(mailOptions);

    const replyItem: EmailThreadItem = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      sender: 'PiFlix+ Support',
      senderEmail: config.supportEmail,
      recipientEmail: to,
      body: replyBody.trim(),
      date: new Date().toISOString(),
      isReply: true,
      adminName: adminEmail || 'Administrator'
    };

    if (!targetMessage.replies) {
      targetMessage.replies = [];
    }
    targetMessage.replies.push(replyItem);
    targetMessage.read = true; // Auto-mark as read when replied

    persistStoredMessages(cachedMessages);

    return {
      success: true,
      reply: replyItem,
      message: targetMessage
    };
  } catch (err: any) {
    console.error('[Support Email] SMTP sending error:', err);
    return {
      success: false,
      error: `Failed to send email via ${config.smtpHost}: ${err?.message || 'SMTP transmission failure'}`
    };
  }
}

export function setMessageReadStatus(messageId: string, read: boolean): boolean {
  const target = cachedMessages.find(m => m.id === messageId);
  if (target) {
    target.read = read;
    persistStoredMessages(cachedMessages);
    return true;
  }
  return false;
}
