import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface AdminUserRecord {
  uid: string;
  email: string;
  role: 'admin';
  createdAt: string;
  displayName?: string;
  providerId?: string;
}

export interface AdminAuthResult {
  success: boolean;
  isAdmin?: boolean;
  user?: FirebaseUser;
  token?: string;
  error?: string;
}

/**
 * Sign in with email and password via real Firebase Authentication.
 * Validates that the signed-in user has the Administrator role.
 */
export async function loginAdminWithEmail(email: string, password: string): Promise<AdminAuthResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const idToken = await cred.user.getIdToken(true);

    // Verify admin role via server verification
    const roleCheck = await verifyTokenWithBackend(idToken);
    if (!roleCheck.isAdmin) {
      // User authenticated with Firebase, but does not possess the Admin role
      await signOut(auth);
      return {
        success: false,
        error: `Access Denied: The Firebase account (${cred.user.email}) is not authorized as an Administrator on PiFlix+.`
      };
    }

    localStorage.setItem('piflix_admin_token', idToken);
    return {
      success: true,
      isAdmin: true,
      user: cred.user,
      token: idToken
    };
  } catch (err: any) {
    console.error('Firebase Auth login error:', err);
    return {
      success: false,
      error: formatFirebaseAuthError(err)
    };
  }
}

/**
 * Sign in with Google Popup via Firebase Authentication.
 */
export async function loginAdminWithGoogle(): Promise<AdminAuthResult> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken(true);

    const roleCheck = await verifyTokenWithBackend(idToken);
    if (!roleCheck.isAdmin) {
      await signOut(auth);
      return {
        success: false,
        error: `Access Denied: The Google account (${cred.user.email}) is not authorized as an Administrator on PiFlix+.`
      };
    }

    localStorage.setItem('piflix_admin_token', idToken);
    return {
      success: true,
      isAdmin: true,
      user: cred.user,
      token: idToken
    };
  } catch (err: any) {
    console.error('Firebase Google Auth error:', err);
    return {
      success: false,
      error: formatFirebaseAuthError(err)
    };
  }
}

/**
 * Create a new Firebase account using email & password for administrator access.
 * Note: Once created, only accounts assigned the admin role can access the dashboard.
 */
export async function registerAdminAccount(email: string, password: string): Promise<AdminAuthResult> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const idToken = await cred.user.getIdToken(true);

    // Verify whether this newly registered user is designated as admin (e.g. primary owner frank.gwaza.FG@gmail.com)
    const roleCheck = await verifyTokenWithBackend(idToken);
    if (!roleCheck.isAdmin) {
      await signOut(auth);
      return {
        success: false,
        error: `Account created for ${cred.user.email}, but this email has not yet been assigned the Administrator role by the Super Admin.`
      };
    }

    localStorage.setItem('piflix_admin_token', idToken);
    return {
      success: true,
      isAdmin: true,
      user: cred.user,
      token: idToken
    };
  } catch (err: any) {
    console.error('Firebase register error:', err);
    return {
      success: false,
      error: formatFirebaseAuthError(err)
    };
  }
}

/**
 * Send password reset email via Firebase Authentication.
 */
export async function sendAdminPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: formatFirebaseAuthError(err)
    };
  }
}

/**
 * Sign out the currently logged-in Firebase administrator.
 */
export async function logoutAdminUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Sign out error:', e);
  } finally {
    localStorage.removeItem('piflix_admin_token');
  }
}

/**
 * Retrieve fresh Firebase ID token for Authorization header.
 */
export async function getFreshAdminToken(): Promise<string | null> {
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      localStorage.setItem('piflix_admin_token', token);
      return token;
    } catch {
      // Fall back to stored token
    }
  }
  return localStorage.getItem('piflix_admin_token') || null;
}

/**
 * Verify token with server API and check admin role.
 */
export async function verifyTokenWithBackend(token: string): Promise<{ isAdmin: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/verify-token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { isAdmin: false, error: data.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      isAdmin: Boolean(data.isAdmin),
      email: data.user?.email,
      error: data.error
    };
  } catch (err: any) {
    console.warn('Backend token verification error:', err);
    return { isAdmin: false, error: err?.message || 'Verification failed' };
  }
}

/**
 * Fetch all registered administrators (Firestore + Server).
 */
export async function fetchAuthorizedAdmins(): Promise<AdminUserRecord[]> {
  const token = await getFreshAdminToken();
  if (!token) return [];

  try {
    const res = await fetch('/api/admin/admins', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not fetch admins from API:', e);
  }

  // Fallback to Firestore client SDK if authenticated
  try {
    const snap = await getDocs(collection(db, 'admins'));
    const items: AdminUserRecord[] = [];
    snap.forEach(d => {
      items.push({ uid: d.id, ...d.data() } as AdminUserRecord);
    });
    return items;
  } catch (e) {
    console.warn('Could not fetch admins from Firestore:', e);
  }

  return [];
}

/**
 * Grant administrator role to another user email / UID.
 */
export async function grantAdminRole(email: string, targetUid?: string): Promise<{ success: boolean; error?: string }> {
  const token = await getFreshAdminToken();
  if (!token) return { success: false, error: 'Administrator authentication required' };

  try {
    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email.trim(), uid: targetUid?.trim() })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to grant admin role' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error granting role' };
  }
}

/**
 * Revoke administrator role from an account.
 */
export async function revokeAdminRole(adminId: string): Promise<{ success: boolean; error?: string }> {
  const token = await getFreshAdminToken();
  if (!token) return { success: false, error: 'Administrator authentication required' };

  try {
    const res = await fetch(`/api/admin/admins/${adminId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to revoke admin role' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error revoking role' };
  }
}

/**
 * Translates Firebase Auth error codes into clear, user-friendly security feedback.
 */
function formatFirebaseAuthError(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/user-not-found':
      return 'No administrator account found with this email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Access temporarily locked due to multiple failed login attempts. Please wait a few minutes or reset your password.';
    default:
      return error?.message || 'Firebase authentication failed. Please try again.';
  }
}
