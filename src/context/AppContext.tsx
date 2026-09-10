import React, { createContext, useContext, useState, useEffect } from 'react';
import { Movie, TVSeries, Episode, User, AppSettings, WatchHistoryItem, WatchlistItem, LikedItem, AppNotification, ContentType } from '../types';
import { initialSettings, defaultUsers } from '../data/mockData';

interface AppContextType {
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Settings
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;

  // User & Auth
  currentUser: User;
  setCurrentUser: (user: User) => void;
  login: (username: string, pass?: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;

  // Content Data
  movies: Movie[];
  seriesList: TVSeries[];
  refreshContent: () => Promise<void>;

  // Navigation / Views
  activeTab: 'home' | 'movies' | 'series' | 'trending' | 'search' | 'watchlist' | 'premium' | 'admin' | 'profile';
  setActiveTab: (tab: 'home' | 'movies' | 'series' | 'trending' | 'search' | 'watchlist' | 'premium' | 'admin' | 'profile') => void;

  // Details Modal
  selectedContent: Movie | TVSeries | null;
  selectedContentType: ContentType;
  openDetails: (content: Movie | TVSeries, type?: ContentType) => void;
  closeDetails: () => void;

  // Video Player Modal
  activePlayingItem: {
    content: Movie | TVSeries;
    episode?: Episode;
    initialSeek?: number;
  } | null;
  playVideo: (content: Movie | TVSeries, episode?: Episode, initialSeek?: number) => void;
  closePlayer: () => void;

  // Watchlist & History
  watchlist: WatchlistItem[];
  watchHistory: (WatchHistoryItem & { content?: Movie | TVSeries; episode?: Episode })[];
  toggleWatchlist: (contentId: string, contentType: ContentType) => Promise<boolean>;
  isInWatchlist: (contentId: string) => boolean;
  recordProgress: (contentId: string, contentType: ContentType, progressSeconds: number, durationSeconds: number, episodeId?: string) => Promise<void>;

  // Likes
  likedIds: string[];
  toggleLike: (movieId: string) => Promise<void>;

  // Notifications
  notifications: AppNotification[];
  unreadNotifsCount: number;
  markNotificationsRead: (id?: string) => Promise<void>;

  // Pi Payment Modal
  isPiPaymentOpen: boolean;
  selectedPlanForPayment: 'monthly' | 'annual';
  openPiPayment: (plan?: 'monthly' | 'annual') => void;
  closePiPayment: () => void;
  onPaymentSuccess: (user: User) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('piflix_theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('piflix_current_user');
    return saved ? JSON.parse(saved) : defaultUsers[1]; // default to demo user
  });

