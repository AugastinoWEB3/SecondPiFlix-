import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

// Configure fast failover timeout for Firebase Storage so network operations never hang
try {
  (storage as any).maxUploadRetryTime = 2500;
  (storage as any).maxOperationRetryTime = 2500;
} catch {
  // Ignore
}

let isStorageReachableCache: boolean | null = null;

/**
 * Check if the Firebase Storage bucket is actually provisioned and reachable on Google Cloud.
 * Returns false if the bucket returns 404 (not provisioned).
 */
export async function isStorageReachable(): Promise<boolean> {
  if (isStorageReachableCache !== null) {
    return isStorageReachableCache;
  }

  try {
    const bucket = firebaseConfig.storageBucket || 'empyrean-patrol-bvxch.firebasestorage.app';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    // 404 means the Cloud Storage bucket has not been provisioned in GCP/Firebase
    if (res.status === 404) {
      isStorageReachableCache = false;
      return false;
    }
    isStorageReachableCache = true;
    return true;
  } catch {
    isStorageReachableCache = false;
    return false;
  }
}

export interface UploadResult {
  url: string;
  durationMinutes?: number;
  durationSeconds?: number;
  assetUrl?: string;
  originalName?: string;
}

/**
 * Upload a media file via the server upload API with duration & asset metadata.
 */
async function uploadViaServerApiWithMetadata(
  file: File,
  folder: 'videos' | 'covers' | 'episodes',
  onProgress?: (percentage: number) => void
): Promise<UploadResult> {
  const token = localStorage.getItem('piflix_admin_token') || 'admin_session';
  const isCover = folder === 'covers';

  // For very large files (>80MB) that are videos, try chunked upload for maximum resilience
  if (!isCover && file.size > 80 * 1024 * 1024) {
    try {
      return await uploadFileInChunks(file, onProgress);
    } catch (chunkErr) {
      console.warn('Chunk upload fallback to standard multipart:', chunkErr);
    }
  }

  const formData = new FormData();
  const endpoint = isCover ? '/api/admin/upload/cover' : '/api/admin/upload/video';
  const fieldName = isCover ? 'cover' : 'video';
  formData.append(fieldName, file);

  if (onProgress) onProgress(30);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-admin-request': 'true'
      },
      body: formData
    });

    if (onProgress) onProgress(85);
    const data = await res.json();
    if (data && data.success && data.url) {
      if (onProgress) onProgress(100);
      return {
        url: data.url,
        durationMinutes: data.durationMinutes || undefined,
        durationSeconds: data.durationSeconds || undefined,
        assetUrl: data.assetUrl || undefined,
        originalName: data.originalName || file.name
      };
    }
  } catch (serverErr) {
    console.warn('Server upload fallback notice:', serverErr);
  }

  // If server upload failed for an image file, convert to persistent base64 data URL
  if (isCover) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          if (onProgress) onProgress(100);
          resolve({ url: reader.result });
        } else {
          resolve({ url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80' });
        }
      };
      reader.onerror = () => {
        resolve({ url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80' });
      };
      reader.readAsDataURL(file);
    });
  }

  throw new Error('Upload could not be completed.');
}

/**
 * Robust chunked uploader for large media files (up to 2GB)
 */
