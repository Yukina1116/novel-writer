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
    // M7-α (P4): 利用規約への同意状態。users/init レスポンスに基づき設定する。
    // null = users/init 未完了 / `string` = 同意済バージョン / `''` = 未同意。
    termsAcceptedAt: string | null;
    termsVersion: string | null;
    // サーバー側現行 TERMS_VERSION。FE は `termsVersion !== currentTermsVersion` で再同意要求。
    currentTermsVersion: string | null;
    // 派生: users/init 完了後、未同意 or バージョン不一致なら true。FE は TermsConsentModal を表示。
    needsTermsAccept: boolean;
    // accept-terms route 呼出中の loading flag。重複クリック / 多重発火防止。
    termsAccepting: boolean;
    initAuth: () => () => void;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    // 内部用: AI 呼出前に呼ぶ retry。成功で needsUserInit=false、失敗時は throw。
    // in-flight guard で同時多発の users/init 多重発火を防ぐ。
    retryUserInit: () => Promise<void>;
    // M7-α (P4): 同意ボタン押下時に呼ぶ。POST /api/users/accept-terms 経由で
    // termsAcceptedAt / termsVersion を更新、needsTermsAccept = false に倒す。
    // 失敗時は throw (UI 側で toast)。
    acceptTerms: () => Promise<void>;
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

// users/init 呼出のエラー型。status が必須なので、catch 側で type guard を
// 通せば「foreign error が status 未定義のまま transient 判定に流れ込む」
// silent fallthrough を防げる。
export interface UserInitError extends Error {
    status: number;
}

const isUserInitError = (e: unknown): e is UserInitError =>
    e instanceof Error && typeof (e as { status?: unknown }).status === 'number';

const makeUserInitError = (message: string, status: number): UserInitError => {
    const err = new Error(message) as UserInitError;
    err.status = status;
    return err;
};

// users/init 呼出で transient と扱うべき HTTP status。
// - 503: Firestore UNAVAILABLE / DEADLINE_EXCEEDED 由来 (handleApiError)
// - 504: Gateway timeout、Cloud Run / プロキシ層由来
// - 0: fetch 自体が失敗 (ネットワーク断、CORS 拒否等)。response が無いケースで
//   呼出元が status=0 を埋めて渡す。
const isTransientUserInitError = (status: number): boolean =>
    status === 503 || status === 504 || status === 0;

// users/init レスポンスから取得する規約同意状態。サーバ実装と shape を合わせる。
export interface UsersInitTermsState {
    termsAcceptedAt: string | null;
    termsVersion: string | null;
    currentTermsVersion: string;
}

const callUsersInit = async (user: User): Promise<UsersInitTermsState | null> => {
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
        throw makeUserInitError(
            fetchErr instanceof Error ? fetchErr.message : 'network error',
            0,
        );
    }
    if (resp.ok) {
        // M7-α: レスポンスに user.termsAcceptedAt / termsVersion + currentTermsVersion を含む。
        // 旧形式 ({success: true} のみ) には null を返す (legacy / test 互換)。
        const body = await resp.json().catch(() => null) as {
            user?: { termsAcceptedAt?: string | null; termsVersion?: string | null };
            currentTermsVersion?: string;
        } | null;
        if (body && typeof body.currentTermsVersion === 'string' && body.user) {
            return {
                termsAcceptedAt: body.user.termsAcceptedAt ?? null,
                termsVersion: body.user.termsVersion ?? null,
                currentTermsVersion: body.currentTermsVersion,
            };
        }
        return null;
    }
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    throw makeUserInitError(
        body?.error ?? `users/init responded ${resp.status}`,
        resp.status,
    );
};

// M7-α: termsAcceptedAt + termsVersion から needsTermsAccept を導出。
// - users/init 未完了 (currentTermsVersion === null) → false (モーダル抑止)
// - termsAcceptedAt === null (未同意) → true
// - termsVersion !== currentTermsVersion (古い版に同意) → true
// - それ以外 → false
export const computeNeedsTermsAccept = (
    termsAcceptedAt: string | null,
    termsVersion: string | null,
    currentTermsVersion: string | null,
): boolean => {
    if (currentTermsVersion === null) return false;
    if (termsAcceptedAt === null) return true;
    return termsVersion !== currentTermsVersion;
};

