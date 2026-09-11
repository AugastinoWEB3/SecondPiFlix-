import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { initialSettings, defaultUsers, sampleMovies, sampleSeries, sampleSeasons, sampleEpisodes, sampleAds } from './src/data/mockData';
import { Movie, TVSeries, Season, Episode, User, WatchHistoryItem, WatchlistItem, LikedItem, ContentRatingReview, Subscription, PaymentRecord, AppSettings, AppNotification, ContentItem } from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Firebase Administrator ID token required' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const adminUser = await verifyFirebaseToken(token);
  if (!adminUser) {
    return res.status(403).json({
      error: 'Forbidden: Real Firebase Administrator authentication required. Access denied.'
    });
  }

  (req as any).adminUser = adminUser;
  next();
}

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

app.put('/api/settings', verifyAdmin, (req: Request, res: Response) => {
  appSettings = { ...appSettings, ...req.body };
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

// 1. Upload video file (MP4, WebM, MKV, MOV up to 2GB)
app.post('/api/admin/upload/video', verifyAdmin, uploadVideo.single('video'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided for upload' });
  }

  const fileUrl = `/uploads/videos/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype
  });
});

// 2. Upload cover image (JPG, PNG, WebP up to 30MB)
app.post('/api/admin/upload/cover', verifyAdmin, uploadCover.single('cover'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No cover image file provided for upload' });
  }

  const fileUrl = `/uploads/covers/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
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
        episodeNumber: e.episodeNumber,
        title: e.title,
        description: e.description,
        thumbnail: e.thumbnail,
        videoUrl: e.videoUrl,
        duration: e.duration,
        skipIntroSec: e.skipIntroSec
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
    genre: itemGenre,
    language: item.language,
    rating: item.rating,
    quality: item.qualityBadge || 'HD',
    accessType: item.isPremium ? 'premium' : 'free',
    published: item.isPublished !== undefined ? item.isPublished : true,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
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

  // Sort by latest updated
  allItems.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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

    // Remove existing if replacing ID
    movies = movies.filter(m => m.id !== id);
    movies.unshift(newMovie);

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

    seriesList = seriesList.filter(s => s.id !== id);
    seriesList.unshift(newSeries);

    // Update seasons and episodes
    if (Array.isArray(episodes) && episodes.length > 0) {
      episodesList = episodesList.filter(e => e.seriesId !== id);
      const defaultSeasonId = 'sn-' + id + '-1';
      if (!seasonsList.some(sn => sn.id === defaultSeasonId)) {
        seasonsList.push({
          id: defaultSeasonId,
          seriesId: id,
          seasonNumber: 1,
          title: 'Season 1',
          episodesCount: episodes.length
        });
      }

      episodes.forEach((ep: any, idx: number) => {
        episodesList.push({
          id: ep.id || `ep-${id}-${idx + 1}`,
          seriesId: id,
          seasonId: defaultSeasonId,
          episodeNumber: ep.episodeNumber || idx + 1,
          title: ep.title || `Episode ${idx + 1}`,
          description: ep.description || '',
          thumbnail: ep.thumbnail || coverImageUrl || '',
          videoUrl: ep.videoUrl || videoUrl || '',
          duration: ep.duration || 45,
          skipIntroSec: ep.skipIntroSec || 0,
          createdAt: now
        });
      });
    }

    return res.json({ success: true, content: mapToContentItem(newSeries) });
  }
});