async function uploadFileInChunks(
  file: File,
  onProgress?: (percentage: number) => void
): Promise<UploadResult> {
  const token = localStorage.getItem('piflix_admin_token') || 'admin_session';
  const chunkSize = 10 * 1024 * 1024; // 10MB per chunk
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let finalResult: UploadResult | null = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunkBlob = file.slice(start, end);

    const res = await fetch('/api/admin/upload/chunk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': `Bearer ${token}`,
        'x-upload-id': uploadId,
        'x-chunk-index': String(chunkIndex),
        'x-total-chunks': String(totalChunks),
        'x-original-name': encodeURIComponent(file.name)
      },
      body: chunkBlob
    });

    if (!res.ok) {
      throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} upload failed`);
    }

    const data = await res.json();
    const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    if (onProgress) onProgress(progress);

    if (data.completed && data.url) {
      finalResult = {
        url: data.url,
        durationMinutes: data.durationMinutes || undefined,
        durationSeconds: data.durationSeconds || undefined,
        originalName: file.name
      };
    }
  }

  if (finalResult) {
    return finalResult;
  }

  throw new Error('Chunk assembly did not return complete media file');
}

/**
 * Upload media file returning full metadata including duration for videos.
 */
export async function uploadMediaWithMetadata(
  file: File,
  folder: 'videos' | 'covers' | 'episodes',
  onProgress?: (percentage: number) => void
): Promise<UploadResult> {
  if (!file) {
    throw new Error('No file provided for upload.');
  }

  const reachable = await isStorageReachable();

  if (reachable) {
    try {
      const cleanBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanBase}`;
      const filePath = `${folder}/${uniqueName}`;
      const storageRef = ref(storage, filePath);

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type || undefined
        });

        const safetyTimer = setTimeout(() => {
          try { uploadTask.cancel(); } catch {}
          reject(new Error('Firebase Storage timeout, switching to server fallback.'));
        }, 4000);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              if (onProgress) onProgress(progress);
            }
          },
          (error) => {
            clearTimeout(safetyTimer);
            reject(error);
          },
          async () => {
            clearTimeout(safetyTimer);
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (urlErr) {
              reject(urlErr);
            }
          }
        );
      });

      return { url: downloadUrl };
    } catch {
      return uploadViaServerApiWithMetadata(file, folder, onProgress);
    }
  }

  return uploadViaServerApiWithMetadata(file, folder, onProgress);
}

/**
 * Upload a media file (video, cover image, or episode asset).
 * Checks Firebase Storage availability first; if provisioned, uploads to Firebase Storage.
 * If not provisioned or on failure, falls back to server storage seamlessly without throwing retry errors.
 */
export async function uploadMediaToStorage(
  file: File,
  folder: 'videos' | 'covers' | 'episodes',
  onProgress?: (percentage: number) => void
): Promise<string> {
  const result = await uploadMediaWithMetadata(file, folder, onProgress);
  return result.url;
}

/**
 * Permanently delete a media asset from Firebase Storage given its URL or storage path.
 */
export async function deleteMediaFromStorage(mediaUrl: string): Promise<void> {
  if (!mediaUrl || typeof mediaUrl !== 'string') return;

  if (mediaUrl.includes('firebasestorage.googleapis.com') || mediaUrl.includes('firebasestorage.app')) {
    try {
      const reachable = await isStorageReachable();
      if (!reachable) return;
      const storageRef = ref(storage, mediaUrl);
      await deleteObject(storageRef);
    } catch (err: any) {
      console.warn(`Could not delete Firebase Storage file (${mediaUrl}):`, err?.message || err);
    }
  }
}

/**
 * Upload multiple movie / episode video files in parallel or sequence,
 * ensuring independent failure isolation (one failure never fails the rest).
 */
export async function uploadBatchVideosToStorage(
  files: File[],
  onOverallProgress?: (completedCount: number, totalCount: number, currentFileName: string) => void
): Promise<Array<{ file: File; result?: UploadResult; error?: string }>> {
  const outcomes: Array<{ file: File; result?: UploadResult; error?: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onOverallProgress) {
      onOverallProgress(i, files.length, file.name);
    }
    try {
      const res = await uploadMediaWithMetadata(file, 'videos');
      outcomes.push({ file, result: res });
    } catch (err: any) {
      console.error(`Batch upload error for ${file.name}:`, err);
      outcomes.push({ file, error: err?.message || 'Upload failed' });
    }
  }

  if (onOverallProgress) {
    onOverallProgress(files.length, files.length, 'Complete');
  }

  return outcomes;
}
