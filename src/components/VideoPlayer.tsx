import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, SkipForward, ArrowLeft, Settings, Subtitles, ShieldAlert, Sparkles, ExternalLink, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Episode, Movie, TVSeries, AdData } from '../types';
import { sampleAds } from '../data/mockData';

function formatTime(sec: number) {
  if (isNaN(sec)) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

interface VideoPlayerInnerProps {
  activeItem: {
    content: Movie | TVSeries;
    episode?: Episode;
    initialSeek?: number;
  };
}

const VideoPlayerInner: React.FC<VideoPlayerInnerProps> = ({ activeItem }) => {
  const {
    closePlayer,
    currentUser,
    settings,
    recordProgress,
    playVideo,
    seriesList,
    openPiPayment
  } = useApp();

  const { content, episode, initialSeek = 0 } = activeItem;
  const isSeries = 'seasonsCount' in content || Boolean(episode);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(initialSeek);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [selectedSubtitle, setSelectedSubtitle] = useState('English');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [resumeNotification, setResumeNotification] = useState<string | null>(
    initialSeek > 10 ? `Resumed from ${formatTime(initialSeek)}` : null
  );

  // Ad Interstitial System State
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [currentAd, setCurrentAd] = useState<AdData | null>(null);
  const [adSecondsLeft, setAdSecondsLeft] = useState(0);
  const [canSkipAd, setCanSkipAd] = useState(false);
  const [adSkipCountdown, setAdSkipCountdown] = useState(5);
  const lastAdWatchedPlaybackTime = useRef<number>(0);
  const adTriggerIntervalRef = useRef<number>(settings.adIntervalMinutes * 60);

  // Free watching limits in seconds (e.g. 5 minutes = 300s)
  const freeThresholdSec = (settings.freeViewingDurationMinutes || 5) * 60;
  const adIntervalSec = (settings.adIntervalMinutes || 2) * 60;

  // Determine video URL
  const streamUrl = episode?.hlsUrl || episode?.videoUrl || (content as Movie).hlsUrl || (content as Movie).videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';

  // Clear resume notification after 4 seconds
  useEffect(() => {
    if (resumeNotification) {
      const t = setTimeout(() => setResumeNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [resumeNotification]);

  // Hls.js stream initialization
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    setIsLoading(true);
    setHasError(false);

    if (streamUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          if (initialSeek > 0) {
            video.currentTime = initialSeek;
          }
          video.play().catch(() => setIsPlaying(false));
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.warn('HLS fatal error, falling back to MP4 stream', data);
            hls?.destroy();
            video.src = (content as Movie).videoUrl || episode?.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';
            video.load();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari/iOS HLS
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          if (initialSeek > 0) video.currentTime = initialSeek;
          video.play().catch(() => setIsPlaying(false));
        });
      }
    } else {
      video.src = streamUrl;
      video.load();
      if (initialSeek > 0) {
        video.currentTime = initialSeek;
      }
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [streamUrl]);

  // Save progress periodically to backend
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && duration > 0 && !isAdPlaying) {
        const curr = videoRef.current.currentTime;
        recordProgress(
          content.id,
          isSeries ? 'series' : 'movie',
          curr,
          duration,
          episode?.id
        );
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [content.id, duration, episode?.id, isAdPlaying]);

  // Check Ad interstitial requirement during playback
  const checkAdRequirement = (curTime: number) => {
    // If user is premium, completely bypass ads!
    if (currentUser.premiumStatus) return;
    if (isAdPlaying) return;

    // Rule:
    // 1. If curTime >= freeThresholdSec and lastAdWatchedPlaybackTime is 0: trigger first ad
    // 2. If curTime - lastAdWatchedPlaybackTime >= adIntervalSec: trigger recurrent ad
    const timeSinceLastAd = curTime - lastAdWatchedPlaybackTime.current;

    if (
      (lastAdWatchedPlaybackTime.current === 0 && curTime >= freeThresholdSec) ||
      (lastAdWatchedPlaybackTime.current > 0 && timeSinceLastAd >= adIntervalSec)
    ) {
      triggerAdInterstitial();
    }
  };

  const triggerAdInterstitial = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    const chosenAd = sampleAds[Math.floor(Math.random() * sampleAds.length)];
    setCurrentAd(chosenAd);
    setIsAdPlaying(true);
    setAdSecondsLeft(chosenAd.durationSec);
    setAdSkipCountdown(chosenAd.skipAfterSec);
    setCanSkipAd(false);

    // Send impression to API
    fetch('/api/ads/impression', { method: 'POST' }).catch(() => {});
  };

  // Ad countdown timer
  useEffect(() => {
    if (!isAdPlaying) return;
    const interval = setInterval(() => {
      setAdSecondsLeft(prev => {
        if (prev <= 1) {
          finishAd();
          return 0;
        }
        return prev - 1;
      });

      setAdSkipCountdown(prev => {
        if (prev <= 1) {
          setCanSkipAd(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAdPlaying]);

  const finishAd = () => {
    setIsAdPlaying(false);
    setCurrentAd(null);
    if (videoRef.current) {
      lastAdWatchedPlaybackTime.current = videoRef.current.currentTime;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Control bar auto-hide
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isAdPlaying) {
        setShowControls(false);
        setShowSettingsMenu(false);
      }
    }, 3500);
  };

  const togglePlay = () => {
    if (isAdPlaying) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const seek = (seconds: number) => {
    if (!videoRef.current || isAdPlaying) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || isAdPlaying || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const target = pos * duration;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    checkAdRequirement(target);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Episode skip intro
  const skipIntroSec = episode?.skipIntroSec || 12;
  const isWithinIntroWindow = currentTime > 0 && currentTime < skipIntroSec;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* Main Streaming Video Element */}
      <video
        ref={videoRef}
        playsInline
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onTimeUpdate={() => {
          if (videoRef.current) {
            const cur = videoRef.current.currentTime;
            setCurrentTime(cur);
            checkAdRequirement(cur);
          }
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setIsLoading(false);
          }
        }}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />

      {/* Buffering Loading Indicator */}
      {isLoading && !isAdPlaying && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-14 h-14 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium text-white/90">Buffering PiFlix+ Stream...</p>
        </div>
      )}

      {/* Playback Error Screen */}
      {hasError && (
        <div className="absolute inset-0 z-40 bg-[#0c0d14]/95 flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert className="w-14 h-14 text-rose-500 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Video Unavailable</h2>
          <p className="text-sm text-zinc-400 max-w-md mb-6">
            We couldn't load this video stream. Please check your network connection or verify the streaming source URL.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setHasError(false);
                setIsLoading(true);
                if (videoRef.current) videoRef.current.load();
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg text-sm transition"
            >
              Retry Stream
            </button>
            <button
              onClick={closePlayer}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg text-sm transition"
            >
              Exit Player
            </button>
          </div>
        </div>
      )}

      {/* Resume Notification Alert */}
      {resumeNotification && !isAdPlaying && (
        <div className="absolute top-20 left-8 z-30 bg-purple-900/80 backdrop-blur-md border border-purple-500/30 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>{resumeNotification}</span>
        </div>
      )}

      {/* Skip Intro Button */}
      {isWithinIntroWindow && !isAdPlaying && (
        <button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.currentTime = skipIntroSec;
              setCurrentTime(skipIntroSec);
            }
          }}
          className="absolute bottom-28 right-8 z-30 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-xl transition flex items-center gap-2 group"
        >
          <SkipForward className="w-4 h-4 text-purple-400 group-hover:translate-x-0.5 transition" />
          <span>Skip Intro</span>
        </button>
      )}

      {/* Demo helper badge: Quick trigger ad */}
      {!currentUser.premiumStatus && !isAdPlaying && (
        <button
          onClick={triggerAdInterstitial}
          title="Demo Feature: Instantly trigger the ad interstitial system to test free-tier ad requirement"
          className="absolute top-20 right-8 z-30 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs px-3 py-1.5 rounded-md border border-zinc-700/60 transition flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Test Ad Interstitial</span>
        </button>
      )}

      {/* AD INTERSTITIAL SYSTEM OVERLAY (Section 12) */}
      {isAdPlaying && currentAd && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col justify-between p-6 md:p-10 animate-fade-in">
          {/* Ad Top Bar */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <span className="bg-amber-500 text-black font-extrabold text-[11px] px-2.5 py-1 rounded tracking-wider uppercase">
                Advertisement
              </span>
              <span className="text-white text-sm font-medium opacity-80">
                Sponsored by <strong className="text-white">{currentAd.brandName}</strong>
              </span>
            </div>

            <button
              onClick={() => openPiPayment('monthly')}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-2 shadow-lg transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Go Premium with Pi — Remove Ads</span>
            </button>
          </div>

          {/* Ad Video / Content Visual */}
          <div className="relative my-auto w-full max-w-4xl mx-auto rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl">
            <video
              src={currentAd.videoUrl}
              autoPlay
              playsInline
              className="w-full max-h-[60vh] object-cover"
              onEnded={finishAd}
            />

            {/* Ad Banner Card inside */}
            <div className="p-5 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">{currentAd.title}</h3>
                <p className="text-xs text-zinc-400">Support free streaming on PiFlix+ by watching sponsored partner messages.</p>
              </div>

              <a
                href={currentAd.clickUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition"
              >
                <span>{currentAd.callToAction}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Ad Bottom Controls: Countdown & Skip Button */}
          <div className="flex items-center justify-between z-10">
            <div className="text-xs text-zinc-400">
              Video resumes in: <span className="text-white font-bold text-sm ml-1">{adSecondsLeft}s</span>
            </div>

            {canSkipAd ? (
              <button
                onClick={finishAd}
                className="px-6 py-2.5 bg-white text-black hover:bg-zinc-200 font-bold text-sm rounded-lg shadow-xl transition flex items-center gap-2"
              >
                <span>Skip Ad & Continue Movie</span>
                <SkipForward className="w-4 h-4" />
              </button>
            ) : (
              <div className="px-5 py-2 bg-zinc-900/90 border border-zinc-700 text-zinc-400 text-xs rounded-lg">
                Skip in <strong className="text-white font-bold">{adSkipCountdown}s</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOP HEADER CONTROLS */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls && !isAdPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={closePlayer}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md"
              title="Back to Browse"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
                {isSeries && episode ? `${content.title} — ${episode.title}` : content.title}
              </h1>
              <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                <span>{content.year}</span>
                <span>•</span>
                <span>{content.language}</span>
                <span>•</span>
                <span className="text-purple-400 font-semibold">{content.qualityBadge || '4K'}</span>
                {currentUser.premiumStatus ? (
                  <span className="bg-gradient-to-r from-amber-500 to-pink-500 text-black text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ml-1">
                    VIP Ad-Free
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400 ml-1">
                    Free Stream (Ad-Supported)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROLS BAR */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 px-6 pb-6 pt-12 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          showControls && !isAdPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Seek Bar */}
          <div
            onClick={handleProgressBarClick}
            className="group relative h-2 hover:h-3 w-full bg-white/20 rounded-full cursor-pointer transition-all flex items-center"
          >
            {/* Progress fill */}
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full relative"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform" />
            </div>

            {/* Free watching threshold indicator marker */}
            {!currentUser.premiumStatus && freeThresholdSec < duration && (
              <div
                title="Free watching threshold (Ad required after this)"
                className="absolute top-0 bottom-0 w-1 bg-amber-400 rounded-full"
                style={{ left: `${(freeThresholdSec / duration) * 100}%` }}
              />
            )}
          </div>

          {/* Buttons Row */}
          <div className="flex items-center justify-between pt-1">
            {/* Left Controls */}
            <div className="flex items-center gap-3 md:gap-5 text-white">
              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="p-2 hover:text-purple-400 transition"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
              </button>

              {/* 10s Rewind */}
              <button
                onClick={() => seek(-10)}
                className="p-2 hover:text-purple-400 transition"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {/* 10s Forward */}
              <button
                onClick={() => seek(10)}
                className="p-2 hover:text-purple-400 transition"
                title="Forward 10 seconds"
              >
                <RotateCw className="w-5 h-5" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 group/vol">
                <button onClick={toggleMute} className="p-1 hover:text-purple-400 transition">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 md:w-20 accent-purple-500 h-1 cursor-pointer"
                />
              </div>

              {/* Time display */}
              <div className="text-xs text-zinc-300 font-medium tracking-wide">
                <span>{formatTime(currentTime)}</span>
                <span className="mx-1 text-zinc-500">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3 md:gap-4 text-white">
              {/* Settings / Quality / Speed Menu Trigger */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu(prev => !prev)}
                  className="p-2 hover:text-purple-400 transition"
                  title="Player Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>

                {/* Settings Popup */}
                {showSettingsMenu && (
                  <div className="absolute bottom-12 right-0 w-64 bg-zinc-900/95 border border-zinc-700/80 backdrop-blur-md rounded-xl p-3 shadow-2xl text-xs space-y-3">
                    <div>
                      <span className="text-zinc-400 font-semibold block mb-1">Playback Quality</span>
                      <div className="grid grid-cols-4 gap-1">
                        {['Auto', '1080p', '720p', '4K'].map(q => (
                          <button
                            key={q}
                            onClick={() => setSelectedQuality(q)}
                            className={`py-1 rounded text-center font-medium transition ${
                              selectedQuality === q
                                ? 'bg-purple-600 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-400 font-semibold block mb-1">Playback Speed</span>
                      <div className="grid grid-cols-4 gap-1">
                        {[0.75, 1, 1.25, 1.5].map(s => (
                          <button
                            key={s}
                            onClick={() => {
                              setPlaybackSpeed(s);
                              if (videoRef.current) videoRef.current.playbackRate = s;
                            }}
                            className={`py-1 rounded text-center font-medium transition ${
                              playbackSpeed === s
                                ? 'bg-purple-600 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-400 font-semibold block mb-1">Subtitles</span>
                      <div className="grid grid-cols-3 gap-1">
                        {['Off', 'English', 'Swahili'].map(sub => (
                          <button
                            key={sub}
                            onClick={() => setSelectedSubtitle(sub)}
                            className={`py-1 rounded text-center font-medium transition ${
                              selectedSubtitle === sub
                                ? 'bg-purple-600 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:text-purple-400 transition"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const VideoPlayer: React.FC = () => {
  const { activePlayingItem } = useApp();

  if (!activePlayingItem) return null;

  return (
    <VideoPlayerInner
      key={activePlayingItem.content.id + (activePlayingItem.episode?.id || '')}
      activeItem={activePlayingItem}
    />
  );
};
