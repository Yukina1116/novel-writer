import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    type User,
} from 'firebase/auth';
import { auth } from '../firebaseClient';
import {
    TERMS_VERSION_MISMATCH_CODE,
    isKnownAcceptTerms409Code,
    type KnownAcceptTerms409Code,
} from '../shared/termsCodes';

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
    // 規約バージョン再取得専用。意図的に needsUserInit を touch せず、
    // AI 呼出 retry 経路 (retryUserInit) と意味論を分離する。失敗時 throw。
    refreshCurrentTermsVersion: () => Promise<void>;
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

const hasNumericStatus = <T extends Error>(e: unknown): e is T & { status: number } =>
    e instanceof Error && typeof (e as { status?: unknown }).status === 'number';

const isUserInitError = (e: unknown): e is UserInitError => hasNumericStatus<UserInitError>(e);

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
        // legacy / malformed レスポンス: prod では fail-closed して
        // 規約 gating を回避させない (rolling deploy / BE rollback 検知も兼ねる)。
        // dev では legacy compat のため null を許容する (test 互換)。
        if (import.meta.env.PROD) {
            throw makeUserInitError(
                'users/init returned legacy/malformed response (currentTermsVersion missing)',
                502,
            );
        }
        console.warn('users/init legacy null response (dev compat)');
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

// accept-terms route 経路で観測しうる非 409 status の具体列挙:
// - 0: fetch 自体の失敗 (network 断 / CORS 拒否)
// - 400: bad request (FE が送る body の形が壊れた契約違反、通常起きない)
// - 401: 認証失効 (verifyIdToken 失敗、再ログイン誘導)
// - 500/502/503/504: サーバ側障害 (502 は本 module で「response malformed」契約違反固定)
// 他 status (403, 422, 5xx 系新コード等) は本 module の narrowStatus で 502 にフォールバック。
// `as const` 配列から型と Set を派生させ、追加時の二重管理を排除する。
const NON_CONFLICT_STATUSES_LIST = [0, 400, 401, 500, 502, 503, 504] as const;
export type NonConflictAcceptTermsStatus = typeof NON_CONFLICT_STATUSES_LIST[number];

const NON_CONFLICT_STATUSES: ReadonlySet<number> = new Set(NON_CONFLICT_STATUSES_LIST);

const narrowAcceptTermsStatus = (s: number): NonConflictAcceptTermsStatus =>
    (NON_CONFLICT_STATUSES.has(s) ? s : 502) as NonConflictAcceptTermsStatus;

// accept-terms route が throw する error の構造。Constructor の引数を discriminated
// union にすることで「status === 409 のとき code 必須 / それ以外は code 不在」を
// 型レベルで強制する。`status: number` の wide arm は意図的に避け、Issue spec の
// 具体列挙に従うことでコンパイラが `{ status: 409 }` (code 欠落) を弾けるようにしている。
export type AcceptTermsErrorInit =
    | { status: 409; code: KnownAcceptTerms409Code }
    | { status: NonConflictAcceptTermsStatus };

export class AcceptTermsError extends Error {
    public readonly status: 409 | NonConflictAcceptTermsStatus;
    public readonly code?: KnownAcceptTerms409Code;
    constructor(message: string, init: AcceptTermsErrorInit) {
        super(message);
        this.name = 'AcceptTermsError';
        this.status = init.status;
        if (init.status === 409) this.code = init.code;
    }
}

