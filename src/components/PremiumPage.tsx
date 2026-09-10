import React from 'react';
import {
  Sparkles, Check, X, ShieldCheck, Zap, Coins, ArrowRight, Play, Star, HelpCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const PremiumPage: React.FC = () => {
  const { settings, currentUser, openPiPayment, theme } = useApp();
  const isDark = theme === 'dark';

  return (
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16 animate-fade-in ${
      isDark ? 'text-white' : 'text-slate-900'
    }`}>
      {/* Hero Section */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-pink-500/20 border border-amber-500/30 text-amber-500 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>PiFlix+ VIP Pioneer Membership</span>
        </div>

        <h1 className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}>
          Stream Without Limits. Powered by <span className="bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">Pi Network</span>.
        </h1>

        <p className={`text-sm sm:text-base leading-relaxed max-w-2xl mx-auto ${
          isDark ? 'text-zinc-300' : 'text-slate-600'
        }`}>
          Say goodbye to video ad interruptions. Unlock cinematic 4K UHD streaming and exclusive PiFlix+ original releases directly with your Pi cryptocurrency wallet.
        </p>

        {currentUser.premiumStatus ? (
          <div className="pt-4 flex items-center justify-center">
            <div className="p-3 px-6 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <span>You currently have an active VIP subscription ({currentUser.subscriptionPlan?.toUpperCase()})</span>
            </div>
          </div>
        ) : (
          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => openPiPayment('monthly')}
              className="px-8 py-3.5 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-extrabold rounded-xl text-sm shadow-[0_10px_30px_rgba(236,72,153,0.35)] hover:scale-105 transition flex items-center gap-2"
            >
              <span>Get Monthly VIP ({settings.monthlyPricePi} Pi)</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => openPiPayment('annual')}
              className={`px-6 py-3.5 font-bold rounded-xl text-sm border transition ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-700'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300 shadow-xs'
              }`}
            >
              Get Annual VIP ({settings.annualPricePi} Pi)
            </button>
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Monthly Plan */}
        <div className={`p-8 rounded-3xl border hover:border-purple-500/50 transition flex flex-col justify-between space-y-6 ${
          isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Monthly Pass</h3>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
              }`}>Flexible</span>
            </div>

            <div>
              <div className={`text-4xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {settings.monthlyPricePi} <span className="text-purple-500 text-xl font-bold">Pi</span>
              </div>
              <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>per month • renews automatically</span>
            </div>

            <ul className={`space-y-3 text-xs pt-4 border-t ${
              isDark ? 'text-zinc-300 border-zinc-800' : 'text-slate-600 border-slate-200'
            }`}>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-purple-500" />
                <span>100% Ad-Free Video Streaming</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-purple-500" />
                <span>Full HD 1080p & 4K UHD Quality</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-purple-500" />
                <span>Access all TV Series episodes and movies</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-purple-500" />
                <span>Pioneer VIP Badge</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => openPiPayment('monthly')}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition"
          >
            Select Monthly ({settings.monthlyPricePi} Pi)
          </button>
        </div>

        {/* Annual Plan */}
        <div className={`relative p-8 rounded-3xl border-2 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.15)] flex flex-col justify-between space-y-6 ${
          isDark ? 'bg-gradient-to-b from-zinc-900 via-zinc-900/80 to-purple-950/40' : 'bg-gradient-to-b from-white via-purple-50/20 to-pink-50/20'
        }`}>
          <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-amber-500 to-rose-500 text-black text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
            Best Value (Save 20%)
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Annual VIP Pass</h3>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                isDark ? 'bg-purple-900/60 text-purple-300' : 'bg-purple-100 text-purple-800'
              }`}>12 Months</span>
            </div>

            <div>
              <div className={`text-4xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {settings.annualPricePi} <span className="text-pink-500 text-xl font-bold">Pi</span>
              </div>
              <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>billed annually (approx 2.49 Pi / mo)</span>
            </div>

            <ul className={`space-y-3 text-xs pt-4 border-t ${
              isDark ? 'text-zinc-300 border-zinc-800' : 'text-slate-700 border-slate-200'
            }`}>
              <li className="flex items-center gap-2.5 font-semibold">
                <Check className="w-4 h-4 text-pink-500" />
                <span>100% Ad-Free Video Streaming</span>
              </li>
              <li className="flex items-center gap-2.5 font-semibold">
                <Check className="w-4 h-4 text-pink-500" />
                <span>Ultra HD 4K Streaming + HDR</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-pink-500" />
                <span>Priority early access to newly released titles</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-pink-500" />
                <span>Exclusive PiFlix+ Original Documentaries</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-pink-500" />
                <span>Golden VIP Profile Crown</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => openPiPayment('annual')}
            className="w-full py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs shadow-lg transition"
          >
            Select Annual ({settings.annualPricePi} Pi)
          </button>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="space-y-6 max-w-4xl mx-auto">
        <h2 className={`text-xl font-bold text-center ${isDark ? 'text-white' : 'text-slate-900'}`}>Compare Streaming Tiers</h2>
        <div className={`overflow-x-auto rounded-2xl border ${
          isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-slate-200 bg-white shadow-xs'
        }`}>
          <table className="w-full text-left text-xs">
            <thead className={`border-b ${
              isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <tr>
                <th className="p-4 font-semibold">Features</th>
                <th className="p-4 font-semibold text-center">Free Tier</th>
                <th className="p-4 font-bold text-center text-purple-500">VIP Pioneer</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-zinc-800/60' : 'divide-slate-200'}`}>
              <tr>
                <td className={`p-4 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Ad-Free Viewing</td>
                <td className={`p-4 text-center ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>5 min free + 2 min ad intervals</td>
                <td className="p-4 text-center font-bold text-emerald-500">100% Zero Ads</td>
              </tr>
              <tr>
                <td className={`p-4 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Streaming Resolution</td>
                <td className={`p-4 text-center ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Up to 720p HD</td>
                <td className="p-4 text-center font-bold text-purple-500">4K Ultra HD + HDR</td>
              </tr>
              <tr>
                <td className={`p-4 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Content Library Access</td>
                <td className={`p-4 text-center ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Standard Catalog</td>
                <td className="p-4 text-center font-bold text-purple-500">All + PiFlix+ Originals</td>
              </tr>
              <tr>
                <td className={`p-4 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Playback Controls & Quality Selector</td>
                <td className="p-4 text-center text-emerald-500 font-bold">Included</td>
                <td className="p-4 text-center text-emerald-500 font-bold">Included</td>
              </tr>
              <tr>
                <td className={`p-4 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Personal Watchlist & History</td>
                <td className="p-4 text-center text-emerald-500 font-bold">Included</td>
                <td className="p-4 text-center text-emerald-500 font-bold">Included</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className={`space-y-6 max-w-3xl mx-auto pt-6 border-t ${isDark ? 'border-zinc-800/80' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-bold text-center flex items-center justify-center gap-2 ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}>
          <HelpCircle className="w-5 h-5 text-purple-500" />
          <span>Frequently Asked Questions</span>
        </h2>

        <div className="space-y-3 text-xs">
          <div className={`p-4 rounded-xl border space-y-1 ${
            isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <h4 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>How does Pi Network payment work on PiFlix+?</h4>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              When you choose a plan, PiFlix+ initializes a secure transaction with the Pi Network payment gateway. You authorize the payment using your Pi Wallet on Pi Browser or desktop. The transaction is cryptographically verified on our backend, immediately granting you VIP ad-free privileges.
            </p>
          </div>

          <div className={`p-4 rounded-xl border space-y-1 ${
            isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <h4 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Can I cancel anytime?</h4>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Yes, your subscription is non-binding. You can choose not to renew at the end of your billing period, and your account will gracefully return to the free ad-supported tier.
            </p>
          </div>

          <div className={`p-4 rounded-xl border space-y-1 ${
            isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <h4 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Can I still watch movies for free?</h4>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Absolutely! PiFlix+ offers generous free viewing supported by brief commercial intervals. The VIP pass is designed for Pioneers who prefer an uninterrupted, 4K cinematic experience.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
