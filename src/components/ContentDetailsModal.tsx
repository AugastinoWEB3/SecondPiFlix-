import React, { useState, useEffect } from 'react';
import { Play, Plus, Check, Heart, Share2, X, Star, Clock, Globe, Award, Sparkles, Send, Copy, MessageCircle, ArrowLeft, ChevronRight, Tv } from 'lucide-react';
import { Movie, TVSeries, Season, Episode, ContentRatingReview } from '../types';
import { useApp } from '../context/AppContext';
import { MovieCard } from './MovieCard';
import { UserAvatar } from './UserAvatar';
import { formatDuration } from '../lib/formatters';

interface ContentDetailsModalInnerProps {
  content: Movie | TVSeries;
}

const ContentDetailsModalInner: React.FC<ContentDetailsModalInnerProps> = ({ content }) => {
  const selectedContent = content;
  const {
    selectedContentType,
    closeDetails,
    playVideo,
    toggleWatchlist,
    isInWatchlist,
    likedIds,
    toggleLike,
    movies,
    seriesList,
    currentUser,
    refreshContent
  } = useApp();

  const isSeries = selectedContentType === 'series' || 'seasonsCount' in selectedContent;
  const inList = isInWatchlist(selectedContent.id);
  const isLiked = likedIds.includes(selectedContent.id);

  // TV Series Seasons & Episodes state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState<ContentRatingReview[]>([]);
  const [newRating, setNewRating] = useState<number>(9);
  const [newReviewText, setNewReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Share popup state
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Trailer preview state
  const [showTrailerPreview, setShowTrailerPreview] = useState(false);

  // Fetch Series details or Reviews
  useEffect(() => {
    if (isSeries) {
      setLoadingEpisodes(true);
      setSelectedSeasonNumber(null); // Step 1: Always navigate to the Seasons screen first

      // Pre-populate if already attached to selectedContent
      let sList: Season[] = [];
      let eList: Episode[] = [];

      if (Array.isArray((selectedContent as any).seasons)) {
        sList = (selectedContent as any).seasons.filter((s: Season) => s.seriesId === selectedContent.id);
      }
      if (Array.isArray((selectedContent as any).episodes)) {
        eList = (selectedContent as any).episodes.filter((e: Episode) => e.seriesId === selectedContent.id);
      }

      if (sList.length > 0) setSeasons(sList);
      if (eList.length > 0) setEpisodes(eList);

      fetch(`/api/series/${selectedContent.id}`)
        .then(r => r.json())
        .then(data => {
          let fetchedSeasons: Season[] = [];
          let fetchedEpisodes: Episode[] = [];

          if (Array.isArray(data.seasons)) {
            fetchedSeasons = data.seasons.filter((sn: Season) => sn.seriesId === selectedContent.id);
          }
          if (Array.isArray(data.episodes)) {
            fetchedEpisodes = data.episodes.filter((ep: Episode) => ep.seriesId === selectedContent.id);
          }

          // Fallback: If seasons list is empty but episodes exist, infer seasons from episodes
          if (fetchedSeasons.length === 0 && fetchedEpisodes.length > 0) {
            const seasonNums = Array.from(new Set(fetchedEpisodes.map(e => e.seasonNumber || 1))).sort((a, b) => a - b);
            fetchedSeasons = seasonNums.map(num => ({
              id: `sn-${selectedContent.id}-${num}`,
              seriesId: selectedContent.id,
              seasonNumber: num,
              title: `Season ${num}`,
              episodesCount: fetchedEpisodes.filter(e => (e.seasonNumber || 1) === num).length
            }));
          } else if (fetchedSeasons.length === 0 && 'seasonsCount' in selectedContent && (selectedContent as TVSeries).seasonsCount) {
            const count = (selectedContent as TVSeries).seasonsCount || 1;
            fetchedSeasons = Array.from({ length: count }, (_, i) => ({
              id: `sn-${selectedContent.id}-${i + 1}`,
              seriesId: selectedContent.id,
              seasonNumber: i + 1,
              title: `Season ${i + 1}`,
              episodesCount: fetchedEpisodes.filter(e => (e.seasonNumber || 1) === (i + 1)).length
            }));
          }

          if (fetchedSeasons.length > 0) setSeasons(fetchedSeasons);
          if (fetchedEpisodes.length > 0) setEpisodes(fetchedEpisodes);
          setLoadingEpisodes(false);
        })
        .catch(() => setLoadingEpisodes(false));
    }

    // Fetch reviews
    fetch(`/api/reviews/${selectedContent.id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setReviews(data);
      })
      .catch(() => {});
  }, [selectedContent.id, isSeries]);

  // Filter episodes strictly for the selected TV series and selected season
  const currentSeasonObj = selectedSeasonNumber !== null
    ? (seasons.find(s => s.seasonNumber === selectedSeasonNumber) || null)
    : null;

  const currentSeasonEpisodes = selectedSeasonNumber !== null
    ? episodes
        .filter(ep => {
          if (ep.seriesId && ep.seriesId !== selectedContent.id) return false;
          if (currentSeasonObj?.id && ep.seasonId === currentSeasonObj.id) return true;
          return (ep.seasonNumber || 1) === selectedSeasonNumber;
        })
        .sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
    : [];

  // Recommendation engine: find items with matching genres or language
  const allContent: (Movie | TVSeries)[] = [...movies, ...seriesList];
  const recommendations = allContent.filter(item => {
    if (item.id === selectedContent.id) return false;
    const commonGenres = item.genre.filter(g => selectedContent.genre.includes(g));
    const sameLanguage = item.language === selectedContent.language;
    return commonGenres.length > 0 || sameLanguage;
  }).slice(0, 6);

  // Submit a review
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewText.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          userImage: currentUser.profileImage,
          contentId: selectedContent.id,
          rating: newRating,
          review: newReviewText.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.review) {
        setReviews(prev => {
          const filtered = prev.filter(r => r.userId !== currentUser.id && r.id !== data.review.id);
          return [data.review, ...filtered];
        });
        setNewReviewText('');
        refreshContent();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const shareUrl = window.location.origin + '?content=' + selectedContent.id;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex justify-center p-0 sm:p-4 md:p-6 animate-fade-in">
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={closeDetails} />

      {/* Modal Card */}
      <div className="relative w-full max-w-5xl bg-[#0e1018] rounded-none sm:rounded-2xl border border-zinc-800/80 shadow-2xl overflow-hidden z-10 my-auto text-zinc-100">
        {/* Close Button */}
        <button
          onClick={closeDetails}
          className="absolute top-4 right-4 z-40 p-2.5 rounded-full bg-black/60 hover:bg-black text-white/80 hover:text-white border border-white/10 backdrop-blur-md transition shadow-lg"
          title="Close details"
        >
          <X className="w-5 h-5" />
        </button>

        {/* HERO SECTION IN MODAL */}
        <div className="relative w-full h-[360px] sm:h-[440px] overflow-hidden bg-zinc-950">
          <img
            src={selectedContent.backdrop || selectedContent.poster}
            alt={selectedContent.title}
            className="w-full h-full object-cover"
          />

          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1018] via-[#0e1018]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0e1018] via-transparent to-transparent w-2/3" />

          {/* Hero Content on Backdrop */}
          <div className="absolute bottom-5 sm:bottom-6 left-5 sm:left-6 right-5 sm:right-6 flex flex-col items-start text-left justify-end gap-2.5 sm:gap-3 max-w-2xl sm:max-w-3xl z-20">
            {/* Badges & Metadata starting from LEFT */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {selectedContent.isPremium && (
                <span className="bg-gradient-to-r from-amber-500 to-rose-500 text-black font-extrabold text-[10px] px-2 py-0.5 rounded shadow flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  PIFLIX+ VIP
                </span>
              )}
              {/* Movie/Series type badge */}
              <span className="bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                {isSeries ? 'Series' : 'Movie'}
              </span>
              {/* Year */}
              <span className="text-zinc-300 text-xs font-semibold">{selectedContent.year}</span>
              {/* Rating */}
              <div className="flex items-center gap-1 text-amber-400 font-bold bg-black/40 backdrop-blur-md px-2 py-0.5 rounded border border-white/10 text-xs">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span>{selectedContent.rating} / 10</span>
              </div>
              {/* Language */}
              <span className="text-zinc-400">•</span>
              <span className="text-zinc-300 text-xs">{selectedContent.language}</span>
              {/* Duration */}
              {'duration' in selectedContent && Boolean((selectedContent as Movie).duration) && (
                <>
                  <span className="text-zinc-400">•</span>
                  <span className="flex items-center gap-1 text-zinc-300 text-xs">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {formatDuration((selectedContent as Movie).duration)}
                  </span>
                </>
              )}
              {isSeries && 'seasonsCount' in selectedContent && (
                <>
                  <span className="text-zinc-400">•</span>
                  <span className="text-purple-300 font-semibold text-xs">
                    {(selectedContent as TVSeries).seasonsCount} Season{(selectedContent as TVSeries).seasonsCount > 1 ? 's' : ''}
                  </span>
                </>
              )}
              {/* Resolution / quality */}
              {selectedContent.qualityBadge && (
                <span className="border border-white/20 text-zinc-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {selectedContent.qualityBadge}
                </span>
              )}
              {selectedContent.ageClassification && (
                <span className="border border-white/20 text-zinc-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {selectedContent.ageClassification}
                </span>
              )}
            </div>

            {/* Movie/Series title */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-md text-left">
              {selectedContent.title}
            </h1>

            {/* Genres / category information */}
            {selectedContent.genre && selectedContent.genre.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 text-left">
                {selectedContent.genre.map((g, idx) => (
                  <span key={g} className="flex items-center gap-2">
                    <span className="bg-zinc-900/70 backdrop-blur-md px-2 py-0.5 rounded border border-zinc-700/60 text-zinc-300">
                      {g}
                    </span>
                    {idx < selectedContent.genre.length - 1 && <span className="text-zinc-600 hidden sm:inline">•</span>}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis / description */}
            {selectedContent.description && (
              <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow max-w-2xl font-normal text-left">
                {selectedContent.description}
              </p>
            )}

            {/* Action buttons starting from LEFT */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1">
              {/* Watch Now / View Seasons button */}
              <button
                onClick={() => {
                  if (isSeries) {
                    setSelectedSeasonNumber(null);
                    const el = document.getElementById('seasons-section');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth' });
                    }
                  } else {
                    playVideo(selectedContent);
                  }
                }}
                className="px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg hover:scale-105 transition active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isSeries ? 'View Seasons' : 'Watch Now'}</span>
              </button>

              {/* My List / add button */}
              <button
                onClick={() => toggleWatchlist(selectedContent.id, isSeries ? 'series' : 'movie')}
                className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-zinc-900/80 hover:bg-zinc-800 text-white font-semibold rounded-xl text-xs sm:text-sm border border-zinc-700/70 transition hover:scale-105 flex items-center gap-1.5 backdrop-blur-md"
                title={inList ? 'In Watchlist' : 'Add to Watchlist'}
              >
                {inList ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>In Watchlist</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>My List</span>
                  </>
                )}
              </button>

              {/* Like / favorite button */}
              <button
                onClick={() => toggleLike(selectedContent.id)}
                className="p-2.5 sm:p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-xl border border-zinc-700/70 transition hover:scale-105 backdrop-blur-md"
                title="Like"
              >
                <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-300'}`} />
              </button>

              {/* Share button */}
              <button
                onClick={() => setShowShareModal(prev => !prev)}
                className="p-2.5 sm:p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-xl border border-zinc-700/70 transition hover:scale-105 backdrop-blur-md"
                title="Share"
              >
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-300" />
              </button>
            </div>
          </div>
        </div>

        {/* SHARE MODAL POPUP */}
        {showShareModal && (
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-3 text-xs text-zinc-300">
              <span className="font-semibold text-white">Share {selectedContent.title}:</span>
              {/* WhatsApp */}
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out ${selectedContent.title} on PiFlix+: ${shareUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1.5 transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
              {/* Telegram */}
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Watch ${selectedContent.title} on PiFlix+`)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 border border-sky-500/30 rounded-lg flex items-center gap-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Telegram</span>
              </a>
              {/* X / Twitter */}
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Streaming ${selectedContent.title} on PiFlix+ #PiNetwork #PiFlix`)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600 rounded-lg flex items-center gap-1.5 transition"
              >
                <span>X / Twitter</span>
              </a>
            </div>

            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Copied Link!' : 'Copy Link'}</span>
            </button>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="p-6 md:p-8 space-y-8">
          {/* Main Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left 2 Cols: Synopsis & Details */}
            <div className="md:col-span-2 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Synopsis</h2>
              <p className="text-zinc-200 text-sm sm:text-base leading-relaxed">
                {selectedContent.description}
              </p>

              {/* Genre Chips */}
              <div className="pt-2">
                <span className="text-xs font-semibold text-zinc-400 block mb-2">Genres:</span>
                <div className="flex flex-wrap gap-2">
                  {selectedContent.genre?.map(g => (
                    <span
                      key={g}
                      className="px-3 py-1 bg-zinc-800/80 border border-zinc-700 text-zinc-300 text-xs rounded-lg font-medium"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 1 Col: Metadata & Cast Box */}
            <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80 space-y-3.5 text-xs">
              <div>
                <span className="text-zinc-500 block mb-0.5">Director</span>
                <span className="text-white font-semibold text-sm">{selectedContent.director}</span>
              </div>

              <div>
                <span className="text-zinc-500 block mb-0.5">Country & Origin</span>
                <span className="text-white font-semibold text-sm flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                  {selectedContent.country}
                </span>
              </div>

              <div>
                <span className="text-zinc-500 block mb-0.5">Starring Cast</span>
                <p className="text-zinc-300 leading-normal">
                  {selectedContent.cast?.join(', ')}
                </p>
              </div>

              {selectedContent.tags && selectedContent.tags.length > 0 && (
                <div>
                  <span className="text-zinc-500 block mb-1">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedContent.tags.map(t => (
                      <span key={t} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TV SERIES SEASONS & EPISODES SECTION */}
          {isSeries && (
            <div id="seasons-section" className="pt-6 border-t border-zinc-800/80 space-y-4">
              {selectedSeasonNumber === null ? (
                /* STEP 1 & 2: SEASONS SCREEN FOR THIS SPECIFIC TV SERIES */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        <Tv className="w-5 h-5 text-purple-400" />
                        <span>Seasons</span>
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Select a season to view its episodes
                      </p>
                    </div>

                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300">
                      {seasons.length} {seasons.length === 1 ? 'Season' : 'Seasons'} Available
                    </span>
                  </div>

                  {loadingEpisodes ? (
                    <div className="py-12 flex justify-center items-center gap-2 text-zinc-400 text-xs">
                      <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span>Loading seasons...</span>
                    </div>
                  ) : seasons.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-sm">
                      No seasons available for this series.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      {seasons.map(sn => {
                        const count = episodes.filter(
                          ep => ep.seriesId === selectedContent.id && (ep.seasonNumber === sn.seasonNumber || (sn.id && ep.seasonId === sn.id))
                        ).length;
                        return (
                          <button
                            key={sn.id || sn.seasonNumber}
                            onClick={() => setSelectedSeasonNumber(sn.seasonNumber)}
                            className="group flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 hover:bg-purple-950/40 border border-zinc-800/80 hover:border-purple-500/60 text-left transition-all duration-200 hover:scale-[1.02] shadow-sm cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="px-2.5 py-1 rounded-md bg-purple-950/80 border border-purple-500/40 text-xs font-extrabold text-purple-300">
                                {sn.seasonName || `Season ${sn.seasonNumber}`}
                              </span>
                              <span className="text-xs text-zinc-400 group-hover:text-zinc-300 font-medium">
                                {count > 0 ? `${count} ${count === 1 ? 'Episode' : 'Episodes'}` : `${sn.episodesCount || 0} Episodes`}
                              </span>
                            </div>

                            <div className="mt-3">
                              <h3 className="text-sm font-bold text-white group-hover:text-purple-200 line-clamp-1">
                                {sn.title || sn.seasonName || `Season ${sn.seasonNumber}`}
                              </h3>
                              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-purple-400 font-semibold group-hover:text-purple-300">
                                <span>View Episodes</span>
                                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* STEP 3: EPISODES LIST FOR THAT SPECIFIC TV SERIES + SEASON */
                <div id="episodes-section" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedSeasonNumber(null)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>All Seasons</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white">
                          {currentSeasonObj?.seasonName || currentSeasonObj?.title || `Season ${selectedSeasonNumber}`}
                        </h2>
                        <span className="text-xs text-zinc-400">
                          ({currentSeasonEpisodes.length} {currentSeasonEpisodes.length === 1 ? 'Episode' : 'Episodes'})
                        </span>
                      </div>
                    </div>

                    {/* Quick Season Switcher if multiple seasons exist */}
                    {seasons.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        {seasons.map(sn => (
                          <button
                            key={sn.id || sn.seasonNumber}
                            onClick={() => setSelectedSeasonNumber(sn.seasonNumber)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                              selectedSeasonNumber === sn.seasonNumber
                                ? 'bg-purple-600 text-white'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                            }`}
                          >
                            {sn.seasonName || `Season ${sn.seasonNumber}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Episodes List for this season */}
                  <div className="space-y-2.5">
                    {currentSeasonEpisodes.length === 0 ? (
                      <div className="py-8 text-center text-zinc-500 text-sm">
                        No episodes found for this season.
                      </div>
                    ) : (
                      currentSeasonEpisodes.map(ep => (
                        <div
                          key={ep.id}
                          onClick={() => playVideo(selectedContent, ep)}
                          className="group/ep flex items-center justify-between gap-4 p-3.5 rounded-xl bg-zinc-900/40 hover:bg-zinc-800/60 border border-zinc-800/60 hover:border-purple-500/40 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <span className="shrink-0 px-2.5 py-1 rounded-md bg-purple-950/80 border border-purple-500/30 text-purple-300 font-extrabold text-xs">
                              Ep {ep.episodeNumber}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-bold text-white group-hover/ep:text-purple-300 transition truncate">
                                {ep.title}
                              </h3>
                              {ep.description && (
                                <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed mt-0.5">
                                  {ep.description}
                                </p>
                              )}
                            </div>
                            {ep.duration ? (
                              <span className="shrink-0 text-xs font-medium text-zinc-400">
                                {formatDuration(ep.duration)}
                              </span>
                            ) : null}
                          </div>

                          {/* STEP 4: Play specific episode */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playVideo(selectedContent, ep);
                            }}
                            className="shrink-0 px-4 py-2 bg-zinc-800 group-hover/ep:bg-purple-600 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* USER REVIEWS & RATINGS SECTION */}
          <div className="pt-6 border-t border-zinc-800/80 space-y-4">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Audience Reviews & Community Ratings</span>
              <span className="text-xs text-zinc-500 font-normal">({reviews.length})</span>
            </h2>

            {/* Leave a review form */}
            <form onSubmit={handleReviewSubmit} className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Your Rating</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setNewRating(star)}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        newRating >= star ? 'text-amber-400 font-bold' : 'text-zinc-600'
                      }`}
                    >
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Share your thoughts about this movie or series..."
                  value={newReviewText}
                  onChange={e => setNewReviewText(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={submittingReview || !newReviewText.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post</span>
                </button>
              </div>
            </form>

            {/* Reviews list */}
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No reviews yet. Be the first Pioneer to review!</p>
              ) : (
                reviews.map(r => (
                  <div key={r.id} className="p-3.5 bg-zinc-900/40 rounded-xl border border-zinc-800/60 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          user={{ username: r.username, profileImage: r.userImage }}
                          sizeClass="w-5 h-5"
                          textClass="text-[10px]"
                          isDark={true}
                        />
                        <span className="font-semibold text-white">{r.username}</span>
                      </div>
                      <div className="flex items-center gap-1 text-amber-400 font-bold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{r.rating}/10</span>
                      </div>
                    </div>
                    <p className="text-zinc-300 leading-relaxed pl-7">{r.review}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* YOU MAY ALSO LIKE / RECOMMENDATIONS */}
          {recommendations.length > 0 && (
            <div className="pt-6 border-t border-zinc-800/80 space-y-4">
              <h2 className="text-lg font-bold text-white tracking-tight">
                You May Also Like
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
                {recommendations.map(rec => (
                  <MovieCard key={rec.id} content={rec} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ContentDetailsModal: React.FC = () => {
  const { selectedContent } = useApp();

  if (!selectedContent) return null;

  return <ContentDetailsModalInner key={selectedContent.id} content={selectedContent} />;
};
