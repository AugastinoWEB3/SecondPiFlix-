import { ContentRatingReview } from '../types';

/**
 * Extracts a numeric timestamp in milliseconds from any review timestamp format:
 * - ISO-8601 string (e.g. "2026-10-08T14:56:27.286Z")
 * - Firestore Timestamp instance or object with .toDate() or { seconds, nanoseconds }
 * - Javascript Date instance
 * - Epoch number in milliseconds or seconds
 * Returns 0 if missing, empty, or unparseable.
 */
export function getReviewTimestampMs(createdAt: any): number {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') {
    return createdAt < 10000000000 ? createdAt * 1000 : createdAt;
  }
  if (typeof createdAt === 'object') {
    if (typeof createdAt.toDate === 'function') {
      try {
        const d = createdAt.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d.getTime();
      } catch {
        // ignore
      }
    }
    if (typeof createdAt.seconds === 'number') {
      return createdAt.seconds * 1000 + Math.floor((createdAt.nanoseconds || 0) / 1000000);
    }
    if (createdAt instanceof Date && !isNaN(createdAt.getTime())) {
      return createdAt.getTime();
    }
  }
  if (typeof createdAt === 'string' && createdAt.trim().length > 0) {
    const parsed = new Date(createdAt.trim()).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Formats a comment timestamp in the required compact format:
 * Example: "10 Oct 2026 • 03:30 AM" or "9 Oct 2026 • 09:15 PM"
 * Falls back to "Date unavailable" if the comment has no valid timestamp,
 * preserving older reviews without inventing false historical dates.
 */
export function formatReviewDateTime(createdAt: any): string {
  const ms = getReviewTimestampMs(createdAt);
  if (!ms || isNaN(ms)) {
    return 'Date unavailable';
  }

  const d = new Date(ms);
  if (isNaN(d.getTime())) {
    return 'Date unavailable';
  }

  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');

  return `${day} ${month} ${year} • ${hoursStr}:${minutes} ${ampm}`;
}

/**
 * Sorts audience reviews in descending chronological order (newest first).
 * The newest comment ALWAYS appears at the top.
 * Comments without valid timestamps are preserved and placed below with "Date unavailable".
 */
export function sortReviewsNewestFirst(reviewsList: ContentRatingReview[]): ContentRatingReview[] {
  if (!Array.isArray(reviewsList)) return [];
  return [...reviewsList].sort((a, b) => {
    const timeA = getReviewTimestampMs(a.createdAt);
    const timeB = getReviewTimestampMs(b.createdAt);
    if (timeA === 0 && timeB === 0) return 0;
    if (timeA === 0) return 1; // items without timestamps stay below
    if (timeB === 0) return -1;
    return timeB - timeA; // descending: newest first
  });
}
