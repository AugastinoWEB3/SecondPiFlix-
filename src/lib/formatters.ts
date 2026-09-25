/**
 * Utility functions for formatting durations and media metadata cleanly
 */

/**
 * Format duration in minutes or seconds to a clean display string
 * e.g. 95 -> "1h 35m", 45 -> "45 min", 12 -> "12 min", 125 -> "2h 5m"
 */
export function formatDuration(durationInMinutesOrSeconds?: number): string {
  if (!durationInMinutesOrSeconds || durationInMinutesOrSeconds <= 0) {
    return '';
  }

  // If the number is greater than 360, it's likely in seconds (e.g. 7200s = 120m)
  const totalMinutes = durationInMinutesOrSeconds > 360 
    ? Math.round(durationInMinutesOrSeconds / 60) 
    : Math.round(durationInMinutesOrSeconds);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

/**
 * Format seconds to standard video timer format (e.g. "1:35:10" or "04:22")
 */
export function formatTimeCode(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const paddedMins = String(minutes).padStart(2, '0');
  const paddedSecs = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins}:${paddedSecs}`;
}
