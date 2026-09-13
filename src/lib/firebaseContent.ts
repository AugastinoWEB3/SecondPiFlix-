import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { AppSettings } from '../types';

export interface EpisodeItem {
  id: string;
  episodeNumber: number;
  title: string;
  description?: string;
  thumbnail?: string;
  videoUrl: string;
  duration?: number;
  skipIntroSec?: number;
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
  episodes?: EpisodeItem[];
}

const CONTENT_COLLECTION = 'content';
const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOC_ID = 'app';

// Helper to retrieve current Firebase ID Token for protected API requests
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      return { Authorization: `Bearer ${token}` };
    }
    const token = localStorage.getItem('piflix_admin_token');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch (err) {
    console.warn('Error retrieving Firebase Auth token:', err);
  }
  return {};
}

/**
 * Save new or existing content item to Firestore.
 * Also synchronizes with server-side catalog.
 */
export async function saveContent(item: ContentItem): Promise<ContentItem> {
  const contentDoc = doc(db, CONTENT_COLLECTION, item.id);
  const now = new Date().toISOString();
  const payload: ContentItem = {
    id: String(item.id),
    title: String(item.title || 'Untitled').trim(),
    description: String(item.description || ''),
    type: item.type === 'series' ? 'series' : 'movie',
    coverImageUrl: String(item.coverImageUrl || ''),
    videoUrl: String(item.videoUrl || ''),
    trailerUrl: String(item.trailerUrl || ''),
    year: Number(item.year) || new Date().getFullYear(),
    genre: Array.isArray(item.genre) ? (item.genre as string[]).join(', ') : String(item.genre || 'General'),
    language: String(item.language || 'English'),
    rating: Number(item.rating) || 8.0,
    quality: (item.quality as 'HD' | 'FHD' | '4K') || 'HD',
    accessType: item.accessType === 'premium' ? 'premium' : 'free',
    published: Boolean(item.published !== false),
    createdAt: item.createdAt || now,
    updatedAt: now,
    episodes: Array.isArray(item.episodes) ? item.episodes.map((ep, idx) => ({
      id: ep.id || `ep-${item.id}-${idx + 1}`,
      episodeNumber: Number(ep.episodeNumber) || (idx + 1),
      title: String(ep.title || `Episode ${idx + 1}`),
      description: String(ep.description || ''),
      thumbnail: String(ep.thumbnail || item.coverImageUrl || ''),
      videoUrl: String(ep.videoUrl || item.videoUrl || ''),
      duration: Number(ep.duration) || 45,
      skipIntroSec: Number(ep.skipIntroSec) || 0
    })) : undefined
  };

  try {
    await setDoc(contentDoc, payload);
  } catch (err) {
    console.warn('Firestore setDoc failed or restricted, syncing via server API:', err);
  }

  // Also sync to server API for caching and streaming integration
  try {
    const authHeaders = await getAuthHeaders();
    await fetch('/api/content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Server content sync error:', err);
  }

  return payload;
}

/**
 * Update an existing content item in Firestore and on the server.
 */
export async function updateContent(id: string, updates: Partial<ContentItem>): Promise<void> {
  const contentDoc = doc(db, CONTENT_COLLECTION, id);
  const patch = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  try {
    await updateDoc(contentDoc, patch);
  } catch (err) {
    console.warn('Firestore updateDoc failed, updating via server API:', err);
  }

  try {
    const authHeaders = await getAuthHeaders();
    await fetch(`/api/content/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(patch)
    });
  } catch (err) {
    console.warn('Server content update error:', err);
  }
}

/**
 * Delete a content item permanently from production Firestore and the server backend.
 */
export async function deleteContent(id: string): Promise<void> {
  let firestoreSuccess = false;
  let serverSuccess = false;
  let lastError: any = null;

  try {
    await deleteDoc(doc(db, CONTENT_COLLECTION, id));
    firestoreSuccess = true;
  } catch (err: any) {
    lastError = err;
    console.warn(`Firestore client deleteDoc notice for ${id}:`, err?.message || err);
  }

  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/content/${id}`, {
      method: 'DELETE',
      headers: {
        ...authHeaders
      }
    });
    if (res.ok) {
      serverSuccess = true;
    }
  } catch (err: any) {
    if (!lastError) lastError = err;
    console.warn(`Server API delete request error for ${id}:`, err?.message || err);
  }

  // If neither client-side Firestore nor server could delete it, throw the actual error
  if (!firestoreSuccess && !serverSuccess) {
    throw new Error(lastError?.message || 'Failed to delete content item from database.');
  }
}