const callAcceptTerms = async (
    user: User,
    termsVersion: string,
): Promise<{ termsAcceptedAt: string; termsVersion: string }> => {
    const idToken = await user.getIdToken();
    let resp: Response;
    try {
        resp = await fetch('/api/users/accept-terms', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ termsVersion }),
        });
    } catch (fetchErr) {
        throw new Error(
            fetchErr instanceof Error ? fetchErr.message : 'network error',
        );
    }
    if (!resp.ok) {
        const body = await resp.json().catch(() => null) as { error?: string; code?: string } | null;
        const err = new Error(body?.error ?? `accept-terms responded ${resp.status}`) as Error & {
            status: number;
            code?: string;
        };
        err.status = resp.status;
        if (body?.code) err.code = body.code;
        throw err;
    }
    const body = await resp.json().catch(() => null) as {
        termsAcceptedAt?: string;
        termsVersion?: string;
    } | null;
    if (!body || typeof body.termsAcceptedAt !== 'string' || typeof body.termsVersion !== 'string') {
        throw new Error('accept-terms returned malformed response');
    }
    return { termsAcceptedAt: body.termsAcceptedAt, termsVersion: body.termsVersion };
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

// 同意状態のセッターを共通化 (callUsersInit / acceptTerms から利用)。
const applyTermsState = (
    set: (partial: Partial<AuthSlice>) => void,
    state: { termsAcceptedAt: string | null; termsVersion: string | null; currentTermsVersion: string | null },
): void => {
    set({
        termsAcceptedAt: state.termsAcceptedAt,
        termsVersion: state.termsVersion,
        currentTermsVersion: state.currentTermsVersion,
        needsTermsAccept: computeNeedsTermsAccept(
            state.termsAcceptedAt,
            state.termsVersion,
            state.currentTermsVersion,
        ),
    });
};

export const createAuthSlice = (set, get): AuthSlice => ({
    currentUser: null,
    authStatus: 'initializing' as AuthStatus,
    authError: null,
    needsUserInit: false,
    termsAcceptedAt: null,
    termsVersion: null,
    currentTermsVersion: null,
    needsTermsAccept: false,
    termsAccepting: false,

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
                const termsState = await callUsersInit(result.user);
                set({ needsUserInit: false });
                if (termsState) {
                    applyTermsState(set, termsState);
                }
            } catch (initError: unknown) {
                console.error('users/init failed:', initError);
                reportAuthError(get, 'ユーザー初期化に失敗しました', initError);
                // type guard 経由で UserInitError の status を読む。foreign error
                // (例: SDK 内部の TypeError) は status 不明のため transient 判定せず、
                // needsUserInit=false のまま (= AI 呼出で AUTH_EXPIRED 経路に倒す)。
                if (isUserInitError(initError) && isTransientUserInitError(initError.status)) {
                    set({ needsUserInit: true });
                }
            }
        } catch (error: unknown) {
            // User-intent cancels (closed popup, double-clicked sign-in) are
            // not errors — silence them so the toast stays for actual problems
            // (network failure, popup blocker, provider config).
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
            set({
                needsUserInit: false,
                termsAcceptedAt: null,
                termsVersion: null,
                currentTermsVersion: null,
                needsTermsAccept: false,
            });
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
                const termsState = await callUsersInit(user);
                set({ needsUserInit: false });
                if (termsState) {
                    applyTermsState(set, termsState);
                }
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

    acceptTerms: async () => {
        const user = auth.currentUser;
        if (!user) throw new Error('acceptTerms called without authenticated user');
        const currentVersion = (get() as { currentTermsVersion?: string | null }).currentTermsVersion;
        if (!currentVersion) {
            throw new Error('acceptTerms called before users/init completed');
        }
        if ((get() as { termsAccepting?: boolean }).termsAccepting) {
            // 重複押下を防ぐ。loading 中はそのまま return (UI 側で disabled 表示)。
            return;
        }
        set({ termsAccepting: true });
        try {
            const result = await callAcceptTerms(user, currentVersion);
            applyTermsState(set, {
                termsAcceptedAt: result.termsAcceptedAt,
                termsVersion: result.termsVersion,
                currentTermsVersion: currentVersion,
            });
        } catch (error: unknown) {
            console.error('acceptTerms failed:', error);
            reportAuthError(get, '利用規約の同意に失敗しました', error);
            // TERMS_VERSION_MISMATCH (409) の場合は users/init を再 fetch して
            // currentTermsVersion を更新する経路を作るべきだが、PR-D-1 では throw のみ。
            // PR-D-2 (UI 実装) で modal 内で再 fetch する flow を追加する。
            throw error;
        } finally {
            set({ termsAccepting: false });
        }
    },
});
