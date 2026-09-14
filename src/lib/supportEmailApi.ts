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
}

export interface SupportStatusResponse {
  configured: boolean;
  supportEmail: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  totalMessages: number;
  unreadMessages: number;
  missingConfiguration: string[];
}

function getAuthHeader(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchSupportStatus(token: string | null): Promise<SupportStatusResponse> {
  try {
    const res = await fetch('/api/admin/support/status', {
      headers: getAuthHeader(token)
    });
    if (!res.ok) {
      throw new Error(`Status check failed (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    return {
      configured: false,
      supportEmail: 'support@piflixplus.network',
      imapHost: 'imap.piflixplus.network',
      imapPort: 993,
      smtpHost: 'smtp.piflixplus.network',
      smtpPort: 465,
      totalMessages: 0,
      unreadMessages: 0,
      missingConfiguration: ['Network or server connection issue']
    };
  }
}

export async function fetchSupportMessages(token: string | null): Promise<{
  messages: SupportEmailMessage[];
  status: SupportStatusResponse;
}> {
  const res = await fetch('/api/admin/support/messages', {
    headers: getAuthHeader(token)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch support messages (${res.status})`);
  }
  const data = await res.json();
  return {
    messages: data.messages || [],
    status: data.status
  };
}

export async function syncSupportMailbox(token: string | null): Promise<{
  success: boolean;
  newCount: number;
  totalCount: number;
  messages: SupportEmailMessage[];
  status: SupportStatusResponse;
  error?: string;
}> {
  const res = await fetch('/api/admin/support/sync', {
    method: 'POST',
    headers: getAuthHeader(token)
  });
  const data = await res.json();
  return data;
}

export async function sendSupportReply(
  token: string | null,
  params: { messageId: string; to: string; subject: string; replyBody: string }
): Promise<{
  success: boolean;
  reply?: EmailThreadItem;
  message?: SupportEmailMessage;
  error?: string;
}> {
  const res = await fetch('/api/admin/support/reply', {
    method: 'POST',
    headers: getAuthHeader(token),
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to transmit email reply');
  }
  return data;
}

export async function markSupportMessageRead(
  token: string | null,
  messageId: string,
  read: boolean
): Promise<{ success: boolean }> {
  const res = await fetch('/api/admin/support/mark-read', {
    method: 'POST',
    headers: getAuthHeader(token),
    body: JSON.stringify({ messageId, read })
  });
  return await res.json();
}