/**
 * Toggle published state of a content item.
 */
export async function setPublishedState(id: string, published: boolean): Promise<void> {
  await updateContent(id, { published });
}

/**
 * Fetch all content items, with optional filter for published only.
 */
export async function fetchAllContent(includeUnpublished = false): Promise<ContentItem[]> {
  try {
    const colRef = collection(db, CONTENT_COLLECTION);
    const q = includeUnpublished ? query(colRef) : query(colRef, where('published', '==', true));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const items: ContentItem[] = [];
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ContentItem);
      });
      return items;
    }
  } catch (err) {
    console.warn('Firestore fetch failed, falling back to server API:', err);
  }

  // Fallback to server API
  try {
    const res = await fetch(`/api/content?publishedOnly=${!includeUnpublished}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('Failed to fetch content from server API:', e);
  }

  return [];
}

/**
 * Real-time listener for Firestore content items.
 */
export function subscribeToContent(
  callback: (items: ContentItem[]) => void,
  includeUnpublished = false
): () => void {
  try {
    const colRef = collection(db, CONTENT_COLLECTION);
    const q = includeUnpublished ? query(colRef) : query(colRef, where('published', '==', true));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: ContentItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as ContentItem);
        });
        callback(items);
      },
      (error) => {
        console.warn('Firestore content subscription error, using polling/API fallback:', error);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn('Could not initialize onSnapshot:', e);
    return () => {};
  }
}

/**
 * Fetch application settings directly from Firestore.
 */
export async function fetchSettingsFromFirestore(): Promise<AppSettings | null> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppSettings;
    }
  } catch (err) {
    console.warn('Firestore fetchSettings error:', err);
  }
  return null;
}

/**
 * Persist application settings directly to Firestore.
 */
export async function saveSettingsToFirestore(settingsUpdate: Partial<AppSettings>): Promise<boolean> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    await setDoc(docRef, { ...settingsUpdate, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore saveSettings error:', err);
    return false;
  }
}

/**
 * Real-time listener for Firestore application settings.
 */
export function subscribeToSettings(callback: (settings: AppSettings) => void): () => void {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    return onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data() as AppSettings);
        }
      },
      (err) => {
        console.warn('Firestore settings subscription warning:', err);
      }
    );
  } catch (err) {
    console.warn('Firestore subscribeToSettings initialization error:', err);
    return () => {};
  }
}

/**
 * Safely audit and correct invalid/temporary media references in Firestore documents without data loss (Requirement Bug 3).
 */
export async function cleanExistingInvalidMedia(): Promise<{ checked: number; updated: number }> {
  let checked = 0;
  let updated = 0;
  try {
    const colRef = collection(db, CONTENT_COLLECTION);
    const snap = await getDocs(colRef);
    const fallbackCover = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80';
    const fallbackVideo = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';

    for (const docSnap of snap.docs) {
      checked++;
      const data = docSnap.data();
      const updates: Record<string, any> = {};

      // Check coverImageUrl - only fix if empty or missing
      if (!data.coverImageUrl || typeof data.coverImageUrl !== 'string' || data.coverImageUrl.trim() === '') {
        updates.coverImageUrl = fallbackCover;
      }

      // Check videoUrl - only fix if empty or missing
      if (!data.videoUrl || typeof data.videoUrl !== 'string' || data.videoUrl.trim() === '') {
        updates.videoUrl = fallbackVideo;
      }

      // Check episodes if series
      if (Array.isArray(data.episodes)) {
        let episodesModified = false;
        const cleanedEpisodes = data.episodes.map((ep: any) => {
          let epChanged = false;
          const cleanedEp = { ...ep };
          if (!cleanedEp.videoUrl || typeof cleanedEp.videoUrl !== 'string' || cleanedEp.videoUrl.trim() === '') {
            cleanedEp.videoUrl = fallbackVideo;
            epChanged = true;
          }
          if (!cleanedEp.thumbnail || typeof cleanedEp.thumbnail !== 'string' || cleanedEp.thumbnail.trim() === '') {
            cleanedEp.thumbnail = fallbackCover;
            epChanged = true;
          }
          if (epChanged) episodesModified = true;
          return cleanedEp;
        });
        if (episodesModified) {
          updates.episodes = cleanedEpisodes;
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date().toISOString();
        await updateDoc(docSnap.ref, updates);
        updated++;
      }
    }
  } catch (err) {
    console.warn('[cleanExistingInvalidMedia] Notice:', err);
  }
  return { checked, updated };
}

