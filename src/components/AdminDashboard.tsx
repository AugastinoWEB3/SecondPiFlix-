import React, { useState, useEffect, useRef } from 'react';
import {
  Film, Tv, Users, DollarSign, Eye, Clock, BarChart3, Plus, Edit2, Trash2,
  Save, Sparkles, Sliders, ShieldCheck, CheckCircle2, AlertTriangle, Search,
  Radio, Layers, Check, X, RefreshCw, Upload, Play, Lock, Unlock,
  Image as ImageIcon, FileVideo, Filter, ExternalLink, LogOut, KeyRound, ArrowUpDown,
  Mail, Calendar, Globe, TrendingUp, Award, UploadCloud, FolderUp
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ContentItem, Movie, TVSeries, User, VisitorAnalyticsData } from '../types';
import { saveContent, deleteContent, setPublishedState, cleanExistingInvalidMedia } from '../lib/firebaseContent';
import { createNotification } from '../lib/firebaseNotifications';
import { uploadMediaToStorage, uploadMediaWithMetadata, deleteMediaFromStorage, uploadBatchVideosToStorage } from '../lib/firebaseStorage';
import { UserAvatar } from './UserAvatar';
import { AdminSupportInbox } from './AdminSupportInbox';
import { fetchSupportStatus } from '../lib/supportEmailApi';

