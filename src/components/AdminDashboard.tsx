import React, { useState, useEffect } from 'react';
import {
  Film, Tv, Users, DollarSign, Eye, Clock, BarChart3, Plus, Edit2, Trash2,
  Save, Sparkles, Sliders, ShieldCheck, CheckCircle2, AlertTriangle, Search,
  Radio, Layers, Check, X, RefreshCw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Movie, TVSeries, User, Season, Episode } from '../types';

export const AdminDashboard: React.FC = () => {
  const {
    settings,
    updateSettings,
    movies,
    seriesList,
    refreshContent,
    currentUser,
    setCurrentUser
  } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'movies' | 'series' | 'users' | 'settings'>('overview');
  const [overviewStats, setOverviewStats] = useState<any>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Movie edit/create modal state
  const [isMovieModalOpen, setIsMovieModalOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Partial<Movie> | null>(null);

  // Series edit/create modal state
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Partial<TVSeries> | null>(null);

  // Settings form state
  const [formSettings, setFormSettings] = useState({ ...settings });
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);

  // Load admin data
  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [ovRes, usrRes] = await Promise.all([
        fetch('/api/admin/overview').then(r => r.json()),
        fetch('/api/admin/users').then(r => r.json())
      ]);
      setOverviewStats(ovRes);
      if (Array.isArray(usrRes)) setUsersList(usrRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    setFormSettings({ ...settings });
  }, [settings]);

  // Handle save settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(formSettings);
    setSavedSettingsSuccess(true);
    setTimeout(() => setSavedSettingsSuccess(false), 3000);
  };

  // Handle Movie Save / Update
  const handleSaveMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovie) return;

    try {
      if (editingMovie.id) {
        // Update
        await fetch(`/api/movies/${editingMovie.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingMovie)
        });
      } else {
        // Create
        await fetch('/api/movies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingMovie)
        });
      }
      setIsMovieModalOpen(false);
      setEditingMovie(null);
      await refreshContent();
      await loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Movie Delete
  const handleDeleteMovie = async (id: string) => {
    if (!confirm('Are you sure you want to delete this movie?')) return;
    try {
      await fetch(`/api/movies/${id}`, { method: 'DELETE' });
      await refreshContent();
      await loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Series Save / Update
  const handleSaveSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeries) return;

    try {
      if (editingSeries.id) {
        await fetch(`/api/series/${editingSeries.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingSeries)
        });
      } else {
        await fetch('/api/series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingSeries)
        });
      }
      setIsSeriesModalOpen(false);
      setEditingSeries(null);
      await refreshContent();
      await loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Series Delete
  const handleDeleteSeries = async (id: string) => {
    if (!confirm('Are you sure you want to delete this TV series?')) return;
    try {
      await fetch(`/api/series/${id}`, { method: 'DELETE' });
      await refreshContent();
      await loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle user premium from admin
  const handleToggleUserPremium = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-premium`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUsersList(prev => prev.map(u => (u.id === userId ? data.user : u)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in text-zinc-100">
      {/* Admin Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Admin CMS Control Center
            </h1>
            <span className="bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold px-2.5 py-0.5 rounded-full">
              LIVE SYSTEM
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage PiFlix+ streaming catalog, Pi Network payment rates, ad gating intervals, and app branding in real-time.
          </p>
        </div>

        {/* Quick Persona Switcher for Verification */}
        <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800 text-xs">
          <span className="text-zinc-500 pl-2">Role:</span>
          <span className="font-bold text-purple-400">{currentUser.role.toUpperCase()}</span>
          {currentUser.role !== 'admin' && (
            <button
              onClick={() => setCurrentUser({ ...currentUser, role: 'admin' })}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition"
            >
              Enable Admin Mode
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-800 scrollbar-none">
        {[
          { id: 'overview', label: 'Platform Overview', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'movies', label: `Movies (${movies.length})`, icon: <Film className="w-4 h-4" /> },
          { id: 'series', label: `TV Series (${seriesList.length})`, icon: <Tv className="w-4 h-4" /> },
          { id: 'users', label: `Users & Pioneers (${usersList.length})`, icon: <Users className="w-4 h-4" /> },
          { id: 'settings', label: 'App & Ad Config', icon: <Sliders className="w-4 h-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {activeTab === 'overview' && overviewStats && (
        <div className="space-y-8">
          {/* Key Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-xs font-semibold">Total Views</span>
                <Eye className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white">{overviewStats.totalViews.toLocaleString()}</div>
              <span className="text-[10px] text-emerald-400 font-medium">↑ 24% this week</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-xs font-semibold">Watch Time</span>
                <Clock className="w-4 h-4 text-pink-400" />
              </div>
              <div className="text-2xl font-black text-white">{overviewStats.totalWatchTimeHours.toLocaleString()}h</div>
              <span className="text-[10px] text-zinc-400">Across all catalog</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-xs font-semibold">Pi Revenue</span>
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-amber-400">{overviewStats.piRevenue} Pi</div>
              <span className="text-[10px] text-emerald-400 font-medium">Verified on blockchain</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-xs font-semibold">VIP Subscribers</span>
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white">{overviewStats.premiumSubscribers}</div>
              <span className="text-[10px] text-purple-400 font-medium">Ad-Free Tier</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-xs font-semibold">Ad Impressions</span>
                <Radio className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-black text-white">{overviewStats.adViews.toLocaleString()}</div>
              <span className="text-[10px] text-zinc-400">Sponsored interstitials</span>
            </div>
          </div>

          {/* Analytics Visual Table & Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Movies by Views */}
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-purple-400" />
                <span>Top Streamed Movies</span>
              </h3>
              <div className="space-y-3">
                {overviewStats.topMovies?.map((m: any, idx: number) => (
                  <div key={m.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-zinc-500 font-bold text-xs w-4">#{idx + 1}</span>
                      <img src={m.poster} alt={m.title} className="w-8 h-11 object-cover rounded" />
                      <div className="truncate">
                        <div className="font-bold text-white truncate">{m.title}</div>
                        <div className="text-[10px] text-zinc-400">{m.genre?.[0]} • {m.year}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-purple-300 font-bold">{m.viewsCount?.toLocaleString()} views</div>
                      <div className="text-[10px] text-amber-400 font-semibold">★ {m.rating}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Series by Views */}
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-pink-400" />
                <span>Top Streamed TV Series</span>
              </h3>
              <div className="space-y-3">
                {overviewStats.topSeries?.map((s: any, idx: number) => (
                  <div key={s.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-zinc-500 font-bold text-xs w-4">#{idx + 1}</span>
                      <img src={s.poster} alt={s.title} className="w-8 h-11 object-cover rounded" />
                      <div className="truncate">
                        <div className="font-bold text-white truncate">{s.title}</div>
                        <div className="text-[10px] text-zinc-400">{s.seasonsCount} Seasons • {s.genre?.[0]}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-pink-300 font-bold">{s.viewsCount?.toLocaleString()} views</div>
                      <div className="text-[10px] text-amber-400 font-semibold">★ {s.rating}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MOVIES MANAGEMENT */}
      {activeTab === 'movies' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search movies by title, genre, actor..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={() => {
                setEditingMovie({
                  title: '',
                  description: '',
                  poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
                  backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
                  videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
                  trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
                  year: 2025,
                  duration: 95,
                  genre: ['Action', 'Sci-Fi'],
                  language: 'English',
                  country: 'International',
                  director: 'Director Name',
                  cast: ['Lead Actor', 'Supporting Actor'],
                  rating: 8.5,
                  ageClassification: 'PG-13',
                  qualityBadge: '4K',
                  isFeatured: false,
                  isTrending: true,
                  isPremium: false,
                  isPublished: true
                });
                setIsMovieModalOpen(true);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Movie</span>
            </button>
          </div>

          {/* Movies Table */}
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">Movie</th>
                  <th className="p-3.5">Year / Duration</th>
                  <th className="p-3.5">Genre</th>
                  <th className="p-3.5">Rating</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Premium</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {movies
                  .filter(m => !searchTerm || m.title.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(movie => (
                    <tr key={movie.id} className="hover:bg-zinc-800/30 transition">
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <img src={movie.poster} alt={movie.title} className="w-9 h-13 object-cover rounded" />
                          <div>
                            <div className="font-bold text-white">{movie.title}</div>
                            <div className="text-[10px] text-zinc-500">{movie.director}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 text-zinc-300">
                        {movie.year} • {movie.duration}m
                      </td>
                      <td className="p-3.5 text-zinc-400">{movie.genre?.join(', ')}</td>
                      <td className="p-3.5 text-amber-400 font-bold">★ {movie.rating}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${movie.isPublished ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-800 text-zinc-400'}`}>
                          {movie.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {movie.isPremium ? (
                          <span className="text-pink-400 font-bold text-[10px] flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> VIP
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-[10px]">Free</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingMovie(movie);
                            setIsMovieModalOpen(true);
                          }}
                          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMovie(movie.id)}
                          className="p-1.5 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-400 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SERIES MANAGEMENT */}
      {activeTab === 'series' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-300">Manage TV Shows & Episodes</h2>
            <button
              onClick={() => {
                setEditingSeries({
                  title: '',
                  description: '',
                  poster: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
                  backdrop: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
                  trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
                  year: 2025,
                  genre: ['TV Series', 'Sci-Fi'],
                  language: 'English',
                  country: 'International',
                  director: 'Series Creator',
                  cast: ['Actor 1', 'Actor 2'],
                  rating: 8.9,
                  ageClassification: '16+',
                  qualityBadge: '4K',
                  isFeatured: true,
                  isTrending: true,
                  isPremium: false,
                  isPublished: true
                });
                setIsSeriesModalOpen(true);
              }}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add New TV Series</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {seriesList.map(series => (
              <div key={series.id} className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                <div className="flex gap-3">
                  <img src={series.poster} alt={series.title} className="w-16 h-24 object-cover rounded-lg" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{series.title}</h3>
                    <div className="text-[11px] text-zinc-400">{series.year} • {series.seasonsCount} Seasons</div>
                    <div className="text-[11px] text-amber-400 font-bold">★ {series.rating}</div>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-300">
                      {series.genre?.[0]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500">{series.viewsCount?.toLocaleString()} views</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingSeries(series);
                        setIsSeriesModalOpen(true);
                      }}
                      className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSeries(series.id)}
                      className="p-1.5 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">User</th>
                  <th className="p-3.5">Role</th>
                  <th className="p-3.5">Pi Wallet</th>
                  <th className="p-3.5">Plan / Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {usersList.map(u => (
                  <tr key={u.id} className="hover:bg-zinc-800/30 transition">
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <img src={u.profileImage} alt={u.username} className="w-8 h-8 rounded-full object-cover" />
                        <div>
                          <div className="font-bold text-white">{u.username}</div>
                          <div className="text-[10px] text-zinc-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${u.role === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-zinc-800 text-zinc-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-zinc-400">{u.piUsername || 'Not linked'}</td>
                    <td className="p-3.5">
                      {u.premiumStatus ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-700/60 flex items-center gap-1 w-fit">
                          <Sparkles className="w-3 h-3" /> VIP {u.subscriptionPlan}
                        </span>
                      ) : (
                        <span className="text-zinc-500">Free Tier</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleToggleUserPremium(u.id)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition ${
                          u.premiumStatus
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        }`}
                      >
                        {u.premiumStatus ? 'Revoke VIP' : 'Grant VIP'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: APP SETTINGS & AD GATING CONFIG (Section 28 & 12) */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl">
          {savedSettingsSuccess && (
            <div className="p-4 bg-emerald-950/80 border border-emerald-600 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Application settings successfully updated and live for all users!</span>
            </div>
          )}

          {/* Section 1: Branding */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>Branding & General Information</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Application Name</label>
                <input
                  type="text"
                  value={formSettings.appName}
                  onChange={e => setFormSettings({ ...formSettings, appName: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Tagline</label>
                <input
                  type="text"
                  value={formSettings.tagline}
                  onChange={e => setFormSettings({ ...formSettings, tagline: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-zinc-400 mb-1 font-medium">Announcement Banner Message</label>
                <input
                  type="text"
                  value={formSettings.announcement || ''}
                  onChange={e => setFormSettings({ ...formSettings, announcement: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Advertising Gated Viewing System (Section 12) */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <span>Ad Interstitial Gated Viewing Engine</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  Initial Free Playback Window (Minutes)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={formSettings.freeViewingDurationMinutes}
                  onChange={e => setFormSettings({ ...formSettings, freeViewingDurationMinutes: parseFloat(e.target.value) || 5 })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  Free users watch uninterrupted for this initial duration before the first ad.
                </span>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  Subsequent Ad Interval (Minutes)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={formSettings.adIntervalMinutes}
                  onChange={e => setFormSettings({ ...formSettings, adIntervalMinutes: parseFloat(e.target.value) || 2 })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  After watching the required ad, playback continues for this duration before next ad.
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Pi Network Subscription Pricing (Section 13) */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-pink-400" />
              <span>Pi Network Subscription Pricing</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Monthly VIP Price (Pi)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formSettings.monthlyPricePi}
                  onChange={e => setFormSettings({ ...formSettings, monthlyPricePi: parseFloat(e.target.value) || 3.14 })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Annual VIP Price (Pi)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formSettings.annualPricePi}
                  onChange={e => setFormSettings({ ...formSettings, annualPricePi: parseFloat(e.target.value) || 29.99 })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg transition"
          >
            <Save className="w-4 h-4" />
            <span>Save & Apply Settings</span>
          </button>
        </form>
      )}

      {/* EDIT / CREATE MOVIE MODAL */}
      {isMovieModalOpen && editingMovie && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-[#10121a] rounded-2xl border border-zinc-800 p-6 space-y-5 text-white my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-bold">
                {editingMovie.id ? `Edit Movie: ${editingMovie.title}` : 'Add New Movie to PiFlix+'}
              </h3>
              <button onClick={() => setIsMovieModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovie} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 mb-1">Movie Title</label>
                  <input
                    type="text"
                    required
                    value={editingMovie.title || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, title: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editingMovie.description || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, description: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Poster Image URL</label>
                  <input
                    type="url"
                    value={editingMovie.poster || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, poster: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Backdrop Image URL</label>
                  <input
                    type="url"
                    value={editingMovie.backdrop || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, backdrop: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Stream Video URL (MP4)</label>
                  <input
                    type="url"
                    value={editingMovie.videoUrl || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, videoUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Adaptive HLS URL (.m3u8 optional)</label>
                  <input
                    type="text"
                    value={editingMovie.hlsUrl || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, hlsUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Year</label>
                  <input
                    type="number"
                    value={editingMovie.year || 2025}
                    onChange={e => setEditingMovie({ ...editingMovie, year: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={editingMovie.duration || 90}
                    onChange={e => setEditingMovie({ ...editingMovie, duration: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Genre (comma-separated)</label>
                  <input
                    type="text"
                    value={editingMovie.genre?.join(', ') || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, genre: e.target.value.split(',').map(s => s.trim()) })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Rating (1 - 10)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="10"
                    value={editingMovie.rating || 8.5}
                    onChange={e => setEditingMovie({ ...editingMovie, rating: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Director</label>
                  <input
                    type="text"
                    value={editingMovie.director || ''}
                    onChange={e => setEditingMovie({ ...editingMovie, director: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Language</label>
                  <input
                    type="text"
                    value={editingMovie.language || 'English'}
                    onChange={e => setEditingMovie({ ...editingMovie, language: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Status checkboxes */}
              <div className="flex flex-wrap gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingMovie.isFeatured || false}
                    onChange={e => setEditingMovie({ ...editingMovie, isFeatured: e.target.checked })}
                    className="rounded text-purple-600"
                  />
                  <span>Featured Hero Carousel</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingMovie.isTrending || false}
                    onChange={e => setEditingMovie({ ...editingMovie, isTrending: e.target.checked })}
                    className="rounded text-purple-600"
                  />
                  <span>Trending Now</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingMovie.isPremium || false}
                    onChange={e => setEditingMovie({ ...editingMovie, isPremium: e.target.checked })}
                    className="rounded text-purple-600"
                  />
                  <span>VIP Premium Only</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsMovieModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg"
                >
                  Save Movie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