  const [movies, setMovies] = useState<Movie[]>([]);
  const [seriesList, setSeriesList] = useState<TVSeries[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'series' | 'trending' | 'search' | 'watchlist' | 'premium' | 'admin' | 'profile'>('home');

  const [selectedContent, setSelectedContent] = useState<Movie | TVSeries | null>(null);
  const [selectedContentType, setSelectedContentType] = useState<ContentType>('movie');

  const [activePlayingItem, setActivePlayingItem] = useState<{
    content: Movie | TVSeries;
    episode?: Episode;
    initialSeek?: number;
  } | null>(null);

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchHistory, setWatchHistory] = useState<(WatchHistoryItem & { content?: Movie | TVSeries; episode?: Episode })[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>(['m-serengeti-whispers']);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [isPiPaymentOpen, setIsPiPaymentOpen] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<'monthly' | 'annual'>('monthly');

  const [searchQuery, setSearchQuery] = useState('');

  // Update theme on html element
  useEffect(() => {
    localStorage.setItem('piflix_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [theme]);

  // Persist current user
  useEffect(() => {
    localStorage.setItem('piflix_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  // Load initial content & settings from API
  const refreshContent = async () => {
    try {
      const [moviesRes, seriesRes, settingsRes, historyRes, watchlistRes, notifsRes] = await Promise.all([
        fetch('/api/movies?publishedOnly=true').then(r => r.json()),
        fetch('/api/series').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
        fetch(`/api/history?userId=${currentUser.id}`).then(r => r.json()),
        fetch(`/api/watchlist?userId=${currentUser.id}`).then(r => r.json()),
        fetch('/api/notifications').then(r => r.json())
      ]);

      if (Array.isArray(moviesRes)) setMovies(moviesRes);
      if (Array.isArray(seriesRes)) setSeriesList(seriesRes);
      if (settingsRes && settingsRes.appName) setSettings(settingsRes);
      if (Array.isArray(historyRes)) setWatchHistory(historyRes);
      if (Array.isArray(watchlistRes)) setWatchlist(watchlistRes);
      if (Array.isArray(notifsRes)) setNotifications(notifsRes);
    } catch (err) {
      console.warn('Backend fetch error, relying on initial state', err);
    }
  };

  useEffect(() => {
    refreshContent();
  }, [currentUser.id]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      setSettings(prev => ({ ...prev, ...newSettings }));
    }
  };

  const login = async (username: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCurrentUser(data.user);
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(defaultUsers[1]); // revert to demo user
    setActiveTab('home');
  };

  const openDetails = (content: Movie | TVSeries, type?: ContentType) => {
    const determinedType = type || ('seasonsCount' in content ? 'series' : 'movie');
    setSelectedContent(content);
    setSelectedContentType(determinedType);
  };

  const closeDetails = () => {
    setSelectedContent(null);
  };

  const playVideo = (content: Movie | TVSeries, episode?: Episode, initialSeek?: number) => {
    setActivePlayingItem({
      content,
      episode,
      initialSeek
    });
  };

  const closePlayer = () => {
    setActivePlayingItem(null);
    // Refresh history
    fetch(`/api/history?userId=${currentUser.id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setWatchHistory(data);
      })
      .catch(() => {});
  };

  const toggleWatchlist = async (contentId: string, contentType: ContentType) => {
    try {
      const res = await fetch('/api/watchlist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          contentId,
          contentType
        })
      });
      const data = await res.json();
      const inWatchlist = Boolean(data.inWatchlist);

      if (inWatchlist) {
        const movie = movies.find(m => m.id === contentId);
        const series = seriesList.find(s => s.id === contentId);
        setWatchlist(prev => [
          {
            id: 'wl-' + Date.now(),
            userId: currentUser.id,
            contentId,
            contentType,
            addedAt: new Date().toISOString(),
            content: movie || series
          } as any,
          ...prev
        ]);
      } else {
        setWatchlist(prev => prev.filter(w => w.contentId !== contentId));
      }
      return inWatchlist;
    } catch (e) {
      // local fallback
      const exists = watchlist.some(w => w.contentId === contentId);
      if (exists) {
        setWatchlist(prev => prev.filter(w => w.contentId !== contentId));
        return false;
      } else {
        setWatchlist(prev => [{
          id: 'wl-' + Date.now(),
          userId: currentUser.id,
          contentId,
          contentType,
          addedAt: new Date().toISOString()
        }, ...prev]);
        return true;
      }
    }
  };

  const isInWatchlist = (contentId: string) => {
    return watchlist.some(w => w.contentId === contentId);
  };

  const toggleLike = async (movieId: string) => {
    try {
      const res = await fetch(`/api/movies/${movieId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (data.success) {
        if (data.liked) {
          setLikedIds(prev => [...prev, movieId]);
        } else {
          setLikedIds(prev => prev.filter(id => id !== movieId));
        }
        setMovies(prev =>
          prev.map(m => (m.id === movieId ? { ...m, likesCount: data.likesCount } : m))
        );
      }
    } catch (e) {
      // local fallback
      setLikedIds(prev =>
        prev.includes(movieId) ? prev.filter(id => id !== movieId) : [...prev, movieId]
      );
    }
  };

  const recordProgress = async (
    contentId: string,
    contentType: ContentType,
    progressSeconds: number,
    durationSeconds: number,
    episodeId?: string
  ) => {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          contentId,
          contentType,
          episodeId,
          progressSeconds,
          durationSeconds
        })
      });
    } catch (e) {
      console.warn('Failed recording watch progress', e);
    }
  };

  const markNotificationsRead = async (id?: string) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setNotifications(prev =>
        prev.map(n => (id ? (n.id === id ? { ...n, read: true } : n) : { ...n, read: true }))
      );
    } catch (e) {}
  };

  const openPiPayment = (plan: 'monthly' | 'annual' = 'monthly') => {
    setSelectedPlanForPayment(plan);
    setIsPiPaymentOpen(true);
  };

  const closePiPayment = () => {
    setIsPiPaymentOpen(false);
  };

  const onPaymentSuccess = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setIsPiPaymentOpen(false);
    refreshContent();
  };

  const unreadNotifsCount = notifications.filter(n => !n.read).length;
  const isAdmin = currentUser.role === 'admin';

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        settings,
        updateSettings,
        currentUser,
        setCurrentUser,
        login,
        logout,
        isAdmin,
        movies,
        seriesList,
        refreshContent,
        activeTab,
        setActiveTab,
        selectedContent,
        selectedContentType,
        openDetails,
        closeDetails,
        activePlayingItem,
        playVideo,
        closePlayer,
        watchlist,
        watchHistory,
        toggleWatchlist,
        isInWatchlist,
        recordProgress,
        likedIds,
        toggleLike,
        notifications,
        unreadNotifsCount,
        markNotificationsRead,
        isPiPaymentOpen,
        selectedPlanForPayment,
        openPiPayment,
        closePiPayment,
        onPaymentSuccess,
        searchQuery,
        setSearchQuery
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
