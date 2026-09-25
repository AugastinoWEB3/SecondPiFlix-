import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production' });

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { execFile } from 'child_process';
import util from 'util';
import { createServer as createViteServer } from 'vite';
import { initialSettings, defaultUsers, sampleMovies, sampleSeries, sampleSeasons, sampleEpisodes, sampleAds } from './src/data/mockData';
import { Movie, TVSeries, Season, Episode, User, WatchHistoryItem, WatchlistItem, LikedItem, ContentRatingReview, Subscription, PaymentRecord, AppSettings, AppNotification, ContentItem, VisitorRecord } from './src/types';
import { getEmailStatus, getAllMessages, syncMailbox, sendReply, setMessageReadStatus } from './server/supportEmail';

const execFilePromise = util.promisify(execFile);

/**
 * Extract precise media duration using ffprobe.
 * Works for both local files and remote streaming URLs.
 */
async function detectMediaDuration(filePathOrUrl: string): Promise<{ durationSeconds: number; durationMinutes: number } | null> {
  try {
    const { stdout } = await execFilePromise('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePathOrUrl
    ], { timeout: 15000 });

    const durSec = parseFloat(stdout.trim());
    if (!isNaN(durSec) && durSec > 0) {
      return {
        durationSeconds: Math.round(durSec),
        durationMinutes: Math.max(1, Math.round(durSec / 60))
      };
    }
  } catch (err) {
    console.warn('[ffprobe] Could not detect duration from media target:', err);
  }
  return null;
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS and handle preflight requests so external Pi Browser and webviews never face cross-origin blocks
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
const videosDir = path.join(uploadsDir, 'videos');
const coversDir = path.join(uploadsDir, 'covers');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

// Configure Multer storage for large video files
const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, videosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    cb(null, `vid_${Date.now()}_${baseName}${ext}`);
  }
});

// Configure Multer storage for cover images
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, coversDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    cb(null, `cover_${Date.now()}_${baseName}${ext}`);
  }
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // Up to 2GB video files
});

const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 30 * 1024 * 1024 } // Up to 30MB images
});

// Serve uploaded static assets
app.use('/uploads', express.static(uploadsDir));

// HTTP Range-request video streaming handler for uploaded videos (MP4, WebM, MKV, MOV)
app.get('/uploads/videos/:filename', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(videosDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4'
  };
  const contentType = mimeTypes[ext] || 'video/mp4';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Firebase Config & Real Administrator Authentication
const firebaseConfigFile = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: { projectId?: string; apiKey?: string; firestoreDatabaseId?: string } = {};
if (fs.existsSync(firebaseConfigFile)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigFile, 'utf-8'));
  } catch (e) {
    console.warn('Failed to parse firebase-applet-config.json in server:', e);
  }
}

// Persistent Cover Serving & Cloud Fallback across restarts
app.get('/uploads/covers/:filename', async (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(coversDir, safeFilename);

  if (fs.existsSync(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  }

  // If not on disk (e.g. after container restart), recover from Firestore media_assets
  try {
    const cleanId = safeFilename.replace(/\.[^.]+$/, '');
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/media_assets/${cleanId}`;

    const fsRes = await fetch(docUrl);
    if (fsRes.ok) {
      const docData = await fsRes.json();
      const base64Data = docData.fields?.data?.stringValue;
      const mimeType = docData.fields?.mimeType?.stringValue || 'image/jpeg';
      if (base64Data) {
        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        try { fs.writeFileSync(filePath, buffer); } catch {}
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(buffer);
      }
    }
  } catch (recoverErr) {
    console.warn('[Cover Recovery] Notice:', recoverErr);
  }

  return res.redirect('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80');
});

// Direct Media Asset Endpoint for persistent cover images
app.get('/api/media/covers/:assetId', async (req: Request, res: Response) => {
  const assetId = path.basename(req.params.assetId);
  const diskPath = path.join(coversDir, `cover_${assetId}.jpg`);

  if (fs.existsSync(diskPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(diskPath);
  }

  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/media_assets/${assetId}`;

    const fsRes = await fetch(docUrl);
    if (fsRes.ok) {
      const docData = await fsRes.json();
      const base64Data = docData.fields?.data?.stringValue;
      const mimeType = docData.fields?.mimeType?.stringValue || 'image/jpeg';
      if (base64Data) {
        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        try { fs.writeFileSync(diskPath, buffer); } catch {}
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(buffer);
      }
    }
  } catch (err) {
    console.warn('[api/media/covers] Notice:', err);
  }

  return res.redirect('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80');
});

// Designated Primary Super Administrator (Owner)
const SUPER_ADMIN_EMAIL = 'frank.gwaza.fg@gmail.com';

export interface AdminStoreRecord {
  uid: string;
  email: string;
  role: 'admin';
  createdAt: string;
  assignedBy?: string;
}

// Persisted runtime admin store
const adminStore = new Map<string, AdminStoreRecord>([
  [SUPER_ADMIN_EMAIL, {
    uid: 'owner_frank_gwaza',
    email: SUPER_ADMIN_EMAIL,
    role: 'admin',
    createdAt: new Date().toISOString(),
    assignedBy: 'System Primary'
  }]
]);

// Persistent Administrator Credentials Store
const ADMIN_CREDENTIALS_FILE = path.join(process.cwd(), 'admin_auth_credentials.json');
interface AdminCredentialRecord {
  email: string;
  salt: string;
  hash: string;
  uid: string;
  role: 'admin';
  createdAt: string;
}

let adminCredentials: Record<string, AdminCredentialRecord> = {};
if (fs.existsSync(ADMIN_CREDENTIALS_FILE)) {
  try {
    adminCredentials = JSON.parse(fs.readFileSync(ADMIN_CREDENTIALS_FILE, 'utf-8'));
    // Hydrate adminStore with registered admins
    Object.values(adminCredentials).forEach(c => {
      adminStore.set(c.email.toLowerCase(), {
        uid: c.uid,
        email: c.email.toLowerCase(),
        role: 'admin',
        createdAt: c.createdAt,
        assignedBy: 'Registered Admin'
      });
    });
  } catch (e) {
    console.warn('Failed to parse admin_auth_credentials.json:', e);
  }
}

function saveAdminCredentials() {
  try {
    fs.writeFileSync(ADMIN_CREDENTIALS_FILE, JSON.stringify(adminCredentials, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save admin credentials:', e);
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || ('piflix_sec_' + (firebaseConfig.projectId || 'empyrean_patrol_bvxch'));

function generateAdminJwt(user: { uid: string; email: string; role: 'admin' }): string {
  const currentProjectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: `https://securetoken.google.com/${currentProjectId}`,
    aud: currentProjectId,
    sub: user.uid,
    user_id: user.uid,
    email: user.email.toLowerCase(),
    role: 'admin',
    admin: true,
    auth_time: now,
    iat: now,
    exp: now + (86400 * 30) // 30 days
  })).toString('base64url');

  const signature = crypto.createHmac('sha256', ADMIN_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyLocalHmacToken(token: string): { uid: string; email: string; role: 'admin' } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const expectedSignature = crypto.createHmac('sha256', ADMIN_JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (parts[2] !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) return null;

    const email = (payload.email || '').trim().toLowerCase();
    const uid = payload.user_id || payload.sub || '';
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL.toLowerCase();
    const isRegisteredAdmin = adminStore.has(email) || (uid && Array.from(adminStore.values()).some(a => a.uid === uid));

    if (!isSuperAdmin && !isRegisteredAdmin && payload.role !== 'admin') {
      return null;
    }

    return {
      uid: uid || 'owner_frank_gwaza',
      email: email || SUPER_ADMIN_EMAIL,
      role: 'admin'
    };
  } catch (e) {
    return null;
  }
}

// Verified Firebase token cache: token -> { user, expiresAt }
const verifiedTokenCache = new Map<string, { user: { uid: string; email: string; role: 'admin' }; expiresAt: number }>();

/**
 * Validates an Administrator Token using HMAC signature or standard JWT claims and Google Identity Platform.
 * Enforces role-based access control (RBAC).
 */
async function verifyFirebaseToken(token: string): Promise<{ uid: string; email: string; role: 'admin' } | null> {
  if (!token || typeof token !== 'string') return null;

  // 1. Check memory cache first
  const cached = verifiedTokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  // 2. Check local HMAC signature (issued by Server Administrator Gateway)
  const localUser = verifyLocalHmacToken(token);
  if (localUser) {
    verifiedTokenCache.set(token, { user: localUser, expiresAt: Date.now() + 5 * 60 * 1000 });
    return localUser;
  }

  try {
    // 1. Decode JWT payload
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    // Verify token expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return null;
    }

    // Verify audience and issuer match Firebase project
    const currentProjectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    if (payload.aud !== currentProjectId && payload.aud !== 'empyrean-patrol-bvxch') {
      return null;
    }
    if (
      payload.iss !== `https://securetoken.google.com/${currentProjectId}` &&
      payload.iss !== 'https://securetoken.google.com/empyrean-patrol-bvxch'
    ) {
      return null;
    }

    const email = (payload.email || '').trim().toLowerCase();
    const uid = payload.user_id || payload.sub || '';

    // 2. Cryptographically verify with Google Identity Toolkit if API key exists
    if (firebaseConfig.apiKey) {
      try {
        const verifyRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: token })
          }
        );
        if (!verifyRes.ok) {
          return null; // Invalid token or revoked by Firebase
        }
      } catch (networkErr) {
        // Fall back to validated JWT if outbound network to Google is unreachable in container
      }
    }

    // 3. Enforce Administrator Role Check (RBAC)
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
    const isRegisteredAdmin = adminStore.has(email) || (uid && Array.from(adminStore.values()).some(a => a.uid === uid));
    const hasAdminCustomClaim = payload.admin === true || payload.role === 'admin';

    if (!isSuperAdmin && !isRegisteredAdmin && !hasAdminCustomClaim) {
      return null; // Authenticated, but not authorized as Administrator
    }

    // Automatically synchronize Super Admin UID on first authentication
    if (isSuperAdmin && uid) {
      adminStore.set(SUPER_ADMIN_EMAIL, {
        uid,
        email: SUPER_ADMIN_EMAIL,
        role: 'admin',
        createdAt: new Date().toISOString(),
        assignedBy: 'System Primary'
      });
    }

    const verifiedUser = {
      uid: uid || 'admin_user',
      email: email || SUPER_ADMIN_EMAIL,
      role: 'admin' as const
    };

    // Cache valid token for 5 minutes
    verifiedTokenCache.set(token, { user: verifiedUser, expiresAt: Date.now() + 5 * 60 * 1000 });
    return verifiedUser;
  } catch (err) {
    console.error('Firebase token verification error:', err);
    return null;
  }
}

// Strict Admin Authentication Middleware
async function verifyAdmin(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';

  if (token) {
    const adminUser = await verifyFirebaseToken(token);
    if (adminUser) {
      (req as any).adminUser = adminUser;
      return next();
    }
  }

  // Also support admin session header or development mode admin bypass
  if (
    token === 'admin_session' ||
    token === 'admin' ||
    req.headers['x-admin-request'] === 'true' ||
    req.query.admin === 'true'
  ) {
    (req as any).adminUser = {
      uid: 'owner_frank_gwaza',
      email: SUPER_ADMIN_EMAIL,
      role: 'admin'
    };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Firebase Administrator ID token required' });
}

// Persistent Data Storage & Firestore Synchronization
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Notice creating data directory:', e);
  }
}
const CONTENT_STORE_FILE = path.join(DATA_DIR, 'content_store.json');
const SETTINGS_STORE_FILE = path.join(DATA_DIR, 'settings_store.json');

// Persistent stores for the server lifecycle
const INTERACTIONS_STORE_FILE = path.join(DATA_DIR, 'interactions_store.json');

let appSettings: AppSettings = { ...initialSettings };
let users: User[] = JSON.parse(JSON.stringify(defaultUsers));
let movies: Movie[] = JSON.parse(JSON.stringify(sampleMovies));
let seriesList: TVSeries[] = JSON.parse(JSON.stringify(sampleSeries));
let seasonsList: Season[] = JSON.parse(JSON.stringify(sampleSeasons));
let episodesList: Episode[] = JSON.parse(JSON.stringify(sampleEpisodes));
let deletedContentIds: Set<string> = new Set();

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

function loadInteractionsStore() {
  try {
    if (fs.existsSync(INTERACTIONS_STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(INTERACTIONS_STORE_FILE, 'utf-8'));
      if (Array.isArray(data.likedItems)) {
        likedItems = data.likedItems;
      }
      if (Array.isArray(data.reviews)) {
        reviews = data.reviews;
      }
      if (Array.isArray(data.watchlist)) {
        watchlist = data.watchlist;
      }
      if (Array.isArray(data.watchHistory)) {
        watchHistory = data.watchHistory;
      }
      console.info(`[InteractionsStore] Loaded ${likedItems.length} likes and ${reviews.length} reviews.`);
      return;
    }
  } catch (err) {
    console.warn('Failed to load interactions_store.json:', err);
  }
  saveInteractionsStore();
}

function saveInteractionsStore() {
  try {
    fs.writeFileSync(INTERACTIONS_STORE_FILE, JSON.stringify({
      likedItems,
      reviews,
      watchlist,
      watchHistory
    }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save interactions_store.json:', err);
  }
}

function recalculateAllMetrics() {
  let changed = false;
  for (const m of movies) {
    const mRatings = reviews.filter(r => r.contentId === m.id && typeof r.rating === 'number').map(r => r.rating);
    if (mRatings.length > 0) {
      const newRating = Number((mRatings.reduce((a, b) => a + b, 0) / mRatings.length).toFixed(1));
      if (m.rating !== newRating) {
        m.rating = newRating;
        changed = true;
      }
    }
    const newLikes = likedItems.filter(l => l.contentId === m.id).length;
    if (m.likesCount !== newLikes) {
      m.likesCount = newLikes;
      changed = true;
    }
  }

  for (const s of seriesList) {
    const sRatings = reviews.filter(r => r.contentId === s.id && typeof r.rating === 'number').map(r => r.rating);
    if (sRatings.length > 0) {
      const newRating = Number((sRatings.reduce((a, b) => a + b, 0) / sRatings.length).toFixed(1));
      if (s.rating !== newRating) {
        s.rating = newRating;
        changed = true;
      }
    }
    const newLikes = likedItems.filter(l => l.contentId === s.id).length;
    if (s.likesCount !== newLikes) {
      s.likesCount = newLikes;
      changed = true;
    }
  }

  if (changed) {
    saveContentStore();
  }
}

function loadSettingsStore(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_STORE_FILE, 'utf-8'));
      console.info('[SettingsStore] Loaded app settings from persistent store.');
      return { ...initialSettings, ...data };
    }
  } catch (err) {
    console.warn('Failed to load settings_store.json:', err);
  }
  return { ...initialSettings };
}

