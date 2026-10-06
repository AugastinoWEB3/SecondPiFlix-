export const EMOJI_AVATARS: string[] = [
  '😀', '😎', '😊', '🥰', '🤩', '😇', '🥳', '😌', '🤗', '🫡',
  '🐼', '🦊', '🐯', '🐨', '🐸', '🐵', '🐱', '🐶', '🐰', '🐻'
];

/**
 * Deterministically maps any username or Pi Network identifier to one of the 20 standard emojis.
 * Rules:
 * - Different users receive different emojis.
 * - The same user always gets the exact same emoji across reloads and sessions.
 * - Normalized by trimming and lowercase so case differences don't alter the emoji.
 */
export function getDeterministicEmoji(identifier?: string): string {
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

/**
 * Validates whether a profile image string is a real custom image URL,
 * filtering out empty values, raw emoji strings, and deprecated cartoon generator endpoints.
 */
/**
 * Detects whether a string is an internal UUID, database document ID, or internal session token.
 * A UUID/internal ID must NEVER be displayed as a visible username.
 */
export function isUuidOrInternalId(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  // Standard UUID (8-4-4-4-12 hex characters)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // Contains UUID anywhere in the string
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s)) return true;
  // Prefixed with usr_pi_
  if (/^usr_pi_/i.test(s)) return true;
  // usr_ followed by timestamp
  if (/^usr_\d{10,}/i.test(s)) return true;
  // Internal token formats
  if (/^(jwt_|TX_|PI_TX_|sub_)/i.test(s)) return true;
  return false;
}

/**
 * Returns the primary visible profile name for a Pioneer:
 * Prioritizes the user's authentic Pi Username, never displaying an internal UUID or token.
 */
export function getVisiblePiUsername(
  user?: { username?: string; piUsername?: string; role?: string } | null,
  fallback = 'Pioneer'
): string {
  if (!user) return fallback;
  // Check piUsername first
  if (user.piUsername && !isUuidOrInternalId(user.piUsername)) {
    return user.piUsername;
  }
  // Check username
  if (user.username && !isUuidOrInternalId(user.username)) {
    return user.username;
  }
  return fallback;
}

export function isCustomImageUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
    return false;
  }
  if (trimmed.includes('dicebear.com') || trimmed.includes('bottts')) {
    return false;
  }
  return true;
}
