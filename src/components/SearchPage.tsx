import React, { useState, useMemo } from 'react';
import { Search, X, SlidersHorizontal, Star, Film, Tv, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MovieCard } from './MovieCard';
import { Movie, TVSeries } from '../types';

export const SearchPage: React.FC = () => {
  const { movies, seriesList, searchQuery, setSearchQuery, theme } = useApp();
  const isDark = theme === 'dark';

  // Filter criteria
  const [selectedType, setSelectedType] = useState<'all' | 'movie' | 'series'>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'trending' | 'rating' | 'newest' | 'title'>('trending');
  const [showFilters, setShowFilters] = useState(false);

  // Collect all unique genres and languages
  const allItems: (Movie | TVSeries)[] = useMemo(() => [...movies, ...seriesList], [movies, seriesList]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach(it => it.genre?.forEach(g => set.add(g)));
    return Array.from(set);
  }, [allItems]);

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach(it => {
      if (it.language) set.add(it.language);
    });
    return Array.from(set);
  }, [allItems]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allItems
      .filter(item => {
        const isSeries = 'seasonsCount' in item;

        // Type filter
        if (selectedType === 'movie' && isSeries) return false;
        if (selectedType === 'series' && !isSeries) return false;

        // Genre filter
        if (selectedGenre !== 'all' && !item.genre.includes(selectedGenre)) return false;

        // Language filter
        if (selectedLanguage !== 'all' && item.language !== selectedLanguage) return false;

        // Year filter
        if (selectedYear !== 'all' && item.year.toString() !== selectedYear) return false;

        // Rating filter
        if (minRating > 0 && item.rating < minRating) return false;

        // Text query search
        if (q) {
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchDesc = item.description.toLowerCase().includes(q);
          const matchDirector = item.director?.toLowerCase().includes(q);
          const matchCast = item.cast?.some(c => c.toLowerCase().includes(q));
          const matchGenre = item.genre?.some(g => g.toLowerCase().includes(q));
          const matchTags = item.tags?.some(t => t.toLowerCase().includes(q));

          return matchTitle || matchDesc || matchDirector || matchCast || matchGenre || matchTags;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'newest') return b.year - a.year;
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        // default trending / views
        return (b.viewsCount || 0) - (a.viewsCount || 0);
      });
  }, [allItems, searchQuery, selectedType, selectedGenre, selectedLanguage, selectedYear, minRating, sortBy]);

  const resetFilters = () => {
    setSelectedType('all');
    setSelectedGenre('all');
    setSelectedLanguage('all');
    setSelectedYear('all');
    setMinRating(0);
    setSortBy('trending');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedType !== 'all' ||
    selectedGenre !== 'all' ||
    selectedLanguage !== 'all' ||
    selectedYear !== 'all' ||
    minRating > 0 ||
    searchQuery.trim() !== '';

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fade-in min-h-[70vh] ${
      isDark ? 'text-white' : 'text-slate-900'
    }`}>
      {/* Search Input Bar */}
      <div className="relative max-w-2xl mx-auto">
        <Search className={`w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 ${
          isDark ? 'text-zinc-400' : 'text-slate-400'
        }`} />
        <input
          type="text"
          placeholder="Search by title, genre, director, actor (e.g., 'Wildlife', 'Sci-Fi')..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
          className={`w-full pl-12 pr-12 py-3.5 rounded-2xl text-sm transition border shadow-md focus:outline-none focus:border-purple-500 ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-700/80 text-white placeholder:text-zinc-500'
              : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-sm'
          }`}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className={`absolute right-4 top-1/2 -translate-y-1/2 ${
              isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {/* Content Type Filter Pills */}
        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: 'All Catalog' },
            { id: 'movie', label: 'Movies Only' },
            { id: 'series', label: 'TV Series Only' }
          ].map(type => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                selectedType === type.id
                  ? 'bg-purple-600 text-white shadow'
                  : isDark
                  ? 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Filter Toggle & Sort selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
              showFilters
                ? isDark
                  ? 'bg-zinc-800 text-white border-zinc-600'
                  : 'bg-slate-100 text-slate-900 border-slate-300'
                : isDark
                ? 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
          </button>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className={`px-3 py-1.5 rounded-xl text-xs border focus:outline-none focus:border-purple-500 ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                : 'bg-white border-slate-200 text-slate-700 shadow-xs'
            }`}
          >
            <option value="trending">Sort: Trending</option>
            <option value="rating">Sort: Top Rated</option>
            <option value="newest">Sort: Newest First</option>
            <option value="title">Sort: Title A-Z</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-rose-500 hover:underline px-2 font-medium"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Expandable Advanced Filter Panel */}
      {showFilters && (
        <div className={`p-4 rounded-2xl border grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs animate-fade-in ${
          isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          {/* Genre select */}
          <div>
            <label className={`block mb-1 font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Genre</label>
            <select
              value={selectedGenre}
              onChange={e => setSelectedGenre(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg ${
                isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <option value="all">All Genres</option>
              {availableGenres.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Language select */}
          <div>
            <label className={`block mb-1 font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Language</label>
            <select
              value={selectedLanguage}
              onChange={e => setSelectedLanguage(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg ${
                isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <option value="all">All Languages</option>
              {availableLanguages.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Year select */}
          <div>
            <label className={`block mb-1 font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Release Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg ${
                isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <option value="all">All Years</option>
              {['2026', '2025', '2024', '2023', '2022'].map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Min Rating select */}
          <div>
            <label className={`block mb-1 font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Minimum Rating</label>
            <select
              value={minRating}
              onChange={e => setMinRating(Number(e.target.value))}
              className={`w-full px-3 py-2 border rounded-lg ${
                isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <option value={0}>Any Rating</option>
              <option value={8.5}>★ 8.5+ Stellar</option>
              <option value={8.0}>★ 8.0+ Great</option>
              <option value={7.5}>★ 7.5+ Good</option>
            </select>
          </div>
        </div>
      )}

      {/* Results Count */}
      <div className={`flex items-center justify-between text-xs pt-2 border-t ${
        isDark ? 'text-zinc-400 border-zinc-800/60' : 'text-slate-500 border-slate-200'
      }`}>
        <span>
          Showing <strong className={isDark ? 'text-white' : 'text-slate-900'}>{filteredItems.length}</strong> streaming titles
          {searchQuery && <span> for &ldquo;{searchQuery}&rdquo;</span>}
        </span>
      </div>

      {/* Results Grid */}
      {filteredItems.length === 0 ? (
        <div className="py-16 text-center space-y-4">
          <div className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center border ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-slate-100 border-slate-200 text-slate-400'
          }`}>
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>No results matched your search</h3>
            <p className={`text-xs mt-1 max-w-sm mx-auto ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Try adjusting your search terms or clearing genre filters to discover more titles in the PiFlix+ catalog.
            </p>
          </div>
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {filteredItems.map(item => (
            <MovieCard key={item.id} content={item} />
          ))}
        </div>
      )}
    </div>
  );
};