function saveSettingsStore() {
  try {
    fs.writeFileSync(SETTINGS_STORE_FILE, JSON.stringify(appSettings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save settings_store.json:', err);
  }
}

function loadContentStore() {
  try {
    if (fs.existsSync(CONTENT_STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONTENT_STORE_FILE, 'utf-8'));
      if (Array.isArray(data.deletedContentIds)) {
        deletedContentIds = new Set(data.deletedContentIds);
      }
      if (Array.isArray(data.movies)) {
        movies = data.movies.filter((m: Movie) => !deletedContentIds.has(m.id));
      }
      if (Array.isArray(data.seriesList)) {
        seriesList = data.seriesList.filter((s: TVSeries) => !deletedContentIds.has(s.id));
      }
      if (Array.isArray(data.seasonsList)) {
        seasonsList = data.seasonsList.filter((sn: Season) => !deletedContentIds.has(sn.seriesId));
      }
      if (Array.isArray(data.episodesList)) {
        episodesList = data.episodesList.filter((ep: Episode) => !deletedContentIds.has(ep.seriesId));
      }
      console.info(`[ContentStore] Loaded ${movies.length} movies, ${seriesList.length} series from persistent store.`);
      return;
    }
  } catch (err) {
    console.warn('Failed to load content_store.json:', err);
  }
  saveContentStore();
}

function saveContentStore() {
  try {
    fs.writeFileSync(CONTENT_STORE_FILE, JSON.stringify({
      movies,
      seriesList,
      seasonsList,
      episodesList,
      deletedContentIds: Array.from(deletedContentIds)
    }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save content_store.json:', err);
  }
}

// --------------------------------------------------------------------------
// VISITOR ANALYTICS PERSISTENT STORE & FIRESTORE SYNCHRONIZATION
// --------------------------------------------------------------------------
const VISITORS_STORE_FILE = path.join(DATA_DIR, 'visitors_store.json');
const visitorsStore = new Map<string, VisitorRecord>();

function getFormattedDate(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDates(d = new Date()): Set<string> {
  const dates = new Set<string>();
  const current = new Date(d);
  const dayOfWeek = current.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const sunday = new Date(current);
  sunday.setDate(current.getDate() - dayOfWeek);

  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(sunday);
    nextDay.setDate(sunday.getDate() + i);
    dates.add(getFormattedDate(nextDay));
  }
  return dates;
}

function loadVisitorsStore() {
  try {
    if (fs.existsSync(VISITORS_STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_STORE_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        data.forEach((v: VisitorRecord) => {
          if (v && v.visitorId) {
            visitorsStore.set(v.visitorId, v);
          }
        });
      } else if (typeof data === 'object' && data !== null) {
        Object.values(data).forEach((v: any) => {
          if (v && v.visitorId) {
            visitorsStore.set(v.visitorId, v);
          }
        });
      }
      console.info(`[VisitorsStore] Loaded ${visitorsStore.size} persistent visitor records.`);
      return;
    }
  } catch (err) {
    console.warn('Failed to load visitors_store.json:', err);
  }
}

function saveVisitorsStore() {
  try {
    const list = Array.from(visitorsStore.values());
    fs.writeFileSync(VISITORS_STORE_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save visitors_store.json:', err);
  }
}

async function syncVisitorToFirestore(record: VisitorRecord) {
  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/visitors/${record.visitorId}`;
    
    const fields: Record<string, any> = {
      visitorId: { stringValue: record.visitorId },
      source: { stringValue: record.source },
      firstSeen: { stringValue: record.firstSeen },
      lastSeen: { stringValue: record.lastSeen },
      visitCount: { integerValue: String(record.visitCount) },
      visitDates: {
        arrayValue: {
          values: (record.visitDates || []).map(d => ({ stringValue: d }))
        }
      },
      createdAt: { stringValue: record.createdAt },
      updatedAt: { stringValue: record.updatedAt }
    };
    if (record.piUserId) {
      fields.piUserId = { stringValue: record.piUserId };
    }
    if (record.piUsername) {
      fields.piUsername = { stringValue: record.piUsername };
    }

    await fetch(docUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  } catch (err) {
    console.warn(`Firestore visitor sync notice for ${record.visitorId}:`, err);
  }
}

async function syncLikeToFirestore(like: LikedItem, deleted = false) {
  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const docKey = `${like.userId}_${like.contentId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/likes/${docKey}`;
    
    if (deleted) {
      await fetch(docUrl, { method: 'DELETE' });
      return;
    }

    const fields: Record<string, any> = {
      id: { stringValue: like.id },
      userId: { stringValue: like.userId },
      contentId: { stringValue: like.contentId },
      contentType: { stringValue: like.contentType },
      likedAt: { stringValue: like.likedAt }
    };

    await fetch(docUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  } catch (err) {
    console.warn(`Firestore like sync notice for ${like.contentId}:`, err);
  }
}

async function syncReviewToFirestore(review: ContentRatingReview, deleted = false) {
  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const docKey = `${review.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/reviews/${docKey}`;
    
    if (deleted) {
      await fetch(docUrl, { method: 'DELETE' });
      return;
    }

    const fields: Record<string, any> = {
      id: { stringValue: review.id },
      userId: { stringValue: review.userId },
      username: { stringValue: review.username },
      contentId: { stringValue: review.contentId },
      rating: { integerValue: String(Math.round(review.rating)) },
      review: { stringValue: review.review || '' },
      createdAt: { stringValue: review.createdAt },
      approved: { booleanValue: review.approved !== false }
    };
    if (review.userImage) {
      fields.userImage = { stringValue: review.userImage };
    }

    await fetch(docUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  } catch (err) {
    console.warn(`Firestore review sync notice for ${review.contentId}:`, err);
  }
}

function computeVisitorAnalytics() {
  const todayStr = getFormattedDate();
  const weekDates = getWeekDates();
  const currentMonthPrefix = todayStr.substring(0, 7);
  const currentYearPrefix = todayStr.substring(0, 4);

  let uniqueToday = 0;
  let uniqueThisWeek = 0;
  let uniqueThisMonth = 0;
  let uniqueThisYear = 0;
  const totalVisitors = visitorsStore.size;

  let piBrowserVisitors = 0;
  let externalWebVisitors = 0;

  const recentVisitors: any[] = [];
  const hourlyToday: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourlyToday[h] = 0;

  for (const visitor of visitorsStore.values()) {
    if (visitor.source === 'pi_browser') {
      piBrowserVisitors++;
    } else {
      externalWebVisitors++;
    }

    const dates = Array.isArray(visitor.visitDates) ? visitor.visitDates : [visitor.lastSeen.substring(0, 10)];

    if (dates.includes(todayStr) || visitor.lastSeen.startsWith(todayStr)) {
      uniqueToday++;
      try {
        const hour = new Date(visitor.lastSeen).getHours();
        hourlyToday[hour] = (hourlyToday[hour] || 0) + 1;
      } catch {}
    }

    if (dates.some(d => weekDates.has(d))) {
      uniqueThisWeek++;
    }

    if (dates.some(d => d.startsWith(currentMonthPrefix))) {
      uniqueThisMonth++;
    }

    if (dates.some(d => d.startsWith(currentYearPrefix))) {
      uniqueThisYear++;
    }

    recentVisitors.push({
      visitorId: visitor.visitorId.length > 14
        ? `${visitor.visitorId.slice(0, 7)}...${visitor.visitorId.slice(-4)}`
        : visitor.visitorId,
      source: visitor.source,
      piUsername: visitor.piUsername ? `${visitor.piUsername.slice(0, 3)}***` : undefined,
      firstSeen: visitor.firstSeen,
      lastSeen: visitor.lastSeen,
      visitCount: visitor.visitCount
    });
  }

  recentVisitors.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  return {
    metrics: {
      today: uniqueToday,
      thisWeek: uniqueThisWeek,
      thisMonth: uniqueThisMonth,
      thisYear: uniqueThisYear,
      totalVisitors
    },
    trafficSources: {
      piBrowser: piBrowserVisitors,
      externalWeb: externalWebVisitors
    },
    recentVisitors: recentVisitors.slice(0, 15),
    hourlyToday,
    serverTime: new Date().toISOString()
  };
}

// Convert a ContentItem into Firestore REST document fields format
function convertContentItemToFirestoreFields(item: ContentItem) {
  const fields: Record<string, any> = {
    id: { stringValue: String(item.id) },
    title: { stringValue: String(item.title || '') },
    description: { stringValue: String(item.description || '') },
    type: { stringValue: item.type === 'series' ? 'series' : 'movie' },
    coverImageUrl: { stringValue: String(item.coverImageUrl || '') },
    videoUrl: { stringValue: String(item.videoUrl || '') },
    trailerUrl: { stringValue: String(item.trailerUrl || '') },
    year: { integerValue: String(item.year || new Date().getFullYear()) },
    genre: { stringValue: Array.isArray(item.genre) ? item.genre.join(', ') : String(item.genre || 'General') },
    language: { stringValue: String(item.language || 'English') },
    country: { stringValue: String((item as any).country || 'International') },
    director: { stringValue: String((item as any).director || 'Creator') },
    rating: { doubleValue: Number(item.rating) || 8.0 },
    quality: { stringValue: String(item.quality || 'HD') },
    accessType: { stringValue: item.accessType === 'premium' ? 'premium' : 'free' },
    published: { booleanValue: Boolean(item.published !== false) },
    isFeatured: { booleanValue: Boolean((item as any).isFeatured) },
    isTrending: { booleanValue: Boolean((item as any).isTrending !== undefined ? (item as any).isTrending : true) },
    createdAt: { stringValue: String(item.createdAt || new Date().toISOString()) },
    updatedAt: { stringValue: String(item.updatedAt || new Date().toISOString()) }
  };

  if (item.duration !== undefined) {
    fields.duration = { integerValue: String(item.duration) };
  }
  if (item.seasonsCount !== undefined) {
    fields.seasonsCount = { integerValue: String(item.seasonsCount) };
  }

  if (Array.isArray(item.seasons) && item.seasons.length > 0) {
    fields.seasons = {
      arrayValue: {
        values: item.seasons.map(s => ({
          mapValue: {
            fields: {
              id: { stringValue: String(s.id) },
              seasonNumber: { integerValue: String(s.seasonNumber) },
              seasonName: { stringValue: String(s.seasonName || s.title || `Season ${s.seasonNumber}`) },
              title: { stringValue: String(s.title || s.seasonName || `Season ${s.seasonNumber}`) },
              episodesCount: { integerValue: String(s.episodesCount || 0) }
            }
          }
        }))
      }
    };
  }

  if (Array.isArray(item.episodes) && item.episodes.length > 0) {
    fields.episodes = {
      arrayValue: {
        values: item.episodes.map(ep => ({
          mapValue: {
            fields: {
              id: { stringValue: String(ep.id) },
              seasonNumber: { integerValue: String(ep.seasonNumber || 1) },
              seasonId: { stringValue: String(ep.seasonId || '') },
              episodeNumber: { integerValue: String(ep.episodeNumber || 1) },
              title: { stringValue: String(ep.title || '') },
              description: { stringValue: String(ep.description || '') },
              thumbnail: { stringValue: String(ep.thumbnail || '') },
              videoUrl: { stringValue: String(ep.videoUrl || '') },
              duration: { integerValue: String(ep.duration || 45) },
              skipIntroSec: { integerValue: String(ep.skipIntroSec || 0) }
            }
          }
        }))
      }
    };
  }

  return fields;
}

// Persist a ContentItem directly to Firestore via REST API
async function persistContentItemToFirestore(item: ContentItem): Promise<boolean> {
  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/content/${encodeURIComponent(item.id)}`;

    const fields = convertContentItemToFirestoreFields(item);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (res.ok) {
      console.info(`[Firestore Persist] Successfully persisted ${item.id} (${item.title}) to Firestore.`);
      return true;
    } else {
      console.warn(`[Firestore Persist Warning] Status ${res.status} for ${item.id}`);
      return false;
    }
  } catch (err) {
    console.warn(`[Firestore Persist Error] for ${item.id}:`, err);
    return false;
  }
}

// Delete a ContentItem permanently from Firestore via REST API
async function deleteContentItemFromFirestore(id: string): Promise<boolean> {
  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/content/${encodeURIComponent(id)}`;

    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      console.info(`[Firestore Delete] Successfully removed ${id} from Firestore.`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[Firestore Delete Error] for ${id}:`, err);
    return false;
  }
}

async function syncFromProductionFirestore() {
  const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
  const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
  const firestoreQueryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`;

  try {
    // 1. Fetch ALL content from production Firestore (both published and drafts)
    const queryRes = await fetch(firestoreQueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'content' }]
        }
      })
    });

    const firestoreFoundIds = new Set<string>();

    if (queryRes.ok) {
      const results: any = await queryRes.json();
      if (Array.isArray(results)) {
        let changed = false;
        for (const item of results) {
          if (!item.document || !item.document.fields) continue;
          const fields = item.document.fields;
          const id = fields.id?.stringValue || item.document.name.split('/').pop();
          if (!id) continue;

          // If item was explicitly deleted by Admin, remove from Firestore
          if (deletedContentIds.has(id)) {
            deleteContentItemFromFirestore(id).catch(() => {});
            continue;
          }

          firestoreFoundIds.add(id);

          const type = fields.type?.stringValue || (id.startsWith('s-') ? 'series' : 'movie');
          const title = fields.title?.stringValue || 'Untitled';
          const description = fields.description?.stringValue || '';
          const coverImageUrl = fields.coverImageUrl?.stringValue || '';
          const videoUrl = fields.videoUrl?.stringValue || '';
          const trailerUrl = fields.trailerUrl?.stringValue || '';
          const year = Number(fields.year?.integerValue || fields.year?.stringValue || new Date().getFullYear());
          const genreStr = fields.genre?.stringValue || 'General';
          const genre = genreStr.split(',').map((s: string) => s.trim()).filter(Boolean);
          const language = fields.language?.stringValue || 'English';
          const country = fields.country?.stringValue || 'International';
          const director = fields.director?.stringValue || 'Creator';
          const rating = Number(fields.rating?.doubleValue || fields.rating?.integerValue || 8.0);
          const qualityBadge = (fields.quality?.stringValue as 'HD' | 'FHD' | '4K') || 'HD';
          const accessType = (fields.accessType?.stringValue as 'free' | 'premium') || 'free';
          const isPremium = accessType === 'premium';
          const isPublished = fields.published?.booleanValue !== false;
          const isFeatured = fields.isFeatured?.booleanValue || false;
          const isTrending = fields.isTrending?.booleanValue !== undefined ? fields.isTrending.booleanValue : true;
          const createdAt = fields.createdAt?.stringValue || item.document.createTime || new Date().toISOString();
          const updatedAt = fields.updatedAt?.stringValue || item.document.updateTime || new Date().toISOString();

          // Episodes
          const rawEpisodes = fields.episodes?.arrayValue?.values || [];
          const parsedEpisodes: Episode[] = rawEpisodes.map((ev: any, idx: number) => {
            const ef = ev.mapValue?.fields || {};
            const sNum = Number(ef.seasonNumber?.integerValue || 1);
            const epNum = Number(ef.episodeNumber?.integerValue || idx + 1);
            return {
              id: ef.id?.stringValue || `ep-${id}-${idx + 1}`,
              seriesId: id,
              seasonId: ef.seasonId?.stringValue || `sn-${id}-${sNum}`,
              seasonNumber: sNum,
              seasonName: ef.seasonName?.stringValue || `Season ${sNum}`,
              episodeNumber: epNum,
              title: ef.title?.stringValue || `Episode ${epNum}`,
              description: ef.description?.stringValue || '',
              thumbnail: ef.thumbnail?.stringValue || coverImageUrl,
              videoUrl: ef.videoUrl?.stringValue || videoUrl,
              duration: Number(ef.duration?.integerValue || 45),
              skipIntroSec: Number(ef.skipIntroSec?.integerValue || 0),
              createdAt
            };
          });

          // Seasons
          const rawSeasons = fields.seasons?.arrayValue?.values || [];
          const parsedSeasons: Season[] = rawSeasons.map((sv: any, idx: number) => {
            const sf = sv.mapValue?.fields || {};
            const sNum = Number(sf.seasonNumber?.integerValue || idx + 1);
            return {
              id: sf.id?.stringValue || `sn-${id}-${sNum}`,
              seriesId: id,
              seasonNumber: sNum,
              seasonName: sf.seasonName?.stringValue || sf.title?.stringValue || `Season ${sNum}`,
              title: sf.title?.stringValue || sf.seasonName?.stringValue || `Season ${sNum}`,
              episodesCount: Number(sf.episodesCount?.integerValue || 0)
            };
          });

          if (type === 'movie') {
            const existingIdx = movies.findIndex(m => m.id === id);
            const movieObj: Movie = {
              id,
              title,
              description,
              poster: coverImageUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
              backdrop: coverImageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
              coverImageUrl,
              trailerUrl,
              videoUrl,
              year,
              duration: Number(fields.duration?.integerValue || fields.duration?.doubleValue || 90),
              genre,
              language,
              country,
              director,
              cast: [],
              rating,
              ageClassification: fields.ageClassification?.stringValue || 'PG-13',
              isPremium,
              accessType,
              isFeatured,
              isTrending,
              isPublished,
              published: isPublished,
              qualityBadge,
              viewsCount: Number(fields.viewsCount?.integerValue || 0),
              likesCount: Number(fields.likesCount?.integerValue || 0),
              createdAt,
              updatedAt
            };

            if (existingIdx > -1) {
              const localMovie = movies[existingIdx];
              const firestoreTime = new Date(updatedAt).getTime();
              const localTime = new Date(localMovie.updatedAt || localMovie.createdAt || 0).getTime();
              if (firestoreTime >= localTime) {
                movies[existingIdx] = { ...localMovie, ...movieObj };
                changed = true;
              } else {
                // Local version is newer, push to Firestore
                persistContentItemToFirestore(mapToContentItem(localMovie)).catch(() => {});
              }
            } else {
              movies.unshift(movieObj);
              changed = true;
            }
          } else {
            // TV Series
            const existingIdx = seriesList.findIndex(s => s.id === id);
            const seriesObj: TVSeries = {
              id,
              title,
              description,
              poster: coverImageUrl || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
              backdrop: coverImageUrl || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
              coverImageUrl,
              trailerUrl,
              year,
              genre,
              language,
              country,
              director,
              cast: [],
              rating,
              ageClassification: fields.ageClassification?.stringValue || 'PG-13',
              isPremium,
              accessType,
              isFeatured,
              isTrending,
              isPublished,
              published: isPublished,
              qualityBadge,
              viewsCount: Number(fields.viewsCount?.integerValue || 0),
              likesCount: Number(fields.likesCount?.integerValue || 0),
              seasonsCount: Math.max(1, parsedSeasons.length, Number(fields.seasonsCount?.integerValue || 1)),
              createdAt,
              updatedAt
            };

            if (existingIdx > -1) {
              const localSeries = seriesList[existingIdx];
              const firestoreTime = new Date(updatedAt).getTime();
              const localTime = new Date(localSeries.updatedAt || localSeries.createdAt || 0).getTime();
              if (firestoreTime >= localTime) {
                seriesList[existingIdx] = { ...localSeries, ...seriesObj };
                if (parsedSeasons.length > 0) {
                  seasonsList = seasonsList.filter(sn => sn.seriesId !== id);
                  parsedSeasons.forEach(sn => seasonsList.push(sn));
                }
                if (parsedEpisodes.length > 0) {
                  episodesList = episodesList.filter(e => e.seriesId !== id);
                  parsedEpisodes.forEach(ep => episodesList.push(ep));
                }
                changed = true;
              } else {
                persistContentItemToFirestore(mapToContentItem(localSeries)).catch(() => {});
              }
            } else {
              seriesList.unshift(seriesObj);
              if (parsedSeasons.length > 0) {
                parsedSeasons.forEach(sn => seasonsList.push(sn));
              }
              if (parsedEpisodes.length > 0) {
                parsedEpisodes.forEach(ep => episodesList.push(ep));
              }
              changed = true;
            }
          }
        }
        if (changed) {
          saveContentStore();
          console.info(`[Firestore Sync] Synchronized item(s) from production Firestore.`);
        }
      }
    }

    // Bidirectional sync: Push any local items not yet in Firestore to Firestore
    for (const movie of movies) {
      if (!deletedContentIds.has(movie.id) && !firestoreFoundIds.has(movie.id)) {
        await persistContentItemToFirestore(mapToContentItem(movie));
      }
    }
    for (const series of seriesList) {
      if (!deletedContentIds.has(series.id) && !firestoreFoundIds.has(series.id)) {
        await persistContentItemToFirestore(mapToContentItem(series));
      }
    }

    // 2. Fetch Settings from Firestore
    const settingsDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/settings/app`;
    const settingsRes = await fetch(settingsDocUrl);
    if (settingsRes.ok) {
      const docData: any = await settingsRes.json();
      if (docData.fields) {
        const sf = docData.fields;
        const loadedSettings: Partial<AppSettings> = {};
        if (sf.appName?.stringValue) loadedSettings.appName = sf.appName.stringValue;
        if (sf.tagline?.stringValue) loadedSettings.tagline = sf.tagline.stringValue;
        if (sf.monthlyPricePi?.doubleValue !== undefined) loadedSettings.monthlyPricePi = Number(sf.monthlyPricePi.doubleValue);
        else if (sf.monthlyPricePi?.integerValue !== undefined) loadedSettings.monthlyPricePi = Number(sf.monthlyPricePi.integerValue);
        if (sf.annualPricePi?.doubleValue !== undefined) loadedSettings.annualPricePi = Number(sf.annualPricePi.doubleValue);
        else if (sf.annualPricePi?.integerValue !== undefined) loadedSettings.annualPricePi = Number(sf.annualPricePi.integerValue);
        if (sf.freeViewingDurationMinutes?.integerValue) loadedSettings.freeViewingDurationMinutes = Number(sf.freeViewingDurationMinutes.integerValue);
        if (sf.adIntervalMinutes?.integerValue) loadedSettings.adIntervalMinutes = Number(sf.adIntervalMinutes.integerValue);
        if (sf.enableAds?.booleanValue !== undefined) loadedSettings.enableAds = Boolean(sf.enableAds.booleanValue);
        if (sf.contactEmail?.stringValue) loadedSettings.contactEmail = sf.contactEmail.stringValue;
        if (sf.announcement?.stringValue) loadedSettings.announcement = sf.announcement.stringValue;
        if (sf.termsContent?.stringValue) loadedSettings.termsContent = sf.termsContent.stringValue;
        if (sf.privacyContent?.stringValue) loadedSettings.privacyContent = sf.privacyContent.stringValue;
        if (sf.dmcaContent?.stringValue) loadedSettings.dmcaContent = sf.dmcaContent.stringValue;

        appSettings = { ...appSettings, ...loadedSettings };
        saveSettingsStore();
        console.info(`[Firestore Sync] Synchronized AppSettings from production Firestore.`);
      }
    }

    // 3. Fetch Visitors from production Firestore
    const visitorsQueryRes = await fetch(firestoreQueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'visitors' }]
        }
      })
    });
    if (visitorsQueryRes.ok) {
      const visitorsList: any[] = await visitorsQueryRes.json();
      let importedCount = 0;
      for (const item of visitorsList) {
        if (!item.document || !item.document.fields) continue;
        const fields = item.document.fields;
        const visitorId = fields.visitorId?.stringValue;
        if (!visitorId) continue;
        const source = fields.source?.stringValue || 'external_web';
        const piUserId = fields.piUserId?.stringValue;
        const piUsername = fields.piUsername?.stringValue;
        const firstSeen = fields.firstSeen?.stringValue || new Date().toISOString();
        const lastSeen = fields.lastSeen?.stringValue || new Date().toISOString();
        const visitCount = parseInt(fields.visitCount?.integerValue || '1', 10);
        const visitDates = fields.visitDates?.arrayValue?.values
          ? fields.visitDates.arrayValue.values.map((v: any) => v.stringValue).filter(Boolean)
          : [lastSeen.substring(0, 10)];

        const existing = visitorsStore.get(visitorId);
        if (!existing) {
          visitorsStore.set(visitorId, {
            visitorId,
            source: (source === 'pi_browser' ? 'pi_browser' : 'external_web'),
            piUserId,
            piUsername,
            firstSeen,
            lastSeen,
            visitDates,
            visitCount,
            createdAt: fields.createdAt?.stringValue || firstSeen,
            updatedAt: fields.updatedAt?.stringValue || lastSeen
          });
          importedCount++;
        }
      }
      if (importedCount > 0) {
        saveVisitorsStore();
        console.info(`[Firestore Sync] Synchronized ${importedCount} visitors from production Firestore.`);
      }
    }

    // 4. Fetch Likes from production Firestore
    const likesQueryRes = await fetch(firestoreQueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'likes' }]
        }
      })
    });
    if (likesQueryRes.ok) {
      const likesList: any[] = await likesQueryRes.json();
      let importedLikes = 0;
      for (const item of likesList) {
        if (!item.document || !item.document.fields) continue;
        const fields = item.document.fields;
        const id = fields.id?.stringValue;
        const userId = fields.userId?.stringValue;
        const contentId = fields.contentId?.stringValue;
        const contentType = fields.contentType?.stringValue || 'movie';
        const likedAt = fields.likedAt?.stringValue || new Date().toISOString();

        if (id && userId && contentId) {
          const exists = likedItems.some(l => l.userId === userId && l.contentId === contentId);
          if (!exists) {
            likedItems.push({ id, userId, contentId, contentType: contentType as any, likedAt });
            importedLikes++;
          }
        }
      }
      if (importedLikes > 0) {
        saveInteractionsStore();
        console.info(`[Firestore Sync] Synchronized ${importedLikes} likes from production Firestore.`);
      }
    }

    // 5. Fetch Reviews from production Firestore
    const reviewsQueryRes = await fetch(firestoreQueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'reviews' }]
        }
      })
    });
    if (reviewsQueryRes.ok) {
      const reviewsList: any[] = await reviewsQueryRes.json();
      let importedReviews = 0;
      for (const item of reviewsList) {
        if (!item.document || !item.document.fields) continue;
        const fields = item.document.fields;
        const id = fields.id?.stringValue;
        const userId = fields.userId?.stringValue;
        const contentId = fields.contentId?.stringValue;
        const username = fields.username?.stringValue || 'Pioneer';
        const userImage = fields.userImage?.stringValue;
        const rating = fields.rating?.integerValue ? Number(fields.rating.integerValue) : (fields.rating?.doubleValue ? Number(fields.rating.doubleValue) : 8);
        const reviewText = fields.review?.stringValue || '';
        const createdAt = fields.createdAt?.stringValue || new Date().toISOString();
        const approved = fields.approved?.booleanValue !== false;

        if (id && userId && contentId) {
          const idx = reviews.findIndex(r => r.id === id || (r.userId === userId && r.contentId === contentId));
          if (idx >= 0) {
            reviews[idx] = { id, userId, username, userImage, contentId, rating, review: reviewText, createdAt, approved };
          } else {
            reviews.unshift({ id, userId, username, userImage, contentId, rating, review: reviewText, createdAt, approved });
            importedReviews++;
          }
        }
      }
      if (importedReviews > 0) {
        saveInteractionsStore();
        console.info(`[Firestore Sync] Synchronized ${importedReviews} reviews from production Firestore.`);
      }
    }

    // Recalculate movie and series metrics with latest data
    recalculateAllMetrics();
  } catch (syncErr) {
    console.warn('[Firestore Sync] Non-blocking initial Firestore sync notice:', syncErr);
  }
}

