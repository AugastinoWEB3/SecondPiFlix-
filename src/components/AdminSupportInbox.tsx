import React, { useState, useEffect } from 'react';
import {
  Mail, Inbox, Send, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  User, Reply, Check, Search, Filter, ShieldAlert, ArrowLeft, ExternalLink
} from 'lucide-react';
import {
  SupportEmailMessage, SupportStatusResponse, EmailThreadItem,
  fetchSupportMessages, syncSupportMailbox, sendSupportReply, markSupportMessageRead, fetchSupportStatus
} from '../lib/supportEmailApi';

interface AdminSupportInboxProps {
  adminToken: string | null;
  currentUserEmail: string;
}

export const AdminSupportInbox: React.FC<AdminSupportInboxProps> = ({ adminToken, currentUserEmail }) => {
  const [messages, setMessages] = useState<SupportEmailMessage[]>([]);
  const [status, setStatus] = useState<SupportStatusResponse | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // Loading & Sync states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  // Reply Composer states
  const [replyBody, setReplyBody] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

  // Filter & Search
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Initial load
  useEffect(() => {
    loadData();
  }, [adminToken]);

  const loadData = async () => {
    setIsLoading(true);
    setSyncError(null);
    try {
      const data = await fetchSupportMessages(adminToken);
      setMessages(data.messages);
      setStatus(data.status);
      if (data.messages.length > 0 && !selectedMessageId) {
        setSelectedMessageId(data.messages[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching support messages:', err);
      // Try to at least get status
      const statusData = await fetchSupportStatus(adminToken);
      setStatus(statusData);
      setSyncError(err.message || 'Failed to connect to support email API');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncMailbox = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const res = await syncSupportMailbox(adminToken);
      setStatus(res.status);
      setMessages(res.messages);

      if (res.error) {
        setSyncError(res.error);
      } else {
        setSyncSuccess(`Sync complete! ${res.newCount} new email(s) retrieved.`);
        setTimeout(() => setSyncSuccess(null), 5000);
      }
    } catch (err: any) {
      setSyncError(err?.message || 'Failed to sync with IMAP mailbox');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleRead = async (message: SupportEmailMessage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !message.read;
    // Optimistic update
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, read: newStatus } : m));
    try {
      await markSupportMessageRead(adminToken, message.id, newStatus);
    } catch (err) {
      // Revert on error
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, read: !newStatus } : m));
    }
  };

  const handleSelectMessage = (message: SupportEmailMessage) => {
    setSelectedMessageId(message.id);
    setReplyError(null);
    setReplySuccess(null);
    if (!message.read) {
      handleToggleRead(message);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMessage) return;
    if (!replyBody.trim()) {
      setReplyError('Please write a reply message before sending.');
      return;
    }

    setIsSendingReply(true);
    setReplyError(null);
    setReplySuccess(null);

    try {
      const res = await sendSupportReply(adminToken, {
        messageId: selectedMessage.id,
        to: selectedMessage.fromEmail,
        subject: selectedMessage.subject,
        replyBody: replyBody.trim()
      });

      if (res.success && res.reply) {
        // Update local state with the sent reply
        setMessages(prev => prev.map(m => {
          if (m.id === selectedMessage.id) {
            return {
              ...m,
              read: true,
              replies: [...(m.replies || []), res.reply!]
            };
          }
          return m;
        }));
        setReplyBody('');
        setReplySuccess(`Reply successfully transmitted via SMTP to ${selectedMessage.fromEmail}!`);
        setTimeout(() => setReplySuccess(null), 6000);
      } else {
        setReplyError(res.error || 'Failed to send reply');
      }
    } catch (err: any) {
      setReplyError(err?.message || 'SMTP transmission error. Check server logs.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const selectedMessage = messages.find(m => m.id === selectedMessageId);

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (activeFilter === 'unread' && msg.read) return false;
    if (activeFilter === 'read' && !msg.read) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSubject = msg.subject?.toLowerCase().includes(q);
      const matchFrom = msg.from?.toLowerCase().includes(q) || msg.fromEmail?.toLowerCase().includes(q);
      const matchBody = msg.bodyText?.toLowerCase().includes(q);
      return matchSubject || matchFrom || matchBody;
    }
    return true;
  });

  const unreadCount = messages.filter(m => !m.read).length;

  return (
    <div className="space-y-4">
      {/* Mailbox Header & Status Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">Support Mailbox</h2>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-purple-300">
                  {status?.supportEmail || 'support@piflixplus.network'}
                </span>
                {status?.configured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    Needs Mailbox Credentials
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Pioneer inquiries sent to <span className="text-zinc-200">support@piflixplus.network</span> with direct SMTP reply delivery.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleSyncMailbox}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-900/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Connecting to Mailbox...' : 'Sync Mailbox'}</span>
            </button>
          </div>
        </div>

        {/* Configuration Notice if credentials are not yet configured in environment */}
        {!status?.configured && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-300">Live Mailbox Provider Setup Required</div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                To synchronize live incoming messages from <span className="font-mono text-white font-semibold">support@piflixplus.network</span>, configure the mail server credentials in your environment variables/secrets.
              </p>
              <div className="text-[10px] font-mono bg-black/40 px-2 py-1 rounded border border-amber-500/20 text-amber-300 inline-block">
                Required secrets: SUPPORT_EMAIL_PASSWORD &bull; IMAP_HOST (default: imap.piflixplus.network) &bull; SMTP_HOST (default: smtp.piflixplus.network)
              </div>
            </div>
          </div>
        )}

        {/* Feedback Banners */}
        {syncSuccess && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncSuccess}</span>
          </div>
        )}

        {syncError && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{syncError}</span>
            </div>
            <button onClick={() => setSyncError(null)} className="text-rose-400 hover:text-white">
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Main Mailbox Workspace: Left List + Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Message List (5 cols on lg) */}
        <div className={`space-y-3 lg:col-span-5 ${selectedMessageId ? 'hidden lg:block' : 'block'}`}>
          {/* Controls: Search & Tabs */}
          <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search sender, email, or subject..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/80 text-xs">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  activeFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                All ({messages.length})
              </button>
              <button
                onClick={() => setActiveFilter('unread')}
                className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                  activeFilter === 'unread'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span>Unread</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-pink-500 text-white font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveFilter('read')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  activeFilter === 'read'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                Read ({messages.filter(m => m.read).length})
              </button>
            </div>
          </div>

          {/* List of Messages */}
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="p-8 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
                <span>Checking support mailbox...</span>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-900/50 border border-zinc-800/80 text-zinc-500 text-xs space-y-2">
                <Inbox className="w-8 h-8 mx-auto text-zinc-600 opacity-60" />
                <div>
                  {searchQuery.trim() ? 'No messages match your search query.' : 'No messages in this filter.'}
                </div>
                {!status?.configured && (
                  <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                    Configure your mailbox password in Settings / Secrets and click &quot;Sync Mailbox&quot; to fetch real emails.
                  </p>
                )}
              </div>
            ) : (
              filteredMessages.map(msg => {
                const isSelected = msg.id === selectedMessageId;
                const replyCount = msg.replies?.length || 0;

                return (
                  <div
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer text-xs space-y-1.5 ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500/80 shadow-md shadow-purple-950/50'
                        : msg.read
                        ? 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700'
                        : 'bg-zinc-900 border-zinc-700 hover:border-purple-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        {!msg.read && (
                          <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" title="Unread Message" />
                        )}
                        <span className={`truncate font-bold ${msg.read ? 'text-zinc-300' : 'text-white'}`}>
                          {msg.from || msg.fromEmail}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0">
                        {new Date(msg.receivedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <div className={`truncate font-medium ${msg.read ? 'text-zinc-400' : 'text-purple-200 font-semibold'}`}>
                      {msg.subject || '(No Subject)'}
                    </div>

                    <p className="text-[11px] text-zinc-500 line-clamp-1">
                      {msg.snippet || msg.bodyText}
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500">
                      <span className="font-mono">{msg.fromEmail}</span>
                      {replyCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-purple-900/50 text-purple-300 border border-purple-700/50 flex items-center gap-1">
                          <Reply className="w-2.5 h-2.5" />
                          <span>{replyCount} repl{replyCount === 1 ? 'y' : 'ies'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Selected Message Detail & Reply Composer (7 cols on lg) */}
        <div className={`lg:col-span-7 ${!selectedMessageId ? 'hidden lg:block' : 'block'}`}>
          {!selectedMessage ? (
            <div className="p-12 text-center rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-500 text-xs flex flex-col items-center justify-center min-h-[400px]">
              <Mail className="w-12 h-12 text-zinc-700 mb-3" />
              <p className="font-medium text-zinc-400">Select an email to view full message and reply</p>
              <p className="text-[11px] text-zinc-600 mt-1">
                Real emails sent to support@piflixplus.network appear here.
              </p>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-5">
              {/* Mobile Back button */}
              <div className="lg:hidden flex items-center justify-between pb-2 border-b border-zinc-800">
                <button
                  onClick={() => setSelectedMessageId(null)}
                  className="flex items-center gap-1.5 text-xs text-purple-400 font-bold hover:underline"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Message List</span>
                </button>
              </div>

              {/* Message Header */}
              <div className="space-y-2 pb-4 border-b border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-black text-white leading-snug">
                    {selectedMessage.subject || '(No Subject)'}
                  </h3>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleRead(selectedMessage)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                        selectedMessage.read
                          ? 'border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800'
                          : 'border-pink-500/40 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20'
                      }`}
                    >
                      {selectedMessage.read ? 'Mark Unread' : 'Mark as Read'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-400">
                  <div className="space-y-0.5">
                    <div>
                      <span className="text-zinc-500">From: </span>
                      <span className="font-bold text-white">{selectedMessage.from}</span>
                      <span className="text-zinc-400 font-mono text-[11px] ml-1.5">&lt;{selectedMessage.fromEmail}&gt;</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">To: </span>
                      <span className="font-mono text-purple-300 text-[11px]">{selectedMessage.to || 'support@piflixplus.network'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{new Date(selectedMessage.receivedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Original Message Body */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Message Content</div>
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto font-sans selection:bg-purple-600">
                  {selectedMessage.bodyText}
                </div>
              </div>

              {/* Conversation History / Sent Replies Thread */}
              {selectedMessage.replies && selectedMessage.replies.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Reply className="w-3.5 h-3.5 text-purple-400" />
                    <span>Sent Responses ({selectedMessage.replies.length})</span>
                  </div>

                  <div className="space-y-2.5">
                    {selectedMessage.replies.map(reply => (
                      <div
                        key={reply.id}
                        className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/60 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-300">{reply.sender}</span>
                            <span className="text-zinc-400 font-mono text-[10px]">({reply.adminName})</span>
                          </div>
                          <span className="text-zinc-500 text-[10px]">
                            {new Date(reply.date).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed">
                          {reply.body}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Reply Composer */}
              <div className="pt-3 border-t border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-purple-400" />
                    <span>Reply to {selectedMessage.fromEmail}</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    Sender: <span className="text-purple-300 font-mono">support@piflixplus.network</span>
                  </span>
                </div>

                <form onSubmit={handleSendReply} className="space-y-3">
                  <textarea
                    rows={4}
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    placeholder={`Write your response to ${selectedMessage.from || selectedMessage.fromEmail}...`}
                    className="w-full p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 leading-relaxed"
                  />

                  {replySuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{replySuccess}</span>
                    </div>
                  )}

                  {replyError && (
                    <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{replyError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setReplyBody('')}
                      disabled={isSendingReply || !replyBody}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-40"
                    >
                      Clear
                    </button>

                    <button
                      type="submit"
                      disabled={isSendingReply || !replyBody.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition disabled:opacity-50"
                    >
                      {isSendingReply ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending via SMTP...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Reply to Sender</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
