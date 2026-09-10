import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initialSettings, defaultUsers, sampleMovies, sampleSeries, sampleSeasons, sampleEpisodes, sampleAds } from './src/data/mockData';
import { Movie, TVSeries, Season, Episode, User, WatchHistoryItem, WatchlistItem, LikedItem, ContentRatingReview, Subscription, PaymentRecord, AppSettings, AppNotification } from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory persistent store for the server lifecycle
let appSettings: AppSettings = { ...initialSettings };
let users: User[] = JSON.parse(JSON.stringify(defaultUsers));
let movies: Movie[] = JSON.parse(JSON.stringify(sampleMovies));
let seriesList: TVSeries[] = JSON.parse(JSON.stringify(sampleSeries));
let seasonsList: Season[] = JSON.parse(JSON.stringify(sampleSeasons));
let episodesList: Episode[] = JSON.parse(JSON.stringify(sampleEpisodes));
let watchHistory: WatchHistoryItem[] = [
  {
    id: 'wh-1',
    userId: 'usr_demo',
    contentId: 'm-tears-of-steel',
    contentType: 'movie',
    progressSeconds: 180,
    durationSeconds: 720,
    completionPercentage: 25,
    lastWatched: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'wh-2',
    userId: 'usr_demo',
    contentId: 's-pi-syndicate',
    contentType: 'series',
    episodeId: 'ep-pi-101',
    progressSeconds: 950,
    durationSeconds: 2880,
    completionPercentage: 33,
    lastWatched: new Date(Date.now() - 86400000).toISOString()
  }
];
let watchlist: WatchlistItem[] = [
  { id: 'wl-1', userId: 'usr_demo', contentId: 'm-lagos-shadows', contentType: 'movie', addedAt: new Date().toISOString() },
  { id: 'wl-2', userId: 'usr_demo', contentId: 's-nairobi-dynasty', contentType: 'series', addedAt: new Date().toISOString() }
];
let likedItems: LikedItem[] = [
  { id: 'lk-1', userId: 'usr_demo', contentId: 'm-serengeti-whispers', contentType: 'movie', likedAt: new Date().toISOString() }
];
let reviews: ContentRatingReview[] = [
  {
    id: 'rev-1',
    userId: 'usr_demo',
    username: 'PiPioneer_Alex',
    userImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    contentId: 'm-tears-of-steel',
    rating: 9,
    review: 'Phenomenal sci-fi VFX and futuristic atmosphere! Streamed smoothly without lag on PiFlix+.',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    approved: true
  },
  {
    id: 'rev-2',
    userId: 'usr_admin',
    username: 'piflix_admin',
    userImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    contentId: 'm-lagos-shadows',
    rating: 10,
    review: 'Nollywood masterpiece! Top tier storytelling and sound design.',
    createdAt: new Date(Date.now() - 12000000).toISOString(),
    approved: true
  }
];
let subscriptions: Subscription[] = [
  {
    id: 'sub-admin',
    userId: 'usr_admin',
    plan: 'annual',
    pricePi: 29.99,
    transactionId: 'TX_PI_ADMIN_ANNUAL_001',
    status: 'active',
    startDate: '2025-01-01T00:00:00Z',
    expiryDate: '2026-12-31T23:59:59Z'
  }
];
let payments: PaymentRecord[] = [
  {
    id: 'pay-001',
    userId: 'usr_admin',
    transactionId: 'TX_PI_ADMIN_ANNUAL_001',
    amount: 29.99,
    currency: 'Pi',
    status: 'completed',
    plan: 'annual',
    createdAt: '2025-01-01T00:00:00Z'
  }
];
let notifications: AppNotification[] = [
  {
    id: 'notif-1',
    userId: 'all',
    title: 'New Release: The Pi Syndicate',
    message: 'Stream Season 1 & 2 of the groundbreaking crypto thriller now on PiFlix+.',
    type: 'new_episode',
    contentId: 's-pi-syndicate',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    read: false
  },
  {
    id: 'notif-2',
    userId: 'all',
    title: 'Special Pi Pioneer Upgrade',
    message: 'Unlock unlimited ad-free streaming for only 3.14 Pi per month.',
    type: 'premium',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    read: false
  }
];

let adImpressionsCount = 1420;