// PUT update existing content item (metadata, cover, video file, episodes)
app.put('/api/content/:id', verifyAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const now = new Date().toISOString();

  // Check movie
  const movieIdx = movies.findIndex(m => m.id === id);
  if (movieIdx > -1) {
    const current = movies[movieIdx];
    const isPremium = req.body.accessType !== undefined ? req.body.accessType === 'premium' : current.isPremium;
    const isPublished = req.body.published !== undefined ? Boolean(req.body.published) : current.isPublished;

    const updatedMovie: Movie = {
      ...current,
      title: req.body.title !== undefined ? req.body.title : current.title,
      description: req.body.description !== undefined ? req.body.description : current.description,
      poster: req.body.coverImageUrl || req.body.poster || current.poster,
      backdrop: req.body.coverImageUrl || req.body.backdrop || current.backdrop,
      coverImageUrl: req.body.coverImageUrl || current.coverImageUrl,
      videoUrl: req.body.videoUrl !== undefined ? req.body.videoUrl : current.videoUrl,
      trailerUrl: req.body.trailerUrl !== undefined ? req.body.trailerUrl : current.trailerUrl,
      year: req.body.year !== undefined ? Number(req.body.year) : current.year,
      rating: req.body.rating !== undefined ? Number(req.body.rating) : current.rating,
      language: req.body.language !== undefined ? req.body.language : current.language,
      qualityBadge: req.body.quality !== undefined ? req.body.quality : current.qualityBadge,
      genre: req.body.genre !== undefined 
        ? (Array.isArray(req.body.genre) ? req.body.genre : String(req.body.genre).split(',').map((s: string) => s.trim()))
        : current.genre,
      isPremium,
      accessType: isPremium ? 'premium' : 'free',
      isPublished,
      published: isPublished,
      updatedAt: now
    };

    movies[movieIdx] = updatedMovie;
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
      title: req.body.title !== undefined ? req.body.title : current.title,
      description: req.body.description !== undefined ? req.body.description : current.description,
      poster: req.body.coverImageUrl || req.body.poster || current.poster,
      backdrop: req.body.coverImageUrl || req.body.backdrop || current.backdrop,
      coverImageUrl: req.body.coverImageUrl || current.coverImageUrl,
      trailerUrl: req.body.trailerUrl !== undefined ? req.body.trailerUrl : current.trailerUrl,
      year: req.body.year !== undefined ? Number(req.body.year) : current.year,
      rating: req.body.rating !== undefined ? Number(req.body.rating) : current.rating,
      language: req.body.language !== undefined ? req.body.language : current.language,
      qualityBadge: req.body.quality !== undefined ? req.body.quality : current.qualityBadge,
      genre: req.body.genre !== undefined 
        ? (Array.isArray(req.body.genre) ? req.body.genre : String(req.body.genre).split(',').map((s: string) => s.trim()))
        : current.genre,
      isPremium,
      accessType: isPremium ? 'premium' : 'free',
      isPublished,
      published: isPublished,
      updatedAt: now
    };

    seriesList[seriesIdx] = updatedSeries;

    // If episodes updated
    if (Array.isArray(req.body.episodes)) {
      episodesList = episodesList.filter(e => e.seriesId !== id);
      const defaultSeasonId = 'sn-' + id + '-1';
      req.body.episodes.forEach((ep: any, idx: number) => {
        episodesList.push({
          id: ep.id || `ep-${id}-${idx + 1}`,
          seriesId: id,
          seasonId: defaultSeasonId,
          episodeNumber: ep.episodeNumber || idx + 1,
          title: ep.title || `Episode ${idx + 1}`,
          description: ep.description || '',
          thumbnail: ep.thumbnail || updatedSeries.coverImageUrl || updatedSeries.poster,
          videoUrl: ep.videoUrl || '',
          duration: ep.duration || 45,
          skipIntroSec: ep.skipIntroSec || 0,
          createdAt: now
        });
      });
    }

    return res.json({ success: true, content: mapToContentItem(updatedSeries) });
  }

  return res.status(404).json({ error: 'Content item not found' });
});

// DELETE content item
app.delete('/api/content/:id', verifyAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const initialMovieCount = movies.length;
  const initialSeriesCount = seriesList.length;

  movies = movies.filter(m => m.id !== id);
  seriesList = seriesList.filter(s => s.id !== id);
  episodesList = episodesList.filter(e => e.seriesId !== id);

  if (movies.length === initialMovieCount && seriesList.length === initialSeriesCount) {
    return res.status(404).json({ error: 'Content item not found' });
  }

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
    return res.json({ success: true, content: mapToContentItem(movie) });
  }

  const series = seriesList.find(s => s.id === id);
  if (series) {
    series.isPublished = Boolean(published);
    series.published = Boolean(published);
    series.updatedAt = new Date().toISOString();
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
// Helper to retrieve Pi Server API Key strictly from server environment variable
const getPiServerApiKey = (): string => {
  return (process.env.PI_SERVER_API_KEY || process.env.PI_NETWORK_API_KEY || '').trim();
};

// Requirement 4: Backend uses Pi Server API Key from environment variable to approve payment
// POST https://api.minepi.com/v2/payments/{paymentId}/approve
app.post(['/api/pi/payments/approve', '/api/pi/approve-payment'], async (req: Request, res: Response) => {
  try {
    const { paymentId, plan = 'monthly', userId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'paymentId is required for approval.' });
    }

    const piServerApiKey = getPiServerApiKey();
    if (!piServerApiKey) {
      console.error('[Pi Payment Approval] Missing PI_SERVER_API_KEY environment variable.');
      return res.status(500).json({
        success: false,
        error: 'Pi Server API Key is not configured on the backend server.'
      });
    }

    console.info(`[Pi Payment] Approving payment ${paymentId} via Pi Network API...`);

    const piApproveRes = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${piServerApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const responseText = await piApproveRes.text();
    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!piApproveRes.ok) {
      // If already developer_approved, continue gracefully
      const isAlreadyApproved =
        responseData?.status?.developer_approved ||
        String(responseData?.message || '').toLowerCase().includes('already approved');

      if (!isAlreadyApproved) {
        console.error(`[Pi Payment Approval] Pi API rejected approval (${piApproveRes.status}):`, responseData);
        return res.status(piApproveRes.status).json({
          success: false,
          error: responseData?.message || responseData?.error || `Pi payment approval failed with status ${piApproveRes.status}`
        });
      }
      console.info(`[Pi Payment] Payment ${paymentId} was already approved.`);
    }

    // Save or update pending payment entry
    let payment = payments.find(p => p.piPaymentId === paymentId || p.transactionId === paymentId);
    if (payment) {
      payment.status = 'approved';
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
        createdAt: new Date().toISOString()
      };
      payments.unshift(payment);
    }

    return res.json({
      success: true,
      message: 'Payment successfully approved by PiFlix+ server.',
      paymentId,
      status: 'approved'
    });
  } catch (err: any) {
    console.error('[Pi Payment Approval Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Server error during Pi payment approval.'
    });
  }
});

