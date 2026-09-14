import React, { useState } from 'react';
import {
  Search, Bell, Sparkles, Sun, Moon, Shield, User as UserIcon, LogOut, Check, Film, Tv, TrendingUp, Bookmark, Loader2, AlertCircle, X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PiFlixLogo } from './PiFlixLogo';
import { UserAvatar } from './UserAvatar';
import { AppNotification } from '../types';
import { formatNotificationTime } from '../lib/firebaseNotifications';

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
    movies,
    seriesList,
    openDetails,
    openPiPayment,
    searchQuery,
    setSearchQuery,
    isPiAuthenticating,
    signInWithPi,
    piAuthError,
    clearPiAuthError
  } = useApp();

  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const isDark = theme === 'dark';

  const handleNotificationClick = async (notif: AppNotification) => {
    setShowNotifMenu(false);

    // 1. Mark as read in Firestore
    if (!notif.read) {
      await markNotificationsRead(notif.id);
    }

    // 2. Navigate directly to target
    if (notif.type === 'premium' || notif.targetTab === 'premium') {
      setActiveTab('premium');
    } else if (notif.contentId) {
      const isSeries = notif.contentType === 'series' || notif.type === 'new_series';
      const existingItem = isSeries
        ? seriesList.find(s => s.id === notif.contentId)
        : movies.find(m => m.id === notif.contentId);

      if (existingItem) {
        openDetails(existingItem, isSeries ? 'series' : 'movie');
      } else {
        try {
          const res = await fetch(`/api/content/${notif.contentId}`);
          if (res.ok) {
            const data = await res.json();
            openDetails(data, isSeries ? 'series' : 'movie');
          } else {
            setActiveTab(isSeries ? 'series' : 'movies');
          }
        } catch {
          setActiveTab(isSeries ? 'series' : 'movies');
        }
      }
    } else if (notif.targetTab) {
      setActiveTab(notif.targetTab as any);
    }
  };

  return (
    <header className={`sticky top-0 z-40 w-full backdrop-blur-md border-b transition-colors duration-200 ${
      isDark ? 'bg-[#0c0d14]/90 border-zinc-800/80 text-white' : 'bg-white/90 border-slate-200 text-slate-900 shadow-xs'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Brand Logo & Desktop Nav Links */}
        <div className="flex items-center gap-3 md:gap-4 lg:gap-6 xl:gap-8 min-w-0 shrink">
          <div
            onClick={() => setActiveTab('home')}
            className="cursor-pointer transition hover:opacity-90 shrink-0"
          >
            <PiFlixLogo size="md" />
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 text-xs font-semibold shrink-0">
            {[
              { id: 'home', label: 'Home' },
              { id: 'movies', label: 'Movies' },
              { id: 'series', label: 'TV Series' },
              { id: 'trending', label: 'Trending' },
              { id: 'watchlist', label: 'Watchlist' }
            ].map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`px-2.5 lg:px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
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
              className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
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
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
          {/* Quick Search Input */}
          <div className="relative hidden md:block w-36 lg:w-52 xl:w-60">
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
              onClick={() => setShowNotifMenu(prev => !prev)}
              className={`p-2 rounded-xl transition relative ${
                isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-pink-500 text-white text-[9px] font-black flex items-center justify-center shadow-xs animate-pulse">
                  {unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}
                </span>
              )}
            </button>

            {/* Backdrop to dismiss on outside click */}
            {showNotifMenu && (
              <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:bg-transparent"
                onClick={() => setShowNotifMenu(false)}
                aria-hidden="true"
              />
            )}

            {/* Notifications Menu (Requirement 11: responsive sizing, positioning, scrolling) */}
            {showNotifMenu && (
              <div
                id="notification-dropdown-panel"
                className={`fixed sm:absolute top-16 sm:top-12 left-3 right-3 sm:left-auto sm:right-0 sm:w-88 max-w-[calc(100vw-1.5rem)] sm:max-w-sm backdrop-blur-xl rounded-2xl shadow-2xl p-3.5 z-50 text-xs space-y-2.5 border transition-all ${
                  isDark
                    ? 'bg-zinc-900/95 border-zinc-800 text-white shadow-black/80'
                    : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
                }`}
              >
                <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">Notifications</span>
                    {unreadNotifsCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30">
                        {unreadNotifsCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadNotifsCount > 0 && (
                      <button
                        onClick={() => markNotificationsRead()}
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold hover:underline transition"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifMenu(false)}
                      className={`p-1 rounded-lg transition ${
                        isDark
                          ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Close notifications"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[65vh] sm:max-h-80 overflow-y-auto pr-0.5 overscroll-contain">
                  {notifications.length === 0 ? (
                    <div className={`text-center py-8 space-y-2 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                      <Bell className="w-7 h-7 mx-auto opacity-30" />
                      <p className="text-xs">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        id={`notif-${n.id}`}
                        onClick={() => handleNotificationClick(n)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 group relative ${
                          n.read
                            ? isDark
                              ? 'bg-zinc-950/40 border-zinc-800/40 text-zinc-400 hover:bg-zinc-900/60'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/70'
                            : isDark
                            ? 'bg-purple-950/30 border-purple-800/40 text-white hover:bg-purple-900/40 shadow-xs'
                            : 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100/60 shadow-xs'
                        }`}
                      >
                        {/* Cover image or type icon */}
                        {n.coverImageUrl ? (
                          <img
                            src={n.coverImageUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-purple-500/20 bg-zinc-900"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div
                            className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
                              n.type === 'premium'
                                ? 'bg-amber-500/20 text-amber-400'
                                : n.type === 'new_series'
                                ? 'bg-sky-500/20 text-sky-400'
                                : 'bg-purple-500/20 text-purple-400'
                            }`}
                          >
                            {n.type === 'premium' ? (
                              <Sparkles className="w-4 h-4" />
                            ) : n.type === 'new_series' ? (
                              <Tv className="w-4 h-4" />
                            ) : (
                              <Film className="w-4 h-4" />
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-bold text-xs truncate">{n.title}</span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" title="Unread" />
                            )}
                          </div>
                          <p className={`text-[11px] mt-0.5 break-words line-clamp-2 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                            {n.message}
                          </p>
                          <div className="flex items-center justify-between mt-1.5 text-[10px] opacity-65">
                            <span>{formatNotificationTime(n.createdAt)}</span>
                            <span className="text-[10px] group-hover:underline text-purple-400 font-medium">
                              {n.type === 'premium' ? 'View VIP' : 'Open details →'}
                            </span>
                          </div>
                        </div>
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

          {/* Manual Pi Authentication Trigger Button (Only shown when not signed in with Pi) */}
          <div className="relative">
            {!currentUser.piUsername && (
              <button
                onClick={() => signInWithPi(false)}
                disabled={isPiAuthenticating}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white shadow-xs transition transform active:scale-95 disabled:opacity-60 cursor-pointer shrink-0"
                title="Sign in with your Pi Network account"
              >
                {isPiAuthenticating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="font-serif font-black text-amber-200 text-sm leading-none">π</span>
                )}
                <span className="hidden sm:inline">{isPiAuthenticating ? 'Connecting...' : 'Sign in with Pi'}</span>
              </button>
            )}

            {/* Dismissible Error / Notice Popup when manual attempt fails */}
            {piAuthError && (
              <div
                className={`absolute right-0 top-11 w-72 p-3 rounded-xl shadow-2xl border text-xs z-50 animate-in fade-in slide-in-from-top-2 ${
                  isDark ? 'bg-zinc-900 border-amber-500/40 text-zinc-200' : 'bg-white border-amber-400 text-slate-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-amber-400">Pi Network Notice</p>
                    <p className="text-[11px] leading-relaxed opacity-90">{piAuthError}</p>
                  </div>
                  <button
                    onClick={clearPiAuthError}
                    className="p-1 rounded-md hover:bg-zinc-700/40 opacity-70 hover:opacity-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Avatar / Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(prev => !prev)}
              className={`flex items-center gap-2 p-1 rounded-full border transition hover:border-purple-500 ${
                isDark ? 'border-zinc-700/80' : 'border-slate-300'
              }`}
            >
              <UserAvatar
                user={currentUser}
                sizeClass="w-7 h-7"
                textClass="text-[15px]"
                isDark={isDark}
              />
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <div className={`absolute right-0 top-12 w-64 rounded-2xl shadow-2xl p-4 z-50 text-xs space-y-3 border ${
                isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
              }`}>
                <div className={`flex items-center gap-3 pb-3 border-b ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <UserAvatar
                    user={currentUser}
                    sizeClass="w-10 h-10"
                    textClass="text-2xl"
                    isDark={isDark}
                  />
                  <div className="truncate">
                    <div className="font-bold truncate flex items-center gap-1.5">
                      <span>{currentUser.username}</span>
                      {currentUser.piUsername && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">π</span>
                      )}
                    </div>
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
                  {/* Pi Network Sign-in in dropdown */}
                  <button
                    onClick={() => {
                      signInWithPi(false);
                      setShowProfileMenu(false);
                    }}
                    disabled={isPiAuthenticating}
                    className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-2 font-semibold ${
                      isDark ? 'hover:bg-purple-900/30 text-purple-300' : 'hover:bg-purple-50 text-purple-700'
                    }`}
                  >
                    {isPiAuthenticating ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    ) : (
                      <span className="font-serif font-bold text-amber-400 text-sm">π</span>
                    )}
                    <span>{isPiAuthenticating ? 'Authenticating Pi...' : currentUser.piUsername ? 'Re-authenticate with Pi' : 'Sign in with Pi'}</span>
                  </button>

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
