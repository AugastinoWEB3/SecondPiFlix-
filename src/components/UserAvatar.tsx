import React, { useState } from 'react';
import { getDeterministicEmoji, isCustomImageUrl } from '../lib/avatar';

interface UserAvatarProps {
  user?: {
    username?: string;
    piUsername?: string;
    profileImage?: string;
  } | null;
  sizeClass?: string;
  textClass?: string;
  isDark?: boolean;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  sizeClass = 'w-7 h-7',
  textClass = 'text-[15px]',
  isDark = true,
  className = ''
}) => {
  const [imageError, setImageError] = useState(false);
  const identifier = user?.piUsername || user?.username || '';
  const profileImage = user?.profileImage;

  const hasValidCustomImage = !imageError && isCustomImageUrl(profileImage);

  if (hasValidCustomImage && profileImage) {
    return (
      <img
        src={profileImage}
        alt={user?.username || 'User profile'}
        onError={() => setImageError(true)}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  // Fallback to deterministic emoji avatar
  const emoji = (profileImage && !profileImage.startsWith('http') && profileImage.length <= 4)
    ? profileImage
    : getDeterministicEmoji(identifier);

  return (
    <span
      className={`${sizeClass} rounded-full flex items-center justify-center ${textClass} leading-none select-none font-normal shrink-0 overflow-hidden ${
        isDark ? 'bg-zinc-800 text-white' : 'bg-slate-100 text-slate-900'
      } ${className}`}
      role="img"
      aria-label={user?.username || 'User avatar'}
    >
      {emoji}
    </span>
  );
};