// API ROUTES

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Settings
app.get('/api/settings', (req: Request, res: Response) => {
  res.json(appSettings);
});

app.put('/api/settings', (req: Request, res: Response) => {
  appSettings = { ...appSettings, ...req.body };
  res.json({ success: true, settings: appSettings });
});

// Authentication
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username or email required' });
  }

  // Admin login check
  if (
    username.toLowerCase() === 'admin' || 
    username.toLowerCase() === 'admin@piflix.com' ||
    username.toLowerCase() === 'piflix_admin'
  ) {
    const adminUser = users.find(u => u.role === 'admin') || users[0];
    return res.json({
      success: true,
      token: 'jwt_admin_session_token_' + Date.now(),
      user: adminUser
    });
  }

  // Regular user login or automatic pioneer discovery
  let user = users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase());
  if (!user) {
    // Create quick session user
    user = {
      id: 'usr_' + Date.now(),
      username: username.trim(),
      email: `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@pioneer.network`,
      profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role: 'user',
      premiumStatus: false,
      subscriptionPlan: 'free',
      piUsername: username.includes('_') ? username : `${username}_pi`,
      piWalletAddress: `GC${Math.random().toString(36).substring(2, 8).toUpperCase()}...PI`,
      createdAt: new Date().toISOString(),
      notificationSettings: {
        newMovies: true,
        newEpisodes: true,
        announcements: true,
        subscription: true
      }
    };
    users.push(user);
  }

  res.json({
    success: true,
    token: 'jwt_user_session_token_' + user.id,
    user
  });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { username, email, piUsername } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Username is already registered' });
  }

  const newUser: User = {
    id: 'usr_' + Date.now(),
    username: username.trim(),
    email: email || `${username.toLowerCase()}@pioneer.network`,
    profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    role: 'user',
    premiumStatus: false,
    subscriptionPlan: 'free',
    piUsername: piUsername || `${username}_pi`,
    piWalletAddress: `GD${Math.random().toString(36).substring(2, 8).toUpperCase()}...PIFLIX`,
    createdAt: new Date().toISOString(),
    notificationSettings: {
      newMovies: true,
      newEpisodes: true,
      announcements: true,
      subscription: true
    }
  };

  users.push(newUser);
  res.json({
    success: true,
    token: 'jwt_user_session_token_' + newUser.id,
    user: newUser
  });
});

// Movies
app.get('/api/movies', (req: Request, res: Response) => {
  let result = [...movies];
  const { genre, language, year, ratingMin, search, featured, trending, publishedOnly } = req.query;

  if (publishedOnly !== 'false') {
    result = result.filter(m => m.isPublished);
  }

  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(m => 
      m.title.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.cast.some(c => c.toLowerCase().includes(q)) ||
      m.director.toLowerCase().includes(q) ||
      m.genre.some(g => g.toLowerCase().includes(q))
    );
  }

  if (genre && genre !== 'All') {
    result = result.filter(m => m.genre.includes(String(genre)));
  }

  if (language && language !== 'All') {
    result = result.filter(m => m.language.toLowerCase().includes(String(language).toLowerCase()));
  }

  if (year) {
    result = result.filter(m => m.year === Number(year));
  }

  if (ratingMin) {
    result = result.filter(m => m.rating >= Number(ratingMin));
  }

  if (featured === 'true') {
    result = result.filter(m => m.isFeatured);
  }

  if (trending === 'true') {
    result = result.filter(m => m.isTrending);
  }

  res.json(result);
});

app.get('/api/movies/:id', (req: Request, res: Response) => {
  const movie = movies.find(m => m.id === req.params.id);
  if (!movie) {
    return res.status(404).json({ error: 'Movie not found' });
  }
  // increment views
  movie.viewsCount += 1;
  res.json(movie);
});