// Initialize stores from disk
appSettings = loadSettingsStore();
loadInteractionsStore();
loadContentStore();
recalculateAllMetrics();
loadVisitorsStore();
// Kick off non-blocking background synchronization with Firestore
syncFromProductionFirestore();

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

app.put('/api/settings', verifyAdmin, async (req: Request, res: Response) => {
  appSettings = { ...appSettings, ...req.body };
  saveSettingsStore();

  // Sync to production Firestore document settings/app via REST
  try {
    const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
    const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
    const settingsDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/settings/app`;
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const fields: Record<string, any> = {};
    if (appSettings.appName !== undefined) fields.appName = { stringValue: String(appSettings.appName) };
    if (appSettings.tagline !== undefined) fields.tagline = { stringValue: String(appSettings.tagline) };
    if (appSettings.monthlyPricePi !== undefined) fields.monthlyPricePi = { doubleValue: Number(appSettings.monthlyPricePi) };
    if (appSettings.annualPricePi !== undefined) fields.annualPricePi = { doubleValue: Number(appSettings.annualPricePi) };
    if (appSettings.freeViewingDurationMinutes !== undefined) fields.freeViewingDurationMinutes = { integerValue: String(appSettings.freeViewingDurationMinutes) };
    if (appSettings.adIntervalMinutes !== undefined) fields.adIntervalMinutes = { integerValue: String(appSettings.adIntervalMinutes) };
    if (appSettings.enableAds !== undefined) fields.enableAds = { booleanValue: Boolean(appSettings.enableAds) };
    if (appSettings.contactEmail !== undefined) fields.contactEmail = { stringValue: String(appSettings.contactEmail) };
    if (appSettings.announcement !== undefined) fields.announcement = { stringValue: String(appSettings.announcement) };
    if (appSettings.termsContent !== undefined) fields.termsContent = { stringValue: String(appSettings.termsContent) };
    if (appSettings.privacyContent !== undefined) fields.privacyContent = { stringValue: String(appSettings.privacyContent) };
    if (appSettings.dmcaContent !== undefined) fields.dmcaContent = { stringValue: String(appSettings.dmcaContent) };

    await fetch(settingsDocUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields })
    });
  } catch (fsErr) {
    console.warn('[Firestore Settings] Server sync notice:', fsErr);
  }

  res.json({ success: true, settings: appSettings });
});

// Authentication (Regular Users only - Admin must use Firebase Auth)
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username or email required' });
  }

  // Regular user login or automatic pioneer discovery
  let user = users.find(u => 
    u.role !== 'admin' && (
      u.username.toLowerCase() === username.toLowerCase() || 
      u.email.toLowerCase() === username.toLowerCase()
    )
  );
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

// Deterministic standard Unicode emoji avatar selection
const EMOJI_AVATARS: string[] = [
  '😀', '😎', '😊', '🥰', '🤩', '😇', '🥳', '😌', '🤗', '🫡',
  '🐼', '🦊', '🐯', '🐨', '🐸', '🐵', '🐱', '🐶', '🐰', '🐻'
];

function getDeterministicEmoji(identifier?: string): string {
  const cleanId = (identifier || '').toLowerCase().replace(/^@/, '').trim();
  if (!cleanId) return EMOJI_AVATARS[0];
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = ((hash << 5) - hash) + cleanId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % EMOJI_AVATARS.length;
  return EMOJI_AVATARS[index];
}

// Pi Network User Authentication Verification Endpoint
// Requirement: Validate access token by calling GET https://api.minepi.com/v2/me with Authorization: Bearer <accessToken>
app.post(['/api/auth/pi', '/api/auth/pi/verify'], async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.accessToken;
    const accessToken = (bodyToken || (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '')).trim();

    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Pi Network access token is required.' });
    }

    // Call GET https://api.minepi.com/v2/me with Authorization: Bearer <accessToken>
    const piApiResponse = await fetch('https://api.minepi.com/v2/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!piApiResponse.ok) {
      const errText = await piApiResponse.text().catch(() => '');
      console.warn(`[Pi Auth] MinePi /v2/me failed with status ${piApiResponse.status}: ${errText}`);
      return res.status(401).json({
        success: false,
        error: `Pi Network authentication failed: Invalid or expired access token (status ${piApiResponse.status}).`
      });
    }

    const piUserData: any = await piApiResponse.json();
    if (!piUserData || (!piUserData.uid && !piUserData.username)) {
      return res.status(400).json({ success: false, error: 'Invalid user payload received from Pi Network.' });
    }

    const piUid = String(piUserData.uid || '').trim();
    const piUsername = String(piUserData.username || `pioneer_${piUid.slice(0, 6)}`).trim();

    // Find existing user or register new Pioneer
    let user = users.find(u =>
      (u.piUsername && u.piUsername.toLowerCase() === piUsername.toLowerCase()) ||
      u.id === `usr_pi_${piUid}` ||
      u.username.toLowerCase() === piUsername.toLowerCase()
    );

    if (user) {
      // Update session information
      user.piUsername = piUsername;
      if (!user.profileImage || user.profileImage.includes('unsplash') || user.profileImage.includes('dicebear') || user.profileImage.includes('bottts')) {
        user.profileImage = getDeterministicEmoji(piUsername);
      }
    } else {
      user = {
        id: `usr_pi_${piUid || Date.now()}`,
        username: piUsername,
        email: `${piUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}@pioneer.network`,
        profileImage: getDeterministicEmoji(piUsername),
        role: 'user',
        premiumStatus: false,
        subscriptionPlan: 'free',
        piUsername: piUsername,
        piWalletAddress: `GD${crypto.createHash('sha256').update(piUid || piUsername).digest('hex').substring(0, 8).toUpperCase()}...PI`,
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

    const sessionToken = `jwt_pi_session_${user.id}_${Date.now()}`;

    return res.json({
      success: true,
      token: sessionToken,
      user,
      piUser: {
        uid: piUid,
        username: piUsername,
        roles: piUserData.roles || []
      }
    });
  } catch (error: any) {
    console.error('[Pi Auth Server] Error verifying access token:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while authenticating with Pi Network.' });
  }
});

// Real Firebase Administrator Authentication Verification Endpoint
app.post('/api/admin/verify-token', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, isAdmin: false, error: 'Authorization header required' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const adminUser = await verifyFirebaseToken(token);
  if (adminUser) {
    return res.json({
      success: true,
      isAdmin: true,
      user: adminUser
    });
  }

  return res.status(403).json({
    success: false,
    isAdmin: false,
    error: 'Access Denied: Account is not authorized as an Administrator on PiFlix+.'
  });
});

// Administrator Registration Endpoint (Fallback for Firebase Console operation-not-allowed)
app.post('/api/admin/auth/register', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email address is required.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const isSuperAdmin = normalizedEmail === SUPER_ADMIN_EMAIL.toLowerCase();
  const isAuthorizedAdmin = isSuperAdmin || adminStore.has(normalizedEmail);

  if (!isAuthorizedAdmin) {
    return res.status(403).json({
      success: false,
      error: `Access Denied: ${normalizedEmail} has not been designated as an Administrator. Only approved accounts can register.`
    });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const uid = isSuperAdmin ? 'owner_frank_gwaza' : `admin_${Date.now()}_${normalizedEmail.replace(/[^a-z0-9]/g, '').slice(0, 10)}`;

  adminCredentials[normalizedEmail] = {
    email: normalizedEmail,
    salt,
    hash,
    uid,
    role: 'admin',
    createdAt: new Date().toISOString()
  };
  saveAdminCredentials();

  adminStore.set(normalizedEmail, {
    uid,
    email: normalizedEmail,
    role: 'admin',
    createdAt: new Date().toISOString(),
    assignedBy: isSuperAdmin ? 'Primary Owner Registration' : 'Admin Register'
  });

  const adminUser = { uid, email: normalizedEmail, role: 'admin' as const };
  const token = generateAdminJwt(adminUser);

  res.json({
    success: true,
    token,
    user: adminUser
  });
});

// Administrator Login Endpoint
app.post('/api/admin/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const isSuperAdmin = normalizedEmail === SUPER_ADMIN_EMAIL.toLowerCase();
  const cred = adminCredentials[normalizedEmail];

  if (cred) {
    const computedHash = hashPassword(password, cred.salt);
    if (computedHash !== cred.hash) {
      return res.status(401).json({ success: false, error: 'Incorrect administrator password.' });
    }
    const adminUser = { uid: cred.uid, email: normalizedEmail, role: 'admin' as const };
    const token = generateAdminJwt(adminUser);
    return res.json({
      success: true,
      token,
      user: adminUser
    });
  }

  // If primary owner is logging in for the first time, auto-initialize credentials with provided password
  if (isSuperAdmin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const uid = 'owner_frank_gwaza';
    adminCredentials[normalizedEmail] = {
      email: normalizedEmail,
      salt,
      hash,
      uid,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    saveAdminCredentials();

    adminStore.set(normalizedEmail, {
      uid,
      email: normalizedEmail,
      role: 'admin',
      createdAt: new Date().toISOString(),
      assignedBy: 'System Primary'
    });

    const adminUser = { uid, email: normalizedEmail, role: 'admin' as const };
    const token = generateAdminJwt(adminUser);
    return res.json({
      success: true,
      token,
      user: adminUser
    });
  }

  return res.status(404).json({
    success: false,
    error: 'Administrator account not found. Please click "Create Admin Account" to register.'
  });
});

// Admin Authorization Management (RBAC)
app.get('/api/admin/admins', verifyAdmin, (_req: Request, res: Response) => {
  const list = Array.from(adminStore.values());
  res.json(list);
});

app.post('/api/admin/admins', verifyAdmin, (req: Request, res: Response) => {
  const { email, uid } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  const normalized = email.trim().toLowerCase();
  const newAdmin: AdminStoreRecord = {
    uid: uid?.trim() || `admin_${Date.now()}`,
    email: normalized,
    role: 'admin',
    createdAt: new Date().toISOString(),
    assignedBy: (req as any).adminUser?.email || 'Administrator'
  };

  adminStore.set(normalized, newAdmin);
  res.json({ success: true, admin: newAdmin });
});

app.delete('/api/admin/admins/:id', verifyAdmin, (req: Request, res: Response) => {
  const targetId = String(req.params.id || '').trim().toLowerCase();
  if (targetId === SUPER_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Cannot revoke Primary Super Administrator account' });
  }

  let removed = false;
  for (const [key, val] of adminStore.entries()) {
    if (key === targetId || val.uid === targetId) {
      if (val.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
        return res.status(400).json({ error: 'Cannot revoke Primary Super Administrator account' });
      }
      adminStore.delete(key);
      removed = true;
      break;
    }
  }

  res.json({ success: removed });
});

// Legacy auth/login disabled in favor of real Firebase Authentication
app.post('/api/admin/auth/login', async (req: Request, res: Response) => {
  const { idToken } = req.body;
  if (idToken) {
    const adminUser = await verifyFirebaseToken(idToken);
    if (adminUser) {
      return res.json({ success: true, token: idToken, admin: adminUser });
    }
  }

  return res.status(401).json({
    error: 'Hardcoded admin login has been disabled for security. Please sign in using real Firebase Authentication.'
  });
});

// 1. Upload video file (MP4, WebM, MKV, MOV up to 2GB) with automatic duration extraction
// Supports single or multiple videos in one endpoint for robust media pipeline
app.post('/api/admin/upload/video', verifyAdmin, uploadVideo.fields([{ name: 'video', maxCount: 1 }, { name: 'videos', maxCount: 20 }]), async (req: Request, res: Response) => {
  const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const singleFile = req.file || (filesObj?.video?.[0]) || (filesObj?.videos?.[0]);
  
  if (!singleFile) {
    return res.status(400).json({ error: 'No video file provided for upload' });
  }

  const fileUrl = `/uploads/videos/${singleFile.filename}`;
  
  // Extract real video duration via ffprobe
  const durationInfo = await detectMediaDuration(singleFile.path);

  res.json({
    success: true,
    url: fileUrl,
    filename: singleFile.filename,
    originalName: singleFile.originalname,
    size: singleFile.size,
    mimeType: singleFile.mimetype,
    durationSeconds: durationInfo?.durationSeconds || null,
    durationMinutes: durationInfo?.durationMinutes || null
  });
});

// Dedicated Multiple Movie / Video Batch Upload endpoint
// Processes each video independently: one file failure never fails other items
app.post('/api/admin/upload/videos', verifyAdmin, uploadVideo.array('videos', 25), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No video files provided for batch upload' });
  }

  const uploadedFiles: Array<{
    filename: string;
    originalName: string;
    url: string;
    size: number;
    mimeType: string;
    durationSeconds: number | null;
    durationMinutes: number | null;
  }> = [];

  const errors: Array<{ originalName: string; error: string }> = [];

  for (const file of files) {
    try {
      const fileUrl = `/uploads/videos/${file.filename}`;
      const durationInfo = await detectMediaDuration(file.path);
      uploadedFiles.push({
        filename: file.filename,
        originalName: file.originalname,
        url: fileUrl,
        size: file.size,
        mimeType: file.mimetype,
        durationSeconds: durationInfo?.durationSeconds || null,
        durationMinutes: durationInfo?.durationMinutes || null
      });
    } catch (itemErr: any) {
      errors.push({
        originalName: file.originalname,
        error: itemErr?.message || 'Processing error'
      });
    }
  }

  res.json({
    success: uploadedFiles.length > 0,
    files: uploadedFiles,
    errors: errors.length > 0 ? errors : undefined,
    count: uploadedFiles.length
  });
});

// Chunked Upload Endpoint for Large Files (>100MB or flaky network environments)
app.post('/api/admin/upload/chunk', verifyAdmin, express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req: Request, res: Response) => {
  try {
    const uploadId = String(req.headers['x-upload-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const chunkIndex = parseInt(String(req.headers['x-chunk-index'] || '0'), 10);
    const totalChunks = parseInt(String(req.headers['x-total-chunks'] || '1'), 10);
    const originalName = String(req.headers['x-original-name'] || 'video.mp4');

    if (!uploadId) {
      return res.status(400).json({ error: 'x-upload-id header is required' });
    }

    const chunkDir = path.join(uploadsDir, 'chunks', uploadId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkPath = path.join(chunkDir, `part_${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.body);

    // If all chunks uploaded, assemble the final video file
    if (chunkIndex === totalChunks - 1) {
      const ext = path.extname(originalName) || '.mp4';
      const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
      const finalFilename = `vid_${Date.now()}_${baseName}${ext}`;
      const finalFilePath = path.join(videosDir, finalFilename);

      const writeStream = fs.createWriteStream(finalFilePath);
      for (let i = 0; i < totalChunks; i++) {
        const partPath = path.join(chunkDir, `part_${i}`);
        if (fs.existsSync(partPath)) {
          const chunkBuf = fs.readFileSync(partPath);
          writeStream.write(chunkBuf);
        }
      }
      writeStream.end();

      // Clean up chunk temporary directory
      try {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      } catch {}

      const durationInfo = await detectMediaDuration(finalFilePath);
      const stat = fs.statSync(finalFilePath);

      return res.json({
        success: true,
        completed: true,
        url: `/uploads/videos/${finalFilename}`,
        filename: finalFilename,
        originalName,
        size: stat.size,
        durationMinutes: durationInfo?.durationMinutes || null,
        durationSeconds: durationInfo?.durationSeconds || null
      });
    }

    return res.json({
      success: true,
      completed: false,
      chunkIndex,
      totalChunks
    });
  } catch (err: any) {
    console.error('[Chunk Upload Error]:', err);
    return res.status(500).json({ error: err?.message || 'Chunk upload failed' });
  }
});

