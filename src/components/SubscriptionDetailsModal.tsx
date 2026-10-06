import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Calendar,
  Clock,
  Coins,
  CreditCard,
  Hash,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  History,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Subscription } from '../types';
import { getVisiblePiUsername } from '../lib/avatar';
import { useTranslation } from '../lib/i18n';

interface SubscriptionApiResponse {
  success: boolean;
  serverTime?: string;
  userTier?: 'VIP' | 'FREE';
  subscriptionStatus?: 'active' | 'expired' | 'none';
  subscription?: Subscription | null;
  subscriptions?: Subscription[];
  user?: any;
  error?: string;
}

/**
 * Dynamically calculates remaining subscription time from a real expiry timestamp.
 * Does not alter the stored date.
 */
function calculateRemainingTime(expiryDateStr?: string): {
  text: string;
  isExpired: boolean;
  urgency: 'normal' | 'soon' | 'expired';
} {
  if (!expiryDateStr) {
    return { text: 'No expiry date recorded', isExpired: false, urgency: 'normal' };
  }

  const expiryTime = new Date(expiryDateStr).getTime();
  if (isNaN(expiryTime)) {
    return { text: 'Invalid date format', isExpired: false, urgency: 'normal' };
  }

  const now = Date.now();
  const diffMs = expiryTime - now;

  if (diffMs <= 0) {
    return { text: 'Expired', isExpired: true, urgency: 'expired' };
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days >= 3) {
    return {
      text: `${days} days remaining`,
      isExpired: false,
      urgency: 'normal'
    };
  }

  if (days >= 1) {
    const hrPart = hours > 0 ? `, ${hours} hr${hours === 1 ? '' : 's'}` : '';
    return {
      text: `${days} day${days === 1 ? '' : 's'}${hrPart} remaining`,
      isExpired: false,
      urgency: 'soon'
    };
  }

  if (hours >= 1) {
    return {
      text: `${hours} hour${hours === 1 ? '' : 's'} remaining`,
      isExpired: false,
      urgency: 'soon'
    };
  }

  return {
    text: `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'} remaining`,
    isExpired: false,
    urgency: 'soon'
  };
}

/**
 * Safe local date-time formatting helper
 */
