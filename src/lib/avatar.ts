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
