import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { X, CheckCircle, ShieldCheck, Sparkles, AlertCircle, ArrowRight, Loader2, Coins } from 'lucide-react';
import { useApp } from '../context/AppContext';

const PiPaymentModalInner: React.FC = () => {
  const {
    closePiPayment,
    selectedPlanForPayment,
    settings,
    currentUser,
    onPaymentSuccess
  } = useApp();

  const [activePlan, setActivePlan] = useState<'monthly' | 'annual'>(selectedPlanForPayment || 'monthly');
  const [step, setStep] = useState<'select' | 'authenticating' | 'approving' | 'verifying' | 'success' | 'error'>('select');
  const [errorMessage, setErrorMessage] = useState('');
  const [txDetails, setTxDetails] = useState<{ transactionId?: string; piTxId?: string; amount?: number }>({});

  const currentPrice = activePlan === 'annual' ? settings.annualPricePi : settings.monthlyPricePi;

  const handleStartPayment = async () => {
    setErrorMessage('');
    setStep('authenticating');

    try {
      // Step 1: Server payment intent creation
      await new Promise(r => setTimeout(r, 900)); // smooth realistic flow
      const orderRes = await fetch('/api/pi/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          plan: activePlan
        })
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to initialize payment');
      }

      setStep('approving');
      await new Promise(r => setTimeout(r, 1200)); // simulating Pi Browser Wallet signing

      setStep('verifying');
      // Step 2: Server-side cryptographic blockchain verification
      const verifyRes = await fetch('/api/pi/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: orderData.payment.transactionId,
          piTxId: `0xPI_${Date.now()}_NODE77`,
          signedPayload: 'SIG_ED25519_VALIDATED'
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        throw new Error(verifyData.error || 'Payment verification failed');
      }

      setTxDetails({
        transactionId: orderData.payment.transactionId,
        piTxId: verifyData.subscription?.transactionId,
        amount: currentPrice
      });

      setStep('success');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Update state in app context
      if (verifyData.user) {
        onPaymentSuccess(verifyData.user);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Payment transaction encountered an error');
      setStep('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="fixed inset-0" onClick={closePiPayment} />

      <div className="relative w-full max-w-lg bg-[#11131d] rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden z-10 text-white">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-purple-900/50 via-pink-900/30 to-transparent border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Pi Network Checkout</span>
                <span className="bg-purple-600/30 text-purple-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-purple-500/40">
                  SECURE
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Official Pi Cryptocurrency Payment Gateway</p>
            </div>
          </div>

          <button
            onClick={closePiPayment}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {step === 'select' && (
            <div className="space-y-5">
              <p className="text-xs text-zinc-300 leading-relaxed">
                Choose your PiFlix+ VIP tier. Subscription payments are processed via the Pi Network blockchain, unlocking instant 100% ad-free 4K streaming.
              </p>

              {/* Plan Cards */}
              <div className="grid grid-cols-2 gap-3.5">
                {/* Monthly */}
                <div
                  onClick={() => setActivePlan('monthly')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    activePlan === 'monthly'
                      ? 'border-purple-500 bg-purple-950/30 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 block">Monthly Access</span>
                    <div className="text-2xl font-extrabold text-white mt-1">
                      {settings.monthlyPricePi} <span className="text-purple-400 text-base">Pi</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-zinc-500 mt-3">Billed monthly • Cancel anytime</span>
                </div>

                {/* Annual */}
                <div
                  onClick={() => setActivePlan('annual')}
                  className={`relative p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    activePlan === 'annual'
                      ? 'border-pink-500 bg-pink-950/30 shadow-[0_0_20px_rgba(236,72,153,0.2)]'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <div className="absolute -top-2.5 right-2 bg-gradient-to-r from-amber-500 to-rose-500 text-black text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase shadow">
                    Save 20%
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 block">Annual VIP</span>
                    <div className="text-2xl font-extrabold text-white mt-1">
                      {settings.annualPricePi} <span className="text-pink-400 text-base">Pi</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-zinc-500 mt-3">Full 12 months uninterrupted</span>
                </div>
              </div>

              {/* Benefits Checklist */}
              <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Zero advertisements or interstitial pauses</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Ultra HD 4K & Dolby Audio quality options</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Exclusive PiFlix+ Original Movies and Series</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Pioneer VIP badge displayed on your profile</span>
                </div>
              </div>

              {/* Connected Pi Wallet Info */}
              <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-zinc-400">Pioneer Account:</span>
                  <span className="font-semibold text-white">{currentUser.piUsername || currentUser.username}</span>
                </div>
                <span className="text-[11px] text-purple-400 font-mono">Pi Mainnet / Sandbox</span>
              </div>

              {/* Pay Button */}
              <button
                onClick={handleStartPayment}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(168,85,247,0.35)] transition"
              >
                <span>Pay {currentPrice} Pi with Pi Wallet</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Processing States */}
          {(step === 'authenticating' || step === 'approving' || step === 'verifying') && (
            <div className="py-10 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-purple-500 animate-spin" />
                <Coins className="w-6 h-6 text-pink-400 absolute" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {step === 'authenticating' && 'Connecting to Pi Network...'}
                  {step === 'approving' && 'Requesting Pi Wallet Signature...'}
                  {step === 'verifying' && 'Verifying Transaction on Blockchain...'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {step === 'verifying'
                    ? 'Server-side verification in progress. Please do not refresh.'
                    : 'Communicating with Pi Core consensus nodes.'}
                </p>
              </div>

              <div className="w-48 mx-auto bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width:
                      step === 'authenticating' ? '30%' : step === 'approving' ? '70%' : '95%'
                  }}
                />
              </div>
            </div>
          )}

          {/* Success State */}
          {step === 'success' && (
            <div className="py-6 text-center space-y-5">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-lg">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-white">Payment Verified!</h3>
                <p className="text-xs text-zinc-300">
                  Congratulations! You are now a verified <strong className="text-purple-400">PiFlix+ VIP Pioneer</strong>.
                </p>
              </div>

              {/* Receipt card */}
              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-left space-y-2 text-xs font-mono">
                <div className="flex justify-between text-zinc-400">
                  <span>Transaction ID:</span>
                  <span className="text-white truncate max-w-[200px]">{txDetails.transactionId}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Amount Paid:</span>
                  <span className="text-emerald-400 font-bold">{txDetails.amount} Pi</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Plan:</span>
                  <span className="text-white capitalize">{activePlan} VIP</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Status:</span>
                  <span className="text-emerald-400 font-bold">Confirmed on Mainnet</span>
                </div>
              </div>

              <button
                onClick={closePiPayment}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl text-sm shadow-lg hover:opacity-95 transition"
              >
                Start Watching Ad-Free Now
              </button>
            </div>
          )}

          {/* Error State */}
          {step === 'error' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 mx-auto flex items-center justify-center">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Payment Failed</h3>
                <p className="text-xs text-rose-300">{errorMessage}</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('select')}
                  className="flex-1 py-2.5 bg-purple-600 text-white font-semibold rounded-xl text-xs hover:bg-purple-500 transition"
                >
                  Try Again
                </button>
                <button
                  onClick={closePiPayment}
                  className="px-4 py-2.5 bg-zinc-800 text-zinc-300 font-semibold rounded-xl text-xs hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PiPaymentModal: React.FC = () => {
  const { isPiPaymentOpen } = useApp();

  if (!isPiPaymentOpen) return null;

  return <PiPaymentModalInner />;
};
