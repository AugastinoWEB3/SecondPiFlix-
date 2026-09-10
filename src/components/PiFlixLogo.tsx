import React from 'react';

interface PiFlixLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
}

export const PiFlixLogo: React.FC<PiFlixLogoProps> = ({
  className = '',
  size = 'md',
  showTagline = false
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-11 h-11',
    xl: 'w-16 h-16'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl'
  };

  return (
    <div className={`inline-flex flex-col select-none ${className}`}>
      <div className="flex items-center gap-2.5">
        {/* Stylized 3D Ribbon 'P' with Play Icon */}
        <div className={`relative ${iconSizes[size]} shrink-0 flex items-center justify-center filter drop-shadow-[0_2px_10px_rgba(168,85,247,0.4)]`}>
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full overflow-visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="pRibbonGrad1" x1="15%" y1="10%" x2="90%" y2="90%">
                <stop offset="0%" stopColor="#C084FC" />
                <stop offset="45%" stopColor="#9333EA" />
                <stop offset="85%" stopColor="#6366F1" />
              </linearGradient>
              <linearGradient id="pRibbonGrad2" x1="80%" y1="15%" x2="20%" y2="85%">
                <stop offset="0%" stopColor="#EC4899" />
                <stop offset="50%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#4F46E5" />
              </linearGradient>
              <linearGradient id="playBtnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB7185" />
                <stop offset="100%" stopColor="#E11D48" />
              </linearGradient>
              <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Outer flowing 3D Ribbon P stem & loop */}
            <path
              d="M 32 88 L 32 28 C 32 16, 44 8, 62 8 C 80 8, 92 20, 92 38 C 92 56, 78 68, 58 68 L 44 68 C 38 68, 32 74, 32 88 Z"
              fill="url(#pRibbonGrad1)"
            />
            {/* Inner 3D twist ribbon fold */}
            <path
              d="M 44 26 C 44 20, 50 16, 62 16 C 74 16, 82 24, 82 38 C 82 50, 72 58, 58 58 L 44 58 Z"
              fill="#0F1017"
            />
            <path
              d="M 32 40 C 32 26, 44 14, 60 14 C 76 14, 86 24, 86 38 C 86 52, 74 62, 58 62 L 44 62 C 37 62, 32 50, 32 40 Z"
              fill="url(#pRibbonGrad2)"
              opacity="0.85"
            />
            {/* Center Play Button in the loop */}
            <polygon
              points="48,27 48,49 68,38"
              fill="url(#playBtnGrad)"
              filter="url(#glowEffect)"
            />
          </svg>
        </div>

        {/* Brand Wordmark: Pi (Dark in light mode / White in dark) + Flix (Berry Pink) + (Violet) */}
        <div className="flex items-baseline tracking-tight font-extrabold font-['Outfit']">
          <span className={`${textSizes[size]} text-slate-900 dark:text-white font-extrabold transition-colors`}>Pi</span>
          <span className={`${textSizes[size]} text-[#F43F5E] font-black`}>Flix</span>
          <span className={`${textSizes[size]} text-[#A855F7] font-black ml-0.5`}>+</span>
        </div>
      </div>

      {showTagline && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium tracking-wide mt-1 pl-0.5 transition-colors">
          Watch More. Discover More. Experience More.
        </span>
      )}
    </div>
  );
};