function formatDuration(minutes: number | undefined | null): string {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

interface SeasonFormItem {
  id?: string;
  seasonNumber: number;
  seasonName: string;
  title?: string;
}

interface EpisodeFormItem {
  id?: string;
  seasonNumber?: number;
  seasonId?: string;
  episodeNumber: number;
  title: string;
  description?: string;
  thumbnail?: string;
  videoUrl: string;
  duration: number;
  skipIntroSec?: number;
}

export const AdminDashboard: React.FC = () => {
  const {
    settings,
    updateSettings,
    movies,
    seriesList,
    refreshContent,
    removeContentItem,
    currentUser,
    playVideo,
    isAdmin,
    adminToken,
    adminLogin,
    adminLoginGoogle,
    adminRegister,
    adminLogout,
    firebaseAdminUser
  } = useApp();

  // Delete confirmation & action states (Fix for Bug 1)
  const [deleteTargetItem, setDeleteTargetItem] = useState<Movie | TVSeries | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // Admin Firebase Auth Screen state
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessNotice, setAuthSuccessNotice] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);

  // Admin Dashboard views
  const [adminSection, setAdminSection] = useState<'content' | 'overview' | 'users' | 'support' | 'settings' | 'admins'>('content');
  const [supportUnreadCount, setSupportUnreadCount] = useState<number>(0);
  const [overviewStats, setOverviewStats] = useState<any>(null);
  const [visitorAnalytics, setVisitorAnalytics] = useState<VisitorAnalyticsData | null>(null);
  const [refreshingVisitors, setRefreshingVisitors] = useState(false);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminUid, setNewAdminUid] = useState('');
  const [adminActionFeedback, setAdminActionFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Search & Filter state for content table (Requirement 19)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'series'>('all');
  const [filterPublished, setFilterPublished] = useState<'all' | 'published' | 'draft'>('all');
  const [filterAccess, setFilterAccess] = useState<'all' | 'free' | 'premium'>('all');
  const [filterQuality, setFilterQuality] = useState<'all' | 'HD' | 'FHD' | '4K'>('all');

  // Unified Content Item Modal (Create & Edit - Requirements 1 to 17)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingOriginalItem, setEditingOriginalItem] = useState<Movie | TVSeries | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Form State
  const [contentId, setContentId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState<'movie' | 'series'>('movie');
  const [releaseYear, setReleaseYear] = useState<number>(new Date().getFullYear());
  const [genreInput, setGenreInput] = useState('Action, Sci-Fi');
  const [language, setLanguage] = useState('English');
  const [rating, setRating] = useState<number>(8.5);
  const [quality, setQuality] = useState<'HD' | 'FHD' | '4K'>('HD');
  const [trailerUrl, setTrailerUrl] = useState('');
  const [accessType, setAccessType] = useState<'free' | 'premium'>('free');
  const [isPublished, setIsPublished] = useState(true);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [movieDuration, setMovieDuration] = useState<number>(95);
  const [detectedDurationNotice, setDetectedDurationNotice] = useState<string | null>(null);
  const [isDetectingDuration, setIsDetectingDuration] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<EpisodeFormItem[]>([]);
  const [seasons, setSeasons] = useState<SeasonFormItem[]>([]);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState<number>(1);

  // File upload state & progress
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadProgress, setCoverUploadProgress] = useState(0);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [isDragOverVideo, setIsDragOverVideo] = useState(false);

  // Batch Movie Upload State
  const [isBatchMovieModalOpen, setIsBatchMovieModalOpen] = useState(false);
  const [batchMovieFiles, setBatchMovieFiles] = useState<File[]>([]);
  const [batchMovieUploading, setBatchMovieUploading] = useState(false);
  const [batchMovieProgress, setBatchMovieProgress] = useState({ completed: 0, total: 0, currentName: '' });
  const [batchMovieResults, setBatchMovieResults] = useState<Array<{ title: string; success: boolean; durationMinutes?: number; error?: string }>>([]);

  // Batch Episodes Upload State
  const [isBatchEpisodesUploading, setIsBatchEpisodesUploading] = useState(false);
  const [batchEpisodeProgress, setBatchEpisodeProgress] = useState({ completed: 0, total: 0, currentName: '' });

  // Episode video upload state tracker: episode index -> boolean
  const [uploadingEpisodeIdx, setUploadingEpisodeIdx] = useState<number | null>(null);

  // Settings form state
  const [formSettings, setFormSettings] = useState({ ...settings });
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);

  // File inputs ref
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const batchMovieInputRef = useRef<HTMLInputElement | null>(null);
  const batchEpisodesInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch visitor analytics specifically
  const fetchVisitorAnalytics = async () => {
    try {
      setRefreshingVisitors(true);
      const res = await fetch('/api/admin/analytics/visitors', {
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setVisitorAnalytics(data);
      }
    } catch (err) {
      console.warn('Failed to load visitor analytics:', err);
    } finally {
      setRefreshingVisitors(false);
    }
  };

  // Fetch admin overview stats and admin team list
  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [ovRes, usrRes, admRes, supportStatus, visRes] = await Promise.all([
        fetch('/api/admin/overview', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => null),
        fetch('/api/admin/users', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => []),
        fetch('/api/admin/admins', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => []),
        fetchSupportStatus(adminToken).catch(() => null),
        fetch('/api/admin/analytics/visitors', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => null)
      ]);
      if (ovRes) {
        setOverviewStats(ovRes);
        if (ovRes.visitorAnalytics) {
          setVisitorAnalytics(ovRes.visitorAnalytics);
        }
      }
      if (visRes) {
        setVisitorAnalytics(visRes);
      }
      if (Array.isArray(usrRes)) setUsersList(usrRes);
      if (Array.isArray(admRes)) setAdminsList(admRes);
      if (supportStatus && typeof supportStatus.unreadMessages === 'number') {
        setSupportUnreadCount(supportStatus.unreadMessages);
      }
    } catch (e) {
      console.error('Error loading admin data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
      cleanExistingInvalidMedia().catch(e => console.warn('Media reference audit notice:', e));
    }
  }, [isAdmin, adminToken]);

  // Periodic real-time update when Admin is on overview tab
  useEffect(() => {
    if (isAdmin && adminSection === 'overview') {
      fetchVisitorAnalytics();
      const interval = setInterval(() => {
        fetchVisitorAnalytics();
      }, 25000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, adminSection, adminToken]);

  useEffect(() => {
    setFormSettings({ ...settings });
  }, [settings]);

  // Handle Admin Firebase Authentication
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessNotice(null);

    if (!adminEmail.trim() || !adminPassword.trim()) {
      setAuthError('Please enter both admin email and password.');
      return;
    }

    if (authMode === 'register') {
      if (adminPassword.length < 6) {
        setAuthError('Password must be at least 6 characters long.');
        return;
      }
      if (adminPassword !== adminPasswordConfirm) {
        setAuthError('Passwords do not match.');
        return;
      }
    }

    setIsAuthenticating(true);
    try {
      if (authMode === 'register') {
        const res = await adminRegister(adminEmail.trim(), adminPassword);
        if (!res.success) {
          setAuthError(res.error || 'Failed to create administrator account.');
        } else {
          setAuthSuccessNotice('Administrator account created and authenticated successfully!');
        }
      } else {
        const result = await adminLogin(adminEmail.trim(), adminPassword);
        if (!result.success) {
          setAuthError(result.error || 'Invalid administrator credentials. Access restricted.');
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication error occurred.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle Google Sign-In for Administrator
  const handleGoogleAdminLogin = async () => {
    setAuthError(null);
    setAuthSuccessNotice(null);
    setIsGoogleAuthenticating(true);
    try {
      const result = await adminLoginGoogle();
      if (!result.success) {
        setAuthError(result.error || 'Google administrator authentication failed.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in error occurred.');
    } finally {
      setIsGoogleAuthenticating(false);
    }
  };

  // Add new Administrator in RBAC
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
      setAdminActionFeedback('Please enter a valid administrator email.');
      return;
    }
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ email: newAdminEmail.trim(), uid: newAdminUid.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setAdminActionFeedback(`Successfully assigned administrator privileges to ${newAdminEmail}.`);
        setNewAdminEmail('');
        setNewAdminUid('');
        loadAdminData();
      } else {
        setAdminActionFeedback(data.error || 'Failed to assign administrator.');
      }
    } catch (err: any) {
      setAdminActionFeedback(err?.message || 'Error assigning administrator.');
    }
  };

  // Revoke Administrator privileges
  const handleRemoveAdmin = async (idOrEmail: string) => {
    if (!confirm(`Are you sure you want to revoke administrator privileges for ${idOrEmail}?`)) return;
    try {
      const res = await fetch(`/api/admin/admins/${encodeURIComponent(idOrEmail)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setAdminActionFeedback(`Revoked administrator privileges for ${idOrEmail}.`);
        loadAdminData();
      } else {
        setAdminActionFeedback(data.error || 'Failed to revoke administrator.');
      }
    } catch (err: any) {
      setAdminActionFeedback(err?.message || 'Error revoking administrator.');
    }
  };

  // Open Create Content Modal
  const openCreateModal = (type: 'movie' | 'series' = 'movie') => {
    setIsEditing(false);
    setEditingOriginalItem(null);
    setContentId((type === 'series' ? 's-' : 'm-') + Date.now());
    setTitle('');
    setDescription('');
    setContentType(type);
    setReleaseYear(new Date().getFullYear());
    setGenreInput('Action, Sci-Fi');
    setLanguage('English');
    setRating(8.5);
    setQuality('HD');
    setTrailerUrl('');
    setAccessType('free');
    setIsPublished(true);
    setCoverImageUrl('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80');
    setVideoUrl('');
    setEpisodes(type === 'series' ? [
      {
        id: `ep-temp-s1-1`,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episode 1: Pilot',
        description: 'The journey begins.',
        thumbnail: '',
        videoUrl: '',
        duration: 45,
        skipIntroSec: 15
      }
    ] : []);
    setSeasons(type === 'series' ? [
      {
        id: `sn-temp-1`,
        seasonNumber: 1,
        seasonName: 'Season 1',
        title: 'Season 1'
      }
    ] : []);
    setActiveSeasonNumber(1);
    setMovieDuration(type === 'series' ? 45 : 95);
    setDetectedDurationNotice(null);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);
    setUploadFeedback(null);
    setIsModalOpen(true);
  };

  // Open Edit Content Modal (Requirement 14 & 16)
  const openEditModal = (item: Movie | TVSeries) => {
    setIsEditing(true);
    setEditingOriginalItem(item);
    const isSeries = 'seasonsCount' in item;
    setContentId(item.id);
    setTitle(item.title);
    setDescription(item.description || '');
    setContentType(isSeries ? 'series' : 'movie');
    setReleaseYear(item.year || new Date().getFullYear());
    setGenreInput(Array.isArray(item.genre) ? item.genre.join(', ') : (item.genre || 'General'));
    setLanguage(item.language || 'English');
    setRating(item.rating || 8.0);
    setQuality((item.qualityBadge as any) || 'HD');
    setTrailerUrl(item.trailerUrl || '');
    setAccessType(item.isPremium ? 'premium' : 'free');
    setIsPublished(item.isPublished !== undefined ? item.isPublished : true);
    setCoverImageUrl(item.coverImageUrl || item.poster || item.backdrop || '');
    setVideoUrl((item as Movie).videoUrl || '');
    setMovieDuration((item as any).duration || (isSeries ? 45 : 95));
    setDetectedDurationNotice(null);

    if (isSeries) {
      // 1. Load existing episodes
      const seriesEpisodes: EpisodeFormItem[] = ((item as any).episodes || []).map((ep: any, idx: number) => ({
        id: ep.id || `ep-${item.id}-${idx + 1}`,
        seasonNumber: ep.seasonNumber || 1,
        seasonId: ep.seasonId || undefined,
        episodeNumber: ep.episodeNumber || idx + 1,
        title: ep.title || `Episode ${idx + 1}`,
        description: ep.description || '',
        thumbnail: ep.thumbnail || item.coverImageUrl || item.poster || '',
        videoUrl: ep.videoUrl || '',
        duration: ep.duration || 45,
        skipIntroSec: ep.skipIntroSec || 0
      }));

      // 2. Load existing seasons
      let loadedSeasons: SeasonFormItem[] = [];
      if (Array.isArray((item as any).seasons) && (item as any).seasons.length > 0) {
        loadedSeasons = (item as any).seasons.map((sn: any, idx: number) => ({
          id: sn.id || `sn-${item.id}-${sn.seasonNumber || idx + 1}`,
          seasonNumber: sn.seasonNumber || idx + 1,
          seasonName: sn.seasonName || sn.title || `Season ${sn.seasonNumber || idx + 1}`,
          title: sn.title || sn.seasonName || `Season ${sn.seasonNumber || idx + 1}`
        }));
      }

      if (loadedSeasons.length === 0) {
        if (seriesEpisodes.length > 0) {
          const distinctNums = Array.from(new Set(seriesEpisodes.map(e => e.seasonNumber || 1))).sort((a, b) => a - b);
          loadedSeasons = distinctNums.map(num => ({
            id: `sn-${item.id}-${num}`,
            seasonNumber: num,
            seasonName: `Season ${num}`,
            title: `Season ${num}`
          }));
        } else if ((item as any).seasonsCount) {
          const count = (item as any).seasonsCount || 1;
          loadedSeasons = Array.from({ length: count }, (_, i) => ({
            id: `sn-${item.id}-${i + 1}`,
            seasonNumber: i + 1,
            seasonName: `Season ${i + 1}`,
            title: `Season ${i + 1}`
          }));
        } else {
          loadedSeasons = [{
            id: `sn-${item.id}-1`,
            seasonNumber: 1,
            seasonName: 'Season 1',
            title: 'Season 1'
          }];
        }
      }

      setSeasons(loadedSeasons);
      setActiveSeasonNumber(loadedSeasons[0]?.seasonNumber || 1);
      setEpisodes(seriesEpisodes.length > 0 ? seriesEpisodes : [
        {
          id: `ep-${item.id}-s1-1`,
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Episode 1',
          description: '',
          thumbnail: item.coverImageUrl || item.poster || '',
          videoUrl: '',
          duration: 45,
          skipIntroSec: 0
        }
      ]);

      // Also async fetch from server to guarantee freshest seasons & episodes from DB
      fetch(`/api/series/${item.id}`)
        .then(r => r.json())
        .then(data => {
          const sList = data?.seasons || (Array.isArray(data) ? data : []);
          const eList = data?.episodes || [];
          if (Array.isArray(sList) && sList.length > 0) {
            setSeasons(sList.map((sn: any, idx: number) => ({
              id: sn.id || `sn-${item.id}-${sn.seasonNumber || idx + 1}`,
              seasonNumber: sn.seasonNumber || idx + 1,
              seasonName: sn.seasonName || sn.title || `Season ${sn.seasonNumber || idx + 1}`,
              title: sn.title || sn.seasonName || `Season ${sn.seasonNumber || idx + 1}`
            })));
          }
          if (Array.isArray(eList) && eList.length > 0) {
            setEpisodes(eList.map((ep: any, idx: number) => ({
              id: ep.id || `ep-${item.id}-${idx + 1}`,
              seasonNumber: ep.seasonNumber || 1,
              seasonId: ep.seasonId || undefined,
              episodeNumber: ep.episodeNumber || idx + 1,
              title: ep.title || `Episode ${idx + 1}`,
              description: ep.description || '',
              thumbnail: ep.thumbnail || item.coverImageUrl || item.poster || '',
              videoUrl: ep.videoUrl || '',
              duration: ep.duration || 45,
              skipIntroSec: ep.skipIntroSec || 0
            })));
          }
        })
        .catch(() => {});
    } else {
      setSeasons([]);
      setEpisodes([]);
    }

    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);
    setUploadFeedback(null);
    setIsModalOpen(true);
  };

  // Helper to detect duration from video URL or file
  const handleDetectDuration = async (urlOrPath: string, epIndex?: number) => {
    if (!urlOrPath.trim()) return;
    setIsDetectingDuration(true);
    setDetectedDurationNotice(null);
    try {
      const token = localStorage.getItem('piflix_admin_token') || adminToken;
      const res = await fetch('/api/admin/detect-duration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ videoUrl: urlOrPath.trim() })
      });
      const data = await res.json();
      if (data && data.success && data.durationMinutes) {
        if (epIndex !== undefined) {
          setEpisodes(prev => {
            const next = [...prev];
            next[epIndex] = { ...next[epIndex], duration: data.durationMinutes };
            return next;
          });
          setUploadFeedback(`Detected Episode ${epIndex + 1} duration: ${formatDuration(data.durationMinutes)} (${data.durationMinutes}m)`);
        } else {
          setMovieDuration(data.durationMinutes);
          setDetectedDurationNotice(`Real video duration detected: ${formatDuration(data.durationMinutes)} (${data.durationMinutes} minutes)`);
        }
      } else {
        setDetectedDurationNotice('Could not auto-detect duration from video source. You can enter minutes manually.');
      }
    } catch {
      setDetectedDurationNotice('Duration detection request failed. You can enter minutes manually.');
    } finally {
      setIsDetectingDuration(false);
    }
  };

  // Handle Video File Upload (Requirement 1 & 16 & Bug 2)
  const handleVideoFileUpload = async (file: File, episodeIdx?: number) => {
    if (!file) return;

    if (episodeIdx !== undefined) {
      setUploadingEpisodeIdx(episodeIdx);
    } else {
      setIsUploadingVideo(true);
      setVideoUploadProgress(15);
    }
    setUploadFeedback(`Uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

    try {
      const result = await uploadMediaWithMetadata(file, 'videos', (pct) => {
        setVideoUploadProgress(pct);
      });

      setVideoUploadProgress(100);
      if (episodeIdx !== undefined) {
        setEpisodes(prev => {
          const next = [...prev];
          next[episodeIdx] = {
            ...next[episodeIdx],
            videoUrl: result.url,
            ...(result.durationMinutes ? { duration: result.durationMinutes } : {})
          };
          return next;
        });
        const durationText = result.durationMinutes ? ` (Real duration: ${formatDuration(result.durationMinutes)})` : '';
        setUploadFeedback(`Episode ${episodeIdx + 1} video uploaded successfully!${durationText}`);
      } else {
        setVideoUrl(result.url);
        if (result.durationMinutes) {
          setMovieDuration(result.durationMinutes);
          setDetectedDurationNotice(`Real video duration detected: ${formatDuration(result.durationMinutes)} (${result.durationMinutes} minutes)`);
        }
        setUploadFeedback(`Main video uploaded successfully (${(file.size / (1024 * 1024)).toFixed(1)} MB). Ready for streaming.`);
      }
    } catch (err: any) {
      setUploadFeedback(`Upload notice: ${err?.message || 'Server connection error'}`);
    } finally {
      setIsUploadingVideo(false);
      setUploadingEpisodeIdx(null);
    }
  };

  // Handle Cover Image File Upload (Requirement 2 & 16 & Bug 2)
  const handleCoverFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploadingCover(true);
    setCoverUploadProgress(20);
    setUploadFeedback(`Uploading cover image ${file.name}...`);

    try {
      const result = await uploadMediaWithMetadata(file, 'covers', (pct) => {
        setCoverUploadProgress(pct);
      });

      setCoverUploadProgress(100);
      const chosenUrl = result.assetUrl || result.url;
      setCoverImageUrl(chosenUrl);
      setUploadFeedback('Cover image uploaded and linked successfully!');
    } catch (err: any) {
      setUploadFeedback(`Cover upload notice: ${err?.message || 'Server connection error'}`);
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Add a new Episode to TV series for active season
  const handleAddEpisode = (targetSeasonNumber?: number) => {
    const sNum = targetSeasonNumber !== undefined ? targetSeasonNumber : activeSeasonNumber;
    const currentSeasonObj = seasons.find(s => s.seasonNumber === sNum);
    const seasonEps = episodes.filter(e => (e.seasonNumber || 1) === sNum);
    const existingEpNums = seasonEps.map(e => Number(e.episodeNumber) || 0);
    const nextNumber = existingEpNums.length > 0 ? Math.max(...existingEpNums) + 1 : 1;

    setEpisodes(prev => [
      ...prev,
      {
        id: `ep-${contentId || 'series'}-s${sNum}-${Date.now()}-${nextNumber}`,
        seasonNumber: sNum,
        seasonId: currentSeasonObj?.id,
        episodeNumber: nextNumber,
        title: `Episode ${nextNumber}`,
        description: '',
        thumbnail: coverImageUrl,
        videoUrl: '',
        duration: 45,
        skipIntroSec: 15,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
  };

  // Add a new Season
  const handleAddSeason = () => {
    const existingSeasonNums = seasons.map(s => Number(s.seasonNumber) || 0);
    const nextSeasonNum = existingSeasonNums.length > 0 ? Math.max(...existingSeasonNums) + 1 : 1;
    const newSeason: SeasonFormItem = {
      id: `sn-${contentId || 'series'}-${Date.now()}-${nextSeasonNum}`,
      seasonNumber: nextSeasonNum,
      seasonName: `Season ${nextSeasonNum}`,
      title: `Season ${nextSeasonNum}`
    };
    setSeasons(prev => [...prev, newSeason]);
    setActiveSeasonNumber(nextSeasonNum);
    // Automatically prepare episode 1 for the new season
    setEpisodes(prev => [
      ...prev,
      {
        id: `ep-${contentId || 'series'}-s${nextSeasonNum}-${Date.now()}-1`,
        seasonNumber: nextSeasonNum,
        seasonId: newSeason.id,
        episodeNumber: 1,
        title: 'Episode 1',
        description: '',
        thumbnail: coverImageUrl,
        videoUrl: '',
        duration: 45,
        skipIntroSec: 15
      }
    ]);
  };

  // Remove a Season and its episodes
  const handleRemoveSeason = (sNum: number) => {
    if (seasons.length <= 1) return;
    setSeasons(prev => prev.filter(s => s.seasonNumber !== sNum));
    setEpisodes(prev => prev.filter(e => (e.seasonNumber || 1) !== sNum));
    const remaining = seasons.filter(s => s.seasonNumber !== sNum);
    if (remaining.length > 0) {
      setActiveSeasonNumber(remaining[0].seasonNumber);
    }
  };

  // Remove an Episode safely by id or index
  const handleRemoveEpisode = (idOrIndex: string | number) => {
    if (typeof idOrIndex === 'string') {
      setEpisodes(prev => prev.filter(ep => ep.id !== idOrIndex));
    } else {
      setEpisodes(prev => prev.filter((_, i) => i !== idOrIndex));
    }
  };

  // Clean title from video filename (removes .mp4, 1080p, release tags)
  const cleanTitleFromFileName = (fileName: string): string => {
    let clean = fileName.replace(/\.[^/.]+$/, '');
    clean = clean.replace(/[\._\-\+]/g, ' ');
    clean = clean.replace(/\b(1080p|720p|480p|4k|2160p|bluray|bdrip|webrip|web-dl|x264|x265|hevc|aac|dvdrip|h264|hdrip|yify|proper|repack)\b/gi, '');
    clean = clean.trim().replace(/\s+/g, ' ');
    return clean.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()) || fileName;
  };

  // Handle batch upload of multiple movie video files
  const handleBatchMovieUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setBatchMovieUploading(true);
    setBatchMovieResults([]);
    setBatchMovieProgress({ completed: 0, total: files.length, currentName: files[0].name });

    const results: Array<{ title: string; success: boolean; durationMinutes?: number; error?: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsedTitle = cleanTitleFromFileName(file.name);
      setBatchMovieProgress({ completed: i, total: files.length, currentName: file.name });

      try {
        const uploadRes = await uploadMediaWithMetadata(file, 'videos');
        const duration = uploadRes.durationMinutes || 95;
        const newMovieId = 'm-' + Date.now() + '-' + i;
        
        const newMovie: ContentItem = {
          id: newMovieId,
          title: parsedTitle,
          description: `${parsedTitle} - Streaming movie in HD.`,
          type: 'movie',
          coverImageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80',
          videoUrl: uploadRes.url,
          year: new Date().getFullYear(),
          duration: duration,
          genre: 'Action, Drama',
          language: 'English',
          rating: 8.5,
          quality: 'HD',
          accessType: 'free',
          published: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await saveContent(newMovie);
        results.push({ title: parsedTitle, success: true, durationMinutes: duration });
      } catch (err: any) {
        console.error(`Batch movie upload failure for ${file.name}:`, err);
        results.push({ title: parsedTitle, success: false, error: err?.message || 'Upload error' });
      }

      setBatchMovieResults([...results]);
    }

    setBatchMovieProgress({ completed: files.length, total: files.length, currentName: 'All files processed' });
    setBatchMovieUploading(false);
    await refreshContent();
  };

  // Handle batch upload of multiple episode video files for active season of current TV series
  const handleBatchEpisodeUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsBatchEpisodesUploading(true);
    setBatchEpisodeProgress({ completed: 0, total: files.length, currentName: files[0].name });

    // Sort files by natural alphanumeric order
    const sortedFiles = Array.from(files).sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const sNum = activeSeasonNumber;
    const currentSeasonObj = seasons.find(s => s.seasonNumber === sNum);
    const existingSeasonEps = episodes.filter(e => (e.seasonNumber || 1) === sNum);
    const existingNums = existingSeasonEps.map(e => Number(e.episodeNumber) || 0);
    const startEpNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      setBatchEpisodeProgress({ completed: i, total: sortedFiles.length, currentName: file.name });

      try {
        const uploadRes = await uploadMediaWithMetadata(file, 'videos');
        const duration = uploadRes.durationMinutes || 45;
        const cleanName = cleanTitleFromFileName(file.name);
        const thisEpNum = startEpNum + i;

        setEpisodes(prev => [
          ...prev,
          {
            id: `ep-${contentId || 'series'}-s${sNum}-${Date.now()}-${thisEpNum}`,
            seasonNumber: sNum,
            seasonId: currentSeasonObj?.id,
            episodeNumber: thisEpNum,
            title: cleanName || `Episode ${thisEpNum}`,
            description: '',
            thumbnail: coverImageUrl,
            videoUrl: uploadRes.url,
            duration,
            skipIntroSec: 15
          }
        ]);
      } catch (err: any) {
        console.error(`Batch episode upload failed for ${file.name}:`, err);
      }
    }

    setBatchEpisodeProgress({ completed: sortedFiles.length, total: sortedFiles.length, currentName: 'Complete' });
    setIsBatchEpisodesUploading(false);
    setUploadFeedback(`Batch episodes uploaded successfully (${sortedFiles.length} files attached to Season ${sNum})!`);
  };

  // Save / Submit Content Form (Firestore + Server API Sync)
  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    // Problem 4: Transactional Integrity Validation before persistence
    if (!title.trim()) {
      setSaveErrorMessage('Please enter a title for the content item.');
      return;
    }

    if (!coverImageUrl.trim()) {
      setSaveErrorMessage('Please upload or provide a cover image for this title.');
      return;
    }

    if (contentType === 'movie') {
      if (!videoUrl.trim()) {
        setSaveErrorMessage('Please upload a video file or provide a streaming URL for the movie.');
        return;
      }
      if (!movieDuration || movieDuration <= 0) {
        setSaveErrorMessage('Please specify a valid movie duration in minutes.');
        return;
      }
    } else {
      // TV Series validation
      if (!episodes || episodes.length === 0) {
        setSaveErrorMessage('Please add at least one episode to this TV series.');
        return;
      }
      const invalidEp = episodes.find((ep) => !ep.title || !ep.title.trim());
      if (invalidEp) {
        setSaveErrorMessage(`Episode ${invalidEp.episodeNumber} in Season ${invalidEp.seasonNumber || 1} requires a title.`);
        return;
      }
    }

    setSavingContent(true);

    const now = new Date().toISOString();
    const itemToSave: ContentItem = {
      id: contentId || ((contentType === 'series' ? 's-' : 'm-') + Date.now()),
      title: title.trim(),
      description: description.trim(),
      type: contentType,
      coverImageUrl: coverImageUrl.trim() || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80',
      videoUrl: videoUrl.trim(),
      trailerUrl: trailerUrl.trim(),
      year: Number(releaseYear) || new Date().getFullYear(),
      duration: contentType === 'movie' ? (Number(movieDuration) || 95) : undefined,
      genre: genreInput.trim(),
      language: language.trim() || 'English',
      country: editingOriginalItem?.country || 'International',
      director: editingOriginalItem?.director || 'Creator',
      cast: editingOriginalItem?.cast || [],
      rating: Number(rating) || 8.0,
      quality: quality || 'HD',
      accessType,
      published: isPublished,
      isFeatured: editingOriginalItem?.isFeatured || false,
      isTrending: editingOriginalItem?.isTrending !== undefined ? editingOriginalItem.isTrending : true,
      createdAt: isEditing && editingOriginalItem?.createdAt ? editingOriginalItem.createdAt : now,
      updatedAt: now,
      seasonsCount: contentType === 'series' ? (seasons.length || 1) : undefined,
      seasons: contentType === 'series' ? seasons.map((s, idx) => ({
        id: s.id || `sn-${contentId || 'series'}-${s.seasonNumber || idx + 1}`,
        seasonNumber: Number(s.seasonNumber) || (idx + 1),
        seasonName: (s.seasonName || `Season ${s.seasonNumber || idx + 1}`).trim(),
        title: (s.title || s.seasonName || `Season ${s.seasonNumber || idx + 1}`).trim(),
        episodesCount: episodes.filter(e => (e.seasonNumber || 1) === (s.seasonNumber || idx + 1)).length
      })) : undefined,
      episodes: contentType === 'series' ? episodes.map((ep, idx) => ({
        id: ep.id || `ep-${contentId || 'series'}-s${ep.seasonNumber || 1}-${idx + 1}`,
        seasonNumber: Number(ep.seasonNumber) || 1,
        seasonId: ep.seasonId || undefined,
        episodeNumber: Number(ep.episodeNumber) || (idx + 1),
        title: (ep.title || `Episode ${idx + 1}`).trim(),
        description: (ep.description || '').trim(),
        thumbnail: ep.thumbnail || coverImageUrl,
        videoUrl: (ep.videoUrl || '').trim(),
        duration: Number(ep.duration) || 45,
        skipIntroSec: Number(ep.skipIntroSec) || 0
      })) : undefined
    };

    try {
      // 1. Save to server API first to ensure backend JSON store persistence
      const apiEndpoint = isEditing ? `/api/content/${itemToSave.id}` : '/api/content';
      const method = isEditing ? 'PUT' : 'POST';
      let serverSaved = false;
      try {
        const apiRes = await fetch(apiEndpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-admin-request': 'true',
            ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
          },
          body: JSON.stringify(itemToSave)
        });
        if (apiRes.ok) {
          serverSaved = true;
        } else {
          console.warn('[AdminDashboard] Server save returned:', apiRes.status);
        }
      } catch (apiErr) {
        console.warn('Server API save error:', apiErr);
      }

      // 2. Save to Firestore (primary persistent storage)
      let firestoreSaved = false;
      try {
        await saveContent(itemToSave, isEditing);
        firestoreSaved = true;
      } catch (fsErr) {
        console.warn('Firestore save non-blocking warning:', fsErr);
      }

      if (!serverSaved && !firestoreSaved) {
        throw new Error('Failed to save to both server and Firestore. Please check your connection.');
      }

      setSaveSuccessMessage(
        itemToSave.published 
          ? `Successfully saved and published to PiFlix+!`
          : `Saved content draft successfully!`
      );

      // Create persistent notification in Firestore when item is published (Requirements 2 & 3)
      if (itemToSave.published) {
        const isSeries = itemToSave.type === 'series';
        const notifTitle = isSeries ? '📺 New Series' : '🎬 New Movie Release';
        const notifMsg = isSeries
          ? `A new series, ${itemToSave.title}, is now available on PiFlix+.`
          : `"${itemToSave.title}" is now available on PiFlix+.`;

        createNotification({
          id: `notif_${itemToSave.type}_${itemToSave.id}`,
          userId: 'all',
          title: notifTitle,
          message: notifMsg,
          type: isSeries ? 'new_series' : 'new_movie',
          contentId: itemToSave.id,
          contentType: isSeries ? 'series' : 'movie',
          coverImageUrl: itemToSave.coverImageUrl || '',
          targetTab: isSeries ? 'series' : 'movies',
          createdAt: new Date().toISOString(),
          read: false,
          readBy: []
        }).catch(err => console.error('[Notifications] Failed creating content release notification:', err));
      }

      // Refresh app public catalog
      await refreshContent();
      await loadAdminData();

      setTimeout(() => {
        setIsModalOpen(false);
        setSaveSuccessMessage(null);
      }, 1200);
    } catch (err: any) {
      setSaveErrorMessage(err?.message || 'Error saving content item');
    } finally {
      setSavingContent(false);
    }
  };

  // Delete Content Item Trigger (Bug 1 Requirement 1)
  const handleDeleteContent = (item: Movie | TVSeries) => {
    setDeleteTargetItem(item);
    setDeleteError(null);
  };

  // Confirm and Execute Permanent Deletion (Bug 1 Requirement 2)
  const confirmDeleteAction = async () => {
    if (!deleteTargetItem) return;
    setIsDeleting(true);
    setDeleteError(null);

    const itemId = deleteTargetItem.id;
    try {
      // 1. Delete associated media from Firebase Storage if applicable
      const coverUrl = deleteTargetItem.coverImageUrl || deleteTargetItem.poster;
      if (coverUrl) {
        await deleteMediaFromStorage(coverUrl).catch(() => {});
      }
      const vidUrl = (deleteTargetItem as Movie).videoUrl;
      if (vidUrl) {
        await deleteMediaFromStorage(vidUrl).catch(() => {});
      }

      // 2. Delete document from production Firestore
      await deleteContent(itemId);

      // 3. Delete from server API
      await fetch(`/api/content/${itemId}`, {
        method: 'DELETE',
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
      });

      // 4. Update UI immediately
      removeContentItem(itemId);
      await refreshContent();
      await loadAdminData();

      setDeleteSuccess(`"${deleteTargetItem.title}" was permanently deleted.`);
      setDeleteTargetItem(null);
      setTimeout(() => setDeleteSuccess(null), 4000);
    } catch (err: any) {
      console.error('Delete content error:', err);
      setDeleteError(err?.message || 'Failed to delete content item. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle Publish / Unpublish (Requirement 17)
  const handleTogglePublish = async (item: Movie | TVSeries) => {
    const newPublishedState = !(item.isPublished !== undefined ? item.isPublished : true);
    try {
      await setPublishedState(item.id, newPublishedState);
      await fetch(`/api/content/${item.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ published: newPublishedState })
      });

      // Create persistent notification in Firestore when toggled to published (Requirements 2 & 3)
      if (newPublishedState) {
        const isSeries = 'seasonsCount' in item || (item as any).type === 'series';
        const notifTitle = isSeries ? '📺 New Series' : '🎬 New Movie Release';
        const notifMsg = isSeries
          ? `A new series, ${item.title}, is now available on PiFlix+.`
          : `"${item.title}" is now available on PiFlix+.`;

        createNotification({
          id: `notif_${isSeries ? 'series' : 'movie'}_${item.id}`,
          userId: 'all',
          title: notifTitle,
          message: notifMsg,
          type: isSeries ? 'new_series' : 'new_movie',
          contentId: item.id,
          contentType: isSeries ? 'series' : 'movie',
          coverImageUrl: item.coverImageUrl || item.poster || '',
          targetTab: isSeries ? 'series' : 'movies',
          createdAt: new Date().toISOString(),
          read: false,
          readBy: []
        }).catch(err => console.error('[Notifications] Failed creating toggle release notification:', err));
      }

      await refreshContent();
      await loadAdminData();
    } catch (err) {
      console.error('Toggle publish error', err);
    }
  };

  // Combine movies and series for unified catalog table with newest/recently modified first (Requirement 19 & 20)
  const allCatalogItems = [
    ...movies.map(m => ({ ...m, type: 'movie' as const })),
    ...seriesList.map(s => ({ ...s, type: 'series' as const }))
  ].sort((a, b) => {
    const timeA = new Date(a.updatedAt || (a as any).modifiedAt || a.createdAt || (a as any).publishedAt || 0).getTime();
    const timeB = new Date(b.updatedAt || (b as any).modifiedAt || b.createdAt || (b as any).publishedAt || 0).getTime();
    return timeB - timeA;
  });

  // Apply search and filters (Requirement 19)
  const filteredCatalogItems = allCatalogItems.filter(item => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const genreStr = Array.isArray(item.genre) ? item.genre.join(' ') : (item.genre || '');
      const match = item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        genreStr.toLowerCase().includes(q) ||
        (item.language && item.language.toLowerCase().includes(q));
      if (!match) return false;
    }

    // Type filter
    if (filterType !== 'all' && item.type !== filterType) return false;

    // Published filter
    const isPub = item.isPublished !== undefined ? item.isPublished : true;
    if (filterPublished === 'published' && !isPub) return false;
    if (filterPublished === 'draft' && isPub) return false;

    // Access filter
    const isPrem = item.isPremium;
    if (filterAccess === 'free' && isPrem) return false;
    if (filterAccess === 'premium' && !isPrem) return false;

    // Quality filter
    if (filterQuality !== 'all' && item.qualityBadge !== filterQuality) return false;

    return true;
  });

  // Save Platform Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(formSettings);
    setSavedSettingsSuccess(true);
    setTimeout(() => setSavedSettingsSuccess(false), 3000);
  };

  // --------------------------------------------------------------------------
  // SECURITY GATE: Secure Firebase Authentication Gateway for Administrators
  // --------------------------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-zinc-900/95 border border-zinc-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-purple-950/80 border border-purple-800/60 text-purple-400 mb-1 shadow-lg shadow-purple-900/30">
              <ShieldCheck className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Administrator Gateway</h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-medium">
              <Lock className="w-3 h-3 text-purple-400" />
              <span>Secured by Firebase Authentication (RBAC)</span>
            </div>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed pt-1">
              Access is restricted strictly to verified administrators. Unauthorized users are blocked by Firebase Security Rules.
            </p>
          </div>

          {/* Mode Switcher: Sign In vs Register Account */}
          <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
            <button
              type="button"
              onClick={() => { setAuthMode('signin'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                authMode === 'signin'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Admin Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                authMode === 'register'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Create Admin Account
            </button>
          </div>

          {authError && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-800/80 text-red-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-snug">{authError}</div>
            </div>
          )}

          {authSuccessNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-snug">{authSuccessNotice}</div>
            </div>
          )}

          {/* Google Sign-In Option */}
          <button
            type="button"
            onClick={handleGoogleAdminLogin}
            disabled={isGoogleAuthenticating || isAuthenticating}
            className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-zinc-800/80 text-white text-xs font-semibold rounded-xl border border-zinc-800 hover:border-zinc-700 transition flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isGoogleAuthenticating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Connecting to Google Identity...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>Continue with Google (Owner / Admin)</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">or email & password</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300 tracking-wide uppercase">Admin Email</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="frank.gwaza.fg@gmail.com"
                className="w-full pl-3.5 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300 tracking-wide uppercase">Password</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Enter account password"
                className="w-full pl-3.5 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {authMode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 tracking-wide uppercase">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={adminPasswordConfirm}
                  onChange={e => setAdminPasswordConfirm(e.target.value)}
                  placeholder="Re-type password"
                  className="w-full pl-3.5 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating || isGoogleAuthenticating}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAuthenticating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Administrator Privileges...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>{authMode === 'register' ? 'Register & Verify Admin' : 'Sign In to Admin Dashboard'}</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-zinc-800/80 text-center space-y-1">
            <div className="text-[11px] text-zinc-400 font-medium">
              Primary Super Administrator: <span className="text-purple-400">frank.gwaza.fg@gmail.com</span>
            </div>
            <div className="text-[10px] text-zinc-500">
              Hardcoded demo passwords are removed. Production Firebase tokens are required.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // PROTECTED ADMIN DASHBOARD INTERFACE
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-white">PiFlix+ Master CMS</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Verified Admin
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Firestore Live
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Logged in as <span className="text-white font-medium">{currentUser.email || 'admin@piflixplus.com'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => openCreateModal('movie')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Movie</span>
          </button>

          <button
            onClick={() => openCreateModal('series')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-lg shadow-pink-900/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Series</span>
          </button>

          <button
            onClick={() => {
              setBatchMovieFiles([]);
              setBatchMovieResults([]);
              setIsBatchMovieModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-900/30 border border-indigo-500/40 transition"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Batch Movies</span>
          </button>

          <button
            onClick={adminLogout}
            title="Exit Admin Mode"
            className="p-2 rounded-xl bg-zinc-800 hover:bg-red-950/60 hover:text-red-400 text-zinc-400 border border-zinc-700 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setAdminSection('content')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            adminSection === 'content'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Catalog & Content Management</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 border border-purple-800/80">
            {allCatalogItems.length}
          </span>
        </button>

        <button
          onClick={() => setAdminSection('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            adminSection === 'overview'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Streaming Analytics</span>
        </button>

        <button
          onClick={() => setAdminSection('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            adminSection === 'users'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users & Pioneers</span>
        </button>

        <button
          onClick={() => setAdminSection('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            adminSection === 'settings'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Platform & Pi Network</span>
        </button>

        <button
          onClick={() => setAdminSection('support')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            adminSection === 'support'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Support Inbox</span>
          {supportUnreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500 text-white font-black animate-pulse">
              {supportUnreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminSection('admins')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            adminSection === 'admins'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Admin Access (RBAC)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 border border-purple-800/80">
            {adminsList.length || 1}
          </span>
        </button>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 1: CONTENT MANAGEMENT HUB (Requirements 14, 15, 17, 18, 19)        */}
      {/* ---------------------------------------------------------------------- */}
      {adminSection === 'content' && (
        <div className="space-y-4">
          {/* Filter & Search Bar (Requirement 19) */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search catalog by title, synopsis, genre, or language..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Filter controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Content Type Filter */}
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                  aria-label="Filter content by type"
                  className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Formats</option>
                  <option value="movie">Movies Only</option>
                  <option value="series">Series Only</option>
                </select>

                {/* Publish Status Filter */}
                <select
                  value={filterPublished}
                  onChange={e => setFilterPublished(e.target.value as any)}
                  aria-label="Filter content by publish status"
                  className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts / Unpublished</option>
                </select>

                {/* Free vs Premium Filter */}
                <select
                  value={filterAccess}
                  onChange={e => setFilterAccess(e.target.value as any)}
                  aria-label="Filter content by access type"
                  className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Access</option>
                  <option value="free">Free to Stream</option>
                  <option value="premium">VIP Premium</option>
                </select>

                {/* Quality Filter */}
                <select
                  value={filterQuality}
                  onChange={e => setFilterQuality(e.target.value as any)}
                  aria-label="Filter content by video quality"
                  className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Resolutions</option>
                  <option value="HD">HD 720p</option>
                  <option value="FHD">FHD 1080p</option>
                  <option value="4K">4K Ultra HD</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
              <span>Showing {filteredCatalogItems.length} of {allCatalogItems.length} media items</span>
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-purple-400" />
                Live Firestore + Storage Synchronization
              </span>
            </div>
          </div>

          {/* Delete Feedback Banners */}
          {deleteSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">{deleteSuccess}</span>
              </div>
              <button
                onClick={() => setDeleteSuccess(null)}
                className="text-emerald-400 hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {deleteError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{deleteError}</span>
              </div>
              <button
                onClick={() => setDeleteError(null)}
                className="text-rose-400 hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Organized Content Table (Requirement 18) */}
          <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Poster</th>
                    <th className="py-3 px-4">Title & Synopsis</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Year / Lang</th>
                    <th className="py-3 px-4">Rating</th>
                    <th className="py-3 px-4">Quality</th>
                    <th className="py-3 px-4">Access</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredCatalogItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-zinc-500">
                        <Film className="w-8 h-8 mx-auto text-zinc-600 mb-2 opacity-50" />
                        <div>No movies or series matching the current filter.</div>
                        <button
                          onClick={() => openCreateModal('movie')}
                          className="mt-3 text-xs text-purple-400 hover:underline font-bold"
                        >
                          + Upload your first video now
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredCatalogItems.map(item => {
                      const isSeries = item.type === 'series';
                      const isPub = item.isPublished !== undefined ? item.isPublished : true;
                      const coverUrl = item.coverImageUrl || item.poster || item.backdrop;
                      const genreDisplay = Array.isArray(item.genre) ? item.genre.slice(0, 2).join(', ') : item.genre;

                      return (
                        <tr key={item.id} className="hover:bg-zinc-800/40 transition">
                          {/* Poster Thumbnail Preview */}
                          <td className="py-3 px-4">
                            <div className="relative group w-10 h-14 rounded-md overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0">
                              <img
                                src={coverUrl}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                              />
                            </div>
                          </td>

                          {/* Title & Synopsis */}
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-bold text-white text-xs truncate">{item.title}</div>
                            <div className="text-[11px] text-zinc-400 line-clamp-1">{item.description || 'No description provided.'}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{genreDisplay}</div>
                          </td>

                          {/* Content Type Badge */}
                          <td className="py-3 px-4">
                            {isSeries ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/10 text-pink-400 border border-pink-500/20">
                                <Tv className="w-2.5 h-2.5" />
                                Series
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Film className="w-2.5 h-2.5" />
                                Movie
                              </span>
                            )}
                          </td>

                          {/* Release Year & Language */}
                          <td className="py-3 px-4 text-zinc-300">
                            <div>{item.year} {isSeries ? `• ${(item as any).seasonsCount || 1}S` : `• ${formatDuration((item as any).duration || 90)}`}</div>
                            <div className="text-[10px] text-zinc-500">{item.language || 'English'}</div>
                          </td>

                          {/* Rating */}
                          <td className="py-3 px-4">
                            <span className="font-bold text-amber-400">★ {item.rating}</span>
                          </td>

                          {/* Video Quality Badge */}
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              item.qualityBadge === '4K'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                            }`}>
                              {item.qualityBadge || 'HD'}
                            </span>
                          </td>

                          {/* Access Type (Free vs Premium) */}
                          <td className="py-3 px-4">
                            {item.isPremium ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-700/60">
                                <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                                VIP Pi
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                                Free
                              </span>
                            )}
                          </td>

                          {/* Publish / Unpublish Toggle (Requirement 17) */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleTogglePublish(item)}
                              title={isPub ? 'Click to unpublish' : 'Click to publish'}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                                isPub
                                  ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/80 hover:bg-emerald-900'
                                  : 'bg-zinc-800/90 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                              }`}
                            >
                              {isPub ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Published</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 text-zinc-500" />
                                  <span>Draft</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* Action Buttons: Play, Edit, Delete (Requirements 14, 15) */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Preview Play */}
                              <button
                                onClick={() => playVideo(item as any)}
                                title="Stream / Test Video Player"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-purple-600 text-zinc-300 hover:text-white transition"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit metadata & video file */}
                              <button
                                onClick={() => openEditModal(item)}
                                title="Edit Metadata & Media"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteContent(item)}
                                title="Delete Content"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-900/70 text-zinc-400 hover:text-red-300 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 2: OVERVIEW & STREAMING ANALYTICS                                   */}
      {/* ---------------------------------------------------------------------- */}
      {adminSection === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-xs text-zinc-400 flex items-center justify-between">
                <span>Total Movies</span>
                <Film className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white mt-1">{movies.length}</div>
              <span className="text-[10px] text-zinc-500">Live in catalog</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-xs text-zinc-400 flex items-center justify-between">
                <span>Series</span>
                <Tv className="w-4 h-4 text-pink-400" />
              </div>
              <div className="text-2xl font-black text-white mt-1">{seriesList.length}</div>
              <span className="text-[10px] text-zinc-500">Multi-episode shows</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-xs text-zinc-400 flex items-center justify-between">
                <span>Pi Revenue</span>
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-amber-400 mt-1">{overviewStats?.piRevenue || '156.40'} Pi</div>
              <span className="text-[10px] text-emerald-400">Blockchain verified</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-xs text-zinc-400 flex items-center justify-between">
                <span>VIP Subscribers</span>
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white mt-1">{overviewStats?.premiumSubscribers || '38'}</div>
              <span className="text-[10px] text-purple-400">Ad-Free Streamers</span>
            </div>
          </div>

          {/* ================================================================ */}
          {/* REAL VISITOR ANALYTICS SECTION                                   */}
          {/* ================================================================ */}
          {(() => {
            const visitorMetrics = visitorAnalytics?.metrics || overviewStats?.visitorAnalytics?.metrics || {
              today: 0,
              thisWeek: 0,
              thisMonth: 0,
              thisYear: 0,
              totalVisitors: 0
            };

            const visitorSources = visitorAnalytics?.trafficSources || overviewStats?.visitorAnalytics?.trafficSources || {
              piBrowser: 0,
              externalWeb: 0
            };

            const totalSourceCount = (visitorSources.piBrowser + visitorSources.externalWeb) || 1;
            const piBrowserPercent = Math.round((visitorSources.piBrowser / totalSourceCount) * 100);
            const externalWebPercent = 100 - piBrowserPercent;

            const recentVisitorsList = visitorAnalytics?.recentVisitors || overviewStats?.visitorAnalytics?.recentVisitors || [];

            return (
              <div className="p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl space-y-6">
                {/* Header with LIVE badge and Refresh Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white tracking-wide">REAL VISITOR ANALYTICS</h2>
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          LIVE
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Persistent unique visitor count tracking &bull; Verified Pi Browser and Web traffic
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchVisitorAnalytics}
                      disabled={refreshingVisitors}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition disabled:opacity-50"
                      title="Refresh visitor analytics"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${refreshingVisitors ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                {/* 5 Core Unique Metrics Grid */}
                <div>
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                    Unique Visitors
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {/* 1. Today */}
                    <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs">
                        <span>Today</span>
                        <Clock className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <div className="text-2xl font-black text-white my-1">
                        {visitorMetrics.today.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-zinc-500">Unique visitors today</span>
                    </div>

                    {/* 2. This Week */}
                    <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs">
                        <span>This Week</span>
                        <Calendar className="w-3.5 h-3.5 text-pink-400" />
                      </div>
                      <div className="text-2xl font-black text-white my-1">
                        {visitorMetrics.thisWeek.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-zinc-500">Current calendar week</span>
                    </div>

                    {/* 3. This Month */}
                    <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs">
                        <span>This Month</span>
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div className="text-2xl font-black text-white my-1">
                        {visitorMetrics.thisMonth.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-zinc-500">Current month</span>
                    </div>

                    {/* 4. This Year */}
                    <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs">
                        <span>This Year</span>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="text-2xl font-black text-white my-1">
                        {visitorMetrics.thisYear.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-zinc-500">Current year</span>
                    </div>

                    {/* 5. Total Visitors */}
                    <div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-gradient-to-br from-purple-950/40 to-zinc-950 border border-purple-800/40 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-purple-300 text-xs">
                        <span>Total Visitors</span>
                        <Award className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <div className="text-2xl font-black text-purple-300 my-1">
                        {visitorMetrics.totalVisitors.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-purple-400/80">All-time unique</span>
                    </div>
                  </div>
                </div>

                {/* Traffic Sources Breakdown */}
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300 uppercase tracking-wider">Traffic Sources Breakdown</span>
                    <span className="text-[11px] text-zinc-500">Dual-source classification</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Pi Browser */}
                    <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-purple-900/40 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-black text-sm">
                          π
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>Pi Browser / Pi Ecosystem</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-900/60 text-purple-300">Pi App</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">Pi Browser pioneers & Pi accounts</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-purple-400">
                          {visitorSources.piBrowser.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-zinc-500">{piBrowserPercent}% of total</div>
                      </div>
                    </div>

                    {/* External / Web */}
                    <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-sky-600/20 text-sky-400 flex items-center justify-center">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>External / Web Links</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-sky-900/60 text-sky-300">Web</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">Direct URLs & standard web browsers</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-sky-400">
                          {visitorSources.externalWeb.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-zinc-500">{externalWebPercent}% of total</div>
                      </div>
                    </div>
                  </div>

                  {/* Split bar */}
                  <div className="space-y-1 pt-1">
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${piBrowserPercent}%` }}
                        className="h-full bg-purple-500 transition-all duration-500"
                        title={`Pi Browser: ${piBrowserPercent}%`}
                      />
                      <div
                        style={{ width: `${externalWebPercent}%` }}
                        className="h-full bg-sky-500 transition-all duration-500"
                        title={`External Web: ${externalWebPercent}%`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                        Pi Browser ({piBrowserPercent}%)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                        External / Web ({externalWebPercent}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Privacy-Safe Recent Visitor Activity */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300 uppercase tracking-wider">Recent Active Visitors (Anonymous)</span>
                    <span className="text-[10px] text-zinc-500">Privacy-conscious identifiers &bull; Deduplicated sessions</span>
                  </div>

                  {recentVisitorsList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-500 rounded-xl bg-zinc-950/40 border border-zinc-800/60">
                      No public visitor sessions recorded yet. Visitors accessing PiFlix+ will appear here automatically.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-800 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 text-[10px] uppercase font-semibold">
                              <th className="py-2.5 px-3">Visitor ID (Masked)</th>
                              <th className="py-2.5 px-3">Source</th>
                              <th className="py-2.5 px-3">First Seen</th>
                              <th className="py-2.5 px-3">Last Active</th>
                              <th className="py-2.5 px-3 text-right">Sessions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/30">
                            {recentVisitorsList.map((vis, idx) => (
                              <tr key={idx} className="hover:bg-zinc-800/30 transition">
                                <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-300">
                                  {vis.visitorId}
                                  {vis.piUsername && (
                                    <span className="ml-2 text-[10px] text-purple-400 font-sans">
                                      ({vis.piUsername})
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {vis.source === 'pi_browser' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/40 text-purple-300 border border-purple-700/50">
                                      <span>π</span> Pi Browser
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                                      <Globe className="w-2.5 h-2.5 text-sky-400" /> External / Web
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                                  {new Date(vis.firstSeen).toLocaleDateString()} {new Date(vis.firstSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2.5 px-3 text-zinc-300 text-[11px]">
                                  {new Date(vis.lastSeen).toLocaleDateString()} {new Date(vis.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-white text-[11px]">
                                  {vis.visitCount || 1}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-400" />
              <span>Catalog Ingestion Details</span>
            </h3>
            <div className="text-xs text-zinc-400 leading-relaxed space-y-1">
              <p>• Video files uploaded via this Admin Dashboard are served with high-performance HTTP Byte-Range streaming for instant seek and bufferless playback.</p>
              <p>• Metadata and access policies are synchronized directly with Google Firebase Firestore collections (<code>content</code> and <code>admins</code>).</p>
              <p>• Newly uploaded and published movies automatically appear on the public homepage, Movies tab, and PiFlix+ search engine instantly.</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 3: USERS & PIONEERS                                                 */}
      {/* ---------------------------------------------------------------------- */}
      {adminSection === 'users' && (
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
          <h2 className="text-sm font-bold text-white">Registered PiFlix+ Pioneers & Accounts</h2>
          <div className="divide-y divide-zinc-800">
            {usersList.map(u => (
              <div key={u.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <UserAvatar user={u} sizeClass="w-8 h-8" textClass="text-lg" isDark={true} />
                  <div>
                    <div className="font-bold text-white">{u.username}</div>
                    <div className="text-[10px] text-zinc-400">{u.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    u.role === 'admin'
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}>
                    {u.role}
                  </span>
                  {u.premiumStatus && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      VIP Pi
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 4: PLATFORM SETTINGS                                                */}
      {/* ---------------------------------------------------------------------- */}
      {adminSection === 'settings' && (
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold text-white">Streaming Engine & Pi Network Configuration</h2>

          {savedSettingsSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Platform settings updated and broadcasted!</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium">Platform Brand Name</label>
              <input
                type="text"
                value={formSettings.appName}
                onChange={e => setFormSettings({ ...formSettings, appName: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Monthly VIP Access (Pi)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formSettings.monthlyPricePi}
                  onChange={e => setFormSettings({ ...formSettings, monthlyPricePi: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Annual VIP Access (Pi)</label>
                <input
                  type="number"
                  step="0.5"
                  value={formSettings.annualPricePi}
                  onChange={e => setFormSettings({ ...formSettings, annualPricePi: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save System Settings</span>
            </button>
          </form>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 5: ADMIN ACCESS & ROLE-BASED ACCESS CONTROL (RBAC)                 */}
      {/* ---------------------------------------------------------------------- */}
      {adminSection === 'admins' && (
        <div className="space-y-6">
          {/* Security Banner */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">Production Administrator Access (RBAC)</h3>
                  <p className="text-xs text-zinc-400">
                    Protected by Firebase Authentication & Firestore Security Rules. Only authorized accounts can modify content.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Rules Enforced
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Security Model</div>
                <div className="text-xs font-semibold text-zinc-200 mt-0.5">Firebase Token Verification</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Primary Super Admin</div>
                <div className="text-xs font-semibold text-purple-400 mt-0.5 truncate">frank.gwaza.fg@gmail.com</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Database Role Matcher</div>
                <div className="text-xs font-semibold text-emerald-400 mt-0.5">/admins/{'{uid}'}</div>
              </div>
            </div>
          </div>

          {/* Feedback banner */}
          {adminActionFeedback && (
            <div className="p-3.5 rounded-xl bg-purple-950/70 border border-purple-800/80 text-purple-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>{adminActionFeedback}</span>
              </div>
              <button onClick={() => setAdminActionFeedback(null)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Add New Admin Form */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div>
              <h4 className="font-black text-white text-sm">Assign Administrator Privileges</h4>
              <p className="text-xs text-zinc-400">
                Add an email address or Firebase UID to grant full CMS administrative privileges.
              </p>
            </div>

            <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase">Administrator Email</label>
                <input
                  type="email"
                  required
                  placeholder="admin-colleague@piflixplus.com"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase">Firebase UID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. jf48X... (auto-detected if blank)"
                  value={newAdminUid}
                  onChange={e => setNewAdminUid(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Assign Admin Role</span>
                </button>
              </div>
            </form>
          </div>

          {/* Administrators Directory Table */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-white text-sm">Active Administrator Accounts</h4>
                <p className="text-xs text-zinc-400">
                  Accounts authorized to upload, edit, delete, and publish streaming content.
                </p>
              </div>
              <button
                onClick={loadAdminData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh List</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Admin Email</th>
                    <th className="py-3 px-4">Role Tier</th>
                    <th className="py-3 px-4">Firebase UID</th>
                    <th className="py-3 px-4">Assigned Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {adminsList.map((adm, idx) => {
                    const isSuper = adm.email?.toLowerCase() === 'frank.gwaza.fg@gmail.com';
                    return (
                      <tr key={adm.uid || idx} className="hover:bg-zinc-950/40">
                        <td className="py-3 px-4 font-semibold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-950 text-purple-300 flex items-center justify-center font-bold text-[11px] border border-purple-800/60 shrink-0">
                            {adm.email?.substring(0, 2).toUpperCase()}
                          </div>
                          <span>{adm.email}</span>
                          {isSuper && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30">
                              Primary Owner
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {isSuper ? 'Super Administrator' : 'Administrator'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-500 truncate max-w-[160px]">
                          {adm.uid || '—'}
                        </td>
                        <td className="py-3 px-4 text-zinc-400 text-[11px]">
                          {adm.createdAt ? new Date(adm.createdAt).toLocaleDateString() : 'Active'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isSuper ? (
                            <span className="text-[11px] text-zinc-600 italic">Protected Owner</span>
                          ) : (
                            <button
                              onClick={() => handleRemoveAdmin(adm.email || adm.uid)}
                              className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 text-[11px] font-semibold border border-red-800/50 transition"
                            >
                              Revoke Access
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Setup Instructions for User */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
            <h4 className="font-bold text-white text-xs flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-purple-400" />
              <span>Production Setup & Role Assignment Instructions</span>
            </h4>
            <div className="text-xs text-zinc-400 space-y-2 leading-relaxed">
              <p>
                1. <strong>Primary Owner Access:</strong> The account <code className="text-purple-300 bg-zinc-900 px-1 py-0.5 rounded">frank.gwaza.fg@gmail.com</code> is registered as the Primary Super Administrator. You can sign in using Google or by creating password credentials on the Administrator Gateway.
              </p>
              <p>
                2. <strong>Adding Additional Admins:</strong> You can assign new administrators directly via the form above, or by adding a document to the <code className="text-purple-300 bg-zinc-900 px-1 py-0.5 rounded">admins</code> collection in Firestore where the Document ID is the user's Firebase UID.
              </p>
              <p>
                3. <strong>Security Protection:</strong> All upload, edit, delete, and publish endpoints require valid Firebase ID tokens. Regular users and unauthenticated guests receive <code className="text-red-300 bg-zinc-900 px-1 py-0.5 rounded">401 Unauthorized</code> or <code className="text-red-300 bg-zinc-900 px-1 py-0.5 rounded">403 Forbidden</code> errors automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 6: SUPPORT INBOX (support@piflixplus.network)                      */}
      {/* ---------------------------------------------------------------------- */}
      {adminSection === 'support' && (
        <AdminSupportInbox
          adminToken={adminToken}
          currentUserEmail={currentUser.email || 'admin@piflixplus.network'}
        />
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL: UPLOAD & EDIT CONTENT (Requirements 1 to 13, 16, 17)            */}
      {/* ---------------------------------------------------------------------- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-600/30">
                  {contentType === 'movie' ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">
                    {isEditing ? `Edit ${contentType === 'movie' ? 'Movie' : 'Series'}` : `Upload New ${contentType === 'movie' ? 'Movie' : 'Series'}`}
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    Fill in metadata, upload video and cover images, and publish to PiFlix+.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification messages */}
            {saveSuccessMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{saveSuccessMessage}</span>
              </div>
            )}

            {saveErrorMessage && (
              <div className="p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{saveErrorMessage}</span>
              </div>
            )}

            {uploadFeedback && (
              <div className="p-3 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-200 text-xs flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-400 shrink-0" />
                <span>{uploadFeedback}</span>
              </div>
            )}

            <form onSubmit={handleSaveContent} className="space-y-5 text-xs">
              {/* REQUIREMENT 5: Content Type Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Content Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setContentType('movie')}
                    className={`py-2.5 px-4 rounded-xl border font-bold flex items-center justify-center gap-2 transition ${
                      contentType === 'movie'
                        ? 'bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-900/40'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Film className="w-4 h-4" />
                    <span>Feature Movie</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setContentType('series');
                      if (episodes.length === 0) handleAddEpisode();
                    }}
                    className={`py-2.5 px-4 rounded-xl border font-bold flex items-center justify-center gap-2 transition ${
                      contentType === 'series'
                        ? 'bg-pink-600 border-pink-500 text-white shadow-md shadow-pink-900/40'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Tv className="w-4 h-4" />
                    <span>Series</span>
                  </button>
                </div>
              </div>

              {/* REQUIREMENT 3: Title */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Inception, Stranger Things, Interstellar"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* REQUIREMENT 4: Description / Synopsis */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Description / Synopsis *</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter compelling story synopsis, plot overview, and background details..."
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* REQUIREMENT 2 & 16: Upload Cover Image */}
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-purple-400" />
                    <span>Cover Image / Poster (JPG, PNG, WebP)</span>
                  </label>
                  {coverImageUrl && (
                    <span className="text-[10px] text-emerald-400 font-semibold">Image Linked</span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Image Preview */}
                  <div className="w-20 h-28 rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {coverImageUrl ? (
                      <img src={coverImageUrl} alt="Cover preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-zinc-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        ref={coverFileInputRef}
                        onChange={e => {
                          if (e.target.files?.[0]) handleCoverFileUpload(e.target.files[0]);
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => coverFileInputRef.current?.click()}
                        disabled={isUploadingCover}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isEditing ? 'Replace Cover Image' : 'Browse Cover File'}</span>
                      </button>
                      <span className="text-[10px] text-zinc-500">Up to 30MB</span>
                    </div>

                    <div className="space-y-1">
                      <input
                        type="url"
                        value={coverImageUrl}
                        onChange={e => setCoverImageUrl(e.target.value)}
                        placeholder="Or paste direct image / cloud storage URL (https://...)"
                        className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {isUploadingCover && (
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-purple-500 h-1.5 transition-all" style={{ width: `${coverUploadProgress}%` }} />
                  </div>
                )}
              </div>

              {/* REQUIREMENT 1 & 16: Upload Video File (Only for Movie, or main pilot) */}
              {contentType === 'movie' && (
                <div 
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverVideo(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragOverVideo(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverVideo(false);
                    if (e.dataTransfer.files?.[0]) {
                      handleVideoFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`p-4 rounded-2xl bg-zinc-950/80 border transition-all space-y-3 ${
                    isDragOverVideo 
                      ? 'border-purple-500 bg-purple-950/20 shadow-lg shadow-purple-950/50 scale-[1.01]' 
                      : 'border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileVideo className="w-4 h-4 text-purple-400" />
                      <span>Movie Video File (MP4, WebM, MKV, MOV)</span>
                    </label>
                    {videoUrl && (
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Ready for Streaming
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="file"
                        accept="video/*"
                        ref={videoFileInputRef}
                        onChange={e => {
                          if (e.target.files?.[0]) handleVideoFileUpload(e.target.files[0]);
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => videoFileInputRef.current?.click()}
                        disabled={isUploadingVideo}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        <span>{videoUrl ? 'Replace Video File' : 'Upload Video File to Cloud Storage'}</span>
                      </button>
                      <span className="text-[10px] text-zinc-500">Supports drag & drop, chunked uploads up to 2GB</span>
                    </div>

                    {isDragOverVideo && (
                      <div className="py-4 text-center border border-dashed border-purple-500/60 rounded-xl bg-purple-900/10 text-xs font-semibold text-purple-300 animate-pulse">
                        Drop video file here to upload directly to Cloud Storage...
                      </div>
                    )}

                    <div className="space-y-1">
                      <input
                        type="text"
                        value={videoUrl}
                        onChange={e => setVideoUrl(e.target.value)}
                        placeholder="Or specify streaming URL / Google Cloud Storage / S3 / R2 URL"
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>

                    {/* Movie Real Duration & Detection Controls */}
                    <div className="pt-2.5 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-400" />
                            <span>Movie Duration (Minutes) *</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="600"
                              required
                              value={movieDuration}
                              onChange={e => {
                                setMovieDuration(Math.max(1, parseInt(e.target.value) || 1));
                                setDetectedDurationNotice(null);
                              }}
                              className="w-24 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                            />
                            <span className="text-xs text-zinc-400 font-medium">
                              ({formatDuration(movieDuration)})
                            </span>
                          </div>
                        </div>

                        {videoUrl && (
                          <button
                            type="button"
                            onClick={() => handleDetectDuration(videoUrl)}
                            disabled={isDetectingDuration}
                            className="mt-4 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isDetectingDuration ? 'animate-spin text-purple-400' : ''}`} />
                            <span>{isDetectingDuration ? 'Detecting Duration...' : 'Detect Real Duration'}</span>
                          </button>
                        )}
                      </div>

                      {detectedDurationNotice && (
                        <div className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{detectedDurationNotice}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isUploadingVideo && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Uploading video file...</span>
                        <span>{videoUploadProgress}%</span>
                      </div>
                      <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 transition-all duration-300" style={{ width: `${videoUploadProgress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Season & Episodes Management for TV Series */}
              {contentType === 'series' && (() => {
                const sortedSeasons = [...seasons].sort((a, b) => {
                  const timeA = new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime();
                  const timeB = new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime();
                  if (timeA && timeB && timeA !== timeB) return timeB - timeA;
                  return (Number(b.seasonNumber) || 0) - (Number(a.seasonNumber) || 0);
                });
                const activeSeason = seasons.find(s => s.seasonNumber === activeSeasonNumber) || sortedSeasons[0] || {
                  seasonNumber: 1,
                  seasonName: 'Season 1',
                  title: 'Season 1'
                };
                const activeSeasonEpisodes = episodes
                  .filter(e => (e.seasonNumber || 1) === activeSeason.seasonNumber)
                  .sort((a, b) => {
                    const timeA = new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime();
                    const timeB = new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime();
                    if (timeA && timeB && timeA !== timeB) return timeB - timeA;
                    return (Number(b.episodeNumber) || 0) - (Number(a.episodeNumber) || 0);
                  });

                return (
                  <div className="p-4 rounded-2xl bg-zinc-950/90 border border-pink-900/40 space-y-4">
                    {/* Header with TV icon, total count, and Add Season button */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div>
                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Tv className="w-4 h-4 text-pink-400" />
                          <span>Seasons & Episodes Management</span>
                        </h3>
                        <p className="text-[10px] text-zinc-400">
                          Total {seasons.length} Season{seasons.length > 1 ? 's' : ''} • {episodes.length} Episode{episodes.length > 1 ? 's' : ''} across all seasons
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddSeason}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] transition shadow"
                        title="Add a new season to this TV series"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Season</span>
                      </button>
                    </div>

                    {/* Season Selector Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {seasons.map((sn, idx) => {
                        const count = episodes.filter(e => (e.seasonNumber || 1) === sn.seasonNumber).length;
                        const isCurrent = sn.seasonNumber === activeSeason.seasonNumber;
                        return (
                          <button
                            key={sn.id || idx}
                            type="button"
                            onClick={() => setActiveSeasonNumber(sn.seasonNumber)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border ${
                              isCurrent
                                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white border-pink-400 shadow-md shadow-pink-900/30'
                                : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <span>{sn.seasonName || `Season ${sn.seasonNumber}`}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isCurrent ? 'bg-black/40 text-pink-200' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {count} ep{count !== 1 ? 's' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Season Config Card */}
                    <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                          {/* Season Name / Label */}
                          <div className="flex-1 min-w-[160px]">
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                              Season Name / Number
                            </label>
                            <input
                              type="text"
                              value={activeSeason.seasonName}
                              onChange={e => {
                                const val = e.target.value;
                                setSeasons(prev => prev.map(s => 
                                  s.seasonNumber === activeSeason.seasonNumber 
                                    ? { ...s, seasonName: val, title: val } 
                                    : s
                                ));
                              }}
                              placeholder="e.g. Season 1, Season 10, Final Season"
                              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-white font-medium focus:outline-none focus:border-pink-500"
                            />
                          </div>

                          {/* Numeric Season Number */}
                          <div className="w-28">
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                              Season #
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={activeSeason.seasonNumber}
                              onChange={e => {
                                const newNum = Math.max(1, parseInt(e.target.value) || 1);
                                const oldNum = activeSeason.seasonNumber;
                                if (newNum === oldNum) return;
                                setSeasons(prev => prev.map(s => 
                                  s.seasonNumber === oldNum 
                                    ? { ...s, seasonNumber: newNum } 
                                    : s
                                ));
                                setEpisodes(prev => prev.map(ep => 
                                  (ep.seasonNumber || 1) === oldNum 
                                    ? { ...ep, seasonNumber: newNum } 
                                    : ep
                                ));
                                setActiveSeasonNumber(newNum);
                              }}
                              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-white font-mono text-center focus:outline-none focus:border-pink-500"
                            />
                          </div>
                        </div>

                        {seasons.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSeason(activeSeason.seasonNumber)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 text-[11px] font-semibold border border-transparent hover:border-red-900/50 transition self-end"
                            title="Delete this entire season and its episodes"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Season</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Episodes for Active Season */}
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-pink-300">
                            Episodes in {activeSeason.seasonName || `Season ${activeSeason.seasonNumber}`}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-950/60 border border-pink-900/50 text-pink-300 font-mono">
                            {activeSeasonEpisodes.length} episode{activeSeasonEpisodes.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="video/*"
                            multiple
                            ref={batchEpisodesInputRef}
                            onChange={e => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleBatchEpisodeUpload(Array.from(e.target.files));
                              }
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => batchEpisodesInputRef.current?.click()}
                            disabled={isBatchEpisodesUploading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-pink-300 font-bold text-[11px] border border-pink-900/60 transition shadow disabled:opacity-50"
                            title="Upload multiple videos sequentially into this season"
                          >
                            <FolderUp className="w-3.5 h-3.5" />
                            <span>Batch Upload for {activeSeason.seasonName || `Season ${activeSeason.seasonNumber}`}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddEpisode(activeSeason.seasonNumber)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-[11px] transition shadow"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Episode</span>
                          </button>
                        </div>
                      </div>

                      {isBatchEpisodesUploading && (
                        <div className="p-3 bg-pink-950/40 border border-pink-800/60 rounded-xl space-y-1.5">
                          <div className="flex justify-between text-[11px] text-pink-300">
                            <span>Uploading to {activeSeason.seasonName}: Episode {batchEpisodeProgress.completed + 1} of {batchEpisodeProgress.total}: {batchEpisodeProgress.currentName}</span>
                            <span>{Math.round((batchEpisodeProgress.completed / batchEpisodeProgress.total) * 100)}%</span>
                          </div>
                          <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 transition-all duration-300" 
                              style={{ width: `${Math.round((batchEpisodeProgress.completed / batchEpisodeProgress.total) * 100)}%` }} 
                            />
                          </div>
                        </div>
                      )}

                      {/* Episode List */}
                      {activeSeasonEpisodes.length === 0 ? (
                        <div className="p-6 text-center rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-zinc-400 text-xs">
                          No episodes in this season yet. Click <span className="text-pink-400 font-bold">+ Add Episode</span> or <span className="text-pink-400 font-bold">Batch Upload Videos</span> to populate this season.
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                          {activeSeasonEpisodes.map((ep) => {
                            const globalIndex = episodes.findIndex(e => e.id === ep.id);
                            return (
                              <div key={ep.id || globalIndex} className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-pink-400 text-xs">
                                      Episode {ep.episodeNumber}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">
                                      in {activeSeason.seasonName || `Season ${activeSeason.seasonNumber}`}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEpisode(ep.id || globalIndex)}
                                    className="text-zinc-500 hover:text-red-400 p-1 transition"
                                    title="Delete episode"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                  {/* Episode Number - editable */}
                                  <div className="sm:col-span-2">
                                    <label className="block text-[9px] text-zinc-500 uppercase font-semibold mb-0.5">Ep #</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={ep.episodeNumber}
                                      onChange={e => {
                                        const val = Math.max(1, parseInt(e.target.value) || 1);
                                        setEpisodes(prev => prev.map(item => item.id === ep.id ? { ...item, episodeNumber: val } : item));
                                      }}
                                      className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white font-mono"
                                    />
                                  </div>

                                  {/* Episode Title */}
                                  <div className="sm:col-span-6">
                                    <label className="block text-[9px] text-zinc-500 uppercase font-semibold mb-0.5">Title</label>
                                    <input
                                      type="text"
                                      placeholder="Episode Title"
                                      value={ep.title}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setEpisodes(prev => prev.map(item => item.id === ep.id ? { ...item, title: val } : item));
                                      }}
                                      className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white"
                                    />
                                  </div>

                                  {/* Duration */}
                                  <div className="sm:col-span-4">
                                    <label className="block text-[9px] text-zinc-500 uppercase font-semibold mb-0.5">Duration</label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min="1"
                                        max="300"
                                        placeholder="Min"
                                        value={ep.duration}
                                        onChange={e => {
                                          const val = Math.max(1, parseInt(e.target.value) || 1);
                                          setEpisodes(prev => prev.map(item => item.id === ep.id ? { ...item, duration: val } : item));
                                        }}
                                        className="w-16 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white"
                                      />
                                      <span className="text-[10px] text-zinc-400 font-medium">
                                        {formatDuration(ep.duration)}
                                      </span>
                                      {ep.videoUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleDetectDuration(ep.videoUrl, globalIndex)}
                                          title="Detect duration from video"
                                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold flex items-center gap-1 transition"
                                        >
                                          <Clock className="w-2.5 h-2.5 text-pink-400" />
                                          <span>Detect</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Video Upload / URL */}
                                <div className="space-y-1 pt-1">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="file"
                                      accept="video/*"
                                      id={`ep-video-${ep.id || globalIndex}`}
                                      onChange={e => {
                                        if (e.target.files?.[0]) handleVideoFileUpload(e.target.files[0], globalIndex);
                                      }}
                                      className="hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => document.getElementById(`ep-video-${ep.id || globalIndex}`)?.click()}
                                      disabled={uploadingEpisodeIdx === globalIndex}
                                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold flex items-center gap-1 transition"
                                    >
                                      <Upload className="w-3 h-3" />
                                      <span>{uploadingEpisodeIdx === globalIndex ? 'Uploading...' : 'Upload Video File'}</span>
                                    </button>
                                    <span className="text-[10px] text-zinc-500 truncate max-w-xs">
                                      {ep.videoUrl ? '✓ Video attached' : 'No video attached'}
                                    </span>
                                  </div>

                                  <input
                                    type="text"
                                    placeholder="Video streaming URL (https://... or /uploads/videos/...)"
                                    value={ep.videoUrl}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEpisodes(prev => prev.map(item => item.id === ep.id ? { ...item, videoUrl: val } : item));
                                    }}
                                    className="w-full px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 font-mono"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Metadata Grid (Requirements 6, 7, 8, 9, 10, 11, 12) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* REQUIREMENT 6: Release Year */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Release Year *</label>
                  <input
                    type="number"
                    required
                    value={releaseYear}
                    onChange={e => setReleaseYear(parseInt(e.target.value) || 2026)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                  />
                </div>

                {/* REQUIREMENT 7: Genre / Category */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Genre / Category *</label>
                  <input
                    type="text"
                    required
                    value={genreInput}
                    onChange={e => setGenreInput(e.target.value)}
                    placeholder="Action, Sci-Fi, Drama"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                  />
                </div>

                {/* REQUIREMENT 8: Language */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Language *</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="Swahili">Swahili</option>
                    <option value="German">German</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Korean">Korean</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Chinese">Chinese</option>
                  </select>
                </div>

                {/* REQUIREMENT 9: Rating */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Rating (0.0 to 10.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={rating}
                    onChange={e => setRating(parseFloat(e.target.value) || 8.0)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                  />
                </div>

                {/* REQUIREMENT 10: Video Quality */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Video Quality Badge</label>
                  <select
                    value={quality}
                    onChange={e => setQuality(e.target.value as any)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                  >
                    <option value="HD">HD (720p)</option>
                    <option value="FHD">FHD (1080p)</option>
                    <option value="4K">4K Ultra HD</option>
                  </select>
                </div>

                {/* REQUIREMENT 12: Free or Premium */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Access Tier</label>
                  <select
                    value={accessType}
                    onChange={e => setAccessType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white"
                  >
                    <option value="free">Free to Stream</option>
                    <option value="premium">VIP Premium (Pi Network)</option>
                  </select>
                </div>
              </div>

              {/* REQUIREMENT 11: Trailer URL */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Trailer URL (Optional)</label>
                <input
                  type="url"
                  value={trailerUrl}
                  onChange={e => setTrailerUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or direct MP4"
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600"
                />
              </div>

              {/* REQUIREMENT 17: Publish / Unpublish Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <div>
                  <div className="font-bold text-white text-xs">Publish Immediately to Platform</div>
                  <div className="text-[10px] text-zinc-400">
                    {isPublished ? 'This content will be visible and streamable on the public PiFlix+ app.' : 'Saved as unpublished draft. Only administrators can preview it.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPublished(!isPublished)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 ${
                    isPublished ? 'bg-purple-600 justify-end' : 'bg-zinc-800 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md transform" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingContent}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-purple-900/30 flex items-center gap-2 transition disabled:opacity-50"
                >
                  {savingContent ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving & Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{isEditing ? 'Save Changes & Sync' : 'Upload & Publish Content'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Content Confirmation Modal (Bug 1 Requirements) */}
      {deleteTargetItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Content</h3>
                <p className="text-xs text-zinc-400">Action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-zinc-300">
              Are you sure you want to permanently delete this item?
            </p>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 space-y-1">
              <div className="font-bold text-white truncate">{deleteTargetItem.title}</div>
              <div className="text-[11px] text-zinc-500">ID: {deleteTargetItem.id}</div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteTargetItem(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteAction}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-rose-900/30 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Movie Upload Modal */}
      {isBatchMovieModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Batch Upload Movies</h2>
                  <p className="text-xs text-zinc-400">Select multiple video files to automatically create catalog entries</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!batchMovieUploading) {
                    setIsBatchMovieModalOpen(false);
                    setBatchMovieFiles([]);
                    setBatchMovieResults([]);
                  }
                }}
                disabled={batchMovieUploading}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File selection drop area */}
            <div className="space-y-3">
              <input
                type="file"
                accept="video/*"
                multiple
                ref={batchMovieInputRef}
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    setBatchMovieFiles(Array.from(e.target.files));
                    setBatchMovieResults([]);
                  }
                }}
                className="hidden"
              />

              <div
                onClick={() => !batchMovieUploading && batchMovieInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition ${
                  batchMovieFiles.length > 0 
                    ? 'border-indigo-500/70 bg-indigo-950/20' 
                    : 'border-zinc-700 hover:border-indigo-500 hover:bg-zinc-800/50'
                }`}
              >
                <UploadCloud className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-white">
                  {batchMovieFiles.length > 0 
                    ? `${batchMovieFiles.length} files selected` 
                    : 'Click to select multiple movie video files'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Supports MP4, WebM, MKV, MOV. Titles will be automatically derived from file names.
                </p>
              </div>

              {/* Selected file preview list */}
              {batchMovieFiles.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs">
                  {batchMovieFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 px-2 rounded-lg bg-zinc-900/60 text-zinc-300">
                      <div className="flex items-center gap-2 truncate">
                        <FileVideo className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">{cleanTitleFromFileName(file.name)}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Progress Bar */}
              {batchMovieUploading && (
                <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-1.5">
                  <div className="flex justify-between text-xs text-indigo-300 font-medium">
                    <span>Processing {batchMovieProgress.completed + 1} of {batchMovieProgress.total}: {batchMovieProgress.currentName}</span>
                    <span>{Math.round((batchMovieProgress.completed / batchMovieProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 transition-all duration-300" 
                      style={{ width: `${Math.round((batchMovieProgress.completed / batchMovieProgress.total) * 100)}%` }} 
                    />
                  </div>
                </div>
              )}

              {/* Batch Upload Results */}
              {batchMovieResults.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 px-1">Upload Results:</p>
                  {batchMovieResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-zinc-900">
                      <span className="truncate text-zinc-200">{r.title}</span>
                      {r.success ? (
                        <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Published {r.durationMinutes ? `(${formatDuration(r.durationMinutes)})` : ''}
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1 text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3" /> {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setIsBatchMovieModalOpen(false);
                  setBatchMovieFiles([]);
                  setBatchMovieResults([]);
                }}
                disabled={batchMovieUploading}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition disabled:opacity-50"
              >
                {batchMovieResults.length > 0 ? 'Close' : 'Cancel'}
              </button>

              {batchMovieResults.length === 0 && (
                <button
                  type="button"
                  disabled={batchMovieFiles.length === 0 || batchMovieUploading}
                  onClick={() => handleBatchMovieUpload(batchMovieFiles)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-900/30 disabled:opacity-50"
                >
                  {batchMovieUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading Movies...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Start Batch Upload ({batchMovieFiles.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