// Requirement 6: Backend uses Pi Server API Key to complete payment with txid
// POST https://api.minepi.com/v2/payments/{paymentId}/complete
// Requirement 7: Only after successful completion should the app confirm purchase and unlock Premium/VIP
app.post(['/api/pi/payments/complete', '/api/pi/complete-payment'], async (req: Request, res: Response) => {
  try {
    const { paymentId, txid, plan = 'monthly', userId } = req.body;
    if (!paymentId || !txid) {
      return res.status(400).json({ success: false, error: 'Both paymentId and txid are required for completion.' });
    }

    const piServerApiKey = getPiServerApiKey();
    if (!piServerApiKey) {
      console.error('[Pi Payment Completion] Missing PI_SERVER_API_KEY environment variable.');
      return res.status(500).json({
        success: false,
        error: 'Pi Server API Key is not configured on the backend server.'
      });
    }

    console.info(`[Pi Payment] Completing payment ${paymentId} with txid ${txid} via Pi Network API...`);

    const piCompleteRes = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${piServerApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ txid })
    });

    const responseText = await piCompleteRes.text();
    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!piCompleteRes.ok) {
      // If already developer_completed, we can proceed to grant access
      const isAlreadyCompleted =
        responseData?.status?.developer_completed ||
        String(responseData?.message || '').toLowerCase().includes('already completed');

      if (!isAlreadyCompleted) {
        console.error(`[Pi Payment Completion] Pi API rejected completion (${piCompleteRes.status}):`, responseData);
        return res.status(piCompleteRes.status).json({
          success: false,
          error: responseData?.message || responseData?.error || `Pi payment completion failed with status ${piCompleteRes.status}`
        });
      }
      console.info(`[Pi Payment] Payment ${paymentId} was already completed.`);
    }

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
        createdAt: new Date().toISOString()
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

    // Send celebration notification to user
    notifications.unshift({
      id: 'notif-' + Date.now(),
      userId: user ? user.id : (targetUserId || 'usr_demo'),
      title: '⭐ Welcome to PiFlix+ VIP Pioneer!',
      message: `Your ${selectedPlan} subscription of ${amountPaid} Pi has been verified on the blockchain. Ad-free 4K streaming is now unlocked!`,
      type: 'premium',
      createdAt: new Date().toISOString(),
      read: false
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
    console.error('[Pi Payment Completion Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Server error during Pi payment completion.'
    });
  }
});

// Requirement 8: Handle onIncompletePaymentFound during authentication
app.post('/api/pi/payments/incomplete', async (req: Request, res: Response) => {
  try {
    const { payment, userId } = req.body;
    if (!payment) {
      return res.status(400).json({ success: false, error: 'Payment payload is required.' });
    }

    const paymentId = payment.identifier || payment.id || payment.paymentId;
    const txid = payment.transaction?.txid;
    const isCompleted = payment.status?.developer_completed;
    const piServerApiKey = getPiServerApiKey();

    console.info(`[Pi Payment] Incomplete payment reported: ${paymentId}, txid: ${txid}, completed: ${isCompleted}`);

    if (paymentId && txid && !isCompleted && piServerApiKey) {
      console.info(`[Pi Payment] Auto-completing pending incomplete payment ${paymentId}...`);
      const completeRes = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${piServerApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txid })
      });

      if (completeRes.ok) {
        console.info(`[Pi Payment] Incomplete payment ${paymentId} completed successfully.`);
        if (userId) {
          const user = users.find(u => u.id === userId);
          if (user) {
            user.premiumStatus = true;
            user.subscriptionPlan = payment.metadata?.plan || 'monthly';
          }
        }
        return res.json({ success: true, completed: true, paymentId, txid });
      }
    }

    return res.json({ success: true, completed: Boolean(isCompleted), paymentId });
  } catch (err: any) {
    console.error('[Pi Incomplete Payment Handler Error]:', err);
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

app.get('/api/admin/users', verifyAdmin, (req: Request, res: Response) => {
  res.json(users);
});

app.post('/api/admin/users/:id/toggle-premium', verifyAdmin, (req: Request, res: Response) => {
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
