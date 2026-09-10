import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { ContentRow } from './components/ContentRow';
import { ContentDetailsModal } from './components/ContentDetailsModal';
import { VideoPlayer } from './components/VideoPlayer';
import { PiPaymentModal } from './components/PiPaymentModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Footer } from './components/Footer';
import { SearchPage } from './components/SearchPage';
import { WatchlistPage } from './components/WatchlistPage';
import { PremiumPage } from './components/PremiumPage';
import { AdminDashboard } from './components/AdminDashboard';
import { MovieCard } from './components/MovieCard';
import { Flame, Film, Tv, Sparkles, Compass, Star, TrendingUp, Play, Bell } from 'lucide-react';
import { Movie, TVSeries } from './types';

const MainAppContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    movies,
    seriesList,
    settings,
    watchHistory,
    playVideo,
    theme
  } = useApp();

  // Filter categories
  const trendingItems = [...movies.filter(m => m.isTrending), ...seriesList.filter(s => s.isTrending)];
  const actionSciFi = movies.filter(m => m.genre?.some(g => ['Action', 'Sci-Fi', 'Cyberpunk'].includes(g)));
  const wildlifeNature = movies.filter(m => m.genre?.some(g => ['Wildlife', 'Nature', 'Documentary'].includes(g)));
  const topRated = [...movies, ...seriesList].filter(item => item.rating >= 8.5);
  const premiumExclusives = [...movies, ...seriesList].filter(item => item.isPremium);

  // Continue watching
  const continueWatchingItems = watchHistory
    .filter(h => h.progressSeconds > 10 && h.progressSeconds < (h.durationSeconds * 0.95))
    .slice(0, 5);

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0b12] text-zinc-100' : 'bg-[#f8fafc] text-slate-900'} flex flex-col font-['Plus_Jakarta_Sans'] selection:bg-purple-600 selection:text-white transition-colors duration-200`}>
      {/* Announcement Banner (from Admin settings) */}
      {settings.announcement && (
        <div className="w-full bg-gradient-to-r from-purple-700 via-pink-600 to-rose-600 text-white text-xs font-semibold py-2 px-4 text-center flex items-center justify-center gap-2 shadow-md relative z-40">
          <Bell className="w-3.5 h-3.5 animate-bounce" />
          <span>{settings.announcement}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar />

      {/* Main View Switcher */}
      <main className="flex-1 pb-16 md:pb-0">
        {/* VIEW 1: HOME FEED */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            <HeroBanner />

            {/* Continue Watching Carousel if available */}
            {continueWatchingItems.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className={`text-base sm:text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    <Play className="w-4 h-4 text-purple-500 fill-current" />
                    <span>Continue Watching</span>
                  </h2>
                  <button
                    onClick={() => setActiveTab('watchlist')}
                    className="text-xs text-purple-500 hover:text-purple-600 font-semibold"
                  >
                    View All
                  </button>
                </div>

                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
                  {continueWatchingItems.map(h => {
                    const content = h.content || movies.find(m => m.id === h.contentId) || seriesList.find(s => s.id === h.contentId);
                    if (!content) return null;
                    const percent = Math.round((h.progressSeconds / h.durationSeconds) * 100);

                    return (
                      <div
                        key={h.id}
                        onClick={() => playVideo(content, h.episode, h.progressSeconds)}
                        className={`shrink-0 w-64 sm:w-72 rounded-xl overflow-hidden border hover:border-purple-500/60 cursor-pointer group transition ${
                          isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
                        }`}
                      >
                        <div className="relative aspect-video bg-zinc-950">
                          <img
                            src={h.episode?.thumbnail || content.backdrop || content.poster}
                            alt={content.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <Play className="w-8 h-8 text-white fill-current drop-shadow" />
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        <div className="p-3">
                          <h3 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{content.title}</h3>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                            <span>{percent}% completed</span>
                            <span className="text-purple-500 font-semibold">Resume</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category Rows */}
            <ContentRow
              title="Trending Blockbusters"
              items={trendingItems}
              icon={<Flame className="w-5 h-5 text-amber-500" />}
              onSeeAll={() => setActiveTab('trending')}
            />

            <ContentRow
              title="PiFlix+ Original TV Series"
              items={seriesList}
              aspectRatio="backdrop"
              icon={<Tv className="w-5 h-5 text-purple-500" />}
              onSeeAll={() => setActiveTab('series')}
            />

            <ContentRow
              title="Action & Cyberpunk Sci-Fi"
              items={actionSciFi}
              icon={<Compass className="w-5 h-5 text-sky-500" />}
              onSeeAll={() => setActiveTab('movies')}
            />

            <ContentRow
              title="VIP Pioneer Exclusives"
              items={premiumExclusives}
              icon={<Sparkles className="w-5 h-5 text-pink-500" />}
              onSeeAll={() => setActiveTab('premium')}
            />

            <ContentRow
              title="Wild Earth & Nature Documentaries"
              items={wildlifeNature}
              aspectRatio="backdrop"
              icon={<Film className="w-5 h-5 text-emerald-500" />}
              onSeeAll={() => setActiveTab('movies')}
            />

            <ContentRow
              title="Highest Rated Masterpieces (★ 8.5+)"
              items={topRated}
              icon={<Star className="w-5 h-5 text-amber-400 fill-amber-400" />}
              onSeeAll={() => setActiveTab('movies')}
            />
          </div>
        )}

        {/* VIEW 2: MOVIES BROWSER */}
        {activeTab === 'movies' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
            <div className="space-y-2">
              <h1 className={`text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Film className="w-7 h-7 text-purple-500" />
                <span>Feature Movies & Films</span>
              </h1>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Stream full-length cinematic blockbusters, sci-fi epics, action thrillers, and nature documentaries.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {movies.map(movie => (
                <MovieCard key={movie.id} content={movie} />
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: TV SERIES BROWSER */}
        {activeTab === 'series' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
            <div className="space-y-2">
              <h1 className={`text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Tv className="w-7 h-7 text-pink-500" />
                <span>Original TV Series</span>
              </h1>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Binge multi-season narrative series with complete episodic streaming and skip-intro support.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {seriesList.map(series => (
                <div key={series.id} className="space-y-2">
                  <MovieCard content={series} aspectRatio="backdrop" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: TRENDING TOP 10 */}
        {activeTab === 'trending' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
            <div className="space-y-2">
              <h1 className={`text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <TrendingUp className="w-7 h-7 text-amber-500" />
                <span>Top 10 Trending Titles Today</span>
              </h1>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                The most watched and talked-about movies and TV shows across the global Pi community this week.
              </p>
            </div>

            <div className="space-y-4">
              {[...movies, ...seriesList]
                .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0))
                .slice(0, 10)
                .map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-4 p-3.5 border rounded-2xl transition cursor-pointer group ${
                      isDark
                        ? 'bg-zinc-900/60 hover:bg-zinc-800/60 border-zinc-800'
                        : 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
                    }`}
                    onClick={() => playVideo(item)}
                  >
                    {/* Rank Badge with huge typographic number */}
                    <span className={`w-10 text-center font-black text-2xl sm:text-3xl transition font-['Outfit'] ${
                      isDark ? 'text-zinc-600 group-hover:text-purple-400' : 'text-slate-300 group-hover:text-purple-600'
                    }`}>
                      #{idx + 1}
                    </span>

                    <img
                      src={item.poster}
                      alt={item.title}
                      className="w-12 h-16 sm:w-16 sm:h-22 object-cover rounded-xl shrink-0 group-hover:scale-105 transition"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm sm:text-base font-bold transition truncate ${
                          isDark ? 'text-white group-hover:text-purple-300' : 'text-slate-900 group-hover:text-purple-600'
                        }`}>
                          {item.title}
                        </h3>
                        {item.isPremium && (
                          <span className="bg-gradient-to-r from-amber-500 to-rose-500 text-black text-[9px] font-extrabold px-2 py-0.5 rounded">
                            VIP
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        <span>{item.year}</span>
                        <span>•</span>
                        <span>{item.genre?.[0]}</span>
                        <span>•</span>
                        <span className="text-amber-500 font-bold">★ {item.rating}</span>
                      </div>
                      <p className={`text-xs line-clamp-1 hidden sm:block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        {item.description}
                      </p>
                    </div>

                    <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 shrink-0">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">Watch Now</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* VIEW 5: SEARCH */}
        {activeTab === 'search' && <SearchPage />}

        {/* VIEW 6: WATCHLIST & LIBRARY */}
        {activeTab === 'watchlist' && <WatchlistPage />}

        {/* VIEW 7: PREMIUM SUBSCRIPTION */}
        {activeTab === 'premium' && <PremiumPage />}

        {/* VIEW 8: ADMIN CMS DASHBOARD */}
        {activeTab === 'admin' && <AdminDashboard />}
      </main>

      {/* Global Modals */}
      <ContentDetailsModal />
      <VideoPlayer />
      <PiPaymentModal />

      {/* Footer */}
      <Footer />

      {/* Mobile Bottom Bar */}
      <MobileBottomNav />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
