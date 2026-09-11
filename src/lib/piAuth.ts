import { User } from '../types';

declare global {
  interface Window {
    Pi?: {
      init: (config: { version: string; sandbox?: boolean }) => Promise<void> | void;
      authenticate: (
        scopes: string[],
        onIncompletePaymentFound?: (payment: any) => void
      ) => Promise<{
        accessToken: string;
        user: {
          uid: string;
          username: string;
        };
      }>;
      createPayment?: (
        paymentData: {
          amount: number;
          memo: string;
          metadata: Record<string, any>;
        },
        callbacks: {
          onReadyForServerApproval: (paymentId: string) => Promise<void> | void;
          onReadyForServerCompletion: (paymentId: string, txid: string) => Promise<void> | void;
          onCancel?: (paymentId: string) => void;
          onError?: (error: Error, payment?: any) => void;
        }
      ) => Promise<any>;
    };
  }
}

export function isPiBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator?.userAgent || '';
  if (/PiBrowser/i.test(ua)) return true;
  if (typeof (window as any).Pi?.getPiHostAppInfo === 'function') {
    try {
      const hostInfo = (window as any).Pi.getPiHostAppInfo();
      if (hostInfo) return true;
    } catch {
      // ignore
    }
  }
  if ((window as any).PiNetworkBridge || (window as any).ReactNativeWebView) {
    return true;
  }
  if (typeof document !== 'undefined' && document.referrer && /minepi\.com/i.test(document.referrer)) {
    return true;
  }
  return false;
}

let piInitPromise: Promise<void> | null = null;

/**
 * Resolves the global window.Pi SDK object if available or waits briefly for the script to load.
 */
export async function getPiSDK(timeoutMs = 4000): Promise<NonNullable<Window['Pi']> | null> {
  if (typeof window !== 'undefined' && window.Pi) {
    return window.Pi;
  }

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 80));
    if (typeof window !== 'undefined' && window.Pi) {
      return window.Pi;
    }
  }

  return typeof window !== 'undefined' && window.Pi ? window.Pi : null;
}

/**
 * Initializes the Pi Network SDK.
 * Requirement: Treat Pi.init(...) as a Promise; await it fully before calling Pi.authenticate(...).
 */
export async function initPiSDK(): Promise<void> {
  if (piInitPromise) {
    return piInitPromise;
  }

  piInitPromise = (async () => {
    const Pi = await getPiSDK();
    if (!Pi) {
      throw new Error('Pi Network SDK is not available. Please open inside the Pi Browser.');
    }

    const inPiBrowser = isPiBrowser();
    const isSandboxEnv = !inPiBrowser || window.location.hostname === 'localhost' || window.location.hostname.includes('ais-');

    // Treat Pi.init(...) as a Promise; await it fully before calling Pi.authenticate(...)
    const initExecution = Promise.resolve(Pi.init({ version: '2.0', sandbox: isSandboxEnv }));
    const safetyTimeout = new Promise<void>((resolve) => setTimeout(resolve, 3500));
    await Promise.race([initExecution, safetyTimeout]);
  })();

  return piInitPromise;
}

export interface PiAuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  piUser?: {
    uid: string;
    username: string;
  };
  error?: string;
}

/**
 * Authenticates user via Pi Network SDK and verifies accessToken server-side against GET https://api.minepi.com/v2/me.
 * Requirement: Use the "username" scope.
 */