// 注: AcceptTermsError class instance に絞らず、`status: number` + 任意 code を持つ
// Error 全般を duck-typing で受ける。理由は (1) 既存テストが plain Error with mutation
// pattern で書かれており互換性を維持する必要があること、(2) 将来 fetch ラッパー等が
// 同形状の Error を throw した際に拾えること。AcceptTermsError instance である保証は
// callAcceptTerms の throw 経路 (本 module) のみが負う。
export const isTermsVersionMismatch = (error: unknown): boolean =>
    hasNumericStatus<Error & { status: number; code?: string }>(error)
    && error.status === 409
    && (error as { code?: string }).code === TERMS_VERSION_MISMATCH_CODE;

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
        // network 断 / CORS 拒否は status=0 で AcceptTermsError 化。
        // status を持たせないと FE の transient 判定 / 文言マップが効かず raw error が露出する。
        throw new AcceptTermsError(
            fetchErr instanceof Error ? fetchErr.message : 'network error',
            { status: 0 },
        );
    }
    if (!resp.ok) {
        // body parse 失敗 (BE が HTML エラーページや非 JSON を返した proxy/CDN 経路) は
        // contentType と元 status を残して post-mortem 可能にする。null 化自体は意図的フォールバック。
        const errBody = await resp.json().catch((parseErr) => {
            console.warn('[accept-terms] response body parse failed', {
                status: resp.status,
                contentType: resp.headers.get('Content-Type'),
                parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
            return null;
        }) as { error?: string; code?: string } | null;
        const message = errBody?.error ?? `accept-terms responded ${resp.status}`;
        // 409 + 既知 code (TERMS_VERSION_MISMATCH / USER_DOC_MISSING) のときのみ code を保持。
        // 未知 code は BE 契約違反として 502 にフォールバック (status は narrowAcceptTermsStatus 経由)。
        if (resp.status === 409 && isKnownAcceptTerms409Code(errBody?.code)) {
            throw new AcceptTermsError(message, { status: 409, code: errBody.code });
        }
        // 409 で未知 code のケースを含む全フォールスルー: status を NonConflictAcceptTermsStatus に narrow。
        // 想定外 status (例 403/422) は 502 (BE 契約違反扱い) に倒し、文言は status >= 500 の経路に乗せる。
        // 元 status / code が消失するため、Sentry 等の post-mortem 用に warn しておく
        // (BE rolling deploy / API 仕様 drift の早期検知)。
        const narrowed = narrowAcceptTermsStatus(resp.status);
        if (narrowed !== resp.status) {
            console.warn('[accept-terms] unexpected status narrowed to NonConflictAcceptTermsStatus', {
                originalStatus: resp.status,
                originalCode: errBody?.code,
                narrowedStatus: narrowed,
                message,
            });
        }
        throw new AcceptTermsError(message, { status: narrowed });
    }
    const body = await resp.json().catch(() => null) as {
        termsAcceptedAt?: string;
        termsVersion?: string;
    } | null;
    if (!body || typeof body.termsAcceptedAt !== 'string' || typeof body.termsVersion !== 'string') {
        // 200 だが body 形が不正 → BE 契約違反。502 として固定し transient 判定対象外に。
        // 元 body は keys のみログ (PII 漏れリスクを避けつつ shape の変化を検知できる粒度)。
        console.warn('[accept-terms] 200 body malformed', {
            keys: body && typeof body === 'object' ? Object.keys(body) : null,
            body: body === null ? '<null/parse-failed>' : '<has-keys>',
        });
        throw new AcceptTermsError('accept-terms returned malformed response', { status: 502 });
    }
    return { termsAcceptedAt: body.termsAcceptedAt, termsVersion: body.termsVersion };
};

// 同時多発防止のための module-scope in-flight guard。同一 retry が複数 AI 呼出
// から並列に走らないようにする（同 Promise を共有）。authSlice の state には
// 入れず closure local で管理（Zustand の re-render を起こさないため）。
let inFlightUserInitRetry: Promise<void> | null = null;
// acceptTerms も同様 (multi-tab / 同時クリック)。state.termsAccepting は UI disabled 用、
// in-flight guard は Promise 共有による真の二重実行防止。
let inFlightAcceptTerms: Promise<void> | null = null;

// test 間の module-scope state リーク防止のため、test 専用 reset を export する。
// 本番コードからは参照しない。
export const __testing = {
    resetInFlightUserInitRetry: (): void => {
        inFlightUserInitRetry = null;
    },
    resetInFlightAcceptTerms: (): void => {
        inFlightAcceptTerms = null;
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
                // M7-α: persisted session の reload でも users/init を実行して terms state を取得。
                // これを怠ると既ログインユーザーが規約同意を回避できる (法務 gating の核心)。
                // signInWithGoogle でも別途呼ぶが、reload 経路では popup を経ないためここで担保。
                if (!user) return;
                void (async () => {
                    const capturedUid = user.uid;
                    try {
                        const termsState = await callUsersInit(user);
                        // resolve 時にユーザーが入れ替わっていれば破棄 (signOut + 別 sign-in race 対策)
                        if (auth.currentUser?.uid !== capturedUid) return;
                        set({ needsUserInit: false });
                        if (termsState) {
                            applyTermsState(set, termsState);
                        }
                    } catch (initError: unknown) {
                        if (auth.currentUser?.uid !== capturedUid) return;
                        console.error('users/init failed (persisted session):', initError);
                        if (isUserInitError(initError) && isTransientUserInitError(initError.status)) {
                            set({ needsUserInit: true });
                        }
                    }
                })();
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
                // acceptTerms 実行中に signOut した場合、termsAccepting=true のまま残ると
                // 次回ログインで silent failure (UI disabled のまま) になる。明示的に false へ。
                termsAccepting: false,
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
        // Multi-tab / 同時クリック対策: in-flight Promise を共有して真の二重実行を防ぐ。
        // state.termsAccepting (React state) は UI disabled 用で別レイヤー。
        if (inFlightAcceptTerms) return inFlightAcceptTerms;

        const user = auth.currentUser;
        if (!user) throw new Error('acceptTerms called without authenticated user');
        const capturedUid = user.uid;
        const currentVersion = (get() as { currentTermsVersion?: string | null }).currentTermsVersion;
        if (!currentVersion) {
            throw new Error('acceptTerms called before users/init completed');
        }

        inFlightAcceptTerms = (async () => {
            set({ termsAccepting: true });
            try {
                const result = await callAcceptTerms(user, currentVersion);
                // resolve 時にユーザーが入れ替わっていれば破棄 (signOut + 別 sign-in race 対策)
                if (auth.currentUser?.uid !== capturedUid) return;
                applyTermsState(set, {
                    termsAcceptedAt: result.termsAcceptedAt,
                    termsVersion: result.termsVersion,
                    currentTermsVersion: currentVersion,
                });
            } catch (error: unknown) {
                console.error('acceptTerms failed:', error);
                // mismatch (409) は recoverable signal なので generic 失敗 toast を出さない。
                // modal 側が refreshCurrentTermsVersion → 再同意 UI を回す。
                if (!isTermsVersionMismatch(error)) {
                    reportAuthError(get, '利用規約の同意に失敗しました', error);
                }
                throw error;
            } finally {
                set({ termsAccepting: false });
                inFlightAcceptTerms = null;
            }
        })();
        return inFlightAcceptTerms;
    },

    refreshCurrentTermsVersion: async () => {
        const user = auth.currentUser;
        if (!user) throw new Error('refreshCurrentTermsVersion called without authenticated user');
        const capturedUid = user.uid;
        const termsState = await callUsersInit(user);
        if (auth.currentUser?.uid !== capturedUid) return;
        if (!termsState) {
            // legacy / null レスポンス時に据え置きすると mismatch 連鎖で無限ループ。
            // 再 fetch が意味を成さない状態なので throw して modal を fatal 経路に倒す。
            throw new Error(
                'refreshCurrentTermsVersion: users/init returned legacy/malformed response',
            );
        }
        applyTermsState(set, termsState);
        // needsUserInit は意図的に touch しない (AI 呼出 retry 経路と切り離す)。
    },
});