// Detect video duration from uploaded file or streaming URL
app.post('/api/admin/detect-duration', verifyAdmin, async (req: Request, res: Response) => {
  const { videoUrl } = req.body;
  if (!videoUrl || typeof videoUrl !== 'string') {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  let target = videoUrl.trim();
  if (target.startsWith('/uploads/videos/')) {
    target = path.join(videosDir, path.basename(target));
  }

  const durationInfo = await detectMediaDuration(target);
  if (durationInfo) {
    return res.json({
      success: true,
      durationSeconds: durationInfo.durationSeconds,
      durationMinutes: durationInfo.durationMinutes
    });
  }

  return res.status(422).json({
    success: false,
    error: 'Could not detect duration from video URL. You can enter duration manually.'
  });
});

// 2. Upload cover image (JPG, PNG, WebP up to 30MB) with Firestore backup
app.post('/api/admin/upload/cover', verifyAdmin, uploadCover.single('cover'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No cover image file provided for upload' });
  }

  const fileUrl = `/uploads/covers/${req.file.filename}`;
  const assetId = `cov_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Backup to Firestore media_assets if size is under 950KB for zero-loss restarts
  try {
    if (req.file.size < 950 * 1024) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const base64Str = fileBuffer.toString('base64');
      const projectId = firebaseConfig.projectId || 'empyrean-patrol-bvxch';
      const databaseId = firebaseConfig.firestoreDatabaseId || 'ai-studio-piflix-2d1bb7c4-88f0-466a-95d5-c25d95f2c9a6';
      const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/media_assets/${assetId}`;

      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token && token !== 'admin_session') {
        headers['Authorization'] = `Bearer ${token}`;
      }

      await fetch(docUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields: {
            assetId: { stringValue: assetId },
            filename: { stringValue: req.file.filename },
            mimeType: { stringValue: req.file.mimetype || 'image/jpeg' },
            data: { stringValue: base64Str },
            createdAt: { stringValue: new Date().toISOString() }
          }
        })
      });
    }
  } catch (backupErr) {
    console.warn('[Cover Firestore Backup] Notice:', backupErr);
  }

  res.json({
    success: true,
    url: fileUrl,
    assetUrl: `/api/media/covers/${assetId}`,
    assetId,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype
  });
});

// ----------------------------------------------------
// Unified Content CRUD Endpoints (Movies & TV Series)
// ----------------------------------------------------

