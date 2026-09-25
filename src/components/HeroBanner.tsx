import React, { useState, useEffect, useMemo } from 'react';
import { Play, Plus, Check, Info, Star, Clock, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Movie, TVSeries } from '../types';
import { formatDuration } from '../lib/formatters';

export const HeroBanner: React.FC = () => {
  const { movies, seriesList, playVideo, openDetails, toggleWatchlist, isInWatchlist, settings, theme } = useApp();
  const isDark = theme === 'dark';

  // Dynamic hero items selection:
  // Combines valid movies and TV series, deduplicates by ID,
  // and prioritizes newly added and recently modified items first, then older existing items.
  const items = useMemo(() => {
    const map = new Map<string, Movie | TVSeries>();
    const allContent: (Movie | TVSeries)[] = [...movies, ...seriesList];

    // Filter valid items: must have id, title, must not be unpublished, and have a usable visual cover/backdrop
    const valid = allContent.filter(item => {
      if (!item || !item.id || !item.title) return false;
      if (item.published === false || (item as any).isPublished === false) return false;
      return Boolean(item.backdrop || item.poster || item.coverImageUrl);
    });

    valid.forEach(item => {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    });

    // Sort by reliable timestamp: updatedAt -> modifiedAt -> createdAt -> publishedAt (newest/recently modified first)
    const sorted = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
      return timeB - timeA;
    });

    // Provide up to 12 items for rich multi-title rotation while preserving responsive performance
    return sorted.slice(0, 12);
  }, [movies, seriesList]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Safely clamp index if items change or reload
  const safeIndex = items.length > 0 ? (currentIndex < items.length ? currentIndex : 0) : 0;

  // Auto carousel slide
  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const intervalTime = (settings.heroSlideIntervalSec || 7) * 1000;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % items.length);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPaused, items.length, settings.heroSlideIntervalSec]);

  if (items.length === 0) return null;

  const current = items[safeIndex];
  const isSeries = 'seasonsCount' in current || (current as any).type === 'series';
  const inList = isInWatchlist(current.id);

  // Safe image selection: prefers backdrop, gracefully falls back to poster or coverImageUrl
  const heroImage = current.backdrop || current.poster || current.coverImageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80';

  const prevSlide = () => {
    setCurrentIndex(prev => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const nextSlide = () => {
    setCurrentIndex(prev => (prev + 1) % items.length);
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative w-full h-[56vh] sm:h-[62vh] md:h-[66vh] lg:h-[68vh] min-h-[400px] md:min-h-[460px] max-h-[720px] overflow-hidden select-none ${isDark ? 'bg-[#0a0b12]' : 'bg-slate-900'}`}
    >
      {/* Background Backdrop with Pan Zoom Animation */}
      <div className="absolute inset-0">
        <img
          key={current.id}
          src={heroImage}
          alt={current.title}
          onError={(e) => {
            const target = e.currentTarget;
            if (current.poster && target.src !== current.poster) {
              target.src = current.poster;
            } else if (current.coverImageUrl && target.src !== current.coverImageUrl) {
              target.src = current.coverImageUrl;
            }
          }}
          className="w-full h-full object-cover object-center animate-fade-in transition-transform duration-1000 scale-105"
        />

        {/* Multi-stage cinematic gradient overlays */}
        <div className={`absolute inset-0 bg-gradient-to-t ${isDark ? 'from-[#0a0b12] via-[#0a0b12]/60' : 'from-[#f8fafc] via-slate-950/40'} to-transparent`} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent w-full md:w-3/4" />
        <div className={`absolute inset-0 bg-gradient-to-b ${isDark ? 'from-[#0a0b12]/40' : 'from-black/40'} via-transparent ${isDark ? 'to-[#0a0b12]' : 'to-[#f8fafc]'}`} />
      </div>

      {/* Hero Content Container */}
      <div className="relative h-full w-full max-w-7xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8 flex flex-col justify-end pb-8 sm:pb-12 md:pb-14 lg:pb-16 z-20">
        <div className="w-full sm:max-w-xl md:max-w-2xl space-y-3 sm:space-y-3.5">
          {/* Tag Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {current.isPremium && (
              <span className="bg-gradient-to-r from-amber-500 to-rose-500 text-black px-2.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                PiFlix+ Exclusive
              </span>
            )}
            <span className="bg-purple-600/30 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-full">
              {isSeries ? 'Series' : 'Movie'}
            </span>
            <div className="flex items-center gap-1 text-amber-400 font-bold bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>{current.rating}</span>
            </div>
            <span className="text-zinc-300 font-medium">{current.year}</span>
            {'duration' in current && Boolean((current as Movie).duration) && (
              <div className="flex items-center gap-1 text-zinc-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDuration((current as Movie).duration)}</span>
              </div>
            )}
            {isSeries && (
              <span className="text-purple-300 font-medium text-xs">
                {((current as TVSeries).seasonsCount || (current as TVSeries).seasons?.length || 1)} Season{((current as TVSeries).seasonsCount || (current as TVSeries).seasons?.length || 1) > 1 ? 's' : ''}
              </span>
            )}
            {current.qualityBadge && (
              <span className="border border-white/20 text-zinc-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                {current.qualityBadge}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white tracking-tight leading-tight drop-shadow-md">
            {current.title}
          </h1>

          {/* Genres */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            {current.genre?.map((g, idx) => (
              <span key={g} className="flex items-center gap-2">
                <span>{g}</span>
                {idx < current.genre.length - 1 && <span className="text-zinc-600">•</span>}
              </span>
            ))}
          </div>

          {/* Description */}
          <p className="text-xs sm:text-sm md:text-base text-zinc-300 line-clamp-2 md:line-clamp-3 leading-relaxed drop-shadow max-w-xl font-normal">
            {current.description}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
            <button
              onClick={() => {
                if (isSeries) {
                  openDetails(current, 'series');
                } else {
                  playVideo(current);
                }
              }}
              className="px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 sm:gap-2.5 shadow-[0_10px_25px_rgba(236,72,153,0.35)] hover:scale-105 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isSeries ? 'View Episodes' : 'Watch Now'}</span>
            </button>

            <button
              onClick={() => toggleWatchlist(current.id, isSeries ? 'series' : 'movie')}
              className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-zinc-900/80 hover:bg-zinc-800 text-white font-semibold rounded-xl text-xs sm:text-sm border border-zinc-700/60 backdrop-blur-md flex items-center gap-2 transition hover:scale-105"
            >
              {inList ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>In Watchlist</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>My List</span>
                </>
              )}
            </button>

            <button
              onClick={() => openDetails(current, isSeries ? 'series' : 'movie')}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm backdrop-blur-md border border-white/20 flex items-center gap-2 transition hover:scale-105"
            >
              <Info className="w-4 h-4 text-purple-300" />
              <span>More Info</span>
            </button>
          </div>
        </div>
      </div>

      {/* Prev / Next Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/40 hover:bg-black/80 text-white/70 hover:text-white border border-white/10 backdrop-blur-md transition"
        title="Previous Slide"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/40 hover:bg-black/80 text-white/70 hover:text-white border border-white/10 backdrop-blur-md transition"
        title="Next Slide"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Carousel Indicator Dots */}
      <div className="absolute bottom-4 right-4 sm:right-8 z-30 flex items-center gap-1.5 sm:gap-2 max-w-[70vw] overflow-x-auto py-1 scrollbar-none">
        {items.map((it, idx) => (
          <button
            key={it.id}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-300 rounded-full shrink-0 ${
              idx === safeIndex
                ? 'w-5 sm:w-6 h-1.5 sm:h-2 bg-gradient-to-r from-purple-500 to-pink-500 shadow-sm'
                : 'w-1.5 sm:w-2 h-1.5 sm:h-2 bg-white/30 hover:bg-white/60'
            }`}
            title={`Slide ${idx + 1}: ${it.title}`}
          />
        ))}
      </div>
    </div>
  );
};
