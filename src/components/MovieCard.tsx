import React from 'react';
import { Play, Plus, Check, Heart, Star, Sparkles } from 'lucide-react';
import { Movie, TVSeries } from '../types';
import { useApp } from '../context/AppContext';

interface MovieCardProps {
  content: Movie | TVSeries;
  aspectRatio?: 'poster' | 'backdrop';
}

export const MovieCard: React.FC<MovieCardProps> = ({ content, aspectRatio = 'poster' }) => {
  const { openDetails, playVideo, toggleWatchlist, isInWatchlist, likedIds, toggleLike, theme } = useApp();

  const isSeries = 'seasonsCount' in content;
  const inList = isInWatchlist(content.id);
  const isLiked = likedIds.includes(content.id);
  const primaryGenre = content.genre && content.genre.length > 0 ? content.genre[0] : 'Feature';
  const isDark = theme === 'dark';

  const imageSrc = aspectRatio === 'backdrop' ? content.backdrop || content.poster : content.poster;

  return (
    <div
      onClick={() => openDetails(content, isSeries ? 'series' : 'movie')}
      className={`group relative flex flex-col rounded-xl overflow-hidden border cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_12px_30px_rgba(168,85,247,0.2)] hover:border-purple-500/50 ${
        isDark ? 'bg-zinc-900/60 border-zinc-800/80' : 'bg-white border-slate-200 shadow-xs'
      }`}
    >
      {/* Poster Image Container */}
      <div className={`relative w-full ${aspectRatio === 'backdrop' ? 'aspect-video' : 'aspect-[2/3]'} overflow-hidden bg-zinc-950`}>
        <img
          src={imageSrc}
          alt={content.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Gradient Shadow Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

        {/* Badges: Quality & Premium */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
          {content.isPremium && (
            <span className="bg-gradient-to-r from-amber-500 to-rose-500 text-black text-[10px] font-extrabold px-2 py-0.5 rounded shadow flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              <span>PREMIUM</span>
            </span>
          )}
          {content.qualityBadge && (
            <span className="bg-black/60 backdrop-blur-md text-zinc-200 border border-white/10 text-[10px] font-bold px-1.5 py-0.5 rounded">
              {content.qualityBadge}
            </span>
          )}
          {isSeries && (
            <span className="bg-purple-900/80 backdrop-blur-md text-purple-200 border border-purple-400/30 text-[10px] font-bold px-1.5 py-0.5 rounded">
              SERIES
            </span>
          )}
        </div>

        {/* Rating Badge */}
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-[11px] font-bold text-amber-400 border border-white/10">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span>{content.rating}</span>
        </div>

        {/* Hover Quick Action Buttons */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-2xs">
          <button
            onClick={(e) => {
              e.stopPropagation();
              playVideo(content);
            }}
            className="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition"
            title="Play Now"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(content.id, isSeries ? 'series' : 'movie');
            }}
            className="w-9 h-9 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-white flex items-center justify-center shadow transition hover:scale-105"
            title={inList ? 'Remove from Watchlist' : 'Add to Watchlist'}
          >
            {inList ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(content.id);
            }}
            className="w-9 h-9 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-white flex items-center justify-center shadow transition hover:scale-105"
            title="Like"
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-300'}`} />
          </button>
        </div>
      </div>

      {/* Info Meta */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <h3 className={`text-sm font-bold transition line-clamp-1 ${
          isDark ? 'text-white group-hover:text-purple-300' : 'text-slate-900 group-hover:text-purple-600'
        }`}>
          {content.title}
        </h3>

        <div className={`flex items-center justify-between mt-1 text-[11px] ${
          isDark ? 'text-zinc-400' : 'text-slate-500'
        }`}>
          <span>{content.year}</span>
          <span className="truncate max-w-[100px] font-medium">{primaryGenre}</span>
          <span>{content.language}</span>
        </div>
      </div>
    </div>
  );
};