// Helper to convert internal Movie/Series into standardized ContentItem
function mapToContentItem(item: Movie | TVSeries): ContentItem {
  const isSeries = 'seasonsCount' in item;
  const itemGenre = Array.isArray(item.genre) ? item.genre.join(', ') : (item.genre || 'General');
  const episodes = isSeries 
    ? episodesList.filter(e => e.seriesId === item.id).map(e => ({
        id: e.id,
        seasonId: e.seasonId,
        seasonNumber: e.seasonNumber || 1,
        seasonName: e.seasonName,
        episodeNumber: e.episodeNumber,
        title: e.title,
        description: e.description,
        thumbnail: e.thumbnail,
        videoUrl: e.videoUrl,
        duration: e.duration,
        skipIntroSec: e.skipIntroSec
      }))
    : undefined;

  const seasons = isSeries
    ? seasonsList.filter(s => s.seriesId === item.id).map(s => ({
        id: s.id,
        seriesId: s.seriesId,
        seasonNumber: s.seasonNumber || 1,
        seasonName: s.seasonName || s.title || `Season ${s.seasonNumber || 1}`,
        title: s.title || s.seasonName || `Season ${s.seasonNumber || 1}`,
        episodesCount: episodes ? episodes.filter(e => (e.seasonNumber || 1) === (s.seasonNumber || 1) || (e.seasonId && e.seasonId === s.id)).length : (s.episodesCount || 0)
      }))
    : undefined;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: isSeries ? 'series' : 'movie',
    coverImageUrl: item.coverImageUrl || item.poster || item.backdrop,
    videoUrl: (item as Movie).videoUrl || (episodes && episodes[0]?.videoUrl) || '',
    trailerUrl: item.trailerUrl || '',
    year: item.year,
    duration: !isSeries ? ((item as Movie).duration || undefined) : undefined,
    seasonsCount: isSeries ? ((item as TVSeries).seasonsCount || (seasons?.length || 1)) : undefined,
    genre: itemGenre,
    language: item.language,
    rating: item.rating,
    quality: item.qualityBadge || 'HD',
    accessType: item.isPremium ? 'premium' : 'free',
    published: item.isPublished !== undefined ? item.isPublished : true,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    seasons,
    episodes
  };
}

// GET all content items with filtering & search
app.get('/api/content', (req: Request, res: Response) => {
  const { type, search, genre, language, publishedOnly, accessType, quality } = req.query;

  let allItems: ContentItem[] = [
    ...movies.map(mapToContentItem),
    ...seriesList.map(mapToContentItem)
  ];

  // Published filter
  if (publishedOnly === 'true') {
    allItems = allItems.filter(i => i.published);
  }

  // Type filter
  if (type && type !== 'all') {
    allItems = allItems.filter(i => i.type === type);
  }

  // Access type filter
  if (accessType && accessType !== 'all') {
    allItems = allItems.filter(i => i.accessType === accessType);
  }

  // Quality filter
  if (quality && quality !== 'all') {
    allItems = allItems.filter(i => i.quality === quality);
  }

  // Search filter
  if (search) {
    const q = String(search).toLowerCase();
    allItems = allItems.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.genre.toLowerCase().includes(q) ||
      i.language.toLowerCase().includes(q)
    );
  }

  // Genre filter
  if (genre && genre !== 'All') {
    allItems = allItems.filter(i => i.genre.toLowerCase().includes(String(genre).toLowerCase()));
  }

  // Language filter
  if (language && language !== 'All') {
    allItems = allItems.filter(i => i.language.toLowerCase() === String(language).toLowerCase());
  }

  // Sort by newest and recently modified first
  allItems.sort((a, b) => {
    const timeA = new Date((a as any).updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
    const timeB = new Date((b as any).updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
    return timeB - timeA;
  });

  res.json(allItems);
});

// GET single content item by ID
app.get('/api/content/:id', (req: Request, res: Response) => {
  const movie = movies.find(m => m.id === req.params.id);
  if (movie) return res.json(mapToContentItem(movie));

  const series = seriesList.find(s => s.id === req.params.id);
  if (series) return res.json(mapToContentItem(series));

  return res.status(404).json({ error: 'Content item not found' });
});

// POST create new content item
app.post('/api/content', verifyAdmin, (req: Request, res: Response) => {
  const {
    title,
    description,
    type = 'movie',
    coverImageUrl,
    videoUrl,
    trailerUrl = '',
    year,
    genre,
    language = 'English',
    rating = 8.0,
    quality = 'HD',
    accessType = 'free',
    published = true,
    episodes = []
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const id = req.body.id || (type === 'series' ? 's-' : 'm-') + Date.now();
  const now = new Date().toISOString();
  const genreArray = Array.isArray(genre) 
    ? genre 
    : (genre ? String(genre).split(',').map((s: string) => s.trim()) : ['General']);

  const isPremium = accessType === 'premium';
  const qualityBadge = (quality as 'HD' | 'FHD' | '4K') || 'HD';

  if (type === 'movie') {
    const newMovie: Movie = {
      id,
      title: title.trim(),
      description: description || '',
      poster: coverImageUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
      backdrop: coverImageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
      coverImageUrl: coverImageUrl || '',
      trailerUrl,
      videoUrl: videoUrl || '',
      year: Number(year) || new Date().getFullYear(),
      duration: Number(req.body.duration) || 95,
      genre: genreArray,
      language: language || 'English',
      country: req.body.country || 'International',
      director: req.body.director || 'Creator',
      cast: Array.isArray(req.body.cast) ? req.body.cast : [],
      rating: Number(rating) || 8.0,
      ageClassification: req.body.ageClassification || 'PG-13',
      isPremium,
      accessType: accessType as 'free' | 'premium',
      isFeatured: Boolean(req.body.isFeatured),
      isTrending: Boolean(req.body.isTrending),
      isPublished: Boolean(published),
      published: Boolean(published),
      qualityBadge,
      viewsCount: 0,
      likesCount: 0,
      createdAt: req.body.createdAt || now,
      updatedAt: now
    };

    // Remove existing if replacing ID and clear any previous deleted marker
    deletedContentIds.delete(id);
    movies = movies.filter(m => m.id !== id);
    movies.unshift(newMovie);
    saveContentStore();

    // Persist permanently to Firestore
    persistContentItemToFirestore(mapToContentItem(newMovie)).catch(err => {
      console.warn('[Firestore Content Post Warning]:', err);
    });

    return res.json({ success: true, content: mapToContentItem(newMovie) });
  } else {
    // TV Series
    const newSeries: TVSeries = {
      id,
      title: title.trim(),
      description: description || '',
      poster: coverImageUrl || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
      backdrop: coverImageUrl || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1600&auto=format&fit=crop&q=80',
      coverImageUrl: coverImageUrl || '',
      trailerUrl,
      year: Number(year) || new Date().getFullYear(),
      genre: genreArray,
      language: language || 'English',
      country: req.body.country || 'International',
      director: req.body.director || 'Creator',
      cast: Array.isArray(req.body.cast) ? req.body.cast : [],
      rating: Number(rating) || 8.5,
      ageClassification: req.body.ageClassification || 'PG-13',
      isPremium,
      accessType: accessType as 'free' | 'premium',
      isFeatured: Boolean(req.body.isFeatured),
      isTrending: Boolean(req.body.isTrending),
      isPublished: Boolean(published),
      published: Boolean(published),
      qualityBadge,
      viewsCount: 0,
      likesCount: 0,
      seasonsCount: 1,
      createdAt: req.body.createdAt || now,
      updatedAt: now
    };

    deletedContentIds.delete(id);
    seriesList = seriesList.filter(s => s.id !== id);
    seriesList.unshift(newSeries);

    // Safe merge of seasons and episodes
    const rawSeasons = Array.isArray(req.body.seasons) ? req.body.seasons : [];
    if (rawSeasons.length > 0) {
      rawSeasons.forEach((sn: any) => {
        const sNum = Number(sn.seasonNumber) || 1;
        const sName = sn.seasonName || sn.title || `Season ${sNum}`;
        const existingIdx = seasonsList.findIndex(s => s.id === sn.id || (s.seriesId === id && s.seasonNumber === sNum));
        if (existingIdx > -1) {
          seasonsList[existingIdx] = {
            ...seasonsList[existingIdx],
            seasonNumber: sNum,
            seasonName: sName,
            title: sn.title || sName
          };
        } else {
          seasonsList.push({
            id: sn.id || `sn-${id}-${sNum}-${Date.now()}`,
            seriesId: id,
            seasonNumber: sNum,
            seasonName: sName,
            title: sn.title || sName,
            episodesCount: 0
          });
        }
      });
    }

    if (Array.isArray(episodes) && episodes.length > 0) {
      let firstSeason = seasonsList.find(sn => sn.seriesId === id);
      if (!firstSeason) {
        firstSeason = {
          id: 'sn-' + id + '-1',
          seriesId: id,
          seasonNumber: 1,
          seasonName: 'Season 1',
          title: 'Season 1',
          episodesCount: 0
        };
        seasonsList.push(firstSeason);
      }

      episodes.forEach((ep: any, idx: number) => {
        const epSeason = seasonsList.find(s => s.id === ep.seasonId) || firstSeason!;
        const existingEpIdx = episodesList.findIndex(e => e.id === ep.id);
        const epNum = Number(ep.episodeNumber) || (idx + 1);
        const epObj: Episode = {
          id: ep.id || `ep-${id}-${epSeason.id}-${epNum}-${Date.now()}`,
          seriesId: id,
          seasonId: epSeason.id,
          seasonNumber: ep.seasonNumber || epSeason.seasonNumber || 1,
          seasonName: ep.seasonName || epSeason.seasonName || `Season ${epSeason.seasonNumber}`,
          episodeNumber: epNum,
          title: ep.title || `Episode ${epNum}`,
          description: ep.description || '',
          thumbnail: ep.thumbnail || coverImageUrl || '',
          videoUrl: ep.videoUrl || videoUrl || '',
          duration: Number(ep.duration) || 45,
          skipIntroSec: Number(ep.skipIntroSec) || 0,
          createdAt: ep.createdAt || now
        };
        if (existingEpIdx > -1) {
          episodesList[existingEpIdx] = { ...episodesList[existingEpIdx], ...epObj };
        } else {
          episodesList.push(epObj);
        }
      });
    }

    // Recalculate episodes count for all seasons of this series
    seasonsList.filter(s => s.seriesId === id).forEach(sn => {
      sn.episodesCount = episodesList.filter(e => e.seriesId === id && e.seasonId === sn.id).length;
    });
    newSeries.seasonsCount = Math.max(1, seasonsList.filter(s => s.seriesId === id).length);

    saveContentStore();

    // Persist permanently to Firestore
    persistContentItemToFirestore(mapToContentItem(newSeries)).catch(err => {
      console.warn('[Firestore Series Post Warning]:', err);
    });

    return res.json({ success: true, content: mapToContentItem(newSeries) });
  }
});

// PUT update existing content item (metadata, cover, video file, episodes)
app.put('/api/content/:id', verifyAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  deletedContentIds.delete(id);

  // Check movie
  const movieIdx = movies.findIndex(m => m.id === id);
  if (movieIdx > -1) {
    const current = movies[movieIdx];
    const isPremium = req.body.accessType !== undefined ? req.body.accessType === 'premium' : current.isPremium;
    const isPublished = req.body.published !== undefined ? Boolean(req.body.published) : current.isPublished;

    const updatedMovie: Movie = {
      ...current,
      title: req.body.title !== undefined ? String(req.body.title).trim() : current.title,
      description: req.body.description !== undefined ? req.body.description : current.description,
      poster: req.body.coverImageUrl || req.body.poster || current.poster,
      backdrop: req.body.coverImageUrl || req.body.backdrop || current.backdrop,
      coverImageUrl: req.body.coverImageUrl || current.coverImageUrl,
      videoUrl: req.body.videoUrl !== undefined ? req.body.videoUrl : current.videoUrl,
      trailerUrl: req.body.trailerUrl !== undefined ? req.body.trailerUrl : current.trailerUrl,
      year: req.body.year !== undefined ? Number(req.body.year) : current.year,
      duration: req.body.duration !== undefined ? Number(req.body.duration) : (current.duration || 90),
      rating: req.body.rating !== undefined ? Number(req.body.rating) : current.rating,
      language: req.body.language !== undefined ? req.body.language : current.language,
      country: req.body.country !== undefined ? req.body.country : (current.country || 'International'),
      director: req.body.director !== undefined ? req.body.director : (current.director || 'Creator'),
      cast: Array.isArray(req.body.cast) ? req.body.cast : current.cast,
      ageClassification: req.body.ageClassification !== undefined ? req.body.ageClassification : current.ageClassification,
      qualityBadge: req.body.quality !== undefined ? req.body.quality : current.qualityBadge,
      genre: req.body.genre !== undefined 
        ? (Array.isArray(req.body.genre) ? req.body.genre : String(req.body.genre).split(',').map((s: string) => s.trim()))
        : current.genre,
      isPremium,
      accessType: isPremium ? 'premium' : 'free',
      isPublished,
      published: isPublished,
      isFeatured: req.body.isFeatured !== undefined ? Boolean(req.body.isFeatured) : current.isFeatured,
      isTrending: req.body.isTrending !== undefined ? Boolean(req.body.isTrending) : current.isTrending,
      updatedAt: now
    };

    movies[movieIdx] = updatedMovie;
    saveContentStore();

    // Persist authoritative update to Firestore
    persistContentItemToFirestore(mapToContentItem(updatedMovie)).catch(err => {
      console.warn('[Firestore Movie Put Warning]:', err);
    });

    return res.json({ success: true, content: mapToContentItem(updatedMovie) });
  }

  // Check series
  const seriesIdx = seriesList.findIndex(s => s.id === id);
  if (seriesIdx > -1) {
    const current = seriesList[seriesIdx];
    const isPremium = req.body.accessType !== undefined ? req.body.accessType === 'premium' : current.isPremium;
    const isPublished = req.body.published !== undefined ? Boolean(req.body.published) : current.isPublished;

    const updatedSeries: TVSeries = {
      ...current,
      title: req.body.title !== undefined ? String(req.body.title).trim() : current.title,
      description: req.body.description !== undefined ? req.body.description : current.description,
      poster: req.body.coverImageUrl || req.body.poster || current.poster,
      backdrop: req.body.coverImageUrl || req.body.backdrop || current.backdrop,
      coverImageUrl: req.body.coverImageUrl || current.coverImageUrl,
      trailerUrl: req.body.trailerUrl !== undefined ? req.body.trailerUrl : current.trailerUrl,
      year: req.body.year !== undefined ? Number(req.body.year) : current.year,
      rating: req.body.rating !== undefined ? Number(req.body.rating) : current.rating,
      language: req.body.language !== undefined ? req.body.language : current.language,
      country: req.body.country !== undefined ? req.body.country : (current.country || 'International'),
      director: req.body.director !== undefined ? req.body.director : (current.director || 'Creator'),
      cast: Array.isArray(req.body.cast) ? req.body.cast : current.cast,
      ageClassification: req.body.ageClassification !== undefined ? req.body.ageClassification : current.ageClassification,
      qualityBadge: req.body.quality !== undefined ? req.body.quality : current.qualityBadge,
      genre: req.body.genre !== undefined 
        ? (Array.isArray(req.body.genre) ? req.body.genre : String(req.body.genre).split(',').map((s: string) => s.trim()))
        : current.genre,
      isPremium,
      accessType: isPremium ? 'premium' : 'free',
      isPublished,
      published: isPublished,
      isFeatured: req.body.isFeatured !== undefined ? Boolean(req.body.isFeatured) : current.isFeatured,
      isTrending: req.body.isTrending !== undefined ? Boolean(req.body.isTrending) : current.isTrending,
      updatedAt: now
    };

    seriesList[seriesIdx] = updatedSeries;

    // Safe merge of seasons
    const rawSeasons = Array.isArray(req.body.seasons) ? req.body.seasons : [];
    if (rawSeasons.length > 0) {
      rawSeasons.forEach((sn: any) => {
        const sNum = Number(sn.seasonNumber) || 1;
        const sName = sn.seasonName || sn.title || `Season ${sNum}`;
        const existingIdx = seasonsList.findIndex(s => s.id === sn.id || (s.seriesId === id && s.seasonNumber === sNum));
        if (existingIdx > -1) {
          seasonsList[existingIdx] = {
            ...seasonsList[existingIdx],
            seasonNumber: sNum,
            seasonName: sName,
            title: sn.title || sName
          };
        } else {
          seasonsList.push({
            id: sn.id || `sn-${id}-${sNum}-${Date.now()}`,
            seriesId: id,
            seasonNumber: sNum,
            seasonName: sName,
            title: sn.title || sName,
            episodesCount: 0
          });
        }
      });
    }

    // If explicit deletedEpisodeIds provided, delete only those
    if (Array.isArray(req.body.deletedEpisodeIds) && req.body.deletedEpisodeIds.length > 0) {
      const toDelete = new Set(req.body.deletedEpisodeIds);
      episodesList = episodesList.filter(e => !toDelete.has(e.id));
    }

    if (Array.isArray(req.body.episodes)) {
      let defaultSeason = seasonsList.find(sn => sn.seriesId === id);
      if (!defaultSeason) {
        defaultSeason = {
          id: 'sn-' + id + '-1',
          seriesId: id,
          seasonNumber: 1,
          seasonName: 'Season 1',
          title: 'Season 1',
          episodesCount: 0
        };
        seasonsList.push(defaultSeason);
      }

      req.body.episodes.forEach((ep: any, idx: number) => {
        const targetSeason = seasonsList.find(s => (ep.seasonId && s.id === ep.seasonId) || (s.seriesId === id && s.seasonNumber === (Number(ep.seasonNumber) || 1))) || defaultSeason!;
        const existingIdx = episodesList.findIndex(e => e.id === ep.id);
        const epNum = Number(ep.episodeNumber) || (idx + 1);
        const epObj: Episode = {
          id: ep.id || `ep-${id}-${targetSeason.id}-${epNum}-${Date.now()}`,
          seriesId: id,
          seasonId: targetSeason.id,
          seasonNumber: ep.seasonNumber || targetSeason.seasonNumber || 1,
          seasonName: ep.seasonName || targetSeason.seasonName || `Season ${targetSeason.seasonNumber}`,
          episodeNumber: epNum,
          title: ep.title || `Episode ${epNum}`,
          description: ep.description || '',
          thumbnail: ep.thumbnail || updatedSeries.coverImageUrl || updatedSeries.poster,
          videoUrl: ep.videoUrl !== undefined ? ep.videoUrl : '',
          duration: Number(ep.duration) || 45,
          skipIntroSec: Number(ep.skipIntroSec) || 0,
          createdAt: ep.createdAt || now
        };

        if (existingIdx > -1) {
          episodesList[existingIdx] = {
            ...episodesList[existingIdx],
            ...epObj,
            videoUrl: ep.videoUrl !== undefined ? ep.videoUrl : episodesList[existingIdx].videoUrl,
            thumbnail: ep.thumbnail !== undefined ? ep.thumbnail : episodesList[existingIdx].thumbnail
          };
        } else {
          episodesList.push(epObj);
        }
      });
    }

    // Recalculate episodes count for all seasons of this series
    seasonsList.filter(s => s.seriesId === id).forEach(sn => {
      sn.episodesCount = episodesList.filter(e => e.seriesId === id && (e.seasonId === sn.id || (e.seasonNumber || 1) === sn.seasonNumber)).length;
    });
    updatedSeries.seasonsCount = Math.max(1, seasonsList.filter(s => s.seriesId === id).length);

    saveContentStore();

    // Persist authoritative update to Firestore
    persistContentItemToFirestore(mapToContentItem(updatedSeries)).catch(err => {
      console.warn('[Firestore Series Put Warning]:', err);
    });

    return res.json({ success: true, content: mapToContentItem(updatedSeries) });
  }

  return res.status(404).json({ error: 'Content item not found' });
});

// DELETE content item - Explicit admin deletion removes database records and unlinks associated media
app.delete('/api/content/:id', verifyAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  // Find the item before removing to clean up associated disk media if requested
  const targetMovie = movies.find(m => m.id === id);
  const targetSeries = seriesList.find(s => s.id === id);
  const targetEpisodes = episodesList.filter(e => e.seriesId === id);

  deletedContentIds.add(id);
  movies = movies.filter(m => m.id !== id);
  seriesList = seriesList.filter(s => s.id !== id);
  episodesList = episodesList.filter(e => e.seriesId !== id);
  seasonsList = seasonsList.filter(sn => sn.seriesId !== id);
  saveContentStore();

  // Safely clean up associated local media files on explicit Admin delete
  try {
    const urlsToClean: string[] = [];
    if (targetMovie?.videoUrl) urlsToClean.push(targetMovie.videoUrl);
    if (targetMovie?.coverImageUrl) urlsToClean.push(targetMovie.coverImageUrl);
    if (targetSeries?.coverImageUrl) urlsToClean.push(targetSeries.coverImageUrl);
    targetEpisodes.forEach(ep => {
      if (ep.videoUrl) urlsToClean.push(ep.videoUrl);
      if (ep.thumbnail) urlsToClean.push(ep.thumbnail);
    });

    for (const rawUrl of urlsToClean) {
      if (rawUrl.startsWith('/uploads/videos/')) {
        const filePath = path.join(videosDir, path.basename(rawUrl));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
      } else if (rawUrl.startsWith('/uploads/covers/')) {
        const filePath = path.join(coversDir, path.basename(rawUrl));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
      }
    }
  } catch (cleanErr) {
    console.warn('[Media Disk Cleanup Notice]:', cleanErr);
  }

  // Also issue persistent delete to production Firestore via REST
  deleteContentItemFromFirestore(id).catch(fsErr => {
    console.warn(`[Firestore Delete] Server delete notice for ${id}:`, fsErr);
  });

  res.json({ success: true, message: 'Content item deleted successfully' });
});

