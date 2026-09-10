import React, { useState, useEffect } from 'react';
import { Play, Plus, Check, Info, Star, Clock, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Movie, TVSeries } from '../types';

export const HeroBanner: React.FC = () => {
  const { movies, seriesList, playVideo, openDetails, toggleWatchlist, isInWatchlist, settings } = useApp();

  // Combine featured movies and series
  const featuredItems: (Movie | TVSeries)[] = [
    ...movies.filter(m => m.isFeatured),
    ...seriesList.filter(s => s.isFeatured)
  ];

  const items = featuredItems.length > 0 ? featuredItems : movies.slice(0, 4);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto carousel slide
  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const intervalTime = (settings.heroSlideIntervalSec || 7) * 1000;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % items.length);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [currentIndex, isPaused, items.length, settings.heroSlideIntervalSec]);

  if (items.length === 0) return null;

  const current = items[currentIndex];
  const isSeries = 'seasonsCount' in current;
  const inList = isInWatchlist(current.id);

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
      className="relative w-full h-[68vh] min-h-[460px] max-h-[720px] overflow-hidden select-none bg-[#0c0d14]"
    >
      {/* Background Backdrop with Pan Zoom Animation */}
      <div className="absolute inset-0">
        <img
          key={current.id}
          src={current.backdrop || current.poster}
          alt={current.title}
          className="w-full h-full object-cover object-center animate-fade-in transition-transform duration-1000 scale-105"
        />

        {/* Multi-stage cinematic gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d14] via-[#0c0d14]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0d14] via-[#0c0d14]/70 to-transparent w-full md:w-3/4" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0d14]/40 via-transparent to-[#0c0d14]" />
      </div>

      {/* Hero Content Container */}
      <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12 sm:pb-16 z-20">
        <div className="max-w-2xl space-y-3.5">
          {/* Tag Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {current.isPremium && (
              <span className="bg-gradient-to-r from-amber-500 to-rose-500 text-black px-2.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                PiFlix+ Exclusive
              </span>
            )}
            <span className="bg-purple-600/30 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-full">
              {isSeries ? 'TV Series' : 'Movie'}
            </span>
            <div className="flex items-center gap-1 text-amber-400 font-bold bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>{current.rating}</span>
            </div>
            <span className="text-zinc-300 font-medium">{current.year}</span>
            {'duration' in current && (
              <div className="flex items-center gap-1 text-zinc-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{current.duration} min</span>
              </div>
            )}
            {current.qualityBadge && (
              <span className="border border-white/20 text-zinc-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                {current.qualityBadge}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-none drop-shadow-md">
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
          <p className="text-sm sm:text-base text-zinc-300 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow max-w-xl font-normal">
            {current.description}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => playVideo(current)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-bold rounded-xl text-sm flex items-center gap-2.5 shadow-[0_10px_25px_rgba(236,72,153,0.35)] hover:scale-105 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Watch Now</span>
            </button>

            <button
              onClick={() => toggleWatchlist(current.id, isSeries ? 'series' : 'movie')}
              className="px-4 py-3 bg-zinc-900/80 hover:bg-zinc-800 text-white font-semibold rounded-xl text-sm border border-zinc-700/60 backdrop-blur-md flex items-center gap-2 transition hover:scale-105"
            >
              {inList ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>In Watchlist</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Watchlist</span>
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
      <div className="absolute bottom-4 right-8 z-30 flex items-center gap-2">
        {items.map((it, idx) => (
          <button
            key={it.id}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-300 rounded-full ${
              idx === currentIndex
                ? 'w-6 h-2 bg-gradient-to-r from-purple-500 to-pink-500'
                : 'w-2 h-2 bg-white/30 hover:bg-white/60'
            }`}
            title={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
