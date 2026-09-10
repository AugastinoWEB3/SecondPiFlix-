import React from 'react';
import { Bookmark, Play, Trash2, Clock, Sparkles, Film, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MovieCard } from './MovieCard';
import { Movie, TVSeries } from '../types';

export const WatchlistPage: React.FC = () => {
  const {
    watchlist,
    watchHistory,
    movies,
    seriesList,
    playVideo,
    toggleWatchlist,
    setActiveTab,
    theme
  } = useApp();

  const isDark = theme === 'dark';

  // Match watchlist items to full movie/series objects
  const watchlistItems: (Movie | TVSeries)[] = watchlist
    .map(w => {
      if (w.content) return w.content;
      return movies.find(m => m.id === w.contentId) || seriesList.find(s => s.id === w.contentId);
    })
    .filter(Boolean) as (Movie | TVSeries)[];

  // Continue watching items (progress < 95% of duration)
  const continueWatchingItems = watchHistory
    .filter(h => h.progressSeconds > 10 && h.progressSeconds < (h.durationSeconds * 0.95))
    .slice(0, 6);

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 animate-fade-in min-h-[70vh] ${
      isDark ? 'text-white' : 'text-slate-900'
    }`}>
      {/* Page Header */}
      <div>
        <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-3 ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}>
          <Bookmark className="w-6 h-6 text-purple-500" />
          <span>My Library & Watchlist</span>
        </h1>
        <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          Pick up right where you left off and access your saved streaming titles.
        </p>
      </div>

      {/* SECTION 1: CONTINUE WATCHING */}
      {continueWatchingItems.length > 0 && (
        <div className="space-y-4">
          <h2 className={`text-base font-bold flex items-center gap-2 ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
            <Clock className="w-4 h-4 text-purple-500" />
            <span>Continue Watching</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {continueWatchingItems.map(item => {
              const content = item.content || movies.find(m => m.id === item.contentId) || seriesList.find(s => s.id === item.contentId);
              if (!content) return null;

              const percent = Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100));

              return (
                <div
                  key={item.id}
                  onClick={() => playVideo(content, item.episode, item.progressSeconds)}
                  className={`group relative rounded-xl overflow-hidden cursor-pointer transition flex gap-3 p-3 border hover:border-purple-500/60 ${
                    isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-zinc-950 shrink-0">
                    <img
                      src={item.episode?.thumbnail || content.backdrop || content.poster}
                      alt={content.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Play className="w-6 h-6 text-white fill-current" />
                    </div>

                    {/* Progress bar at bottom of thumbnail */}
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h3 className={`text-xs sm:text-sm font-bold truncate transition ${
                        isDark ? 'text-white group-hover:text-purple-300' : 'text-slate-900 group-hover:text-purple-600'
                      }`}>
                        {content.title}
                      </h3>
                      {item.episode && (
                        <p className="text-[11px] text-purple-500 font-semibold truncate">
                          Ep {item.episode.episodeNumber}: {item.episode.title}
                        </p>
                      )}
                      <p className={`text-[10px] mt-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                        {percent}% completed • {Math.round(item.progressSeconds / 60)}m left
                      </p>
                    </div>

                    <button className="self-start text-[11px] font-bold text-purple-500 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      <span>Resume</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: MY WATCHLIST */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-base font-bold flex items-center gap-2 ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
            <Film className="w-4 h-4 text-pink-500" />
            <span>Saved in Watchlist ({watchlistItems.length})</span>
          </h2>
        </div>

        {watchlistItems.length === 0 ? (
          <div className={`py-16 text-center space-y-4 rounded-2xl border ${
            isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center border ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}>
              <Bookmark className="w-6 h-6" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Your watchlist is empty</h3>
              <p className={`text-xs mt-1 max-w-sm mx-auto ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                Explore movies and series on PiFlix+ and click the &ldquo;+ Watchlist&rdquo; button to save titles for later.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('home')}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-bold rounded-xl transition"
            >
              Discover Trending Movies
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {watchlistItems.map(item => (
              <div key={item.id} className="relative group/wcard">
                <MovieCard content={item} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWatchlist(item.id, 'seasonsCount' in item ? 'series' : 'movie');
                  }}
                  className="absolute top-2 right-2 z-20 p-1.5 rounded-md bg-black/80 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border border-white/10 opacity-0 group-hover/wcard:opacity-100 transition"
                  title="Remove from Watchlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