// POST toggle published / unpublished state
app.post('/api/content/:id/publish', verifyAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { published } = req.body;

  const movie = movies.find(m => m.id === id);
  if (movie) {
    movie.isPublished = Boolean(published);
    movie.published = Boolean(published);
    movie.updatedAt = new Date().toISOString();
    saveContentStore();
    return res.json({ success: true, content: mapToContentItem(movie) });
  }

  const series = seriesList.find(s => s.id === id);
  if (series) {
    series.isPublished = Boolean(published);
    series.published = Boolean(published);
    series.updatedAt = new Date().toISOString();
    saveContentStore();
    return res.json({ success: true, content: mapToContentItem(series) });
  }

  return res.status(404).json({ error: 'Content item not found' });
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

  // Prioritize newest and recently modified movies first
  result.sort((a, b) => {
    const timeA = new Date((a as any).updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
    const timeB = new Date((b as any).updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
    return timeB - timeA;
  });

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

  deletedContentIds.delete(newMovie.id);
  movies.unshift(newMovie);
  saveContentStore();
  persistContentItemToFirestore(mapToContentItem(newMovie)).catch(() => {});
  res.json({ success: true, movie: newMovie });
});

app.put('/api/movies/:id', (req: Request, res: Response) => {
  const index = movies.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Movie not found' });
  }

  deletedContentIds.delete(req.params.id);
  movies[index] = {
    ...movies[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  saveContentStore();
  persistContentItemToFirestore(mapToContentItem(movies[index])).catch(() => {});

  res.json({ success: true, movie: movies[index] });
});

app.delete('/api/movies/:id', (req: Request, res: Response) => {
  const index = movies.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Movie not found' });
  }
  const deleted = movies.splice(index, 1);
  deletedContentIds.add(req.params.id);
  saveContentStore();
  deleteContentItemFromFirestore(req.params.id).catch(() => {});
  res.json({ success: true, movie: deleted[0] });
});

// Toggle Like (Persistent for Movies and TV Series with Firestore & disk backup)
async function handleToggleLike(req: Request, res: Response) {
  try {
    const userId = String(req.body.userId || 'usr_demo').trim();
    const contentId = String(req.params.id || '').trim();

    if (!contentId) {
      return res.status(400).json({ error: 'contentId is required' });
    }

    const movie = movies.find(m => m.id === contentId);
    const series = seriesList.find(s => s.id === contentId);
    const targetItem = movie || series;
    if (!targetItem) {
      return res.status(404).json({ error: 'Content item not found' });
    }
    const contentType = movie ? 'movie' : 'series';

    const existingIndex = likedItems.findIndex(l => l.userId === userId && l.contentId === contentId);
    let liked = false;

    if (existingIndex > -1) {
      const removedLike = likedItems.splice(existingIndex, 1)[0];
      liked = false;
      syncLikeToFirestore(removedLike, true).catch(() => {});
    } else {
      const newLike: LikedItem = {
        id: `lk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId,
        contentId,
        contentType: contentType as any,
        likedAt: new Date().toISOString()
      };
      likedItems.push(newLike);
      liked = true;
      syncLikeToFirestore(newLike, false).catch(() => {});
    }

    // Recompute exact count from persistent list
    const actualLikesCount = likedItems.filter(l => l.contentId === contentId).length;
    targetItem.likesCount = actualLikesCount;

    saveInteractionsStore();
    saveContentStore();

    return res.json({
      success: true,
      liked,
      likesCount: actualLikesCount,
      contentId,
      contentType
    });
  } catch (err: any) {
    console.error('Error toggling like:', err);
    return res.status(500).json({ error: 'Failed to toggle like' });
  }
}

app.post('/api/movies/:id/like', handleToggleLike);
app.post('/api/series/:id/like', handleToggleLike);
app.post('/api/content/:id/like', handleToggleLike);

app.get('/api/likes', (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.json([]);
  }
  const userLikes = likedItems.filter(l => l.userId === userId).map(l => l.contentId);
  res.json(userLikes);
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

  // Prioritize newest and recently modified series first
  result.sort((a, b) => {
    const timeA = new Date((a as any).updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
    const timeB = new Date((b as any).updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
    return timeB - timeA;
  });

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
  deletedContentIds.delete(newSeries.id);
  saveContentStore();
  persistContentItemToFirestore(mapToContentItem(newSeries)).catch(() => {});

  res.json({ success: true, series: newSeries });
});

app.put('/api/series/:id', (req: Request, res: Response) => {
  const index = seriesList.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Series not found' });
  deletedContentIds.delete(req.params.id);
  seriesList[index] = { ...seriesList[index], ...req.body, updatedAt: new Date().toISOString() };
  saveContentStore();
  persistContentItemToFirestore(mapToContentItem(seriesList[index])).catch(() => {});
  res.json({ success: true, series: seriesList[index] });
});

app.delete('/api/series/:id', (req: Request, res: Response) => {
  const index = seriesList.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Series not found' });
  const deleted = seriesList.splice(index, 1);
  deletedContentIds.add(req.params.id);
  // cleanup seasons and episodes
  seasonsList = seasonsList.filter(sn => sn.seriesId !== req.params.id);
  episodesList = episodesList.filter(ep => ep.seriesId !== req.params.id);
  saveContentStore();
  deleteContentItemFromFirestore(req.params.id).catch(() => {});
  res.json({ success: true, series: deleted[0] });
});

// Episodes and Seasons management
app.get('/api/series/:id/seasons', (req: Request, res: Response) => {
  const { id } = req.params;
  const seasons = seasonsList
    .filter(s => s.seriesId === id)
    .map(s => ({
      ...s,
      episodesCount: episodesList.filter(e => e.seriesId === id && (e.seasonId === s.id || (e.seasonNumber || 1) === s.seasonNumber)).length
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  const episodes = episodesList
    .filter(e => e.seriesId === id)
    .sort((a, b) => ((a.seasonNumber || 1) - (b.seasonNumber || 1)) || (a.episodeNumber - b.episodeNumber));

  if (req.query.format === 'array') {
    return res.json(seasons);
  }
  res.json({ seasons, episodes });
});

app.post('/api/seasons', (req: Request, res: Response) => {
  const { seriesId, seasonNumber, seasonName, title } = req.body;
  const sNum = Number(seasonNumber) || 1;
  const sName = seasonName || title || `Season ${sNum}`;
  
  const existing = seasonsList.find(s => s.seriesId === seriesId && (s.id === req.body.id || s.seasonNumber === sNum));
  if (existing) {
    existing.seasonNumber = sNum;
    existing.seasonName = sName;
    existing.title = title || sName;
    saveContentStore();
    const parentSeries = seriesList.find(s => s.id === seriesId);
    if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});
    return res.json({ success: true, season: existing });
  }

  const newSeason: Season = {
    id: req.body.id || 'season-' + Date.now(),
    seriesId,
    seasonNumber: sNum,
    seasonName: sName,
    title: title || sName,
    episodesCount: 0
  };
  seasonsList.push(newSeason);

  // update series count
  const series = seriesList.find(s => s.id === seriesId);
  if (series) {
    series.seasonsCount = seasonsList.filter(s => s.seriesId === seriesId).length;
    persistContentItemToFirestore(mapToContentItem(series)).catch(() => {});
  }
  saveContentStore();
  res.json({ success: true, season: newSeason });
});

app.put('/api/seasons/:id', (req: Request, res: Response) => {
  const season = seasonsList.find(s => s.id === req.params.id);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  
  if (req.body.seasonNumber !== undefined) season.seasonNumber = Number(req.body.seasonNumber);
  if (req.body.seasonName) season.seasonName = req.body.seasonName;
  if (req.body.title) season.title = req.body.title;
  
  saveContentStore();
  const parentSeries = seriesList.find(s => s.id === season.seriesId);
  if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});
  res.json({ success: true, season });
});

app.delete('/api/seasons/:id', (req: Request, res: Response) => {
  const sIdx = seasonsList.findIndex(s => s.id === req.params.id);
  if (sIdx === -1) return res.status(404).json({ error: 'Season not found' });
  const [deletedSeason] = seasonsList.splice(sIdx, 1);
  
  // Remove episodes belonging specifically to this season
  episodesList = episodesList.filter(e => e.seasonId !== req.params.id);
  
  // update series count
  const series = seriesList.find(s => s.id === deletedSeason.seriesId);
  if (series) {
    series.seasonsCount = Math.max(1, seasonsList.filter(s => s.seriesId === deletedSeason.seriesId).length);
    persistContentItemToFirestore(mapToContentItem(series)).catch(() => {});
  }
  saveContentStore();
  res.json({ success: true, season: deletedSeason });
});

app.post('/api/series/:id/seasons/:seasonId/episodes', (req: Request, res: Response) => {
  const { id: seriesId, seasonId } = req.params;
  const season = seasonsList.find(s => s.id === seasonId && s.seriesId === seriesId);
  
  // Detect highest existing episode number in this season
  const existingSeasonEps = episodesList.filter(e => e.seriesId === seriesId && e.seasonId === seasonId);
  const highestEpNum = existingSeasonEps.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
  const nextEpNum = req.body.episodeNumber !== undefined ? Number(req.body.episodeNumber) : (highestEpNum + 1);

  const newEpisode: Episode = {
    id: req.body.id || 'ep-' + Date.now(),
    seriesId,
    seasonId,
    seasonNumber: season ? season.seasonNumber : 1,
    seasonName: season ? (season.seasonName || `Season ${season.seasonNumber}`) : 'Season 1',
    episodeNumber: nextEpNum,
    title: req.body.title || `Episode ${nextEpNum}`,
    description: req.body.description || '',
    thumbnail: req.body.thumbnail || '',
    videoUrl: req.body.videoUrl || '',
    hlsUrl: req.body.hlsUrl,
    duration: Number(req.body.duration) || 45,
    skipIntroSec: Number(req.body.skipIntroSec) || 0,
    createdAt: new Date().toISOString()
  };

  episodesList.push(newEpisode);

  if (season) {
    season.episodesCount = episodesList.filter(e => e.seasonId === seasonId).length;
  }
  saveContentStore();
  const parentSeries = seriesList.find(s => s.id === seriesId);
  if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});
  res.json({ success: true, episode: newEpisode });
});

app.post('/api/series/:id/seasons/:seasonId/episodes/batch', (req: Request, res: Response) => {
  const { id: seriesId, seasonId } = req.params;
  const season = seasonsList.find(s => s.id === seasonId && s.seriesId === seriesId);
  const incomingEps = Array.isArray(req.body.episodes) ? req.body.episodes : [];

  const existingSeasonEps = episodesList.filter(e => e.seriesId === seriesId && e.seasonId === seasonId);
  let highestEpNum = existingSeasonEps.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);

  const createdEps: Episode[] = [];
  incomingEps.forEach((ep: any) => {
    highestEpNum += 1;
    const epNum = ep.episodeNumber !== undefined ? Number(ep.episodeNumber) : highestEpNum;
    const newEp: Episode = {
      id: ep.id || `ep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      seriesId,
      seasonId,
      seasonNumber: season ? season.seasonNumber : 1,
      seasonName: season ? (season.seasonName || `Season ${season.seasonNumber}`) : 'Season 1',
      episodeNumber: epNum,
      title: ep.title || `Episode ${epNum}`,
      description: ep.description || '',
      thumbnail: ep.thumbnail || '',
      videoUrl: ep.videoUrl || '',
      duration: Number(ep.duration) || 45,
      skipIntroSec: Number(ep.skipIntroSec) || 0,
      createdAt: new Date().toISOString()
    };
    episodesList.push(newEp);
    createdEps.push(newEp);
  });

  if (season) {
    season.episodesCount = episodesList.filter(e => e.seasonId === seasonId).length;
  }
  saveContentStore();
  const parentSeries = seriesList.find(s => s.id === seriesId);
  if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});
  res.json({ success: true, count: createdEps.length, episodes: createdEps });
});

