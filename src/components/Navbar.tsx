import React, { useState } from 'react';
import {
  Search, Bell, Sparkles, Sun, Moon, Shield, User as UserIcon, LogOut, Check, Film, Tv, TrendingUp, Bookmark
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PiFlixLogo } from './PiFlixLogo';

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    theme,
    toggleTheme,
    currentUser,
    logout,
    isAdmin,
    notifications,
    unreadNotifsCount,
    markNotificationsRead,
    openPiPayment,
    searchQuery,
    setSearchQuery
  } = useApp();

  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const isDark = theme === 'dark';

  return (
    <header className={`sticky top-0 z-40 w-full backdrop-blur-md border-b transition-colors duration-200 ${
      isDark ? 'bg-[#0c0d14]/90 border-zinc-800/80 text-white' : 'bg-white/90 border-slate-200 text-slate-900 shadow-xs'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo & Desktop Nav Links */}
        <div className="flex items-center gap-8">
          <div
            onClick={() => setActiveTab('home')}
            className="cursor-pointer transition hover:opacity-90"
          >
            <PiFlixLogo size="md" />
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold">
            {[
              { id: 'home', label: 'Home' },
              { id: 'movies', label: 'Movies' },
              { id: 'series', label: 'TV Series' },
              { id: 'trending', label: 'Trending' },
              { id: 'watchlist', label: 'My Watchlist' }
            ].map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    isActive
                      ? isDark
                        ? 'text-white bg-purple-600/30 border border-purple-500/40'
                        : 'text-purple-700 bg-purple-100 border border-purple-300'
                      : isDark
                      ? 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            {/* Premium VIP Link */}
            <button
              onClick={() => setActiveTab('premium')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === 'premium'
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-black shadow'
                  : isDark
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                  : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pi VIP</span>
            </button>
          </nav>
        </div>

        {/* Right Controls: Search, Notifications, Theme, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Search Input */}
          <div className="relative hidden sm:block w-44 lg:w-60">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
              isDark ? 'text-zinc-400' : 'text-slate-400'
            }`} />
            <input
              type="text"
              placeholder="Search movies, cast..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                if (activeTab !== 'search') setActiveTab('search');
              }}
              onFocus={() => {
                if (activeTab !== 'search') setActiveTab('search');
              }}
              className={`w-full pl-9 pr-3 py-1.5 rounded-full text-xs transition border focus:outline-none focus:border-purple-500 ${
                isDark
                  ? 'bg-zinc-900/80 border-zinc-700/80 text-white placeholder:text-zinc-500'
                  : 'bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white'
              }`}
            />
          </div>

          {/* Admin Dashboard shortcut */}
          <button
            onClick={() => setActiveTab('admin')}
            className={`p-2 rounded-xl transition ${
              activeTab === 'admin'
                ? 'bg-purple-600 text-white'
                : isDark
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Admin CMS & Settings"
          >
            <Shield className="w-4 h-4" />
          </button>

          {/* Notifications Trigger */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifMenu(prev => !prev);
                if (unreadNotifsCount > 0) markNotificationsRead();
              }}
              className={`p-2 rounded-xl transition relative ${
                isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              )}
            </button>

            {/* Notifications Menu */}
            {showNotifMenu && (
              <div className={`absolute right-0 top-12 w-80 backdrop-blur-xl rounded-2xl shadow-2xl p-4 z-50 text-xs space-y-3 border ${
                isDark ? 'bg-zinc-900/95 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
              }`}>
                <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <span className="font-bold">Notifications</span>
                  <button
                    onClick={() => markNotificationsRead()}
                    className="text-[11px] text-purple-600 hover:underline"
                  >
                    Mark all read
                  </button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className={`text-center py-4 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>No notifications yet</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl border transition ${
                          n.read
                            ? isDark
                              ? 'bg-zinc-950/40 border-zinc-800/40 text-zinc-400'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                            : isDark
                            ? 'bg-purple-950/30 border-purple-800/40 text-white'
                            : 'bg-purple-50 border-purple-200 text-purple-900'
                        }`}
                      >
                        <div className="font-bold text-xs">{n.title}</div>
                        <div className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{n.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme Switcher Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl transition ${
              isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-90 transition duration-300" />
            ) : (
              <Moon className="w-4 h-4 text-purple-600 hover:-rotate-12 transition duration-300" />
            )}
          </button>

          {/* User Profile Avatar / Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(prev => !prev)}
              className={`flex items-center gap-2 p-1 rounded-full border transition hover:border-purple-500 ${
                isDark ? 'border-zinc-700/80' : 'border-slate-300'
              }`}
            >
              <img
                src={currentUser.profileImage}
                alt={currentUser.username}
                className="w-7 h-7 rounded-full object-cover"
              />
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <div className={`absolute right-0 top-12 w-64 rounded-2xl shadow-2xl p-4 z-50 text-xs space-y-3 border ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
              }`}>
                <div className={`flex items-center gap-3 pb-3 border-b ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <img
                    src={currentUser.profileImage}
                    alt={currentUser.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="truncate">
                    <div className="font-bold truncate">{currentUser.username}</div>
                    <div className={`text-[10px] truncate ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{currentUser.email}</div>
                    {currentUser.premiumStatus ? (
                      <span className="inline-block mt-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-black uppercase">
                        VIP Subscriber
                      </span>
                    ) : (
                      <span className={`inline-block mt-1 text-[9px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Free Tier</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setActiveTab('watchlist');
                      setShowProfileMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-2 ${
                      isDark ? 'hover:bg-zinc-800 text-zinc-300 hover:text-white' : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <Bookmark className="w-4 h-4 text-purple-500" />
                    <span>My Watchlist & History</span>
                  </button>

                  <button
                    onClick={() => {
                      openPiPayment('monthly');
                      setShowProfileMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-2 font-semibold ${
                      isDark ? 'hover:bg-zinc-800 text-amber-400 hover:text-amber-300' : 'hover:bg-amber-50 text-amber-600 hover:text-amber-700'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Upgrade with Pi</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('admin');
                      setShowProfileMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-2 ${
                      isDark ? 'hover:bg-zinc-800 text-zinc-300 hover:text-white' : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <Shield className="w-4 h-4 text-sky-500" />
                    <span>Admin CMS</span>
                  </button>
                </div>

                <div className={`pt-2 border-t ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <button
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-100/60 text-rose-500 transition flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Switch / Log out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