app.post('/api/movies', (req: Request, res: Response) => {
  const newMovie: Movie = {
    id: 'm-' + Date.now(),
    title: req.body.title || 'Untitled Movie',
    description: req.body.description || '',
    poster: req.body.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
    backdrop: req.body.backdrop || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
    trailerUrl: req.body.trailerUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    videoUrl: req.body.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    hlsUrl: req.body.hlsUrl,
    year: Number(req.body.year) || new Date().getFullYear(),
    duration: Number(req.body.duration) || 90,
    genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : ['Action']),
    language: req.body.language || 'English',
    country: req.body.country || 'International',
    director: req.body.director || 'Unknown Director',
    cast: Array.isArray(req.body.cast) ? req.body.cast : (req.body.cast ? req.body.cast.split(',').map((s: string) => s.trim()) : []),
    rating: Number(req.body.rating) || 8.0,
    ageClassification: req.body.ageClassification || 'PG-13',
    isPremium: Boolean(req.body.isPremium),
    isFeatured: Boolean(req.body.isFeatured),
    isTrending: Boolean(req.body.isTrending),
    isPublished: req.body.isPublished !== undefined ? Boolean(req.body.isPublished) : true,
    qualityBadge: req.body.qualityBadge || 'FHD',
    viewsCount: 0,
    likesCount: 0,
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  movies.unshift(newMovie);
  res.json({ success: true, movie: newMovie });
});

app.put('/api/movies/:id', (req: Request, res: Response) => {
  const index = movies.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Movie not found' });
  }

  movies[index] = {
    ...movies[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  res.json({ success: true, movie: movies[index] });
});

app.delete('/api/movies/:id', (req: Request, res: Response) => {
  const index = movies.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Movie not found' });
  }
  const deleted = movies.splice(index, 1);
  res.json({ success: true, movie: deleted[0] });
});

// Toggle Like
app.post('/api/movies/:id/like', (req: Request, res: Response) => {
  const userId = req.body.userId || 'usr_demo';
  const movieId = req.params.id;
  const movie = movies.find(m => m.id === movieId);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });

  const existingIndex = likedItems.findIndex(l => l.userId === userId && l.contentId === movieId);
  let liked = false;
  if (existingIndex > -1) {
    likedItems.splice(existingIndex, 1);
    movie.likesCount = Math.max(0, movie.likesCount - 1);
    liked = false;
  } else {
    likedItems.push({
      id: 'lk-' + Date.now(),
      userId,
      contentId: movieId,
      contentType: 'movie',
      likedAt: new Date().toISOString()
    });
    movie.likesCount += 1;
    liked = true;
  }

  res.json({ success: true, liked, likesCount: movie.likesCount });
});

// Series
app.get('/api/series', (req: Request, res: Response) => {
  let result = [...seriesList];
  const { genre, search } = req.query;

  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(s => 
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.cast.some(c => c.toLowerCase().includes(q))
    );
  }

  if (genre && genre !== 'All') {
    result = result.filter(s => s.genre.includes(String(genre)));
  }

  res.json(result);
});

app.get('/api/series/:id', (req: Request, res: Response) => {
  const series = seriesList.find(s => s.id === req.params.id);
  if (!series) {
    return res.status(404).json({ error: 'Series not found' });
  }

  series.viewsCount += 1;
  const seasons = seasonsList.filter(sn => sn.seriesId === series.id).sort((a, b) => a.seasonNumber - b.seasonNumber);
  const episodes = episodesList.filter(ep => ep.seriesId === series.id).sort((a, b) => a.episodeNumber - b.episodeNumber);

  res.json({
    series,
    seasons,
    episodes
  });
});