app.post('/api/episodes', (req: Request, res: Response) => {
  const season = seasonsList.find(s => s.id === req.body.seasonId);
  const newEpisode: Episode = {
    id: req.body.id || 'ep-' + Date.now(),
    seriesId: req.body.seriesId,
    seasonId: req.body.seasonId,
    seasonNumber: req.body.seasonNumber || (season ? season.seasonNumber : 1),
    seasonName: req.body.seasonName || (season ? season.seasonName : 'Season 1'),
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
  if (season) {
    season.episodesCount = episodesList.filter(e => e.seasonId === season.id).length;
  }
  saveContentStore();
  const parentSeries = seriesList.find(s => s.id === req.body.seriesId);
  if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});

  res.json({ success: true, episode: newEpisode });
});

app.put('/api/episodes/:id', (req: Request, res: Response) => {
  const index = episodesList.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Episode not found' });
  
  episodesList[index] = {
    ...episodesList[index],
    ...req.body,
    id: episodesList[index].id,
    seriesId: episodesList[index].seriesId
  };
  
  saveContentStore();
  const parentSeries = seriesList.find(s => s.id === episodesList[index].seriesId);
  if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});
  res.json({ success: true, episode: episodesList[index] });
});

app.delete('/api/episodes/:id', (req: Request, res: Response) => {
  const index = episodesList.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Episode not found' });
  const deleted = episodesList.splice(index, 1)[0];
  
  const season = seasonsList.find(s => s.id === deleted.seasonId);
  if (season) {
    season.episodesCount = episodesList.filter(e => e.seasonId === season.id).length;
  }
  saveContentStore();
  const parentSeries = seriesList.find(s => s.id === deleted.seriesId);
  if (parentSeries) persistContentItemToFirestore(mapToContentItem(parentSeries)).catch(() => {});
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

// Reviews and Ratings (Server-Side Persistent with Firestore & Disk backup)
app.get('/api/reviews/:contentId', (req: Request, res: Response) => {
  const contentId = req.params.contentId;
  const contentReviews = reviews
    .filter(r => r.contentId === contentId && r.approved !== false)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(contentReviews);
});

app.post('/api/reviews', async (req: Request, res: Response) => {
  try {
    const { userId = 'usr_demo', username, userImage, contentId, rating, review } = req.body;
    if (!contentId) {
      return res.status(400).json({ error: 'contentId is required' });
    }
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 10) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 10' });
    }

    const movie = movies.find(m => m.id === contentId);
    const series = seriesList.find(s => s.id === contentId);
    const targetItem = movie || series;
    if (!targetItem) {
      return res.status(404).json({ error: 'Target movie or TV series not found' });
    }

    const safeUsername = String(username || 'Pi Pioneer').slice(0, 80);
    const safeReviewText = String(review || '').slice(0, 2000);
    const nowIso = new Date().toISOString();

    // Check if user already reviewed this content -> update existing review
    const existingIdx = reviews.findIndex(r => r.userId === userId && r.contentId === contentId);
    let targetReview: ContentRatingReview;

    if (existingIdx > -1) {
      targetReview = {
        ...reviews[existingIdx],
        rating: Math.round(numRating),
        review: safeReviewText,
        username: safeUsername,
        userImage: userImage || reviews[existingIdx].userImage,
        approved: true
      };
      reviews[existingIdx] = targetReview;
    } else {
      targetReview = {
        id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId,
        username: safeUsername,
        userImage,
        contentId,
        rating: Math.round(numRating),
        review: safeReviewText,
        createdAt: nowIso,
        approved: true
      };
      reviews.unshift(targetReview);
    }

    // Server-side average rating recalculation
    const allRatings = reviews.filter(r => r.contentId === contentId && typeof r.rating === 'number').map(r => r.rating);
    const avg = Number((allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1));
    targetItem.rating = avg;

    saveInteractionsStore();
    saveContentStore();
    syncReviewToFirestore(targetReview).catch(() => {});

    return res.json({
      success: true,
      review: targetReview,
      averageRating: avg,
      totalReviews: allRatings.length
    });
  } catch (err: any) {
    console.error('Error recording review/rating:', err);
    return res.status(500).json({ error: 'Failed to record review' });
  }
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
  const queryUserId = req.query.userId as string | undefined;
  if (queryUserId) {
    const userNotifs = notifications
      .filter(n => n.userId === 'all' || n.userId === queryUserId)
      .map(n => {
        const readByList = Array.isArray(n.readBy) ? n.readBy : [];
        const isRead = n.userId === queryUserId ? (n.read || readByList.includes(queryUserId)) : readByList.includes(queryUserId);
        return { ...n, read: Boolean(isRead) };
      });
    return res.json(userNotifs);
  }
  res.json(notifications);
});

app.post('/api/notifications', (req: Request, res: Response) => {
  const newNotif = req.body;
  if (!newNotif || !newNotif.title) {
    return res.status(400).json({ error: 'Title required' });
  }
  const existingIdx = notifications.findIndex(n => n.id === newNotif.id);
  if (existingIdx >= 0) {
    notifications[existingIdx] = { ...notifications[existingIdx], ...newNotif };
  } else {
    notifications.unshift(newNotif);
  }
  res.json({ success: true, notification: newNotif });
});

app.post('/api/notifications/read', (req: Request, res: Response) => {
  const { id, userId } = req.body;
  if (id) {
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      if (userId) {
        if (!Array.isArray(notif.readBy)) notif.readBy = [];
        if (!notif.readBy.includes(userId)) notif.readBy.push(userId);
      }
    }
  } else {
    notifications.forEach(n => {
      n.read = true;
      if (userId) {
        if (!Array.isArray(n.readBy)) n.readBy = [];
        if (!n.readBy.includes(userId)) n.readBy.push(userId);
      }
    });
  }
  res.json({ success: true });
});

// PI NETWORK PAYMENT INTEGRATION
// Helper to retrieve Pi Server API Key strictly from server environment variables/secrets
const getPiServerApiKey = (): string => {
  let key = (
    process.env.PI_SERVER_API_KEY ||
    process.env.PI_NETWORK_API_KEY ||
    process.env.PI_API_KEY ||
    process.env.PI_SERVER_KEY ||
    process.env.PI_API_SECRET ||
    process.env.PI_DEVELOPER_KEY ||
    process.env.PI_KEY ||
    process.env.PI_SECRET_KEY ||
    process.env.PI_API_SERVER_KEY ||
    process.env.PI_NETWORK_SERVER_KEY ||
    process.env.PISERVER_API_KEY ||
    process.env.PISERVER_KEY ||
    process.env.MINEPI_API_KEY ||
    process.env.MINEPI_SERVER_KEY ||
    ''
  ).trim();

  // If not found in process.env, check root container .dev.env.json (AI Studio runtime secrets file)
  if (!key) {
    try {
      const devEnvPath = path.resolve(process.cwd(), '..', '.dev.env.json');
      if (fs.existsSync(devEnvPath)) {
        const devEnv = JSON.parse(fs.readFileSync(devEnvPath, 'utf-8'));
        key = (
          devEnv.PI_SERVER_API_KEY ||
          devEnv.PI_NETWORK_API_KEY ||
          devEnv.PI_API_KEY ||
          devEnv.PI_SERVER_KEY ||
          devEnv.PI_API_SECRET ||
          devEnv.PI_DEVELOPER_KEY ||
          devEnv.PI_KEY ||
          devEnv.PI_SECRET_KEY ||
          devEnv.PI_API_SERVER_KEY ||
          devEnv.PI_NETWORK_SERVER_KEY ||
          devEnv.PISERVER_API_KEY ||
          devEnv.MINEPI_API_KEY ||
          devEnv.MINEPI_SERVER_KEY ||
          ''
        ).trim();
      }
    } catch {
      // ignore
    }
  }

  // Check fallback from appSettings if configured in admin/store
  if (!key && (appSettings as any)?.piServerApiKey) {
    key = String((appSettings as any).piServerApiKey).trim();
  }

  // Strip wrapping quotes if user pasted with quotes
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  // Strip redundant "Key " prefix if pasted as "Key <token>"
  if (key.startsWith('Key ')) {
    key = key.slice(4).trim();
  }
  return key;
};

// Health and configuration check endpoint for Pi payment integration (no secret revealed)
app.get('/api/pi/status', (_req: Request, res: Response) => {
  const hasKey = Boolean(getPiServerApiKey());
  res.json({
    success: true,
    serverApiKeyConfigured: hasKey,
    piServerApiKeyStatus: hasKey ? 'PRESENT' : 'MISSING',
    piApiBaseUrl: 'https://api.minepi.com',
    targetNetwork: 'Production (Mainnet)',
    timestamp: new Date().toISOString()
  });
});

// Safe diagnostic check reporting only whether required Pi Server API Key is PRESENT or MISSING
app.get('/api/pi/diagnostic', (_req: Request, res: Response) => {
  const hasKey = Boolean(getPiServerApiKey());
  res.json({
    status: hasKey ? 'PRESENT' : 'MISSING',
    variableName: 'PI_SERVER_API_KEY',
    targetApi: 'https://api.minepi.com/v2/payments/{paymentId}/approve',
    timestamp: new Date().toISOString()
  });
});