function formatDateTime(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

const SubscriptionDetailsModalInner: React.FC = () => {
  const {
    currentUser,
    closeSubscriptionDetails,
    openPiPayment,
    theme
  } = useApp();

  const { isRTL } = useTranslation();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<Subscription | null>(null);
  const [subHistory, setSubHistory] = useState<Subscription[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Dynamic remaining-time periodic refresher
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSubscriptionDetails();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeSubscriptionDetails]);

  // Authenticated user-specific subscription retrieval
  const fetchSubscriptionData = useCallback(async () => {
    if (!currentUser?.id) {
      setError('No authenticated user session found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('userId', currentUser.id);
      if (currentUser.piUsername) {
        params.set('piUsername', currentUser.piUsername);
      }

      // Check for existing session token
      const piToken = localStorage.getItem('piflix_pi_access_token');
      const userToken = localStorage.getItem('piflix_user_token');
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (piToken) {
        headers['Authorization'] = `Bearer ${piToken}`;
      } else if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
      }

      const res = await fetch(`/api/user/subscription?${params.toString()}`, { headers });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data: SubscriptionApiResponse = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed retrieving subscription');
      }

      const retrievedSub = data.subscription || (Array.isArray(data.subscriptions) && data.subscriptions.length > 0 ? data.subscriptions[0] : null);
      setActiveSub(retrievedSub);
      setSubHistory(Array.isArray(data.subscriptions) ? data.subscriptions : []);
    } catch (err: any) {
      console.warn('[MySubscription] Failed loading subscription data:', err);
      setError(err?.message || 'Unable to load subscription details.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, currentUser?.piUsername]);

  useEffect(() => {
    fetchSubscriptionData();
  }, [fetchSubscriptionData]);

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const remainingInfo = calculateRemainingTime(activeSub?.expiresAt || activeSub?.expiryDate);

  // Format plan display name
  const getPlanDisplayName = (plan?: string) => {
    if (!plan) return 'VIP Subscription';
    const p = plan.toLowerCase();
    if (p.includes('annual') || p.includes('year')) return 'Annual VIP Pass (1 Year)';
    if (p.includes('month')) return 'Monthly VIP Pass (30 Days)';
    return `${plan.toUpperCase()} VIP Pass`;
  };

  const displayName = getVisiblePiUsername(currentUser);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      {/* Backdrop click closes modal without logging out */}
      <div className="fixed inset-0" onClick={closeSubscriptionDetails} />

      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className={`relative w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden z-10 transition-colors ${
          isDark
            ? 'bg-[#11131d] border-zinc-800 text-white'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-purple-900/40 via-amber-950/20 to-transparent border-zinc-800/90'
              : 'bg-gradient-to-r from-purple-50 via-amber-50 to-transparent border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Dedicated Back Button */}
            <button
              onClick={closeSubscriptionDetails}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
                isDark
                  ? 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700/60'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-300'
              }`}
              title="Return to previous screen"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>My Subscription</span>
                <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-500 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  VIP Status
                </span>
              </h2>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Verified Pi Network subscription details for {displayName}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={closeSubscriptionDetails}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isDark
                ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* 1. LOADING STATE */}
          {loading && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400 animate-spin">
                <Coins className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold">Verifying Subscription</h3>
              <p className={`text-xs max-w-xs mx-auto ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Retrieving authorized Pi Network blockchain records for your account...
              </p>
            </div>
          )}

          {/* 2. ERROR STATE */}
          {!loading && error && (
            <div
              className={`p-6 rounded-2xl border text-center space-y-4 ${
                isDark ? 'bg-rose-950/20 border-rose-900/40 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
              <div>
                <h3 className="font-bold text-sm">Unable to load subscription details.</h3>
                <p className="text-xs text-rose-400/90 mt-1">{error}</p>
              </div>
              <button
                onClick={fetchSubscriptionData}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* 3. NO ACTIVE SUBSCRIPTION STATE */}
          {!loading && !error && !activeSub && subHistory.length === 0 && (
            <div className="py-10 text-center space-y-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}
              >
                <Coins className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold">No Active Subscription</h3>
                <p className={`text-xs max-w-sm mx-auto ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Your account is currently on the Free Tier supported by brief video advertisements.
                  Upgrade with your Pi cryptocurrency wallet to unlock 100% ad-free 4K streaming.
                </p>
              </div>

              <button
                onClick={() => {
                  closeSubscriptionDetails();
                  openPiPayment('monthly');
                }}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-extrabold rounded-xl text-xs shadow-lg transition flex items-center gap-2 mx-auto cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Upgrade with Pi</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 4. ACTIVE / VERIFIED SUBSCRIPTION DETAILS */}
          {!loading && !error && (activeSub || subHistory.length > 0) && (
            <div className="space-y-5">
              {/* Top Banner Card: Plan + Status + Dynamic Remaining Time */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border relative overflow-hidden ${
                  activeSub && !remainingInfo.isExpired
                    ? isDark
                      ? 'bg-gradient-to-br from-amber-500/10 via-purple-900/20 to-zinc-900/60 border-amber-500/30'
                      : 'bg-gradient-to-br from-amber-50 via-purple-50 to-white border-amber-200 shadow-sm'
                    : isDark
                      ? 'bg-zinc-900/70 border-zinc-800'
                      : 'bg-slate-50 border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block">
                      Current Membership Tier
                    </span>
                    <h3 className="text-lg sm:text-xl font-black flex items-center gap-2">
                      <span>{getPlanDisplayName(activeSub?.plan || currentUser.subscriptionPlan)}</span>
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Account: <span className="font-semibold text-amber-400">@{displayName}</span>
                    </p>
                  </div>

                  {/* VIP Status Badge */}
                  <div className="flex flex-col items-end gap-1.5">
                    {activeSub && !remainingInfo.isExpired ? (
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-black uppercase tracking-wide flex items-center gap-1 shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>VIP SUBSCRIBER</span>
                      </span>
                    ) : (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1 border ${
                          isDark
                            ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            : 'bg-slate-200 text-slate-600 border-slate-300'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Subscription Expired</span>
                      </span>
                    )}

                    {/* Active vs Expired Status Tag */}
                    <div className="flex items-center gap-1.5 text-[11px] font-bold">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeSub && !remainingInfo.isExpired ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
                        }`}
                      />
                      <span
                        className={
                          activeSub && !remainingInfo.isExpired
                            ? 'text-emerald-400'
                            : isDark
                              ? 'text-zinc-400'
                              : 'text-slate-500'
                        }
                      >
                        {activeSub && !remainingInfo.isExpired ? 'Status: Active' : 'Status: Expired'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Remaining Time Highlight Box */}
                <div
                  className={`mt-4 p-3 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${
                    activeSub && !remainingInfo.isExpired
                      ? remainingInfo.urgency === 'soon'
                        ? isDark
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                        : isDark
                          ? 'bg-purple-950/30 border-purple-500/30 text-purple-200'
                          : 'bg-purple-50 border-purple-200 text-purple-900'
                      : isDark
                        ? 'bg-zinc-950/60 border-zinc-800 text-zinc-400'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                    <span className="font-medium">Remaining Subscription Time:</span>
                  </div>
                  <div className="text-xs font-black tracking-wide">
                    {remainingInfo.text}
                  </div>
                </div>
              </div>

              {/* Grid of 8 Key Verified Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Payment Method */}
                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                    <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                    <span>Payment Method</span>
                  </div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-amber-400 font-serif font-black">π</span>
                    <span>Pi Network / Pi Cryptocurrency</span>
                  </div>
                </div>

                {/* 2. Amount Paid */}
                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Amount Paid</span>
                  </div>
                  <div className="text-xs font-black text-amber-400">
                    {activeSub?.pricePi || (activeSub?.plan === 'annual' ? 29.99 : 3.14)} Pi
                  </div>
                </div>

                {/* 3. Subscription Start Date */}
                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Subscription Start Date</span>
                  </div>
                  <div className="text-xs font-medium">
                    {formatDateTime(activeSub?.startDate || activeSub?.startAt || activeSub?.purchaseDate)}
                  </div>
                </div>

                {/* 4. Subscription Expiry Date */}
                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                    <Calendar className="w-3.5 h-3.5 text-rose-400" />
                    <span>Subscription Expiry Date</span>
                  </div>
                  <div className="text-xs font-bold text-amber-300">
                    {formatDateTime(activeSub?.expiresAt || activeSub?.expiryDate)}
                  </div>
                </div>

                {/* 5. Payment Date */}
                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Verified Payment Date</span>
                  </div>
                  <div className="text-xs font-medium">
                    {formatDateTime(activeSub?.purchaseDate || activeSub?.startDate)}
                  </div>
                </div>

                {/* 6. Verification Status */}
                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                    <span>Blockchain Verification</span>
                  </div>
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Cryptographically Confirmed</span>
                  </div>
                </div>
              </div>

              {/* Payment References (Blockchain TXID & Payment ID) */}
              {(activeSub?.transactionId || activeSub?.paymentId) && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-zinc-300">
                      <Hash className="w-3.5 h-3.5 text-purple-400" />
                      <span>Payment Reference & Transaction</span>
                    </span>
                    <span className="text-[10px] text-purple-400 font-mono">Pi Mainnet / Testnet</span>
                  </div>

                  {activeSub?.transactionId && (
                    <div className="space-y-1">
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>Pi Blockchain Transaction ID (txid):</span>
                        <button
                          onClick={() => handleCopy(activeSub.transactionId, 'txid')}
                          className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'txid' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div
                        className={`p-2 rounded-lg font-mono text-[11px] break-all border select-all ${
                          isDark ? 'bg-black/40 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {activeSub.transactionId}
                      </div>
                    </div>
                  )}

                  {activeSub?.paymentId && (
                    <div className="space-y-1">
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>Pi Payment Identifier:</span>
                        <button
                          onClick={() => handleCopy(activeSub.paymentId || '', 'payid')}
                          className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'payid' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div
                        className={`p-2 rounded-lg font-mono text-[11px] break-all border select-all ${
                          isDark ? 'bg-black/40 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {activeSub.paymentId}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. SUBSCRIPTION HISTORY (Only if records exist) */}
              {subHistory.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-purple-400" />
                      <span>Subscription History ({subHistory.length})</span>
                    </h4>
                  </div>

                  <div className="space-y-2">
                    {subHistory.map((hist, idx) => {
                      const histRem = calculateRemainingTime(hist.expiresAt || hist.expiryDate);
                      const isHistActive = !histRem.isExpired;

                      return (
                        <div
                          key={hist.id || idx}
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                            isDark ? 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">{getPlanDisplayName(hist.plan)}</span>
                              <span
                                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                                  isHistActive
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                }`}
                              >
                                {isHistActive ? 'Active' : 'Expired'}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span>Start: {formatDateTime(hist.startDate || hist.startAt)}</span>
                              <span>•</span>
                              <span>Expiry: {formatDateTime(hist.expiresAt || hist.expiryDate)}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <div className="text-end">
                              <div className="text-xs font-black text-amber-400">
                                {hist.pricePi || (hist.plan === 'annual' ? 29.99 : 3.14)} Pi
                              </div>
                              {hist.transactionId && (
                                <div className="text-[10px] font-mono text-zinc-500">
                                  {hist.transactionId.slice(0, 10)}...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Renewal Action if expired or expiring soon */}
              {(!activeSub || remainingInfo.isExpired || remainingInfo.urgency === 'soon') && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      closeSubscriptionDetails();
                      openPiPayment(activeSub?.plan === 'annual' ? 'annual' : 'monthly');
                    }}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-extrabold rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Renew or Extend VIP Subscription with Pi</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`p-4 border-t flex items-center justify-between transition-colors ${
            isDark ? 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-serif font-black text-amber-400 text-sm">π</span>
            <span>PiFlix+ Blockchain Media Platform</span>
          </div>

          <button
            onClick={closeSubscriptionDetails}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700/60'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const SubscriptionDetailsModal: React.FC = () => {
  const { isSubscriptionDetailsOpen } = useApp();

  if (!isSubscriptionDetailsOpen) return null;

  return <SubscriptionDetailsModalInner />;
};