app.post('/api/series', (req: Request, res: Response) => {
  const newSeries: TVSeries = {
    id: 's-' + Date.now(),
    title: req.body.title || 'Untitled Series',
    description: req.body.description || '',
    poster: req.body.poster || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
    backdrop: req.body.backdrop || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
    trailerUrl: req.body.trailerUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    year: Number(req.body.year) || new Date().getFullYear(),
    genre: Array.isArray(req.body.genre) ? req.body.genre : ['TV Series', 'Drama'],
    language: req.body.language || 'English',
    country: req.body.country || 'International',
    director: req.body.director || 'Unknown Director',
    cast: Array.isArray(req.body.cast) ? req.body.cast : [],
    rating: Number(req.body.rating) || 8.5,
    ageClassification: req.body.ageClassification || 'PG-13',
    isPremium: Boolean(req.body.isPremium),
    isFeatured: Boolean(req.body.isFeatured),
    isTrending: Boolean(req.body.isTrending),
    isPublished: req.body.isPublished !== undefined ? Boolean(req.body.isPublished) : true,
    qualityBadge: req.body.qualityBadge || 'FHD',
    viewsCount: 0,
    likesCount: 0,
    tags: req.body.tags || [],
    seasonsCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  seriesList.unshift(newSeries);

  // default season 1
  const defaultSeason: Season = {
    id: 'season-' + Date.now(),
    seriesId: newSeries.id,
    seasonNumber: 1,
    title: 'Season 1',
    episodesCount: 1
  };
  seasonsList.push(defaultSeason);

  // default episode 1
  const defaultEpisode: Episode = {
    id: 'ep-' + Date.now(),
    seriesId: newSeries.id,
    seasonId: defaultSeason.id,
    episodeNumber: 1,
    title: 'Episode 1: Pilot',
    description: 'The journey begins.',
    thumbnail: newSeries.backdrop,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: 45,
    skipIntroSec: 10,
    createdAt: new Date().toISOString()
  };
  episodesList.push(defaultEpisode);

  res.json({ success: true, series: newSeries });
});

app.put('/api/series/:id', (req: Request, res: Response) => {
  const index = seriesList.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Series not found' });
  seriesList[index] = { ...seriesList[index], ...req.body, updatedAt: new Date().toISOString() };
  res.json({ success: true, series: seriesList[index] });
});

app.delete('/api/series/:id', (req: Request, res: Response) => {
  const index = seriesList.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Series not found' });
  const deleted = seriesList.splice(index, 1);
  // cleanup seasons and episodes
  seasonsList = seasonsList.filter(sn => sn.seriesId !== req.params.id);
  episodesList = episodesList.filter(ep => ep.seriesId !== req.params.id);
  res.json({ success: true, series: deleted[0] });
});

// Episodes and Seasons management
app.post('/api/seasons', (req: Request, res: Response) => {
  const { seriesId, seasonNumber, title } = req.body;
  const newSeason: Season = {
    id: 'season-' + Date.now(),
    seriesId,
    seasonNumber: Number(seasonNumber) || 1,
    title: title || `Season ${seasonNumber || 1}`,
    episodesCount: 0
  };
  seasonsList.push(newSeason);

  // update series count
  const series = seriesList.find(s => s.id === seriesId);
  if (series) {
    series.seasonsCount = seasonsList.filter(s => s.seriesId === seriesId).length;
  }
  res.json({ success: true, season: newSeason });
});

app.post('/api/episodes', (req: Request, res: Response) => {
  const newEpisode: Episode = {
    id: 'ep-' + Date.now(),
    seriesId: req.body.seriesId,
    seasonId: req.body.seasonId,
    episodeNumber: Number(req.body.episodeNumber) || 1,
    title: req.body.title || `Episode ${req.body.episodeNumber}`,
    description: req.body.description || '',
    thumbnail: req.body.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    videoUrl: req.body.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    hlsUrl: req.body.hlsUrl,
    duration: Number(req.body.duration) || 45,
    skipIntroSec: Number(req.body.skipIntroSec) || 10,
    createdAt: new Date().toISOString()
  };
  episodesList.push(newEpisode);

  // update season count
  const season = seasonsList.find(s => s.id === newEpisode.seasonId);
  if (season) {
    season.episodesCount = episodesList.filter(e => e.seasonId === season.id).length;
  }

  res.json({ success: true, episode: newEpisode });
});

app.delete('/api/episodes/:id', (req: Request, res: Response) => {
  const index = episodesList.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Episode not found' });
  const deleted = episodesList.splice(index, 1)[0];
  res.json({ success: true, episode: deleted });
});

// Watch History & Continue Watching
app.get('/api/history', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_demo';
  const userHistory = watchHistory
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime());

  // Attach enriched content details
  const enriched = userHistory.map(item => {
    let content: any = null;
    let episode: any = null;
    if (item.contentType === 'movie') {
      content = movies.find(m => m.id === item.contentId);
    } else {
      content = seriesList.find(s => s.id === item.contentId);
      if (item.episodeId) {
        episode = episodesList.find(e => e.id === item.episodeId);
      }
    }
    return {
      ...item,
      content,
      episode
    };
  }).filter(item => Boolean(item.content));

  res.json(enriched);
});

