import React, { createContext, useContext, useState, useEffect } from 'react';
import { Movie, TVSeries, Episode, User, AppSettings, WatchHistoryItem, WatchlistItem, LikedItem, AppNotification, ContentType, ContentItem } from '../types';
import { initialSettings, defaultUsers } from '../data/mockData';
import { subscribeToContent } from '../lib/firebaseContent';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { loginAdminWithEmail, loginAdminWithGoogle, registerAdminAccount, logoutAdminUser, verifyTokenWithBackend } from '../lib/firebaseAuth';
import { authenticateWithPi } from '../lib/piAuth';
import { getDeterministicEmoji } from '../lib/avatar';

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
  adminToken: string | null;
  adminLogin: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  adminLoginGoogle: () => Promise<{ success: boolean; error?: string }>;
  adminRegister: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  adminLogout: () => void;
  firebaseAdminUser: FirebaseUser | null;

  // Pi Network Auth
  isPiAuthenticating: boolean;
  piAuthError: string | null;
  clearPiAuthError: () => void;
  signInWithPi: (silent?: boolean) => Promise<{ success: boolean; error?: string; user?: User }>;

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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.profileImage && (parsed.profileImage.includes('dicebear') || parsed.profileImage.includes('bottts'))) {
          parsed.profileImage = getDeterministicEmoji(parsed.piUsername || parsed.username);
          localStorage.setItem('piflix_current_user', JSON.stringify(parsed));
        }
        return parsed;
      } catch (e) {
        console.warn('Failed to parse cached user:', e);
      }
    }
    return defaultUsers[1]; // default to demo user
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
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [firebaseAdminUser, setFirebaseAdminUser] = useState<FirebaseUser | null>(null);

  // Pi Network authentication states
  const [isPiAuthenticating, setIsPiAuthenticating] = useState<boolean>(false);
  const [piAuthError, setPiAuthError] = useState<string | null>(null);

  const clearPiAuthError = () => setPiAuthError(null);

  const signInWithPi = async (silent: boolean = false): Promise<{ success: boolean; error?: string; user?: User }> => {
    setIsPiAuthenticating(true);
    setPiAuthError(null);
    try {
      const result = await authenticateWithPi({ isAuto: silent });
      if (result.success && result.user) {
        setCurrentUser(result.user);
        setIsPiAuthenticating(false);
        return { success: true, user: result.user };
      } else {
        const errMsg = result.error || 'Pi Network authentication failed';
        if (!silent) {
          setPiAuthError(errMsg);
        } else {
          console.info('[Pi Auth] Auto-authentication check:', errMsg);
        }
        setIsPiAuthenticating(false);
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unexpected error during Pi authentication';
      if (!silent) setPiAuthError(errMsg);
      setIsPiAuthenticating(false);
      return { success: false, error: errMsg };
    }
  };

  // Requirement: Trigger Pi authentication automatically when the app loads
  useEffect(() => {
    signInWithPi(true);
  }, []);

  // Real Firebase Auth listener for Admin role verification
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          const verification = await verifyTokenWithBackend(token);
          if (verification.isAdmin) {
            setIsAdmin(true);
            setAdminToken(token);
            setFirebaseAdminUser(fbUser);
            localStorage.setItem('piflix_admin_token', token);
            setCurrentUser(prev => ({
              ...prev,
              id: fbUser.uid,
              username: fbUser.displayName || fbUser.email?.split('@')[0] || 'Administrator',
              email: fbUser.email || '',
              role: 'admin'
            }));
            return;
          }
        } catch (err) {
          console.warn('Firebase Auth state verification error:', err);
        }
      }

      // If user is not authenticated or lacks administrator role
      setIsAdmin(false);
      setAdminToken(null);
      setFirebaseAdminUser(null);
      localStorage.removeItem('piflix_admin_token');
    });

    return () => unsubscribe();
  }, []);

  const adminLogin = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    if (!password) {
      return { success: false, error: 'Password is required' };
    }
    const result = await loginAdminWithEmail(email, password);
    if (result.success && result.token) {
      setIsAdmin(true);
      setAdminToken(result.token);
      if (result.user) setFirebaseAdminUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error || 'Authentication failed' };
  };

  const adminLoginGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    const result = await loginAdminWithGoogle();
    if (result.success && result.token) {
      setIsAdmin(true);
      setAdminToken(result.token);
      if (result.user) setFirebaseAdminUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error || 'Google authentication failed' };
  };

  const adminRegister = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const result = await registerAdminAccount(email, password);
    if (result.success && result.token) {
      setIsAdmin(true);
      setAdminToken(result.token);
      if (result.user) setFirebaseAdminUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error || 'Registration failed' };
  };

  const adminLogout = async () => {
    await logoutAdminUser();
    setIsAdmin(false);
    setAdminToken(null);
    setFirebaseAdminUser(null);
    setCurrentUser(defaultUsers[1]);
    setActiveTab('home');
  };

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

  // Helper to merge ContentItems into Movie / TVSeries state
  const mergeContentItems = (items: ContentItem[]) => {
    if (!items || items.length === 0) return;

    const publishedMovies = items.filter(i => i.type === 'movie' && i.published);
    const publishedSeries = items.filter(i => i.type === 'series' && i.published);

    if (publishedMovies.length > 0) {
      setMovies(prev => {
        const map = new Map(prev.map(m => [m.id, m]));
        publishedMovies.forEach(item => {
          map.set(item.id, {
            id: item.id,
            title: item.title,
            description: item.description,
            poster: item.coverImageUrl,
            backdrop: item.coverImageUrl,
            coverImageUrl: item.coverImageUrl,
            videoUrl: item.videoUrl,
            trailerUrl: item.trailerUrl || '',
            year: item.year,
            duration: 95,
            genre: Array.isArray(item.genre) ? item.genre : [item.genre],
            language: item.language,
            country: 'International',
            director: 'Creator',
            cast: [],
            rating: item.rating,
            ageClassification: 'PG-13',
            isPremium: item.accessType === 'premium',
            accessType: item.accessType,
            isFeatured: false,
            isTrending: true,
            isPublished: item.published,
            published: item.published,
            qualityBadge: item.quality,
            viewsCount: 0,
            likesCount: 0,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          });
        });
        return Array.from(map.values());
      });
    }

    if (publishedSeries.length > 0) {
      setSeriesList(prev => {
        const map = new Map(prev.map(s => [s.id, s]));
        publishedSeries.forEach(item => {
          map.set(item.id, {
            id: item.id,
            title: item.title,
            description: item.description,
            poster: item.coverImageUrl,
            backdrop: item.coverImageUrl,
            coverImageUrl: item.coverImageUrl,
            trailerUrl: item.trailerUrl || '',
            year: item.year,
            genre: Array.isArray(item.genre) ? item.genre : [item.genre],
            language: item.language,
            country: 'International',
            director: 'Creator',
            cast: [],
            rating: item.rating,
            ageClassification: 'PG-13',
            isPremium: item.accessType === 'premium',
            accessType: item.accessType,
            isFeatured: false,
            isTrending: true,
            isPublished: item.published,
            published: item.published,
            qualityBadge: item.quality,
            viewsCount: 0,
            likesCount: 0,
            seasonsCount: 1,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          });
        });
        return Array.from(map.values());
      });
    }
  };

  // Load initial content & settings from API
  const refreshContent = async () => {
    try {
      const [moviesRes, seriesRes, contentRes, settingsRes, historyRes, watchlistRes, notifsRes] = await Promise.all([
        fetch('/api/movies?publishedOnly=true').then(r => r.json()).catch(() => []),
        fetch('/api/series').then(r => r.json()).catch(() => []),
        fetch('/api/content?publishedOnly=true').then(r => r.json()).catch(() => []),
        fetch('/api/settings').then(r => r.json()).catch(() => null),
        fetch(`/api/history?userId=${currentUser.id}`).then(r => r.json()).catch(() => []),
        fetch(`/api/watchlist?userId=${currentUser.id}`).then(r => r.json()).catch(() => []),
        fetch('/api/notifications').then(r => r.json()).catch(() => [])
      ]);

      if (Array.isArray(moviesRes)) setMovies(moviesRes);
      if (Array.isArray(seriesRes)) setSeriesList(seriesRes);
      if (Array.isArray(contentRes)) mergeContentItems(contentRes);
      if (settingsRes && settingsRes.appName) setSettings(settingsRes);
      if (Array.isArray(historyRes)) setWatchHistory(historyRes);
      if (Array.isArray(watchlistRes)) setWatchlist(watchlistRes);
      if (Array.isArray(notifsRes)) setNotifications(notifsRes);
    } catch (err) {
      console.warn('Backend fetch error, relying on initial state', err);
    }
  };

  // Real-time Firestore sync: Any newly published content shows up instantly in the app!
  useEffect(() => {
    const unsubscribe = subscribeToContent((items) => {
      mergeContentItems(items);
    });
    return () => unsubscribe();
  }, []);

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
    localStorage.removeItem('piflix_pi_access_token');
    localStorage.removeItem('piflix_user_token');
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
        adminToken,
        adminLogin,
        adminLoginGoogle,
        adminRegister,
        adminLogout,
        firebaseAdminUser,
        isPiAuthenticating,
        piAuthError,
        clearPiAuthError,
        signInWithPi,
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
