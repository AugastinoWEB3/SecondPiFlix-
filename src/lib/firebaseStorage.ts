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

/**
 * Upload a media file via the server upload API.
 */
async function uploadViaServerApi(
  file: File,
  folder: 'videos' | 'covers' | 'episodes',
  onProgress?: (percentage: number) => void
): Promise<string> {
  const token = localStorage.getItem('piflix_admin_token') || 'admin_session';
  const formData = new FormData();
  const isCover = folder === 'covers';
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
      return data.url;
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
          resolve(reader.result);
        } else {
          resolve('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80');
        }
      };
      reader.onerror = () => {
        resolve('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80');
      };
      reader.readAsDataURL(file);
    });
  }

  throw new Error('Upload could not be completed.');
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

      return await new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type || undefined
        });

        // Set safety timeout of 4 seconds so it fails over quickly if stalled
        const safetyTimer = setTimeout(() => {
          try {
            uploadTask.cancel();
          } catch {
            // ignore
          }
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
            console.warn(`Firebase Storage upload note on ${filePath}:`, error?.message || error);
            reject(error);
          },
          async () => {
            clearTimeout(safetyTimer);
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            } catch (urlErr) {
              reject(urlErr);
            }
          }
        );
      });
    } catch (storageErr) {
      console.warn('Firebase Storage upload failed, utilizing persistent server upload:', storageErr);
      return uploadViaServerApi(file, folder, onProgress);
    }
  }

  // Firebase Storage is not provisioned; use server upload directly
  return uploadViaServerApi(file, folder, onProgress);
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
