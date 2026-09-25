import React, { createContext, useContext, useState, useEffect } from 'react';
import { Movie, TVSeries, Episode, User, AppSettings, WatchHistoryItem, WatchlistItem, LikedItem, AppNotification, ContentType, ContentItem } from '../types';
import { initialSettings, defaultUsers, sampleMovies, sampleSeries } from '../data/mockData';
import { subscribeToContent, fetchSettingsFromFirestore, saveSettingsToFirestore, subscribeToSettings } from '../lib/firebaseContent';
import { subscribeToUserNotifications, markNotificationAsRead, markAllNotificationsAsRead, createNotification } from '../lib/firebaseNotifications';
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
  removeContentItem: (id: string) => void;

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

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('piflix_app_settings');
    if (saved) {
      try {
        return { ...initialSettings, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('Failed to parse cached app settings:', e);
      }
    }
    return initialSettings;
  });
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

  // Helper to reliably sort items with newest and recently modified content first
  const sortNewestFirst = <T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      const timeA = new Date(a.updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
      return timeB - timeA;
    });
  };

  const [movies, setMovies] = useState<Movie[]>(() => {
    try {
      const cached = localStorage.getItem('piflix_cached_movies');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return sortNewestFirst(parsed);
      }
    } catch {}
    return sortNewestFirst(sampleMovies);
  });

  const [seriesList, setSeriesList] = useState<TVSeries[]>(() => {
    try {
      const cached = localStorage.getItem('piflix_cached_series');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return sortNewestFirst(parsed);
      }
    } catch {}
    return sortNewestFirst(sampleSeries);
  });
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

  // Persist content to localStorage cache for instant loading without flicker
  useEffect(() => {
    if (movies.length > 0) {
      try {
        localStorage.setItem('piflix_cached_movies', JSON.stringify(movies));
      } catch {}
    }
  }, [movies]);

  useEffect(() => {
    if (seriesList.length > 0) {
      try {
        localStorage.setItem('piflix_cached_series', JSON.stringify(seriesList));
      } catch {}
    }
  }, [seriesList]);

  // Track permanently deleted content IDs across reloads/syncs
  const getDeletedIds = (): Set<string> => {
    try {
      const stored = localStorage.getItem('piflix_deleted_content_ids');
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set();
  };

  // Remove a content item immediately from local state and remember its deleted status
  const removeContentItem = (id: string) => {
    try {
      const currentDeleted = getDeletedIds();
      currentDeleted.add(id);
      localStorage.setItem('piflix_deleted_content_ids', JSON.stringify(Array.from(currentDeleted)));
    } catch {}

    setMovies(prev => prev.filter(m => m.id !== id));
    setSeriesList(prev => prev.filter(s => s.id !== id));
    setSelectedContent(prev => (prev?.id === id ? null : prev));
    setActivePlayingItem(prev => (prev?.content.id === id ? null : prev));
  };

  const unmarkDeleted = (id: string) => {
    try {
      const currentDeleted = getDeletedIds();
      if (currentDeleted.has(id)) {
        currentDeleted.delete(id);
        localStorage.setItem('piflix_deleted_content_ids', JSON.stringify(Array.from(currentDeleted)));
      }
    } catch {}
  };

  // Helper to merge ContentItems into Movie / TVSeries state
  const mergeContentItems = (items: ContentItem[]) => {
    if (!items || !Array.isArray(items)) return;
    const deleted = getDeletedIds();
    const activeItems = items.filter(i => !deleted.has(i.id));

    const moviesFromItems = activeItems.filter(i => i.type === 'movie');
    const seriesFromItems = activeItems.filter(i => i.type === 'series');

    setMovies(prev => {
      const filteredPrev = prev.filter(m => !deleted.has(m.id));
      const map = new Map<string, Movie>(filteredPrev.map(m => [m.id, m]));
      moviesFromItems.forEach(item => {
        unmarkDeleted(item.id);
        const existing = map.get(item.id);
        const itemUpdated = new Date(item.updatedAt || item.createdAt || 0).getTime();
        const existingUpdated = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime();
        if (existing && existingUpdated > itemUpdated) {
          // Keep existing if local state has a strictly newer timestamp
          return;
        }

        map.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          poster: item.coverImageUrl || existing?.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
          backdrop: item.coverImageUrl || existing?.backdrop || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
          coverImageUrl: item.coverImageUrl || existing?.coverImageUrl || '',
          videoUrl: item.videoUrl || existing?.videoUrl || '',
          trailerUrl: item.trailerUrl || existing?.trailerUrl || '',
          year: item.year || existing?.year || new Date().getFullYear(),
          duration: Number(item.duration) || existing?.duration || 95,
          genre: Array.isArray(item.genre) ? item.genre : (item.genre ? String(item.genre).split(',').map(s => s.trim()) : (existing?.genre || ['Action'])),
          language: item.language || existing?.language || 'English',
          country: item.country || existing?.country || 'International',
          director: item.director || existing?.director || 'Creator',
          cast: Array.isArray(item.cast) ? item.cast : (existing?.cast || []),
          rating: item.rating !== undefined ? Number(item.rating) : (existing?.rating || 8.0),
          ageClassification: (item as any).ageClassification || existing?.ageClassification || 'PG-13',
          isPremium: item.accessType === 'premium',
          accessType: item.accessType || (item.accessType === 'premium' ? 'premium' : 'free'),
          isFeatured: item.isFeatured !== undefined ? item.isFeatured : (existing?.isFeatured || false),
          isTrending: item.isTrending !== undefined ? item.isTrending : (existing?.isTrending !== undefined ? existing.isTrending : true),
          isPublished: item.published !== false,
          published: item.published !== false,
          qualityBadge: item.quality || existing?.qualityBadge || 'HD',
          viewsCount: existing?.viewsCount || 0,
          likesCount: existing?.likesCount || 0,
          createdAt: item.createdAt || existing?.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        });
      });
      return sortNewestFirst(Array.from(map.values()));
    });

    setSeriesList(prev => {
      const filteredPrev = prev.filter(s => !deleted.has(s.id));
      const map = new Map<string, TVSeries>(filteredPrev.map(s => [s.id, s]));
      seriesFromItems.forEach(item => {
        unmarkDeleted(item.id);
        const existing = map.get(item.id);
        const itemUpdated = new Date(item.updatedAt || item.createdAt || 0).getTime();
        const existingUpdated = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime();
        if (existing && existingUpdated > itemUpdated) {
          return;
        }

        const resolvedSeasons = item.seasons || existing?.seasons;
        const resolvedEpisodes = (item.episodes as any) || existing?.episodes;
        const resolvedCount = item.seasonsCount || (resolvedSeasons ? resolvedSeasons.length : (existing?.seasonsCount || 1));

        map.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          poster: item.coverImageUrl || existing?.poster || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
          backdrop: item.coverImageUrl || existing?.backdrop || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
          coverImageUrl: item.coverImageUrl || existing?.coverImageUrl || '',
          trailerUrl: item.trailerUrl || existing?.trailerUrl || '',
          year: item.year || existing?.year || new Date().getFullYear(),
          genre: Array.isArray(item.genre) ? item.genre : (item.genre ? String(item.genre).split(',').map(s => s.trim()) : (existing?.genre || ['Drama'])),
          language: item.language || existing?.language || 'English',
          country: item.country || existing?.country || 'International',
          director: item.director || existing?.director || 'Creator',
          cast: Array.isArray(item.cast) ? item.cast : (existing?.cast || []),
          rating: item.rating !== undefined ? Number(item.rating) : (existing?.rating || 8.5),
          ageClassification: (item as any).ageClassification || existing?.ageClassification || 'PG-13',
          isPremium: item.accessType === 'premium',
          accessType: item.accessType || (item.accessType === 'premium' ? 'premium' : 'free'),
          isFeatured: item.isFeatured !== undefined ? item.isFeatured : (existing?.isFeatured || false),
          isTrending: item.isTrending !== undefined ? item.isTrending : (existing?.isTrending !== undefined ? existing.isTrending : true),
          isPublished: item.published !== false,
          published: item.published !== false,
          qualityBadge: item.quality || existing?.qualityBadge || 'HD',
          viewsCount: existing?.viewsCount || 0,
          likesCount: existing?.likesCount || 0,
          seasonsCount: resolvedCount,
          seasons: resolvedSeasons,
          episodes: resolvedEpisodes,
          createdAt: item.createdAt || existing?.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        });
      });
      return sortNewestFirst(Array.from(map.values()));
    });
  };

  // Load initial content & settings from API
  const refreshContent = async () => {
    try {
      const deleted = getDeletedIds();
      const [moviesRes, seriesRes, contentRes, settingsRes, historyRes, watchlistRes, notifsRes, likesRes] = await Promise.all([
        fetch('/api/movies').then(r => r.json()).catch(() => []),
        fetch('/api/series').then(r => r.json()).catch(() => []),
        fetch('/api/content?publishedOnly=false').then(r => r.json()).catch(() => []),
        fetch('/api/settings').then(r => r.json()).catch(() => null),
        fetch(`/api/history?userId=${currentUser.id}`).then(r => r.json()).catch(() => []),
        fetch(`/api/watchlist?userId=${currentUser.id}`).then(r => r.json()).catch(() => []),
        fetch('/api/notifications').then(r => r.json()).catch(() => []),
        fetch(`/api/likes?userId=${currentUser.id}`).then(r => r.json()).catch(() => [])
      ]);

      if (Array.isArray(moviesRes) && moviesRes.length > 0) {
        const validMovies = moviesRes.filter(m => !deleted.has(m.id));
        setMovies(prev => {
          const map = new Map<string, Movie>(prev.map(m => [m.id, m]));
          validMovies.forEach(m => {
            const existing = map.get(m.id);
            map.set(m.id, { ...(existing || {}), ...m });
          });
          return sortNewestFirst(Array.from(map.values()));
        });
      }
      if (Array.isArray(seriesRes) && seriesRes.length > 0) {
        const validSeries = seriesRes.filter(s => !deleted.has(s.id));
        setSeriesList(prev => {
          const map = new Map<string, TVSeries>(prev.map(s => [s.id, s]));
          validSeries.forEach(s => {
            const existing = map.get(s.id);
            map.set(s.id, { ...(existing || {}), ...s });
          });
          return sortNewestFirst(Array.from(map.values()));
        });
      }
      if (Array.isArray(contentRes) && contentRes.length > 0) {
        mergeContentItems(contentRes);
      }
      if (settingsRes && settingsRes.appName) {
        setSettings(prev => {
          const merged = { ...prev, ...settingsRes };
          localStorage.setItem('piflix_app_settings', JSON.stringify(merged));
          return merged;
        });
      }
      if (Array.isArray(historyRes)) setWatchHistory(historyRes);
      if (Array.isArray(watchlistRes)) setWatchlist(watchlistRes);
      if (Array.isArray(notifsRes)) setNotifications(notifsRes);
      if (Array.isArray(likesRes)) setLikedIds(likesRes);
    } catch (err) {
      console.warn('Backend fetch error, relying on initial state', err);
    }
  };

  // Real-time Firestore sync: Any newly added or updated content syncs immediately!
  useEffect(() => {
    const unsubscribe = subscribeToContent((items) => {
      mergeContentItems(items);
    }, true);
    return () => unsubscribe();
  }, []);

  // Real-time Firestore Settings sync: Settings updates propagate in real time across the platform!
  useEffect(() => {
    fetchSettingsFromFirestore().then((fbSettings) => {
      if (fbSettings && fbSettings.appName) {
        setSettings(prev => {
          const merged = { ...prev, ...fbSettings };
          localStorage.setItem('piflix_app_settings', JSON.stringify(merged));
          return merged;
        });
      }
    });

    const unsubscribe = subscribeToSettings((firestoreSettings) => {
      if (firestoreSettings && firestoreSettings.appName) {
        setSettings(prev => {
          const merged = { ...prev, ...firestoreSettings };
          localStorage.setItem('piflix_app_settings', JSON.stringify(merged));
          return merged;
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    refreshContent();
  }, [currentUser.id]);

  // Real-time Firestore Notifications sync: Persistent across page reloads and devices
  useEffect(() => {
    const unsubscribe = subscribeToUserNotifications(currentUser.id, (userNotifs) => {
      setNotifications(userNotifs);
    });
    return () => unsubscribe();
  }, [currentUser.id]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    // 1. Optimistically update local state & disk cache immediately
    setSettings(prev => {
      const merged = { ...prev, ...newSettings };
      localStorage.setItem('piflix_app_settings', JSON.stringify(merged));
      return merged;
    });

    // 2. Persist to production Firestore database
    try {
      await saveSettingsToFirestore(newSettings);
    } catch (fsErr) {
      console.warn('Firestore settings write notice:', fsErr);
    }

    // 3. Persist to backend server API
    try {
      const token = adminToken || localStorage.getItem('piflix_admin_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data && data.settings) {
        setSettings(prev => {
          const merged = { ...prev, ...data.settings };
          localStorage.setItem('piflix_app_settings', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.warn('Backend settings update notice:', err);
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
    const isSeries = 'seasonsCount' in content;
    if (isSeries && !episode) {
      openDetails(content, 'series');
      return;
    }
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

  const toggleLike = async (contentId: string) => {
    try {
      const res = await fetch(`/api/content/${contentId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (data.success) {
        if (data.liked) {
          setLikedIds(prev => Array.from(new Set([...prev, contentId])));
        } else {
          setLikedIds(prev => prev.filter(id => id !== contentId));
        }
        setMovies(prev =>
          prev.map(m => (m.id === contentId ? { ...m, likesCount: data.likesCount } : m))
        );
        setSeriesList(prev =>
          prev.map(s => (s.id === contentId ? { ...s, likesCount: data.likesCount } : s))
        );
        setSelectedContent(prev =>
          prev && prev.id === contentId ? { ...prev, likesCount: data.likesCount } : prev
        );
      }
    } catch (e) {
      // local fallback
      setLikedIds(prev =>
        prev.includes(contentId) ? prev.filter(id => id !== contentId) : [...prev, contentId]
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
      if (id) {
        const success = await markNotificationAsRead(id, currentUser.id);
        if (success) {
          setNotifications(prev =>
            prev.map(n => (n.id === id ? { ...n, read: true } : n))
          );
        }
      } else {
        const success = await markAllNotificationsAsRead(notifications, currentUser.id);
        if (success) {
          setNotifications(prev =>
            prev.map(n => ({ ...n, read: true }))
          );
        }
      }

      // Background sync to server endpoint
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: currentUser.id })
      }).catch(() => {});
    } catch (e) {
      console.error('[Notifications] Failed marking as read:', e);
    }
  };

  const openPiPayment = (plan: 'monthly' | 'annual' = 'monthly') => {
    setSelectedPlanForPayment(plan);
    setIsPiPaymentOpen(true);
  };

  const closePiPayment = () => {
    setIsPiPaymentOpen(false);
  };

  const onPaymentSuccess = async (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setIsPiPaymentOpen(false);
    refreshContent();

    // Create confirmation notification in Firestore (Requirement 4)
    try {
      const planName = selectedPlanForPayment === 'annual' ? 'Annual VIP' : 'Monthly VIP';
      const duration = selectedPlanForPayment === 'annual' ? '1 Year' : '1 Month';
      await createNotification({
        id: `notif_vip_${updatedUser.id}_${Date.now()}`,
        userId: updatedUser.id,
        title: '⭐ Premium Activated',
        message: 'Your PiFlix+ Premium membership has been successfully activated.',
        type: 'premium',
        targetTab: 'premium',
        createdAt: new Date().toISOString(),
        read: false,
        readBy: [],
        metadata: {
          plan: planName,
          duration: duration
        }
      });
    } catch (err) {
      console.error('[Notifications] Failed creating VIP notification in Firestore:', err);
    }
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
        removeContentItem,
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