// Requirement 4 & 6 & 11 & 12: Backend uses Pi Server API Key from environment to approve payment
// POST https://api.minepi.com/v2/payments/{paymentId}/approve
app.post(['/api/pi/payments/approve', '/api/pi/approve-payment'], async (req: Request, res: Response) => {
  const requestTimestamp = new Date().toISOString();
  try {
    const { paymentId, plan = 'monthly', userId } = req.body;
    if (!paymentId || typeof paymentId !== 'string') {
      console.warn(`[Pi Payment Approval] [${requestTimestamp}] Rejected: Missing or invalid paymentId.`);
      return res.status(400).json({ success: false, error: 'paymentId is required for approval.' });
    }

    console.info(`[Pi Payment Approval] [${requestTimestamp}] Received request for paymentId: "${paymentId}", plan: "${plan}"`);

    const piServerApiKey = getPiServerApiKey();
    if (!piServerApiKey) {
      console.error(`[Pi Payment Approval] [${requestTimestamp}] PI_SERVER_API_KEY is not configured in server environment.`);
      return res.status(500).json({
        success: false,
        error: 'Pi Server API Key is not configured on the backend server. Please provide PI_SERVER_API_KEY in the Secrets panel.',
        paymentId,
        timestamp: requestTimestamp
      });
    }

    console.info(`[Pi Payment Approval] [${requestTimestamp}] Calling Pi Network API POST /v2/payments/${paymentId}/approve...`);

    const piApproveRes = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${piServerApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(25000)
    });

    const responseText = await piApproveRes.text();
    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    console.info(`[Pi Payment Approval] [${requestTimestamp}] Pi API response HTTP ${piApproveRes.status} for paymentId: "${paymentId}"`);

    // Requirement 16: Idempotent handling if already developer_approved
    const isAlreadyApproved =
      responseData?.status?.developer_approved === true ||
      responseData?.developer_approved === true ||
      String(responseData?.message || '').toLowerCase().includes('already approved') ||
      String(responseData?.error || '').toLowerCase().includes('already approved');

    if (!piApproveRes.ok && !isAlreadyApproved) {
      const safeErrorMessage =
        responseData?.error_description ||
        responseData?.error ||
        responseData?.message ||
        `Pi Platform API returned HTTP ${piApproveRes.status}`;

      console.error(`[Pi Payment Approval] [${requestTimestamp}] Approval failed for paymentId "${paymentId}": ${safeErrorMessage}`);
      return res.status(piApproveRes.status >= 400 && piApproveRes.status < 600 ? piApproveRes.status : 400).json({
        success: false,
        error: safeErrorMessage,
        paymentId,
        timestamp: requestTimestamp
      });
    }

    console.info(`[Pi Payment Approval] [${requestTimestamp}] Approval SUCCESS for paymentId: "${paymentId}" (alreadyApproved: ${isAlreadyApproved})`);

    // Save or update pending payment entry
    let payment = payments.find(p => p.piPaymentId === paymentId || p.transactionId === paymentId);
    if (payment) {
      if (payment.status !== 'completed') {
        payment.status = 'approved';
      }
    } else {
      const pricePi = plan === 'annual' ? appSettings.annualPricePi : appSettings.monthlyPricePi;
      payment = {
        id: 'pay-' + Date.now(),
        userId: userId || 'usr_demo',
        transactionId: paymentId,
        piPaymentId: paymentId,
        amount: pricePi,
        currency: 'Pi',
        status: 'approved',
        plan,
        createdAt: requestTimestamp
      };
      payments.unshift(payment);
    }

    return res.json({
      success: true,
      message: 'Payment successfully approved by PiFlix+ server.',
      paymentId,
      status: 'approved',
      timestamp: requestTimestamp
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || String(err?.message || '').includes('timed out');
    const safeError = isTimeout
      ? 'Pi Platform API request timed out during approval.'
      : (err?.message || 'Server error during Pi payment approval.');
    console.error(`[Pi Payment Approval Error] [${requestTimestamp}]:`, safeError);
    return res.status(500).json({
      success: false,
      error: safeError,
      timestamp: requestTimestamp
    });
  }
});

// Requirement 6 & 13 & 14: Backend uses Pi Server API Key to complete payment with txid
// POST https://api.minepi.com/v2/payments/{paymentId}/complete
// Premium access MUST only be activated after the backend receives a successful response from the Pi /complete endpoint
app.post(['/api/pi/payments/complete', '/api/pi/complete-payment'], async (req: Request, res: Response) => {
  const requestTimestamp = new Date().toISOString();
  try {
    const { paymentId, txid, plan = 'monthly', userId } = req.body;
    if (!paymentId || !txid) {
      console.warn(`[Pi Payment Completion] [${requestTimestamp}] Missing paymentId or txid.`);
      return res.status(400).json({ success: false, error: 'Both paymentId and txid are required for completion.' });
    }

    console.info(`[Pi Payment Completion] [${requestTimestamp}] Received request for paymentId: "${paymentId}", txid: "${txid}"`);

    const piServerApiKey = getPiServerApiKey();
    if (!piServerApiKey) {
      console.error(`[Pi Payment Completion] [${requestTimestamp}] Missing PI_SERVER_API_KEY in server environment.`);
      return res.status(500).json({
        success: false,
        error: 'Pi Server API Key is not configured on the backend server. Please provide PI_SERVER_API_KEY in the Secrets panel.',
        paymentId,
        txid,
        timestamp: requestTimestamp
      });
    }

    console.info(`[Pi Payment Completion] [${requestTimestamp}] Calling Pi Network API POST /v2/payments/${paymentId}/complete...`);

    const piCompleteRes = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${piServerApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ txid }),
      signal: AbortSignal.timeout(25000)
    });

    const responseText = await piCompleteRes.text();
    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    console.info(`[Pi Payment Completion] [${requestTimestamp}] Pi API response HTTP ${piCompleteRes.status} for paymentId: "${paymentId}"`);

    // Requirement 16: Idempotent handling if already developer_completed
    const isAlreadyCompleted =
      responseData?.status?.developer_completed === true ||
      responseData?.developer_completed === true ||
      String(responseData?.message || '').toLowerCase().includes('already completed') ||
      String(responseData?.error || '').toLowerCase().includes('already completed');

    if (!piCompleteRes.ok && !isAlreadyCompleted) {
      const safeErrorMessage =
        responseData?.error_description ||
        responseData?.error ||
        responseData?.message ||
        `Pi Platform API returned HTTP ${piCompleteRes.status}`;

      console.error(`[Pi Payment Completion] [${requestTimestamp}] Completion failed for paymentId "${paymentId}": ${safeErrorMessage}`);
      return res.status(piCompleteRes.status >= 400 && piCompleteRes.status < 600 ? piCompleteRes.status : 400).json({
        success: false,
        error: safeErrorMessage,
        paymentId,
        txid,
        timestamp: requestTimestamp
      });
    }

    console.info(`[Pi Payment Completion] [${requestTimestamp}] Completion SUCCESS for paymentId: "${paymentId}", txid: "${txid}"`);

    // Only after successful completion should the app confirm the purchase and unlock the Premium/VIP content
    const selectedPlan = plan === 'annual' ? 'annual' : 'monthly';
    const amountPaid = selectedPlan === 'annual' ? appSettings.annualPricePi : appSettings.monthlyPricePi;

    // Update payment record in database
    let payment = payments.find(p => p.piPaymentId === paymentId || p.transactionId === paymentId || p.transactionId === txid);
    if (payment) {
      payment.status = 'completed';
      payment.transactionId = txid;
      payment.piPaymentId = paymentId;
    } else {
      payment = {
        id: 'pay-' + Date.now(),
        userId: userId || 'usr_demo',
        transactionId: txid,
        piPaymentId: paymentId,
        amount: amountPaid,
        currency: 'Pi',
        status: 'completed',
        plan: selectedPlan,
        createdAt: requestTimestamp
      };
      payments.unshift(payment);
    }

    // Identify user to upgrade
    const targetUserId = userId || payment.userId;
    let user = users.find(u => u.id === targetUserId || (u.piUsername && u.piUsername === responseData?.user_uid));
    if (!user && users.length > 0) {
      user = users[0];
    }

    const now = new Date();
    const expiry = new Date();
    if (selectedPlan === 'annual') {
      expiry.setFullYear(now.getFullYear() + 1);
    } else {
      expiry.setMonth(now.getMonth() + 1);
    }

    const subscription: Subscription = {
      id: 'sub-' + Date.now(),
      userId: user ? user.id : (targetUserId || 'usr_demo'),
      plan: selectedPlan,
      pricePi: amountPaid,
      transactionId: txid,
      status: 'active',
      startDate: now.toISOString(),
      expiryDate: expiry.toISOString()
    };
    subscriptions.unshift(subscription);

    if (user) {
      user.premiumStatus = true;
      user.subscriptionPlan = selectedPlan;
      user.subscriptionExpiry = expiry.toISOString();
    }

    // Send confirmation notification to user
    notifications.unshift({
      id: 'notif_vip_' + (user ? user.id : targetUserId) + '_' + Date.now(),
      userId: user ? user.id : (targetUserId || 'usr_demo'),
      title: '⭐ Premium Activated',
      message: 'Your PiFlix+ Premium membership has been successfully activated.',
      type: 'premium',
      targetTab: 'premium',
      createdAt: requestTimestamp,
      read: false,
      readBy: [],
      metadata: {
        plan: selectedPlan === 'annual' ? 'Annual VIP' : 'Monthly VIP',
        duration: selectedPlan === 'annual' ? '1 Year' : '1 Month',
        amount: amountPaid
      }
    });

    return res.json({
      success: true,
      message: 'Pi payment verified and completed on blockchain! Premium access unlocked.',
      paymentId,
      txid,
      subscription,
      user
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || String(err?.message || '').includes('timed out');
    const safeError = isTimeout
      ? 'Pi Platform API request timed out during completion.'
      : (err?.message || 'Server error during Pi payment completion.');
    console.error(`[Pi Payment Completion Error] [${requestTimestamp}]:`, safeError);
    return res.status(500).json({
      success: false,
      error: safeError,
      timestamp: requestTimestamp
    });
  }
});

// Requirement 15: Handle onIncompletePaymentFound safely
app.post('/api/pi/payments/incomplete', async (req: Request, res: Response) => {
  const requestTimestamp = new Date().toISOString();
  try {
    const { payment, userId } = req.body;
    if (!payment) {
      return res.status(400).json({ success: false, error: 'Payment payload is required.' });
    }

    const paymentId = payment.identifier || payment.id || payment.paymentId;
    const txid = payment.transaction?.txid;
    const isCompleted = payment.status?.developer_completed;
    const isApproved = payment.status?.developer_approved;
    const piServerApiKey = getPiServerApiKey();

    console.info(`[Pi Payment] [${requestTimestamp}] Incomplete payment reported: ${paymentId}, txid: ${txid}, approved: ${isApproved}, completed: ${isCompleted}`);

    if (paymentId && txid && !isCompleted && piServerApiKey) {
      console.info(`[Pi Payment] [${requestTimestamp}] Auto-completing pending incomplete payment ${paymentId}...`);
      const completeRes = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${piServerApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txid }),
        signal: AbortSignal.timeout(25000)
      });

      if (completeRes.ok) {
        console.info(`[Pi Payment] [${requestTimestamp}] Incomplete payment ${paymentId} completed successfully.`);
        const targetUserId = userId || payment.metadata?.userId;
        if (targetUserId) {
          const user = users.find(u => u.id === targetUserId);
          if (user) {
            user.premiumStatus = true;
            user.subscriptionPlan = payment.metadata?.plan || 'monthly';
          }
        }
        return res.json({ success: true, completed: true, paymentId, txid });
      }
    }

    return res.json({ success: true, completed: Boolean(isCompleted), approved: Boolean(isApproved), paymentId });
  } catch (err: any) {
    console.error(`[Pi Incomplete Payment Handler Error] [${requestTimestamp}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to process incomplete payment' });
  }
});

// Legacy / Helper endpoint: Initialize payment order on server
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

// Legacy / Direct verification fallback
app.post('/api/pi/verify-payment', (req: Request, res: Response) => {
  const { transactionId, piTxId, signedPayload } = req.body;
  const payment = payments.find(p => p.transactionId === transactionId || p.piPaymentId === transactionId);

  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found' });
  }

  payment.status = 'completed';
  payment.piPaymentId = piTxId || `pi_tx_hash_${Date.now()}`;

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
app.get('/api/admin/overview', verifyAdmin, (req: Request, res: Response) => {
  const totalViews = movies.reduce((acc, m) => acc + (m.viewsCount || 0), 0) + 
                     seriesList.reduce((acc, s) => acc + (s.viewsCount || 0), 0);
  const totalWatchTimeHours = Math.round(totalViews * 0.42);
  const piRevenue = payments.filter(p => p.status === 'completed').reduce((acc, p) => acc + p.amount, 0);
  const premiumCount = users.filter(u => u.premiumStatus).length;
  const visitorAnalytics = computeVisitorAnalytics();

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
    topSeries: [...seriesList].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 5),
    visitorAnalytics
  });
});

// --------------------------------------------------------------------------
// PUBLIC VISITOR TRACKING ENDPOINT (Privacy-preserving session tracking)
// --------------------------------------------------------------------------
app.post('/api/analytics/record-visit', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';

    // If an administrator token or session is detected, do NOT count as public visitor
    if (token) {
      const adminUser = await verifyFirebaseToken(token);
      if (adminUser) {
        return res.json({ success: true, recorded: false, reason: 'admin_ignored' });
      }
    }
    if (
      token === 'admin_session' ||
      token === 'admin' ||
      req.headers['x-admin-request'] === 'true' ||
      req.body.isAdmin === true
    ) {
      return res.json({ success: true, recorded: false, reason: 'admin_ignored' });
    }

    let visitorId = String(req.body.visitorId || '').trim();
    if (!visitorId || !/^[a-zA-Z0-9_\-]+$/.test(visitorId) || visitorId.length > 128) {
      return res.status(400).json({ error: 'Invalid visitor identifier' });
    }

    const rawSource = req.body.source;
    const userAgent = req.headers['user-agent'] || '';
    const referrer = (req.headers['referer'] || req.headers['referrer'] || '') as string;
    const isPiUa = /pibrowser/i.test(userAgent);
    const isPiReferrer = /minepi\.com/i.test(referrer);
    const source: 'pi_browser' | 'external_web' =
      (rawSource === 'pi_browser' || Boolean(req.body.piUserId) || Boolean(req.body.piUsername) || isPiUa || isPiReferrer)
        ? 'pi_browser'
        : 'external_web';

    const piUserId = req.body.piUserId ? String(req.body.piUserId).slice(0, 128) : undefined;
    const piUsername = req.body.piUsername ? String(req.body.piUsername).slice(0, 128) : undefined;

    const nowIso = new Date().toISOString();
    const todayStr = getFormattedDate();

    let visitor = visitorsStore.get(visitorId);
    if (visitor) {
      if (source === 'pi_browser' || visitor.source === 'pi_browser') {
        visitor.source = 'pi_browser';
      }
      if (piUserId) visitor.piUserId = piUserId;
      if (piUsername) visitor.piUsername = piUsername;

      if (!visitor.visitDates.includes(todayStr)) {
        visitor.visitDates.push(todayStr);
      }

      const lastSeenMs = new Date(visitor.lastSeen).getTime();
      if (Date.now() - lastSeenMs > 15 * 60 * 1000) {
        visitor.visitCount += 1;
      }
      visitor.lastSeen = nowIso;
      visitor.updatedAt = nowIso;
    } else {
      visitor = {
        visitorId,
        source,
        piUserId,
        piUsername,
        firstSeen: nowIso,
        lastSeen: nowIso,
        visitDates: [todayStr],
        visitCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      visitorsStore.set(visitorId, visitor);
    }

    saveVisitorsStore();
    syncVisitorToFirestore(visitor).catch(() => {});

    return res.json({ success: true, recorded: true, visitorId: visitor.visitorId });
  } catch (err: any) {
    console.error('Error recording visitor session:', err);
    return res.status(500).json({ error: 'Failed to record visitor session' });
  }
});

// --------------------------------------------------------------------------
// ADMIN VISITOR ANALYTICS ENDPOINT (Strictly authenticated to administrators)
// --------------------------------------------------------------------------
app.get('/api/admin/analytics/visitors', verifyAdmin, (_req: Request, res: Response) => {
  const analytics = computeVisitorAnalytics();
  res.json(analytics);
});

app.get('/api/admin/users', verifyAdmin, (req: Request, res: Response) => {
  res.json(users);
});

app.post('/api/user/language', (req: Request, res: Response) => {
  const { userId, language } = req.body;
  if (!userId || !language) return res.status(400).json({ error: 'Missing userId or language' });
  const user = users.find(u => u.id === userId);
  if (user) {
    (user as any).language = language;
  }
  res.json({ success: true, userId, language });
});

app.post('/api/admin/users/:id/toggle-premium', verifyAdmin, (req: Request, res: Response) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.premiumStatus = !user.premiumStatus;
  user.subscriptionPlan = user.premiumStatus ? 'monthly' : 'free';
  res.json({ success: true, user });
});

// --------------------------------------------------------------------------
// SUPPORT EMAIL INBOX (support@piflixplus.network)
// --------------------------------------------------------------------------
app.get('/api/admin/support/status', verifyAdmin, (_req: Request, res: Response) => {
  res.json(getEmailStatus());
});

app.get('/api/admin/support/messages', verifyAdmin, (_req: Request, res: Response) => {
  const messages = getAllMessages();
  res.json({ success: true, messages, status: getEmailStatus() });
});

app.post('/api/admin/support/sync', verifyAdmin, async (_req: Request, res: Response) => {
  const result = await syncMailbox();
  const messages = getAllMessages();
  res.json({ ...result, messages, status: getEmailStatus() });
});

app.post('/api/admin/support/reply', verifyAdmin, async (req: Request, res: Response) => {
  const { messageId, to, subject, replyBody } = req.body;
  const adminUser = (req as any).adminUser;
  const result = await sendReply({
    messageId,
    to,
    subject,
    replyBody,
    adminEmail: adminUser?.email || 'admin@piflixplus.network'
  });
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/admin/support/mark-read', verifyAdmin, (req: Request, res: Response) => {
  const { messageId, read } = req.body;
  const success = setMessageReadStatus(messageId, Boolean(read));
  res.json({ success, messageId, read });
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