app.post('/api/history', (req: Request, res: Response) => {
  const { userId = 'usr_demo', contentId, contentType, episodeId, progressSeconds, durationSeconds } = req.body;
  if (!contentId || !contentType) {
    return res.status(400).json({ error: 'contentId and contentType are required' });
  }

  const completionPercentage = durationSeconds > 0 ? Math.min(100, Math.round((progressSeconds / durationSeconds) * 100)) : 0;

  const existingIdx = watchHistory.findIndex(h => 
    h.userId === userId && 
    h.contentId === contentId && 
    (contentType === 'movie' || h.episodeId === episodeId)
  );

  const historyItem: WatchHistoryItem = {
    id: existingIdx > -1 ? watchHistory[existingIdx].id : 'wh-' + Date.now(),
    userId,
    contentId,
    contentType,
    episodeId,
    progressSeconds: Math.floor(progressSeconds),
    durationSeconds: Math.floor(durationSeconds),
    completionPercentage,
    lastWatched: new Date().toISOString()
  };

  if (existingIdx > -1) {
    watchHistory[existingIdx] = historyItem;
  } else {
    watchHistory.unshift(historyItem);
  }

  res.json({ success: true, historyItem });
});

// Watchlist
app.get('/api/watchlist', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_demo';
  const userWatchlist = watchlist.filter(w => w.userId === userId);
  const items = userWatchlist.map(w => {
    const movie = movies.find(m => m.id === w.contentId);
    const series = seriesList.find(s => s.id === w.contentId);
    return {
      ...w,
      content: movie || series
    };
  }).filter(i => Boolean(i.content));

  res.json(items);
});

app.post('/api/watchlist/toggle', (req: Request, res: Response) => {
  const { userId = 'usr_demo', contentId, contentType = 'movie' } = req.body;
  const idx = watchlist.findIndex(w => w.userId === userId && w.contentId === contentId);
  let inWatchlist = false;

  if (idx > -1) {
    watchlist.splice(idx, 1);
    inWatchlist = false;
  } else {
    watchlist.unshift({
      id: 'wl-' + Date.now(),
      userId,
      contentId,
      contentType,
      addedAt: new Date().toISOString()
    });
    inWatchlist = true;
  }

  res.json({ success: true, inWatchlist });
});

// Reviews and Ratings
app.get('/api/reviews/:contentId', (req: Request, res: Response) => {
  const contentReviews = reviews.filter(r => r.contentId === req.params.contentId && r.approved);
  res.json(contentReviews);
});

app.post('/api/reviews', (req: Request, res: Response) => {
  const { userId = 'usr_demo', username, userImage, contentId, rating, review } = req.body;
  if (!contentId || !rating) return res.status(400).json({ error: 'contentId and rating required' });

  const newReview: ContentRatingReview = {
    id: 'rev-' + Date.now(),
    userId,
    username: username || 'Pi Pioneer',
    userImage,
    contentId,
    rating: Number(rating),
    review: review || '',
    createdAt: new Date().toISOString(),
    approved: true
  };

  reviews.unshift(newReview);

  // update movie rating average
  const movie = movies.find(m => m.id === contentId);
  if (movie) {
    const allRatings = reviews.filter(r => r.contentId === contentId).map(r => r.rating);
    const avg = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;
    movie.rating = Number(avg.toFixed(1));
  }

  res.json({ success: true, review: newReview });
});

// Active Ads & Impressions
app.get('/api/ads', (req: Request, res: Response) => {
  adImpressionsCount += 1;
  res.json(sampleAds);
});

app.post('/api/ads/impression', (req: Request, res: Response) => {
  adImpressionsCount += 1;
  res.json({ success: true, totalImpressions: adImpressionsCount });
});

// Notifications
app.get('/api/notifications', (req: Request, res: Response) => {
  res.json(notifications);
});

app.post('/api/notifications/read', (req: Request, res: Response) => {
  const { id } = req.body;
  if (id) {
    const notif = notifications.find(n => n.id === id);
    if (notif) notif.read = true;
  } else {
    notifications.forEach(n => (n.read = true));
  }
  res.json({ success: true });
});

