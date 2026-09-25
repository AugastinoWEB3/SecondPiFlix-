import { isPiBrowser } from './piAuth';
import { User, VisitorTrafficSource } from '../types';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

const VISITOR_ID_STORAGE_KEY = 'piflix_visitor_id';
const SESSION_TRACKED_KEY = 'piflix_session_tracked_at';
const SESSION_SOURCE_KEY = 'piflix_session_source';

/**
 * Retrieves the existing anonymous visitor ID from localStorage,
 * or safely generates a new cryptographically random anonymous ID.
 */
export function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (!id || !id.startsWith('vis_') || !/^[a-zA-Z0-9_\-]+$/.test(id)) {
      const entropy = window.crypto && window.crypto.getRandomValues
        ? Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        : Math.random().toString(36).substring(2, 12);
      id = `vis_${Date.now().toString(36)}_${entropy}`;
      localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
    }
    return id;
  } catch (err) {
    console.warn('Unable to access localStorage for visitor identifier:', err);
    return `vis_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

/**
 * Detects whether the visitor is connecting via Pi Browser / ecosystem
 * or external web link. Uses authenticated Pi state and ecosystem environment.
 */
export function detectVisitorSource(user?: User | null): VisitorTrafficSource {
  // If user is actively authenticated with Pi Network credentials
  if (user && (user.isPiUser || Boolean(user.piUsername) || Boolean(user.piUserId))) {
    return 'pi_browser';
  }

  // Check Pi ecosystem runtime environment (Pi Browser user-agent or Pi SDK bridge)
  if (isPiBrowser()) {
    return 'pi_browser';
  }

  // Check if URL parameter or document referrer indicates Pi ecosystem
  try {
    if (
      typeof window !== 'undefined' &&
      (window.location.search.includes('pi=') ||
        window.location.search.includes('source=pi') ||
        (document.referrer && document.referrer.includes('minepi.com')))
    ) {
      return 'pi_browser';
    }
  } catch {}

  // Otherwise, user arrived via normal web link/browser
  return 'external_web';
}

/**
 * Records a visitor session event to persistent database storage.
 * Does NOT track authenticated admin dashboard sessions as public visitors.
 * Intelligent throttling prevents inflating counts on page refreshes.
 */
export async function trackVisitorAccess(options: {
  user?: User | null;
  isAdmin?: boolean;
  forceUpdate?: boolean;
}): Promise<boolean> {
  try {
    // 1. Never track admin dashboard visits as public visitors
    if (options.isAdmin) {
      return false;
    }
    const adminToken = localStorage.getItem('piflix_admin_token');
    if (adminToken) {
      return false;
    }

    const visitorId = getOrCreateVisitorId();
    const source = detectVisitorSource(options.user);
    const piUserId = options.user?.piUserId || (options.user?.isPiUser ? options.user?.id : undefined);
    const piUsername = options.user?.piUsername;

    // 2. Refresh deduplication check:
    // Avoid re-triggering API calls on every page refresh if recently recorded in this session
    // unless source has upgraded (e.g. user authenticated with Pi) or forced.
    const lastTrackedTimeStr = sessionStorage.getItem(SESSION_TRACKED_KEY);
    const lastTrackedSource = sessionStorage.getItem(SESSION_SOURCE_KEY);

    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;

    if (!options.forceUpdate && lastTrackedTimeStr) {
      const lastTrackedTime = parseInt(lastTrackedTimeStr, 10);
      const isRecent = now - lastTrackedTime < fifteenMinutes;
      const isSameSource = lastTrackedSource === source;

      // If user hasn't upgraded source and visited recently, skip network spam
      if (isRecent && isSameSource) {
        return true;
      }
    }

    // Update session indicators
    sessionStorage.setItem(SESSION_TRACKED_KEY, now.toString());
    sessionStorage.setItem(SESSION_SOURCE_KEY, source);

    // 3. Send event to server persistence endpoint
    const response = await fetch('/api/analytics/record-visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        visitorId,
        source,
        piUserId: piUserId || undefined,
        piUsername: piUsername || undefined,
      }),
    });

    if (!response.ok) {
      console.warn('Visitor tracking endpoint returned non-200 status:', response.status);
    }

    // 4. Also record to Firestore client SDK for dual persistent redundancy
    try {
      const todayStr = new Date().toISOString().substring(0, 10);
      const nowIso = new Date().toISOString();
      const visitorDocRef = doc(db, 'visitors', visitorId);
      
      await setDoc(
        visitorDocRef,
        {
          visitorId,
          source,
          piUserId: piUserId || null,
          piUsername: piUsername || null,
          lastSeen: nowIso,
          firstSeen: nowIso,
          visitDates: [todayStr],
          visitCount: 1,
          updatedAt: nowIso
        },
        { merge: true }
      );
    } catch (fsErr) {
      // Non-blocking: Server API already records it persistently in visitors_store.json + Firestore REST API
    }

    return true;
  } catch (err) {
    console.warn('Error recording visitor analytics:', err);
    return false;
  }
}
