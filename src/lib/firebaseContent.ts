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
    ...item,
    createdAt: item.createdAt || now,
    updatedAt: now
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
 * Delete a content item from Firestore and the server.
 */
export async function deleteContent(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, CONTENT_COLLECTION, id));
  } catch (err) {
    console.warn('Firestore deleteDoc failed, deleting via server API:', err);
  }

  try {
    const authHeaders = await getAuthHeaders();
    await fetch(`/api/content/${id}`, {
      method: 'DELETE',
      headers: {
        ...authHeaders
      }
    });
  } catch (err) {
    console.warn('Server content delete error:', err);
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
