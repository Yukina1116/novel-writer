import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    type User,
} from 'firebase/auth';
import { auth } from '../firebaseClient';

export type AuthStatus = 'initializing' | 'unauthenticated' | 'authenticated';

export interface CurrentUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

export interface AuthSlice {
    currentUser: CurrentUser | null;
    authStatus: AuthStatus;
    authError: string | null;
    // users/init が transient 失敗した場合に true。AI 呼出前の retry signal として
    // apiClient が確認し、再試行を 1 度だけ行う（permanent 失敗の無限ループ防止）。
    needsUserInit: boolean;
    initAuth: () => () => void;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    // 内部用: AI 呼出前に呼ぶ retry。成功で needsUserInit=false、失敗時は throw。
    // in-flight guard で同時多発の users/init 多重発火を防ぐ。
    retryUserInit: () => Promise<void>;
}

const toCurrentUser = (user: User | null): CurrentUser | null =>
    user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
    } : null;

// Slice-local view of get(): showToast lives on UiSlice but the type union
// only resolves at store composition time, so we cast here.
const reportAuthError = (
    get: () => unknown,
    prefix: string,
    error: unknown,
): string => {
    const message = error instanceof Error ? error.message : String(error);
    (get() as { showToast?: (m: string, t: string) => void }).showToast?.(
        `${prefix}: ${message}`,
        'error',
    );
    return message;
};

// users/init 呼出で transient と扱うべき HTTP status。
// - 503: Firestore UNAVAILABLE / DEADLINE_EXCEEDED 由来 (handleApiError)
// - 504: Gateway timeout、Cloud Run / プロキシ層由来
// - 0: fetch 自体が失敗 (ネットワーク断、CORS 拒否等)。response が無いケースで
//   呼出元が status=0 を埋めて渡す。
const isTransientUserInitError = (status: number): boolean =>
    status === 503 || status === 504 || status === 0;

const callUsersInit = async (user: User): Promise<void> => {
    const idToken = await user.getIdToken();
    let resp: Response;
    try {
        resp = await fetch('/api/users/init', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
        });
    } catch (fetchErr) {
        // ネットワーク断 / CORS 拒否等で fetch 自体が throw した場合、status=0 で
        // transient 扱いにする（isTransientUserInitError が 0 を transient 判定）。
        const error = new Error(
            fetchErr instanceof Error ? fetchErr.message : 'network error',
        ) as Error & { status?: number };
        error.status = 0;
        throw error;
    }
    if (resp.ok) return;
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    const error = new Error(body?.error ?? `users/init responded ${resp.status}`) as Error & { status?: number };
    error.status = resp.status;
    throw error;
};

// 同時多発防止のための module-scope in-flight guard。同一 retry が複数 AI 呼出
// から並列に走らないようにする（同 Promise を共有）。authSlice の state には
// 入れず closure local で管理（Zustand の re-render を起こさないため）。
let inFlightUserInitRetry: Promise<void> | null = null;

// test 間の module-scope state リーク防止のため、test 専用 reset を export する。
// 本番コードからは参照しない。
export const __testing = {
    resetInFlightUserInitRetry: (): void => {
        inFlightUserInitRetry = null;
    },
};

export const createAuthSlice = (set, get): AuthSlice => ({
    currentUser: null,
    authStatus: 'initializing' as AuthStatus,
    authError: null,
    needsUserInit: false,

    initAuth: () => {
        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                set({
                    currentUser: toCurrentUser(user),
                    authStatus: user ? 'authenticated' : 'unauthenticated',
                    authError: null,
                });
            },
            (error) => {
                console.error('onAuthStateChanged error:', error);
                const message = reportAuthError(get, '認証状態の取得に失敗しました', error);
                set({ currentUser: null, authStatus: 'unauthenticated', authError: message });
            },
        );
        return unsubscribe;
    },

    signInWithGoogle: async () => {
        try {
            set({ authError: null });
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            // currentUser update flows through onAuthStateChanged listener.

            // Server-side transaction creates/refreshes users/{uid} metadata
            // and preserves createdAt across re-logins. transient (503) は
            // needsUserInit=true で残し、AI 呼出時に retry させる。permanent
            // (4xx) はトーストのみで残す（再 init しても直らないため）。
            try {
                await callUsersInit(result.user);
                set({ needsUserInit: false });
            } catch (initError: unknown) {
                console.error('users/init failed:', initError);
                reportAuthError(get, 'ユーザー初期化に失敗しました', initError);
                const status = (initError as { status?: number }).status ?? 0;
                if (isTransientUserInitError(status)) {
                    set({ needsUserInit: true });
                }
            }
        } catch (error: unknown) {
            const code = (error as { code?: string }).code;
            if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                return;
            }
            console.error('signInWithGoogle failed:', error);
            const prefix = code === 'auth/popup-blocked'
                ? 'ポップアップがブロックされました。許可してから再度お試しください'
                : 'ログインに失敗しました';
            const message = reportAuthError(get, prefix, error);
            set({ authError: message });
        }
    },

    signOut: async () => {
        try {
            set({ authError: null });
            await firebaseSignOut(auth);
            set({ needsUserInit: false });
            // currentUser update flows through onAuthStateChanged listener.
        } catch (error: unknown) {
            console.error('signOut failed:', error);
            const message = reportAuthError(get, 'ログアウトに失敗しました', error);
            set({ authError: message });
        }
    },

    retryUserInit: async () => {
        // 同一 retry を複数の AI 呼出が並列に走らせると users/init が多重発火
        // するため、in-flight Promise を共有して重複呼出を 1 本にまとめる。
        if (inFlightUserInitRetry) return inFlightUserInitRetry;

        const user = auth.currentUser;
        if (!user) throw new Error('retryUserInit called without authenticated user');

        inFlightUserInitRetry = (async () => {
            try {
                await callUsersInit(user);
                set({ needsUserInit: false });
            } catch (error) {
                // permanent / 設定不能な失敗の場合 needsUserInit=true のままだと
                // AI 呼出のたびに再 retry が走り続ける。一旦 false に戻し、AI 呼出側
                // (apiClient) は throw を catch して AUTH_REQUIRED で AI を止める。
                // 本当に transient なら次回ログイン or onAuthStateChanged で復帰する。
                set({ needsUserInit: false });
                throw error;
            } finally {
                inFlightUserInitRetry = null;
            }
        })();
        return inFlightUserInitRetry;
    },
});