export async function authenticateWithPi(options?: {
  isAuto?: boolean;
  timeoutMs?: number;
}): Promise<PiAuthResponse> {
  const isAuto = options?.isAuto ?? false;
  const inPiBrowser = isPiBrowser();
  const timeoutMs = options?.timeoutMs ?? (isAuto ? 5000 : 12000);

  try {
    const Pi = await getPiSDK();
    if (!Pi) {
      return {
        success: false,
        error: 'Pi Network SDK is not loaded. Please access this application via the official Pi Browser.'
      };
    }

    // When running automatically on page load outside the Pi Browser,
    // avoid initiating unprompted bridge requests that will never be answered by a native host.
    if (isAuto && !inPiBrowser) {
      console.info('[Pi Network] Non-Pi Browser environment detected during auto-load; awaiting manual sign-in or Pi Browser session.');
      return {
        success: false,
        error: 'Ready to connect. Click "Sign in with Pi" or open in the Pi Browser.'
      };
    }

    // Treat Pi.init(...) as a Promise; await it fully before calling Pi.authenticate(...)
    await initPiSDK();

    // Requirement 1: Pi.authenticate requests the "username" and "payments" scopes
    const scopes: string[] = ['username', 'payments'];

    // Requirement 8: Handle onIncompletePaymentFound during authentication
    const onIncompletePaymentFound = async (payment: any) => {
      console.warn('[Pi Network] Incomplete payment found during authentication:', payment);
      try {
        const reportRes = await fetch('/api/pi/payments/incomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment })
        });
        const reportData = await reportRes.json().catch(() => ({}));
        console.info('[Pi Network] Incomplete payment processed by server:', reportData);
      } catch (err) {
        console.warn('[Pi Network] Failed to dispatch incomplete payment to server:', err);
      }
    };

    // Authenticate with Pi SDK using scopes ["username", "payments"]
    // Attach an immediate .catch handler to the raw promise so that any subsequent 120s timer
    // rejection in the Pi SDK messaging pump is safely caught without unhandled rejection errors.
    const rawAuthPromise = Pi.authenticate(scopes, onIncompletePaymentFound);
    rawAuthPromise.catch((innerErr: any) => {
      console.warn('[Pi Network] SDK messaging pump notice:', innerErr?.message || innerErr);
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            inPiBrowser
              ? 'Pi Network authentication timed out. Please try again.'
              : 'Pi Network bridge did not respond. Please access PiFlix+ inside the official Pi Browser mobile app.'
          )
        );
      }, timeoutMs);
    });

    const authResult = await Promise.race([rawAuthPromise, timeoutPromise]);

    if (!authResult || !authResult.accessToken) {
      return {
        success: false,
        error: 'Pi Network authentication did not return an access token.'
      };
    }

    // Send the returned access token to the backend, which must validate it by calling
    // GET https://api.minepi.com/v2/me with Authorization: Bearer <accessToken> before establishing a session.
    const response = await fetch('/api/auth/pi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authResult.accessToken}`
      },
      body: JSON.stringify({
        accessToken: authResult.accessToken,
        authResult
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.user) {
      return {
        success: false,
        error: data.error || `Server verification failed with status ${response.status}.`
      };
    }

    // Persist verified user session
    localStorage.setItem('piflix_pi_access_token', authResult.accessToken);
    if (data.token) {
      localStorage.setItem('piflix_user_token', data.token);
    }
    localStorage.setItem('piflix_current_user', JSON.stringify(data.user));

    return {
      success: true,
      user: data.user,
      token: data.token,
      piUser: data.piUser
    };
  } catch (err: any) {
    const isTimeout =
      String(err?.message || '').includes('timed out') ||
      String(err?.message || '').includes('Messaging promise');

    console.warn('[Pi Network] Authentication flow notice:', err?.message || err);

    return {
      success: false,
      error: isTimeout
        ? 'Pi Network connection timed out. Please open in the Pi Browser to sign in.'
        : err?.message || 'Failed to authenticate with Pi Network.'
    };
  }
}

export interface PiPaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, any>;
}

export interface PiPaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => Promise<void> | void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => Promise<void> | void;
  onCancel?: (paymentId: string) => void;
  onError?: (error: Error, payment?: any) => void;
}

/**
 * Requirement 2: Pi.createPayment() starts the payment
 */
export async function executePiPayment(
  paymentData: PiPaymentData,
  callbacks: PiPaymentCallbacks
): Promise<any> {
  const Pi = await getPiSDK();
  if (!Pi) {
    throw new Error('Pi Network SDK is not available. Please open PiFlix+ inside the official Pi Browser.');
  }

  await initPiSDK();

  if (typeof Pi.createPayment !== 'function') {
    throw new Error('Pi.createPayment is not supported in this browser. Please open in the Pi Browser mobile app.');
  }

  return Pi.createPayment(paymentData, callbacks);
}
