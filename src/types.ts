export type Role = 'admin' | 'user';
export type ContentType = 'movie' | 'series';
export type AgeClassification = 'All' | 'PG' | 'PG-13' | '16+' | '18+';

export interface User {
  id: string;
  username: string;
  email: string;
  profileImage: string;
  role: Role;
  premiumStatus: boolean;
  subscriptionPlan: 'free' | 'monthly' | 'annual';
  subscriptionExpiry?: string;
  piUsername?: string;
  piWalletAddress?: string;
  createdAt: string;
  notificationSettings: {
    newMovies: boolean;
    newEpisodes: boolean;
    announcements: boolean;
    subscription: boolean;
  };
}

export interface Movie {
  id: string;
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  coverImageUrl?: string;
  trailerUrl: string;
  videoUrl: string;
  hlsUrl?: string;
  year: number;
  duration: number; // minutes
  genre: string[];
  language: string;
  country: string;
  director: string;
  cast: string[];
  rating: number; // 0 to 10
  ageClassification: AgeClassification;
  isPremium: boolean;
  accessType?: 'free' | 'premium';
  isFeatured: boolean;
  isTrending: boolean;
  isPublished: boolean;
  published?: boolean;
  qualityBadge: 'HD' | 'FHD' | '4K';
  viewsCount: number;
  likesCount: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TVSeries {
  id: string;
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  coverImageUrl?: string;
  trailerUrl: string;
  year: number;
  genre: string[];
  language: string;
  country: string;
  director: string;
  cast: string[];
  rating: number;
  ageClassification: AgeClassification;
  isPremium: boolean;
  accessType?: 'free' | 'premium';
  isFeatured: boolean;
  isTrending: boolean;
  isPublished: boolean;
  published?: boolean;
  qualityBadge: 'HD' | 'FHD' | '4K';
  viewsCount: number;
  likesCount: number;
  tags?: string[];
  seasonsCount: number;
  createdAt: string;
  updatedAt: string;
  episodes?: Episode[];
}

export interface ContentItem {
  id: string;
  title: string;
  description: string;
  type: 'movie' | 'series';
  coverImageUrl: string;
  videoUrl: string;
  trailerUrl?: string;
  year: number;
  genre: string;
  language: string;
  rating: number;
  quality: 'HD' | 'FHD' | '4K';
  accessType: 'free' | 'premium';
  published: boolean;
  createdAt: string;
  updatedAt: string;
  episodes?: {
    id: string;
    episodeNumber: number;
    title: string;
    description?: string;
    thumbnail?: string;
    videoUrl: string;
    duration?: number;
    skipIntroSec?: number;
  }[];
}

export interface Season {
  id: string;
  seriesId: string;
  seasonNumber: number;
  title: string;
  episodesCount?: number;
}

export interface Episode {
  id: string;
  seriesId: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  hlsUrl?: string;
  duration: number; // minutes
  skipIntroSec?: number;
  createdAt: string;
}

export interface WatchHistoryItem {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  episodeId?: string;
  progressSeconds: number;
  durationSeconds: number;
  completionPercentage: number;
  lastWatched: string;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  addedAt: string;
}

export interface LikedItem {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  likedAt: string;
}

export interface ContentRatingReview {
  id: string;
  userId: string;
  username: string;
  userImage?: string;
  contentId: string;
  rating: number; // 1-10 or 1-5
  review?: string;
  createdAt: string;
  approved: boolean;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: 'monthly' | 'annual';
  pricePi: number;
  transactionId: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  startDate: string;
  expiryDate: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  transactionId: string;
  amount: number;
  currency: 'Pi';
  status: 'pending' | 'approved' | 'completed' | 'failed' | 'cancelled';
  plan: 'monthly' | 'annual';
  piPaymentId?: string;
  createdAt: string;
}

export interface AppSettings {
  appName: string;
  tagline: string;
  logoUrl?: string;
  freeViewingDurationMinutes: number; // e.g. 5
  adIntervalMinutes: number; // e.g. 2
  monthlyPricePi: number; // e.g. 3.14
  annualPricePi: number; // e.g. 29.99
  heroSlideIntervalSec: number;
  announcement?: string;
  enableAds: boolean;
  termsContent?: string;
  privacyContent?: string;
  dmcaContent?: string;
  contactEmail?: string;
}

export interface AppNotification {
  id: string;
  userId: string; // 'all' or specific user
  title: string;
  message: string;
  type: 'new_movie' | 'new_episode' | 'premium' | 'announcement';
  contentId?: string;
  createdAt: string;
  read: boolean;
}

export interface AdData {
  id: string;
  title: string;
  brandName: string;
  durationSec: number;
  skipAfterSec: number;
  videoUrl: string;
  clickUrl: string;
  callToAction: string;
  thumbnail: string;
}

export interface FilterOptions {
  searchQuery?: string;
  genre?: string;
  language?: string;
  year?: number;
  ratingMin?: number;
  country?: string;
  sortBy?: 'popular' | 'latest' | 'rating' | 'title';
  contentType?: 'all' | 'movie' | 'series';
}

export interface PlatformOverviewStats {
  totalUsers: number;
  activeUsers: number;
  totalMovies: number;
  totalTVSeries: number;
  totalEpisodes: number;
  totalViews: number;
  totalWatchTimeHours: number;
  premiumSubscribers: number;
  piRevenue: number;
  adViews: number;
}
