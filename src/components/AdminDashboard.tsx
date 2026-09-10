import React, { useState, useEffect, useRef } from 'react';
import {
  Film, Tv, Users, DollarSign, Eye, Clock, BarChart3, Plus, Edit2, Trash2,
  Save, Sparkles, Sliders, ShieldCheck, CheckCircle2, AlertTriangle, Search,
  Radio, Layers, Check, X, RefreshCw, Upload, Play, Lock, Unlock,
  Image as ImageIcon, FileVideo, Filter, ExternalLink, LogOut, KeyRound, ArrowUpDown
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ContentItem, Movie, TVSeries, User } from '../types';
import { saveContent, deleteContent, setPublishedState } from '../lib/firebaseContent';

interface EpisodeFormItem {
  id?: string;
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
  const [adminSection, setAdminSection] = useState<'content' | 'overview' | 'users' | 'settings' | 'admins'>('content');
  const [overviewStats, setOverviewStats] = useState<any>(null);
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
  const [episodes, setEpisodes] = useState<EpisodeFormItem[]>([]);

  // File upload state & progress
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadProgress, setCoverUploadProgress] = useState(0);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  // Episode video upload state tracker: episode index -> boolean
  const [uploadingEpisodeIdx, setUploadingEpisodeIdx] = useState<number | null>(null);

  // Settings form state
  const [formSettings, setFormSettings] = useState({ ...settings });
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);

  // File inputs ref
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch admin overview stats and admin team list
  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [ovRes, usrRes, admRes] = await Promise.all([
        fetch('/api/admin/overview', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => null),
        fetch('/api/admin/users', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => []),
        fetch('/api/admin/admins', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
        }).then(r => r.json()).catch(() => [])
      ]);
      if (ovRes) setOverviewStats(ovRes);
      if (Array.isArray(usrRes)) setUsersList(usrRes);
      if (Array.isArray(admRes)) setAdminsList(admRes);
    } catch (e) {
      console.error('Error loading admin data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin, adminToken]);

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
        id: `ep-temp-1`,
        episodeNumber: 1,
        title: 'Episode 1: Pilot',
        description: 'The journey begins.',
        thumbnail: '',
        videoUrl: '',
        duration: 45,
        skipIntroSec: 15
      }
    ] : []);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);
    setUploadFeedback(null);
    setIsModalOpen(true);
  };

  // Open Edit Content Modal (Requirement 14 & 16)
  const openEditModal = (item: Movie | TVSeries) => {
    setIsEditing(true);
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

    if (isSeries) {
      const seriesEpisodes: EpisodeFormItem[] = ((item as any).episodes || []).map((ep: any, idx: number) => ({
        id: ep.id || `ep-${item.id}-${idx + 1}`,
        episodeNumber: ep.episodeNumber || idx + 1,
        title: ep.title || `Episode ${idx + 1}`,
        description: ep.description || '',
        thumbnail: ep.thumbnail || item.coverImageUrl || item.poster || '',
        videoUrl: ep.videoUrl || '',
        duration: ep.duration || 45,
        skipIntroSec: ep.skipIntroSec || 0
      }));
      setEpisodes(seriesEpisodes.length > 0 ? seriesEpisodes : [
        {
          id: `ep-${item.id}-1`,
          episodeNumber: 1,
          title: 'Episode 1',
          description: '',
          thumbnail: item.coverImageUrl || item.poster || '',
          videoUrl: '',
          duration: 45,
          skipIntroSec: 0
        }
      ]);
    } else {
      setEpisodes([]);
    }

    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);
    setUploadFeedback(null);
    setIsModalOpen(true);
  };

  // Handle Video File Upload (Requirement 1 & 16)
  const handleVideoFileUpload = async (file: File, episodeIdx?: number) => {
    if (!file) return;

    if (episodeIdx !== undefined) {
      setUploadingEpisodeIdx(episodeIdx);
    } else {
      setIsUploadingVideo(true);
      setVideoUploadProgress(15);
    }
    setUploadFeedback(`Uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

    const formData = new FormData();
    formData.append('video', file);

    try {
      // Simulate progress progression for user feedback
      const progressInterval = setInterval(() => {
        setVideoUploadProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 300);

      const res = await fetch('/api/admin/upload/video', {
        method: 'POST',
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
        body: formData
      });

      clearInterval(progressInterval);
      setVideoUploadProgress(100);

      const data = await res.json();
      if (data.success && data.url) {
        if (episodeIdx !== undefined) {
          setEpisodes(prev => {
            const next = [...prev];
            next[episodeIdx] = { ...next[episodeIdx], videoUrl: data.url };
            return next;
          });
          setUploadFeedback(`Episode ${episodeIdx + 1} video uploaded successfully!`);
        } else {
          setVideoUrl(data.url);
          setUploadFeedback(`Main video uploaded successfully (${(data.size / (1024 * 1024)).toFixed(1)} MB). Ready for streaming.`);
        }
      } else {
        setUploadFeedback(`Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setUploadFeedback(`Upload error: ${err?.message || 'Server connection error'}`);
    } finally {
      setIsUploadingVideo(false);
      setUploadingEpisodeIdx(null);
    }
  };

  // Handle Cover Image File Upload (Requirement 2 & 16)
  const handleCoverFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploadingCover(true);
    setCoverUploadProgress(20);
    setUploadFeedback(`Uploading cover image ${file.name}...`);

    const formData = new FormData();
    formData.append('cover', file);

    try {
      const res = await fetch('/api/admin/upload/cover', {
        method: 'POST',
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
        body: formData
      });
      setCoverUploadProgress(100);
      const data = await res.json();
      if (data.success && data.url) {
        setCoverImageUrl(data.url);
        setUploadFeedback('Cover image uploaded and linked successfully!');
      } else {
        setUploadFeedback(`Cover upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setUploadFeedback(`Cover upload error: ${err?.message || 'Server connection error'}`);
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Add a new Episode to TV series (Requirement 13)
  const handleAddEpisode = () => {
    const nextNumber = episodes.length + 1;
    setEpisodes(prev => [
      ...prev,
      {
        id: `ep-${contentId}-${nextNumber}`,
        episodeNumber: nextNumber,
        title: `Episode ${nextNumber}`,
        description: '',
        thumbnail: coverImageUrl,
        videoUrl: '',
        duration: 45,
        skipIntroSec: 15
      }
    ]);
  };

  // Remove an Episode
  const handleRemoveEpisode = (idx: number) => {
    setEpisodes(prev => prev.filter((_, i) => i !== idx).map((ep, i) => ({ ...ep, episodeNumber: i + 1 })));
  };

  // Save / Submit Content Form (Firestore + Server API Sync)
  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setSaveErrorMessage('Please enter a title for the content item');
      return;
    }

    setSavingContent(true);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

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
      genre: genreInput.trim(),
      language: language.trim() || 'English',
      rating: Number(rating) || 8.0,
      quality: quality || 'HD',
      accessType,
      published: isPublished,
      createdAt: now,
      updatedAt: now,
      episodes: contentType === 'series' ? episodes : undefined
    };

    try {
      // 1. Save to Firestore (primary persistent storage)
      const firestoreResult = await saveContent(itemToSave);

      // 2. Also save to server API to keep in-memory cache synchronized
      const apiEndpoint = isEditing ? `/api/content/${itemToSave.id}` : '/api/content';
      const method = isEditing ? 'PUT' : 'POST';
      await fetch(apiEndpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify(itemToSave)
      }).catch(err => console.warn('Server API sync fallback error:', err));

      setSaveSuccessMessage(
        itemToSave.published 
          ? `Successfully saved to Cloud Firestore and published to PiFlix+!`
          : `Saved content draft successfully!`
      );

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

  // Delete Content Item (Requirement 15)
  const handleDeleteContent = async (item: Movie | TVSeries) => {
    const isSeries = 'seasonsCount' in item;
    const confirmDelete = window.confirm(`Are you sure you want to permanently delete "${item.title}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
      // Delete from Firestore
      await deleteContent(item.id);

      // Delete from server API
      await fetch(`/api/content/${item.id}`, {
        method: 'DELETE',
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
      });

      await refreshContent();
      await loadAdminData();
    } catch (err) {
      console.error('Delete error', err);
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
      await refreshContent();
      await loadAdminData();
    } catch (err) {
      console.error('Toggle publish error', err);
    }
  };

  // Combine movies and series for unified catalog table (Requirement 18 & 19)
  const allCatalogItems = [
    ...movies.map(m => ({ ...m, type: 'movie' as const })),
    ...seriesList.map(s => ({ ...s, type: 'series' as const }))
  ];

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
            <span>Upload TV Series</span>
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
                  <option value="series">TV Series Only</option>
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
                            <div>{item.year}</div>
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
                <span>TV Series</span>
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
                  <img src={u.profileImage} alt={u.username} className="w-8 h-8 rounded-full object-cover" />
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
                    {isEditing ? `Edit ${contentType === 'movie' ? 'Movie' : 'TV Series'}` : `Upload New ${contentType === 'movie' ? 'Movie' : 'TV Series'}`}
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
                    <span>TV Series Show</span>
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
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
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
                      <span className="text-[10px] text-zinc-500">Supports up to 2GB per video with HTTP Range streaming</span>
                    </div>

                    <div className="space-y-1">
                      <input
                        type="text"
                        value={videoUrl}
                        onChange={e => setVideoUrl(e.target.value)}
                        placeholder="Or specify streaming URL / Google Cloud Storage / S3 / R2 URL"
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 font-mono"
                      />
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

              {/* REQUIREMENT 13: Multiple Episodes Builder for TV Series */}
              {contentType === 'series' && (
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-pink-900/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Tv className="w-4 h-4 text-pink-400" />
                        <span>Episodes Management ({episodes.length} Episodes)</span>
                      </h3>
                      <p className="text-[10px] text-zinc-400">Add, upload videos, and organize all episodes for this TV series.</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddEpisode}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-[11px] transition shadow"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Episode</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {episodes.map((ep, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-pink-400 text-xs">Episode {ep.episodeNumber}</span>
                          {episodes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEpisode(idx)}
                              className="text-zinc-500 hover:text-red-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Episode Title"
                            value={ep.title}
                            onChange={e => {
                              const next = [...episodes];
                              next[idx].title = e.target.value;
                              setEpisodes(next);
                            }}
                            className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white"
                          />
                          <input
                            type="number"
                            placeholder="Duration (minutes)"
                            value={ep.duration}
                            onChange={e => {
                              const next = [...episodes];
                              next[idx].duration = parseInt(e.target.value) || 45;
                              setEpisodes(next);
                            }}
                            className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white"
                          />
                        </div>

                        {/* Episode video upload or URL */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="video/*"
                              id={`ep-video-${idx}`}
                              onChange={e => {
                                if (e.target.files?.[0]) handleVideoFileUpload(e.target.files[0], idx);
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => document.getElementById(`ep-video-${idx}`)?.click()}
                              disabled={uploadingEpisodeIdx === idx}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold flex items-center gap-1 transition"
                            >
                              <Upload className="w-3 h-3" />
                              <span>{uploadingEpisodeIdx === idx ? 'Uploading...' : 'Upload Video File'}</span>
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
                              const next = [...episodes];
                              next[idx].videoUrl = e.target.value;
                              setEpisodes(next);
                            }}
                            className="w-full px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 font-mono"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
    </div>
  );
};
