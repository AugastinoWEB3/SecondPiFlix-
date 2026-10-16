import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Movie, TVSeries, Episode, User, AppSettings, WatchHistoryItem, WatchlistItem, LikedItem, AppNotification, ContentType, ContentItem, PublishedRelease } from '../types';
import { initialSettings, defaultUsers } from '../data/mockData';
import { subscribeToContent, subscribeToDeletedItems, fetchSettingsFromFirestore, saveSettingsToFirestore, subscribeToSettings, fetchActiveRelease, subscribeToActiveRelease, publishCatalogRelease, fetchAuthoritativeDeletedIds } from '../lib/firebaseContent';
import { resolveApiUrl } from '../lib/apiConfig';
import { subscribeToUserNotifications, markNotificationAsRead, markAllNotificationsAsRead, createNotification, dismissNotificationForUser } from '../lib/firebaseNotifications';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { loginAdminWithEmail, loginAdminWithGoogle, registerAdminAccount, logoutAdminUser, verifyTokenWithBackend } from '../lib/firebaseAuth';
import { authenticateWithPi } from '../lib/piAuth';
import { getDeterministicEmoji, isUuidOrInternalId, getVisiblePiUsername } from '../lib/avatar';

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
  updateProfileEmoji: (newEmoji: string) => Promise<void>;
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
  updateContentItem: (item: ContentItem) => void;
  removeContentItem: (id: string) => void;

  // Authoritative Published Release System (Requirements 1-7)
  currentRelease: PublishedRelease | null;
  isPublishingRelease: boolean;
  publishRelease: (publishedBy?: string, freshMovies?: Movie[], freshSeries?: TVSeries[]) => Promise<PublishedRelease>;
  applyPublishedRelease: (release: PublishedRelease) => void;

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
  dismissNotification: (id: string) => Promise<void>;

  // Pi Payment Modal
  isPiPaymentOpen: boolean;
  selectedPlanForPayment: 'monthly' | 'annual';
  openPiPayment: (plan?: 'monthly' | 'annual') => void;
  closePiPayment: () => void;
  onPaymentSuccess: (user: User) => void;

  // Subscription Details Modal
  isSubscriptionDetailsOpen: boolean;
  openSubscriptionDetails: () => void;
  closeSubscriptionDetails: () => void;

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
        if (parsed) {
          if (isUuidOrInternalId(parsed.username)) {
            parsed.username = (parsed.piUsername && !isUuidOrInternalId(parsed.piUsername))
              ? parsed.piUsername
              : 'Pioneer';
          }
          if (parsed.piUsername && isUuidOrInternalId(parsed.piUsername)) {
            parsed.piUsername = undefined;
          }
          if (parsed?.profileImage && (parsed.profileImage.includes('dicebear') || parsed.profileImage.includes('bottts'))) {
            parsed.profileImage = parsed.profileEmoji || '🐼';
          }
          // Restore user-specific cached profileEmoji if present
          const userSpecificKey = `piflix_user_emoji_${parsed.id}`;
          const cachedEmoji = localStorage.getItem(userSpecificKey)
            || (parsed.piUserId ? localStorage.getItem(`piflix_user_emoji_${parsed.piUserId}`) : null);

          if (cachedEmoji) {
            parsed.profileEmoji = cachedEmoji;
            parsed.profileImage = cachedEmoji;
          } else if (!parsed.profileEmoji) {
            if (parsed.profileImage && !parsed.profileImage.startsWith('http') && parsed.profileImage.length <= 4) {
              parsed.profileEmoji = parsed.profileImage;
            } else {
              parsed.profileEmoji = '🐼';
              parsed.profileImage = '🐼';
            }
          }
          localStorage.setItem('piflix_current_user', JSON.stringify(parsed));
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse cached user:', e);
      }
    }
    return defaultUsers[1]; // default to demo user
  });

  // Helper to guarantee genre is always a clean string array
  const ensureGenreArray = (genre: any, fallback = 'General'): string[] => {
    if (Array.isArray(genre)) {
      const filtered = genre.filter(Boolean).map(g => String(g).trim());
      return filtered.length > 0 ? filtered : [fallback];
    }
    if (typeof genre === 'string' && genre.trim().length > 0) {
      const parts = genre.split(',').map(s => s.trim()).filter(Boolean);
      return parts.length > 0 ? parts : [fallback];
    }
    return [fallback];
  };

  // Helper to reliably sort items with newest and recently modified content first
  const sortNewestFirst = <T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      const timeA = new Date(a.updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
      return timeB - timeA;
    });
  };

  // Authoritative Published Release Snapshot state (Requirements 1-7)
  const [currentRelease, setCurrentRelease] = useState<PublishedRelease | null>(() => {
    try {
      const cached = localStorage.getItem('piflix_active_release');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.releaseId && Array.isArray(parsed.movies)) return parsed;
      }
    } catch {}
    return null;
  });

  const [isPublishingRelease, setIsPublishingRelease] = useState(false);

  const [movies, setMovies] = useState<Movie[]>(() => {
    try {
      const deleted = new Set<string>();
      try {
        const rawDel = localStorage.getItem('piflix_deleted_content_ids');
        if (rawDel) JSON.parse(rawDel).forEach((id: string) => deleted.add(id));
      } catch {}

      const cachedRelease = localStorage.getItem('piflix_active_release');
      if (cachedRelease) {
        const parsed = JSON.parse(cachedRelease);
        if (parsed && Array.isArray(parsed.movies)) {
          return sortNewestFirst(parsed.movies.filter((m: Movie) => !deleted.has(m.id)).map((m: any) => ({
            ...m,
            genre: ensureGenreArray(m.genre, 'Action')
          })));
        }
      }
      const cached = localStorage.getItem('piflix_cached_movies');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortNewestFirst(parsed.filter((m: Movie) => !deleted.has(m.id)).map((m: any) => ({
            ...m,
            genre: ensureGenreArray(m.genre, 'Action')
          })));
        }
      }
      return [];
    } catch {}
    return [];
  });

  const [seriesList, setSeriesList] = useState<TVSeries[]>(() => {
    try {
      const deleted = new Set<string>();
      try {
        const rawDel = localStorage.getItem('piflix_deleted_content_ids');
        if (rawDel) JSON.parse(rawDel).forEach((id: string) => deleted.add(id));
      } catch {}

      const cachedRelease = localStorage.getItem('piflix_active_release');
      if (cachedRelease) {
        const parsed = JSON.parse(cachedRelease);
        if (parsed && Array.isArray(parsed.series)) {
          return sortNewestFirst(parsed.series.filter((s: TVSeries) => !deleted.has(s.id)).map((s: any) => ({
            ...s,
            genre: ensureGenreArray(s.genre, 'Drama')
          })));
        }
      }
      const cached = localStorage.getItem('piflix_cached_series');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortNewestFirst(parsed.filter((s: TVSeries) => !deleted.has(s.id)).map((s: any) => ({
            ...s,
            genre: ensureGenreArray(s.genre, 'Drama')
          })));
        }
      }
      return [];
    } catch {}
    return [];
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

  // Subscription Details Modal state
  const [isSubscriptionDetailsOpen, setIsSubscriptionDetailsOpen] = useState(false);
  const openSubscriptionDetails = () => setIsSubscriptionDetailsOpen(true);
  const closeSubscriptionDetails = () => setIsSubscriptionDetailsOpen(false);

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

  // Server-authoritative subscription verification: check persistent data and expiration against server time
  useEffect(() => {
    const verifySubscriptionWithServer = async () => {
      if (!currentUser || currentUser.role === 'admin') return;
      if (!currentUser.id) return;

      try {
        const params = new URLSearchParams();
        if (currentUser.id) params.set('userId', currentUser.id);
        if (currentUser.piUsername) params.set('piUsername', currentUser.piUsername);

        const res = await fetch(`/api/user/subscription?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();

        // Requirement 11: When the subscription expires, notify the user clearly that their VIP subscription has expired
        // Store an expiration-notification flag/timestamp so the notification is sent/shown only once
        if (data.subscriptionStatus === 'expired' && data.subscription?.id) {
          const expiredFlagKey = `piflix_expired_notified_${data.subscription.id}`;
          if (!localStorage.getItem(expiredFlagKey)) {
            localStorage.setItem(expiredFlagKey, new Date().toISOString());
            const expiredNotif: AppNotification = {
              id: `notif_exp_${data.subscription.id}`,
              userId: currentUser.id,
              title: '⚠️ VIP Subscription Expired',
              message: 'Your PiFlix+ VIP subscription has expired. Your account has been returned to the Free Tier. Renew your VIP subscription to continue enjoying Premium features.',
              type: 'premium',
              targetTab: 'premium',
              createdAt: data.serverTime || new Date().toISOString(),
              read: false,
              readBy: [],
              metadata: {
                expiredPlan: data.subscription.plan,
                expiredAt: data.subscription.expiresAt || data.subscription.expiryDate
              }
            };
            setNotifications(prev => {
              if (prev.some(n => n.id === expiredNotif.id)) return prev;
              return [expiredNotif, ...prev];
            });
          }
        }

        if (data.success && data.user) {
          const serverPiUsername = (data.user.piUsername && !isUuidOrInternalId(data.user.piUsername))
            ? data.user.piUsername
            : ((data.user.username && !isUuidOrInternalId(data.user.username)) ? data.user.username : undefined);

          setCurrentUser(prev => {
            const updatedUsername = serverPiUsername || (isUuidOrInternalId(prev.username) ? 'Pioneer' : prev.username);
            const updatedPiUsername = serverPiUsername || (isUuidOrInternalId(prev.piUsername) ? undefined : prev.piUsername);

            if (
              prev.premiumStatus !== data.user.premiumStatus ||
              prev.subscriptionPlan !== data.user.subscriptionPlan ||
              prev.subscriptionExpiry !== data.user.subscriptionExpiry ||
              prev.username !== updatedUsername ||
              prev.piUsername !== updatedPiUsername
            ) {
              return {
                ...prev,
                premiumStatus: data.user.premiumStatus,
                subscriptionPlan: data.user.subscriptionPlan,
                subscriptionExpiry: data.user.subscriptionExpiry,
                username: updatedUsername,
                piUsername: updatedPiUsername
              };
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('[Subscription Sync] Notice verifying subscription:', err);
      }
    };

    verifySubscriptionWithServer();
    const interval = setInterval(verifySubscriptionWithServer, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.piUsername]);

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
    setCurrentRelease(prev => {
      if (!prev) return null;
      const newMovies = prev.movies.filter(m => m.id !== id);
      const newSeries = prev.series.filter(s => s.id !== id);
      return {
        ...prev,
        movies: newMovies,
        series: newSeries,
        counts: {
          ...prev.counts,
          movies: newMovies.length,
          series: newSeries.length
        }
      };
    });
    setSelectedContent(prev => (prev?.id === id ? null : prev));
    setActivePlayingItem(prev => (prev?.content.id === id ? null : prev));
  };

  // Authoritative Published Release Snapshot handler (Requirements 1-7)
  const applyPublishedRelease = useCallback((release: PublishedRelease) => {
    if (!release || !Array.isArray(release.movies)) return;
    const deleted = getDeletedIds();

    // Incorporate any deleted content IDs from the canonical release
    if (Array.isArray(release.deletedContentIds)) {
      release.deletedContentIds.forEach(id => deleted.add(id));
      try { localStorage.setItem('piflix_deleted_content_ids', JSON.stringify(Array.from(deleted))); } catch {}
    }

    const cleanMovies = sortNewestFirst(release.movies.filter(m => !deleted.has(m.id)).map((m: any) => ({
      ...m,
      genre: ensureGenreArray(m.genre, 'Action')
    })));
    const cleanSeries = sortNewestFirst(release.series.filter(s => !deleted.has(s.id)).map((s: any) => ({
      ...s,
      genre: ensureGenreArray(s.genre, 'Drama')
    })));

    // STRICT CANONICAL REPLACEMENT: Both Web & Pi Network environments replace rather than merge!
    setMovies(cleanMovies);
    setSeriesList(cleanSeries);
    setCurrentRelease(release);

    try {
      localStorage.setItem('piflix_active_release', JSON.stringify(release));
      localStorage.setItem('piflix_current_release_id', release.releaseId);
      localStorage.setItem('piflix_current_release_revision', String(release.revision));
      localStorage.setItem('piflix_cached_movies', JSON.stringify(cleanMovies));
      localStorage.setItem('piflix_cached_series', JSON.stringify(cleanSeries));
    } catch {}

    setSelectedContent(prev => (prev && deleted.has(prev.id) ? null : prev));
    setActivePlayingItem(prev => (prev && deleted.has(prev.content.id) ? null : prev));
  }, []);

  // Admin action to publish current catalog to canonical release
  const publishRelease = async (publishedBy?: string, freshMovies?: Movie[], freshSeries?: TVSeries[]): Promise<PublishedRelease> => {
    setIsPublishingRelease(true);
    try {
      const deletedIds = Array.from(getDeletedIds());
      const effMovies = (freshMovies || movies).filter(m => !deletedIds.includes(m.id));
      const effSeries = (freshSeries || seriesList).filter(s => !deletedIds.includes(s.id));
      const release = await publishCatalogRelease(adminToken, {
        publishedBy: publishedBy || currentUser.email || 'Admin',
        ...(freshMovies ? { currentMovies: effMovies } : {}),
        ...(freshSeries ? { currentSeries: effSeries } : {}),
        deletedIds
      });
      applyPublishedRelease(release);
      setIsPublishingRelease(false);
      return release;
    } catch (err) {
      setIsPublishingRelease(false);
      throw err;
    }
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

  // Immediate optimistic and cache-persisted update for any saved/edited content
  const updateContentItem = (item: ContentItem) => {
    unmarkDeleted(item.id);
    const now = new Date().toISOString();
    if (item.type === 'movie' || (!item.type && !item.id.startsWith('s-'))) {
      const movieObj: Movie = {
        id: item.id,
        title: item.title,
        description: item.description,
        poster: item.coverImageUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
        backdrop: item.coverImageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        coverImageUrl: item.coverImageUrl,
        videoUrl: item.videoUrl || '',
        trailerUrl: item.trailerUrl || '',
        year: Number(item.year) || new Date().getFullYear(),
        duration: Number(item.duration) || 95,
        genre: Array.isArray(item.genre) ? item.genre : String(item.genre || 'General').split(',').map(s => s.trim()),
        language: item.language || 'English',
        country: item.country || 'International',
        director: item.director || 'Creator',
        cast: item.cast || [],
        rating: Number(item.rating) || 8.0,
        ageClassification: 'PG-13',
        isPremium: item.accessType === 'premium',
        accessType: item.accessType || 'free',
        isFeatured: Boolean(item.isFeatured),
        isTrending: item.isTrending !== undefined ? item.isTrending : true,
        isPublished: item.published !== false,
        published: item.published !== false,
        qualityBadge: item.quality || 'HD',
        viewsCount: 0,
        likesCount: 0,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now
      };
      setMovies(prev => {
        const next = [movieObj, ...prev.filter(m => m.id !== item.id)];
        try { localStorage.setItem('piflix_cached_movies', JSON.stringify(next)); } catch {}
        return next;
      });
      setSelectedContent(prev => (prev?.id === item.id ? movieObj : prev));
    } else {
      const seriesObj: TVSeries = {
        id: item.id,
        title: item.title,
        description: item.description,
        poster: item.coverImageUrl || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
        backdrop: item.coverImageUrl || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
        coverImageUrl: item.coverImageUrl,
        trailerUrl: item.trailerUrl || '',
        year: Number(item.year) || new Date().getFullYear(),
        genre: Array.isArray(item.genre) ? item.genre : String(item.genre || 'General').split(',').map(s => s.trim()),
        language: item.language || 'English',
        country: item.country || 'International',
        director: item.director || 'Creator',
        cast: item.cast || [],
        rating: Number(item.rating) || 8.5,
        ageClassification: 'PG-13',
        isPremium: item.accessType === 'premium',
        accessType: item.accessType || 'free',
        isFeatured: Boolean(item.isFeatured),
        isTrending: item.isTrending !== undefined ? item.isTrending : true,
        isPublished: item.published !== false,
        published: item.published !== false,
        qualityBadge: item.quality || 'HD',
        viewsCount: 0,
        likesCount: 0,
        seasonsCount: item.seasonsCount || (item.seasons ? item.seasons.length : 1),
        seasons: item.seasons as any,
        episodes: item.episodes as any,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now
      };
      setSeriesList(prev => {
        const next = [seriesObj, ...prev.filter(s => s.id !== item.id)];
        try { localStorage.setItem('piflix_cached_series', JSON.stringify(next)); } catch {}
        return next;
      });
      setSelectedContent(prev => (prev?.id === item.id ? seriesObj : prev));
    }
  };

  // Helper to merge ContentItems into Movie / TVSeries state
  const mergeContentItems = (items: ContentItem[]) => {
    if (!items || !Array.isArray(items)) return;
    const deleted = getDeletedIds();
    const activeItems = items.filter(i => !deleted.has(i.id) && i.published !== false);

    const moviesFromItems = activeItems.filter(i => i.type === 'movie' || (!i.type && !i.id.startsWith('s-')));
    const seriesFromItems = activeItems.filter(i => i.type === 'series' || i.id.startsWith('s-'));

    setMovies(prev => {
      // Build incoming movies map
      const incomingMoviesMap = new Map<string, Movie>();
      moviesFromItems.forEach(item => {
        incomingMoviesMap.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          poster: item.coverImageUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
          backdrop: item.coverImageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
          coverImageUrl: item.coverImageUrl || '',
          videoUrl: item.videoUrl || '',
          trailerUrl: item.trailerUrl || '',
          year: item.year || new Date().getFullYear(),
          duration: Number(item.duration) || 95,
          genre: Array.isArray(item.genre) ? item.genre : (item.genre ? String(item.genre).split(',').map(s => s.trim()) : ['Action']),
          language: item.language || 'English',
          country: item.country || 'International',
          director: item.director || 'Creator',
          cast: Array.isArray(item.cast) ? item.cast : [],
          rating: item.rating !== undefined ? Number(item.rating) : 8.0,
          ageClassification: (item as any).ageClassification || 'PG-13',
          isPremium: item.accessType === 'premium',
          accessType: item.accessType || (item.accessType === 'premium' ? 'premium' : 'free'),
          isFeatured: item.isFeatured !== undefined ? item.isFeatured : false,
          isTrending: item.isTrending !== undefined ? item.isTrending : true,
          isPublished: item.published !== false,
          published: item.published !== false,
          qualityBadge: item.quality || 'HD',
          viewsCount: 0,
          likesCount: 0,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        });
      });

      // The live Firestore content snapshot directly updates movies state:
      return sortNewestFirst(Array.from(incomingMoviesMap.values()).filter(m => !deleted.has(m.id)));
    });

    setSeriesList(() => {
      const incomingSeriesMap = new Map<string, TVSeries>();
      seriesFromItems.forEach(item => {
        const resolvedSeasons = item.seasons;
        const resolvedEpisodes = (item.episodes as any);
        const resolvedCount = item.seasonsCount || (resolvedSeasons ? resolvedSeasons.length : 1);

        incomingSeriesMap.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          poster: item.coverImageUrl || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
          backdrop: item.coverImageUrl || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
          coverImageUrl: item.coverImageUrl || '',
          trailerUrl: item.trailerUrl || '',
          year: item.year || new Date().getFullYear(),
          genre: Array.isArray(item.genre) ? item.genre : (item.genre ? String(item.genre).split(',').map(s => s.trim()) : ['Drama']),
          language: item.language || 'English',
          country: item.country || 'International',
          director: item.director || 'Creator',
          cast: Array.isArray(item.cast) ? item.cast : [],
          rating: item.rating !== undefined ? Number(item.rating) : 8.5,
          ageClassification: (item as any).ageClassification || 'PG-13',
          isPremium: item.accessType === 'premium',
          accessType: item.accessType || (item.accessType === 'premium' ? 'premium' : 'free'),
          isFeatured: item.isFeatured !== undefined ? item.isFeatured : false,
          isTrending: item.isTrending !== undefined ? item.isTrending : true,
          isPublished: item.published !== false,
          published: item.published !== false,
          qualityBadge: item.quality || 'HD',
          viewsCount: 0,
          likesCount: 0,
          seasonsCount: resolvedCount,
          seasons: resolvedSeasons,
          episodes: resolvedEpisodes,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        });
      });

      // The live Firestore content snapshot directly updates series state:
      return sortNewestFirst(Array.from(incomingSeriesMap.values()).filter(s => !deleted.has(s.id)));
    });
  };

  // Load initial content & settings from authoritative source with safe cache revalidation
  const refreshContent = async () => {
    try {
      const deleted = getDeletedIds();
      const timestamp = Date.now();
      const [authoritativeDeletedIds, releaseRes, settingsRes, historyRes, watchlistRes, notifsRes, likesRes] = await Promise.all([
        fetchAuthoritativeDeletedIds().catch(() => []),
        fetchActiveRelease(),
        fetch(resolveApiUrl(`/api/settings?_t=${timestamp}`)).then(r => r.json()).catch(() => null),
        fetch(resolveApiUrl(`/api/history?userId=${currentUser.id}&_t=${timestamp}`)).then(r => r.json()).catch(() => []),
        fetch(resolveApiUrl(`/api/watchlist?userId=${currentUser.id}&_t=${timestamp}`)).then(r => r.json()).catch(() => []),
        fetch(resolveApiUrl(`/api/notifications?userId=${currentUser.id}&_t=${timestamp}`)).then(r => r.json()).catch(() => []),
        fetch(resolveApiUrl(`/api/likes?userId=${currentUser.id}&_t=${timestamp}`)).then(r => r.json()).catch(() => [])
      ]);

      if (Array.isArray(authoritativeDeletedIds) && authoritativeDeletedIds.length > 0) {
        authoritativeDeletedIds.forEach(id => deleted.add(id));
        try { localStorage.setItem('piflix_deleted_content_ids', JSON.stringify(Array.from(deleted))); } catch {}
      }

      // If authoritative release is available, adopt it directly as canonical source
      if (releaseRes && releaseRes.releaseId && Array.isArray(releaseRes.movies)) {
        // Safe cache invalidation / revalidation:
        const cachedReleaseId = localStorage.getItem('piflix_current_release_id');
        const cachedRevision = localStorage.getItem('piflix_current_release_revision');
        const isStale = cachedReleaseId !== releaseRes.releaseId ||
                        Number(cachedRevision) !== releaseRes.revision ||
                        (Array.isArray(releaseRes.deletedContentIds) && releaseRes.deletedContentIds.some(id => !deleted.has(id)));

        if (isStale) {
          try {
            localStorage.removeItem('piflix_cached_movies');
            localStorage.removeItem('piflix_cached_series');
          } catch {}
        }

        applyPublishedRelease(releaseRes);

        // Development diagnostic logging (Requirement Step 8)
        console.info('[PiFlix Catalog Sync]', {
          source: 'Authoritative Published Release',
          releaseId: releaseRes.releaseId,
          revision: releaseRes.revision,
          moviesCount: releaseRes.counts?.movies ?? releaseRes.movies.length,
          seriesCount: releaseRes.counts?.series ?? releaseRes.series.length,
          environment: typeof window !== 'undefined' && window.location.hostname.includes('pinet.com') ? 'Pi Browser (PiNet)' : 'Normal Web',
          cacheStatus: isStale ? 'INVALIDATED_AND_REVALIDATED' : 'CONSISTENT'
        });
      } else {
        // Fallback to /api/movies and /api/series if no release was packaged yet
        const [moviesRes, seriesRes] = await Promise.all([
          fetch(resolveApiUrl(`/api/movies?_t=${timestamp}`)).then(r => r.json()).catch(() => []),
          fetch(resolveApiUrl(`/api/series?_t=${timestamp}`)).then(r => r.json()).catch(() => [])
        ]);
        if (Array.isArray(moviesRes)) {
          const cleanMovies = sortNewestFirst(moviesRes.filter((m: Movie) => !deleted.has(m.id)).map((m: any) => ({
            ...m,
            genre: ensureGenreArray(m.genre, 'Action')
          })));
          setMovies(cleanMovies);
          try { localStorage.setItem('piflix_cached_movies', JSON.stringify(cleanMovies)); } catch {}
        }
        if (Array.isArray(seriesRes)) {
          const cleanSeries = sortNewestFirst(seriesRes.filter((s: TVSeries) => !deleted.has(s.id)).map((s: any) => ({
            ...s,
            genre: ensureGenreArray(s.genre, 'Drama')
          })));
          setSeriesList(cleanSeries);
          try { localStorage.setItem('piflix_cached_series', JSON.stringify(cleanSeries)); } catch {}
        }
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

  // Real-time Firestore Published Release Sync:
  // When Admin publishes a new release snapshot, all connected clients (Web and Pi Browser)
  // immediately update to the canonical release snapshot without needing a manual reload!
  useEffect(() => {
    const unsubscribe = subscribeToActiveRelease((remoteRelease) => {
      if (remoteRelease && remoteRelease.releaseId) {
        applyPublishedRelease(remoteRelease);
      }
    });
    return () => unsubscribe();
  }, [applyPublishedRelease]);

  // Real-time Firestore sync: Any newly added or updated content syncs immediately!
  useEffect(() => {
    const unsubscribe = subscribeToContent((items) => {
      mergeContentItems(items);
    }, false);
    return () => unsubscribe();
  }, []);

  // Real-time Firestore deleted items registry sync: Instantly removes deleted titles across all app views
  useEffect(() => {
    const unsubscribe = subscribeToDeletedItems((ids) => {
      if (Array.isArray(ids) && ids.length > 0) {
        const deletedSet = getDeletedIds();
        let changed = false;
        ids.forEach(id => {
          if (!deletedSet.has(id)) {
            deletedSet.add(id);
            changed = true;
          }
        });
        if (changed) {
          try {
            localStorage.setItem('piflix_deleted_content_ids', JSON.stringify(Array.from(deletedSet)));
            const rawM = localStorage.getItem('piflix_cached_movies');
            if (rawM) {
              const parsedM = JSON.parse(rawM);
              if (Array.isArray(parsedM)) {
                localStorage.setItem('piflix_cached_movies', JSON.stringify(parsedM.filter((m: any) => !deletedSet.has(m.id))));
              }
            }
            const rawS = localStorage.getItem('piflix_cached_series');
            if (rawS) {
              const parsedS = JSON.parse(rawS);
              if (Array.isArray(parsedS)) {
                localStorage.setItem('piflix_cached_series', JSON.stringify(parsedS.filter((s: any) => !deletedSet.has(s.id))));
              }
            }
            const rawRel = localStorage.getItem('piflix_active_release');
            if (rawRel) {
              const parsedRel = JSON.parse(rawRel);
              if (parsedRel && Array.isArray(parsedRel.movies)) {
                parsedRel.movies = parsedRel.movies.filter((m: any) => !deletedSet.has(m.id));
                parsedRel.series = (parsedRel.series || []).filter((s: any) => !deletedSet.has(s.id));
                parsedRel.counts = {
                  ...parsedRel.counts,
                  movies: parsedRel.movies.length,
                  series: parsedRel.series.length
                };
                localStorage.setItem('piflix_active_release', JSON.stringify(parsedRel));
              }
            }
          } catch {}
          setMovies(prev => prev.filter(m => !deletedSet.has(m.id)));
          setSeriesList(prev => prev.filter(s => !deletedSet.has(s.id)));
          setCurrentRelease(prev => {
            if (!prev) return null;
            return {
              ...prev,
              movies: prev.movies.filter(m => !deletedSet.has(m.id)),
              series: prev.series.filter(s => !deletedSet.has(s.id)),
              counts: {
                ...prev.counts,
                movies: prev.movies.filter(m => !deletedSet.has(m.id)).length,
                series: prev.series.filter(s => !deletedSet.has(s.id)).length
              }
            };
          });
          setSelectedContent(prev => (prev && deletedSet.has(prev.id) ? null : prev));
          setActivePlayingItem(prev => (prev && deletedSet.has(prev.content.id) ? null : prev));
        }
      }
    });
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

  // User switching data isolation: Load user-specific watchlist, history, likes, and profileEmoji whenever currentUser.id changes
  useEffect(() => {
    if (!currentUser?.id) return;

    // User profile emoji resolution & isolation:
    const userSpecificKey = `piflix_user_emoji_${currentUser.id}`;
    const piUserKey = currentUser.piUserId ? `piflix_user_emoji_${currentUser.piUserId}` : null;
    const cachedEmoji = localStorage.getItem(userSpecificKey) || (piUserKey ? localStorage.getItem(piUserKey) : null);

    if (cachedEmoji) {
      if (currentUser.profileEmoji !== cachedEmoji) {
        setCurrentUser(prev => ({
          ...prev,
          profileEmoji: cachedEmoji,
          profileImage: cachedEmoji
        }));
      }
    } else if (currentUser.profileEmoji) {
      localStorage.setItem(userSpecificKey, currentUser.profileEmoji);
      if (piUserKey) localStorage.setItem(piUserKey, currentUser.profileEmoji);
    } else {
      // Check if this user has a saved profileEmoji in Firestore or server
      const userDocRef = doc(db, 'users', currentUser.id);
      getDoc(userDocRef).then((snap) => {
        if (snap.exists() && snap.data()?.profileEmoji) {
          const savedEmoji = snap.data().profileEmoji;
          localStorage.setItem(userSpecificKey, savedEmoji);
          if (piUserKey) localStorage.setItem(piUserKey, savedEmoji);
          setCurrentUser(prev => ({
            ...prev,
            profileEmoji: savedEmoji,
            profileImage: savedEmoji
          }));
        } else {
          // First-time Pi User: set default to 🐼, persist it to that user's profile, display 🐼
          const defaultEmoji = '🐼';
          localStorage.setItem(userSpecificKey, defaultEmoji);
          if (piUserKey) localStorage.setItem(piUserKey, defaultEmoji);
          setCurrentUser(prev => ({
            ...prev,
            profileEmoji: defaultEmoji,
            profileImage: (prev.profileImage && !prev.profileImage.startsWith('http') && prev.profileImage.length <= 4) ? prev.profileImage : defaultEmoji
          }));
          fetch('/api/user/emoji', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, emoji: defaultEmoji })
          }).catch(() => {});
          setDoc(userDocRef, { profileEmoji: defaultEmoji }, { merge: true }).catch(() => {});
        }
      }).catch(() => {
        if (!currentUser.profileEmoji) {
          setCurrentUser(prev => ({ ...prev, profileEmoji: '🐼' }));
        }
      });
    }

    const fetchUserData = async () => {
      try {
        const [histRes, watchRes, likesRes] = await Promise.all([
          fetch(`/api/history?userId=${currentUser.id}`).then(r => r.json()).catch(() => []),
          fetch(`/api/watchlist?userId=${currentUser.id}`).then(r => r.json()).catch(() => []),
          fetch(`/api/likes?userId=${currentUser.id}`).then(r => r.json()).catch(() => [])
        ]);
        if (Array.isArray(histRes)) setWatchHistory(histRes);
        if (Array.isArray(watchRes)) setWatchlist(watchRes);
        if (Array.isArray(likesRes)) setLikedIds(likesRes);
      } catch (err) {
        console.warn('Failed loading user-specific data:', err);
      }
    };
    fetchUserData();
  }, [currentUser?.id]);

  const updateProfileEmoji = async (newEmoji: string) => {
    if (!currentUser?.id) return;
    const cleanEmoji = newEmoji.trim();
    const updatedUser: User = {
      ...currentUser,
      profileEmoji: cleanEmoji,
      profileImage: cleanEmoji
    };

    // 1. Immediately update active user state (Navbar button and profile panel update immediately)
    setCurrentUser(updatedUser);

    // 2. Persist to isolated user-specific local storage cache
    const userSpecificKey = `piflix_user_emoji_${currentUser.id}`;
    localStorage.setItem(userSpecificKey, cleanEmoji);
    if (currentUser.piUserId) {
      localStorage.setItem(`piflix_user_emoji_${currentUser.piUserId}`, cleanEmoji);
    }
    localStorage.setItem('piflix_current_user', JSON.stringify(updatedUser));

    // 3. Persist to server store via API
    try {
      await fetch('/api/user/emoji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, emoji: cleanEmoji })
      });
    } catch (err) {
      console.warn('Notice saving emoji to server:', err);
    }

    // 4. Persist to Firestore directly for authenticated user resilience
    try {
      const userDocRef = doc(db, 'users', currentUser.id);
      await setDoc(userDocRef, { profileEmoji: cleanEmoji, profileImage: cleanEmoji }, { merge: true });
    } catch (fsErr) {
      console.warn('Notice saving profileEmoji to Firestore:', fsErr);
    }
  };

  const logout = () => {
    localStorage.removeItem('piflix_pi_access_token');
    localStorage.removeItem('piflix_user_token');
    localStorage.removeItem('piflix_current_user');
    setWatchlist([]);
    setWatchHistory([]);
    setLikedIds([]);
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

  const dismissNotification = async (id: string) => {
    if (!id || !currentUser?.id) return;
    // 1. Optimistically update local state immediately for instant responsive feedback
    setNotifications(prev => prev.filter(n => n.id !== id));
    // 2. Persist user-specific dismissal in Firestore, localStorage, and backend
    try {
      await dismissNotificationForUser(id, currentUser.id);
    } catch (e) {
      console.warn('[Notifications] Failed to persist dismissal:', e);
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
        updateProfileEmoji,
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
        updateContentItem,
        removeContentItem,
        currentRelease,
        isPublishingRelease,
        publishRelease,
        applyPublishedRelease,
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
        dismissNotification,
        isPiPaymentOpen,
        selectedPlanForPayment,
        openPiPayment,
        closePiPayment,
        onPaymentSuccess,
        isSubscriptionDetailsOpen,
        openSubscriptionDetails,
        closeSubscriptionDetails,
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
