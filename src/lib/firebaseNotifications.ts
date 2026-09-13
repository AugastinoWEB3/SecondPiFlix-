import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  arrayUnion,
  getDocs,
  query,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { AppNotification } from '../types';

export const NOTIFICATIONS_COLLECTION = 'notifications';

// Clean object helper to ensure no 'undefined' properties are sent to Firestore
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Real-time listener for Firestore persistent notifications.
 * Automatically filters by current user identity and determines user-specific read status.
 */
export function subscribeToUserNotifications(
  currentUserId: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  try {
    const colRef = collection(db, NOTIFICATIONS_COLLECTION);

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const items: AppNotification[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          const targetUserId = data.userId || 'all';

          // Notification filtering: only include if broadcast ('all') or intended for current user
          if (targetUserId !== 'all' && targetUserId !== currentUserId) {
            return;
          }

          const readByList: string[] = Array.isArray(data.readBy) ? data.readBy : [];
          // Determine read status for this specific user
          const isRead =
            targetUserId === currentUserId
              ? Boolean(data.read || readByList.includes(currentUserId))
              : readByList.includes(currentUserId);

          items.push({
            id: docSnap.id,
            userId: targetUserId,
            title: String(data.title || ''),
            message: String(data.message || ''),
            type: data.type || 'announcement',
            contentId: data.contentId,
            contentType: data.contentType,
            coverImageUrl: data.coverImageUrl,
            targetTab: data.targetTab,
            createdAt: data.createdAt || new Date().toISOString(),
            read: isRead,
            readBy: readByList,
            metadata: data.metadata
          });
        });

        // Sort descending: newest first
        items.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime() || 0;
          const timeB = new Date(b.createdAt).getTime() || 0;
          return timeB - timeA;
        });

        if (snapshot.empty) {
          // Initialize persistent Firestore records if notifications collection is currently empty
          seedInitialNotificationsIfEmpty();
        }

        callback(items);
      },
      (error) => {
        console.warn('[Firestore Notifications] Snapshot subscription warning, using fallback:', error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[Firestore Notifications] Could not initialize listener:', err);
    return () => {};
  }
}

let isSeeding = false;
async function seedInitialNotificationsIfEmpty() {
  if (isSeeding) return;
  isSeeding = true;
  try {
    const contentSnap = await getDocs(query(collection(db, 'content'), limit(5)));
    if (!contentSnap.empty) {
      const batch = writeBatch(db);
      let count = 0;
      contentSnap.forEach((docSnap) => {
        const item = docSnap.data();
        if (item.published !== false && item.isPublished !== false) {
          const isSeries = item.type === 'series' || 'seasonsCount' in item;
          const notifId = `notif_${isSeries ? 'series' : 'movie'}_${docSnap.id}`;
          const docRef = doc(db, NOTIFICATIONS_COLLECTION, notifId);
          batch.set(
            docRef,
            {
              id: notifId,
              userId: 'all',
              title: isSeries ? '📺 New Series' : '🎬 New Movie Release',
              message: isSeries
                ? `A new series, ${item.title}, is now available on PiFlix+.`
                : `"${item.title}" is now available on PiFlix+.`,
              type: isSeries ? 'new_series' : 'new_movie',
              contentId: docSnap.id,
              contentType: isSeries ? 'series' : 'movie',
              coverImageUrl: item.coverImageUrl || item.poster || '',
              targetTab: isSeries ? 'series' : 'movies',
              createdAt: item.createdAt || new Date().toISOString(),
              read: false,
              readBy: []
            },
            { merge: true }
          );
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
    }
  } catch (e) {
    // Non-blocking
  } finally {
    isSeeding = false;
  }
}

/**
 * Persist a new notification in production Firestore with stable deduplication.
 */
export async function createNotification(
  notif: Omit<AppNotification, 'id'> & { id?: string }
): Promise<AppNotification> {
  const notifId = notif.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = notif.createdAt || new Date().toISOString();

  const payload: AppNotification = {
    id: notifId,
    userId: notif.userId || 'all',
    title: notif.title.trim(),
    message: notif.message.trim(),
    type: notif.type,
    contentId: notif.contentId,
    contentType: notif.contentType,
    coverImageUrl: notif.coverImageUrl || '',
    targetTab: notif.targetTab,
    createdAt: now,
    read: Boolean(notif.read),
    readBy: Array.isArray(notif.readBy) ? notif.readBy : [],
    metadata: notif.metadata
  };

  const cleanPayload = sanitizeForFirestore(payload);

  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notifId);
    await setDoc(docRef, cleanPayload, { merge: true });
  } catch (err) {
    console.error('[Firestore Notifications] Failed to save notification to Firestore:', err);
    throw err;
  }

  // Also notify server endpoint to keep server cache in sync if needed
  try {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanPayload)
    });
  } catch (e) {
    // Non-blocking
  }

  return payload;
}

/**
 * Mark a single notification as read for the current user in Firestore.
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  if (!notificationId) return false;
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await setDoc(
      docRef,
      {
        read: true,
        readBy: arrayUnion(userId)
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error(`[Firestore Notifications] Failed to mark notification ${notificationId} as read:`, err);
    return false;
  }
}

/**
 * Mark all notifications for the current user as read in Firestore.
 */
export async function markAllNotificationsAsRead(
  notifications: AppNotification[],
  userId: string
): Promise<boolean> {
  if (!notifications.length) return true;
  try {
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      const docRef = doc(db, NOTIFICATIONS_COLLECTION, n.id);
      batch.set(
        docRef,
        {
          read: true,
          readBy: arrayUnion(userId)
        },
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error('[Firestore Notifications] Failed to mark all notifications as read:', err);
    return false;
  }
}

/**
 * Format timestamp into relative readable string (e.g. "Just now", "10m ago", "2h ago", "Yesterday")
 */
export function formatNotificationTime(timestampStr: string): string {
  try {
    const date = new Date(timestampStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}
