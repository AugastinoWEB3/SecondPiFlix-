import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie, TVSeries } from '../types';
import { MovieCard } from './MovieCard';
import { useApp } from '../context/AppContext';

interface ContentRowProps {
  title: string;
  items: (Movie | TVSeries)[];
  aspectRatio?: 'poster' | 'backdrop';
  icon?: React.ReactNode;
  onSeeAll?: () => void;
}

export const ContentRow: React.FC<ContentRowProps> = ({
  title,
  items,
  aspectRatio = 'poster',
  icon,
  onSeeAll
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const { theme } = useApp();
  const isDark = theme === 'dark';

  const scroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;
    const { scrollLeft, clientWidth } = rowRef.current;
    const scrollAmount = clientWidth * 0.75;
    rowRef.current.scrollTo({
      left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
      behavior: 'smooth'
    });
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="relative group/row my-6 sm:my-8">
      {/* Category Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 mb-3">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-purple-500">{icon}</span>}
          <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {title}
          </h2>
          <span className={`text-xs font-medium ml-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
            ({items.length})
          </span>
        </div>

        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-xs font-semibold text-purple-600 hover:text-purple-500 transition"
          >
            Explore All
          </button>
        )}
      </div>

      {/* Horizontal Carousel Container */}
      <div className="relative px-4 sm:px-6 lg:px-8">
        {/* Left Scroll Arrow */}
        <button
          onClick={() => scroll('left')}
          className={`absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full backdrop-blur-md opacity-0 group-hover/row:opacity-100 transition-all flex items-center justify-center shadow-xl hover:scale-110 border ${
            isDark
              ? 'bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border-white/10'
              : 'bg-white/90 hover:bg-white text-slate-800 border-slate-200'
          }`}
          title="Scroll Left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Scrollable track */}
        <div
          ref={rowRef}
          className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto scrollbar-none scroll-smooth pb-2 pt-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map(item => (
            <div
              key={item.id}
              className={`shrink-0 ${
                aspectRatio === 'backdrop'
                  ? 'w-[260px] sm:w-[320px] md:w-[360px]'
                  : 'w-[145px] sm:w-[175px] md:w-[195px]'
              }`}
            >
              <MovieCard content={item} aspectRatio={aspectRatio} />
            </div>
          ))}
        </div>

        {/* Right Scroll Arrow */}
        <button
          onClick={() => scroll('right')}
          className={`absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full backdrop-blur-md opacity-0 group-hover/row:opacity-100 transition-all flex items-center justify-center shadow-xl hover:scale-110 border ${
            isDark
              ? 'bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border-white/10'
              : 'bg-white/90 hover:bg-white text-slate-800 border-slate-200'
          }`}
          title="Scroll Right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
