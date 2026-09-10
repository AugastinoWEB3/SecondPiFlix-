import React, { useState } from 'react';
import { PiFlixLogo } from './PiFlixLogo';
import { useApp } from '../context/AppContext';
import { Shield, Mail, FileText, Heart, Globe, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  const { setActiveTab, settings, theme } = useApp();
  const [showDmcaModal, setShowDmcaModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const isDark = theme === 'dark';

  return (
    <footer className={`w-full border-t text-xs pb-20 md:pb-10 pt-12 transition-colors duration-200 ${
      isDark ? 'bg-[#08090f] border-zinc-900 text-zinc-400' : 'bg-slate-100/80 border-slate-200 text-slate-600'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-3">
            <PiFlixLogo size="md" showTagline={true} />
            <p className={`text-xs max-w-sm leading-relaxed mt-2 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              PiFlix+ is a next-generation entertainment streaming platform built for the global Pi Network ecosystem. Discover critically acclaimed cinema, original TV series, and wildlife documentaries with seamless Pi payments.
            </p>
            <div className={`flex items-center gap-2 text-[11px] pt-2 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              <Shield className="w-4 h-4 text-emerald-500" />
              <span>DMCA Compliant &amp; Authorized Streaming Network</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-2">
            <h4 className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>Explore</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setActiveTab('home')} className="hover:text-purple-500 transition">
                  Home Feed
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('movies')} className="hover:text-purple-500 transition">
                  Feature Movies
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('series')} className="hover:text-purple-500 transition">
                  TV Series
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('trending')} className="hover:text-purple-500 transition">
                  Trending Top 10
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('watchlist')} className="hover:text-purple-500 transition">
                  My Watchlist
                </button>
              </li>
            </ul>
          </div>

          {/* Monetization & Pioneer */}
          <div className="space-y-2">
            <h4 className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>Pi Network</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setActiveTab('premium')} className="text-amber-600 dark:text-amber-400 hover:underline transition font-semibold">
                  VIP Ad-Free Pass
                </button>
              </li>
              <li>
                <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Monthly: {settings.monthlyPricePi} Pi</span>
              </li>
              <li>
                <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Annual: {settings.annualPricePi} Pi</span>
              </li>
              <li>
                <a href="https://minepi.com" target="_blank" rel="noreferrer" className="hover:text-purple-500 flex items-center gap-1">
                  <span>Pi Core Team</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2">
            <h4 className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>Compliance</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setShowDmcaModal(true)} className="hover:text-purple-500 transition">
                  DMCA Copyright Notice
                </button>
              </li>
              <li>
                <button onClick={() => setShowPrivacyModal(true)} className="hover:text-purple-500 transition">
                  Privacy Policy &amp; Terms
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('admin')} className="hover:text-purple-500 transition flex items-center gap-1">
                  <span>Admin CMS</span>
                </button>
              </li>
              <li className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Support: {settings.contactEmail || 'support@piflixplus.com'}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar & Copyright */}
        <div className={`pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] ${
          isDark ? 'border-zinc-900 text-zinc-400' : 'border-slate-200 text-slate-500'
        }`}>
          <div>
            &copy; {new Date().getFullYear()} {settings.appName} Streaming Inc. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span>Made with</span>
              <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
              <span>for Pioneers</span>
            </span>
            <span>•</span>
            <span>Pi Network Ecosystem Verified</span>
          </div>
        </div>
      </div>

      {/* DMCA MODAL */}
      {showDmcaModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`relative w-full max-w-xl rounded-2xl border p-6 space-y-4 text-xs shadow-2xl ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-500" />
              <span>DMCA Copyright &amp; Content Guidelines</span>
            </h3>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              PiFlix+ respects the intellectual property rights of creators. In accordance with the Digital Millennium Copyright Act (DMCA), all content hosted or indexed on PiFlix+ is verified and uploaded under valid distribution agreements, open-license public streaming rights, or publisher authorization.
            </p>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              To submit a copyright notification or takedown inquiry, please direct correspondence to:
              <br />
              <strong className="text-purple-600 font-mono">{settings.contactEmail || 'dmca@piflixplus.com'}</strong>
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowDmcaModal(false)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRIVACY MODAL */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`relative w-full max-w-xl rounded-2xl border p-6 space-y-4 text-xs shadow-2xl ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <h3 className="text-base font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-pink-500" />
              <span>Privacy Policy &amp; Terms</span>
            </h3>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              PiFlix+ values your digital privacy. We do not sell or monetize personal Pioneer identification data. Watch progress and watchlist preferences are strictly used to personalize your streaming session experience.
            </p>
            <p className={`leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              All cryptocurrency transactions are executed directly over the Pi Network blockchain with cryptographic verification on our secure server.
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