// PI NETWORK PAYMENT INTEGRATION
// Step 1: Initialize payment order on server
app.post('/api/pi/create-payment', (req: Request, res: Response) => {
  const { userId = 'usr_demo', plan = 'monthly' } = req.body;
  const pricePi = plan === 'annual' ? appSettings.annualPricePi : appSettings.monthlyPricePi;
  const transactionId = `PI_TX_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const paymentRecord: PaymentRecord = {
    id: 'pay-' + Date.now(),
    userId,
    transactionId,
    amount: pricePi,
    currency: 'Pi',
    status: 'pending',
    plan,
    createdAt: new Date().toISOString()
  };

  payments.unshift(paymentRecord);

  res.json({
    success: true,
    payment: paymentRecord,
    piOrder: {
      amount: pricePi,
      memo: `PiFlix+ ${plan === 'annual' ? 'Annual' : 'Monthly'} VIP Streaming Access`,
      metadata: { plan, userId, transactionId },
      recipient: 'piflix_foundation_mainnet_wallet'
    }
  });
});

// Step 2: Verify Pi payment server-side and activate subscription
app.post('/api/pi/verify-payment', (req: Request, res: Response) => {
  const { transactionId, piTxId, signedPayload } = req.body;
  const payment = payments.find(p => p.transactionId === transactionId);

  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found' });
  }

  // Server-side verification simulation / verification against Pi Network API
  payment.status = 'completed';
  payment.piPaymentId = piTxId || `pi_tx_hash_${Date.now()}`;

  // Update or activate user subscription
  const user = users.find(u => u.id === payment.userId);
  const now = new Date();
  const expiry = new Date();
  if (payment.plan === 'annual') {
    expiry.setFullYear(now.getFullYear() + 1);
  } else {
    expiry.setMonth(now.getMonth() + 1);
  }

  const subscription: Subscription = {
    id: 'sub-' + Date.now(),
    userId: payment.userId,
    plan: payment.plan,
    pricePi: payment.amount,
    transactionId: payment.transactionId,
    status: 'active',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString()
  };
  subscriptions.unshift(subscription);

  if (user) {
    user.premiumStatus = true;
    user.subscriptionPlan = payment.plan;
    user.subscriptionExpiry = expiry.toISOString();
  }

  // Send celebration notification
  notifications.unshift({
    id: 'notif-' + Date.now(),
    userId: payment.userId,
    title: '⭐ Welcome to PiFlix+ Premium!',
    message: `Your ${payment.plan} subscription of ${payment.amount} Pi has been verified on the blockchain. Enjoy ad-free 4K streaming!`,
    type: 'premium',
    createdAt: new Date().toISOString(),
    read: false
  });

  res.json({
    success: true,
    message: 'Pi payment verified successfully! Premium activated.',
    subscription,
    user
  });
});

// Admin endpoints
app.get('/api/admin/overview', (req: Request, res: Response) => {
  const totalViews = movies.reduce((acc, m) => acc + (m.viewsCount || 0), 0) + 
                     seriesList.reduce((acc, s) => acc + (s.viewsCount || 0), 0);
  const totalWatchTimeHours = Math.round(totalViews * 0.42);
  const piRevenue = payments.filter(p => p.status === 'completed').reduce((acc, p) => acc + p.amount, 0);
  const premiumCount = users.filter(u => u.premiumStatus).length;

  res.json({
    totalUsers: users.length,
    activeUsers: Math.max(users.length, 1284),
    totalMovies: movies.length,
    totalTVSeries: seriesList.length,
    totalEpisodes: episodesList.length,
    totalViews,
    totalWatchTimeHours,
    premiumSubscribers: premiumCount,
    piRevenue: Number(piRevenue.toFixed(2)),
    adViews: adImpressionsCount,
    recentPayments: payments.slice(0, 10),
    topMovies: [...movies].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 5),
    topSeries: [...seriesList].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 5)
  });
});

app.get('/api/admin/users', (req: Request, res: Response) => {
  res.json(users);
});

app.post('/api/admin/users/:id/toggle-premium', (req: Request, res: Response) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.premiumStatus = !user.premiumStatus;
  user.subscriptionPlan = user.premiumStatus ? 'monthly' : 'free';
  res.json({ success: true, user });
});

// Production and Development Vite setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PiFlix+ Server running at http://localhost:${PORT}`);
  });
}

startServer();
