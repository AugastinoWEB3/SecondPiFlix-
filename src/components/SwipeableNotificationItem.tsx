import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Sparkles, Tv, Film, X } from 'lucide-react';
import { AppNotification } from '../types';
import { formatNotificationTime } from '../lib/firebaseNotifications';

interface SwipeableNotificationItemProps {
  notification: AppNotification;
  isDark: boolean;
  onClick: (notification: AppNotification) => void;
  onDismiss: (notificationId: string) => void;
}

export const SwipeableNotificationItem: React.FC<SwipeableNotificationItemProps> = ({
  notification,
  isDark,
  onClick,
  onDismiss
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissDirection, setDismissDirection] = useState<'left' | 'right'>('right');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const hasMovedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const DISMISS_THRESHOLD = 75; // pixels to trigger dismiss

  // Reset state if notification ID changes
  useEffect(() => {
    setOffsetX(0);
    setIsDragging(false);
    setIsDismissing(false);
    setIsCollapsed(false);
    hasMovedRef.current = false;
  }, [notification.id]);

  const handleTouchStart = (e: React.TouchEvent | React.PointerEvent) => {
    if (isDismissing) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    startXRef.current = clientX;
    startYRef.current = clientY;
    currentXRef.current = clientX;
    isHorizontalSwipeRef.current = null;
    hasMovedRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.PointerEvent) => {
    if (!isDragging || isDismissing) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const diffX = clientX - startXRef.current;
    const diffY = clientY - startYRef.current;

    // Detect gesture direction on initial movement
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalSwipeRef.current = Math.abs(diffX) >= Math.abs(diffY);
      }
    }

    // If vertical scrolling, do not hijack gesture
    if (isHorizontalSwipeRef.current === false) {
      return;
    }

    if (isHorizontalSwipeRef.current === true) {
      hasMovedRef.current = true;
      currentXRef.current = clientX;
      // Add subtle resistance past 150px
      const clampedDiffX =
        Math.abs(diffX) > 160
          ? Math.sign(diffX) * (160 + (Math.abs(diffX) - 160) * 0.25)
          : diffX;
      setOffsetX(clampedDiffX);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || isDismissing) return;
    setIsDragging(false);

    if (Math.abs(offsetX) >= DISMISS_THRESHOLD) {
      // Trigger smooth dismiss animation
      const direction = offsetX > 0 ? 'right' : 'left';
      setDismissDirection(direction);
      setIsDismissing(true);

      // Slide fully offscreen
      setOffsetX(direction === 'right' ? 360 : -360);

      // Collapse height and trigger parent callback
      setTimeout(() => {
        setIsCollapsed(true);
        setTimeout(() => {
          onDismiss(notification.id);
        }, 220);
      }, 180);
    } else {
      // Snap back to original position
      setOffsetX(0);
      setTimeout(() => {
        hasMovedRef.current = false;
      }, 50);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // If the user swiped or dragged, prevent navigation
    if (hasMovedRef.current || Math.abs(offsetX) > 8 || isDismissing) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    onClick(notification);
  };

  const handleDirectDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDismissing) return;

    setDismissDirection('right');
    setIsDismissing(true);
    setOffsetX(360);

    setTimeout(() => {
      setIsCollapsed(true);
      setTimeout(() => {
        onDismiss(notification.id);
      }, 220);
    }, 180);
  };

  const absOffset = Math.abs(offsetX);
  const swipeProgress = Math.min(absOffset / DISMISS_THRESHOLD, 1);
  const opacity = isDismissing ? 0 : Math.max(1 - absOffset / 260, 0.35);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden transition-all duration-200 select-none ${
        isCollapsed ? 'max-h-0 opacity-0 mb-0 py-0 overflow-hidden' : 'max-h-40 mb-2'
      }`}
    >
      {/* Background revealed during swipe */}
      <div
        className={`absolute inset-0 rounded-xl flex items-center px-4 justify-between transition-colors ${
          isDark
            ? 'bg-gradient-to-r from-purple-950/80 via-rose-950/70 to-purple-950/80 border border-purple-500/30 text-purple-200'
            : 'bg-gradient-to-r from-purple-100 via-rose-100 to-purple-100 border border-purple-300 text-purple-900'
        }`}
        aria-hidden="true"
      >
        <div
          className={`flex items-center gap-1.5 font-bold text-xs transition-opacity duration-150 ${
            offsetX > 20 ? 'opacity-100 scale-105' : 'opacity-30'
          }`}
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span className="text-[11px] font-semibold text-rose-300">Dismiss</span>
        </div>
        <div
          className={`flex items-center gap-1.5 font-bold text-xs transition-opacity duration-150 ${
            offsetX < -20 ? 'opacity-100 scale-105' : 'opacity-30'
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-300">Dismiss</span>
          <Trash2 className="w-4 h-4 text-rose-400" />
        </div>
      </div>

      {/* Foreground Notification Card */}
      <div
        id={`notif-${notification.id}`}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onPointerDown={handleTouchStart}
        onPointerMove={handleTouchMove}
        onPointerUp={handleTouchEnd}
        onPointerCancel={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          opacity: opacity,
          transition: isDragging ? 'none' : 'transform 0.22s ease-out, opacity 0.22s ease-out'
        }}
        className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 group relative touch-pan-y ${
          notification.read
            ? isDark
              ? 'bg-zinc-950/90 border-zinc-800/60 text-zinc-400 hover:bg-zinc-900/80'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            : isDark
            ? 'bg-purple-950/50 border-purple-800/60 text-white hover:bg-purple-900/60 shadow-xs'
            : 'bg-purple-50/95 border-purple-200 text-purple-900 hover:bg-purple-100/70 shadow-xs'
        }`}
      >
        {/* Cover image or type icon */}
        {notification.coverImageUrl ? (
          <img
            src={notification.coverImageUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-purple-500/20 bg-zinc-900 pointer-events-none"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center pointer-events-none ${
              notification.type === 'premium'
                ? 'bg-amber-500/20 text-amber-400'
                : notification.type === 'new_series'
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}
          >
            {notification.type === 'premium' ? (
              <Sparkles className="w-4 h-4" />
            ) : notification.type === 'new_series' ? (
              <Tv className="w-4 h-4" />
            ) : (
              <Film className="w-4 h-4" />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className="font-bold text-xs truncate">{notification.title}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {!notification.read && (
                <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" title="Unread" />
              )}
              {/* Subtle dismiss button for mouse/accessibility */}
              <button
                type="button"
                onClick={handleDirectDismiss}
                className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition ${
                  isDark
                    ? 'text-zinc-500 hover:text-rose-400 hover:bg-zinc-800'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-slate-200'
                }`}
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p
            className={`text-[11px] mt-0.5 break-words line-clamp-2 leading-relaxed ${
              isDark ? 'text-zinc-400' : 'text-slate-600'
            }`}
          >
            {notification.message}
          </p>
          <div className="flex items-center justify-between mt-1.5 text-[10px] opacity-70">
            <span>{formatNotificationTime(notification.createdAt)}</span>
            <span className="text-[10px] group-hover:underline text-purple-400 font-medium">
              {notification.type === 'premium' ? 'View VIP' : 'Open details →'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
