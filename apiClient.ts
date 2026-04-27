import { useStore } from './store/index';
import { TIER0_API_BLOCK_MESSAGE } from './store/authConstants';
import { auth } from './firebaseClient';

const API_BASE = '/api/ai';

// FE-side defense-in-depth Tier gate. UI button-disable is the primary
// surface, but if a code path slips through this prevents the request
// from reaching the BE. The real authorization check is BE-side
// (verifyIdToken middleware), but we still gate here to avoid spurious
// Vertex calls and to surface actionable error toasts.

const AUTH_INITIALIZING_MESSAGE = '認証確認中です。数秒後にお試しください。';
const AUTH_EXPIRED_MESSAGE = 'ログイン期限が切れました。再ログインしてください。';
const QUOTA_EXCEEDED_MESSAGE = '今月の AI 利用枠の上限に達しました。来月の更新をお待ちください。';
const SERVICE_UNAVAILABLE_MESSAGE = 'サービスが一時的に利用できません。時間をおいて再度お試しください。';
const NETWORK_ERROR_MESSAGE = '通信エラーが発生しました。';

export type AuthGateErrorCode =
    | 'AUTH_REQUIRED'
    | 'AUTH_INITIALIZING'
    | 'AUTH_EXPIRED'
    | 'QUOTA_EXCEEDED'
    | 'SERVICE_UNAVAILABLE'
    | 'DUPLICATE_REQUEST'
    | 'NETWORK_ERROR'
    | 'REQUEST_ABORTED'
    | 'SERVER_ERROR';

// code は必須。`makeError` 経由で生成された ApiCallError は必ず分類済みで、
// 呼出元の switch (code) で silent fallthrough が起きない契約。
export type ApiCallError = Error & { code: AuthGateErrorCode; status?: number };

const makeError = (code: AuthGateErrorCode, message: string, status?: number): ApiCallError => {
    const err = new Error(message) as ApiCallError;
    err.code = code;
    if (status !== undefined) err.status = status;
    return err;
};

// 既知の HTTP status と BE 返却 code から FE 共通文言にマップ。
// BE が 401/429/503/409 + `{code, error}` envelope を返す前提。
// 全経路が必ず `AuthGateErrorCode` を持つ ApiCallError を返し、呼出元の
// switch 文での silent fallthrough を防ぐ。
const classifyHttpError = (
    status: number,
    body: { error?: string; code?: string } | null,
): ApiCallError => {
    if (status === 401) return makeError('AUTH_EXPIRED', AUTH_EXPIRED_MESSAGE, 401);
    if (status === 429 && body?.code === 'QUOTA_EXCEEDED') {
        return makeError('QUOTA_EXCEEDED', QUOTA_EXCEEDED_MESSAGE, 429);
    }
    if (status === 503 || status === 504) {
        return makeError('SERVICE_UNAVAILABLE', SERVICE_UNAVAILABLE_MESSAGE, status);
    }
    // 409 DUPLICATE_REQUEST: ユーザー視点では 503 と同等扱い、ログには duplicate と残す
    if (status === 409 && body?.code === 'DUPLICATE_REQUEST') {
        return makeError('DUPLICATE_REQUEST', SERVICE_UNAVAILABLE_MESSAGE, 409);
    }
    // 上記いずれにも該当しない 4xx/5xx は SERVER_ERROR でまとめる。BE が body.error
    // を持っていればそれを表示文言に採用、なければ HTTP status を表示。
    const message = body?.error || `HTTP ${status}`;
    return makeError('SERVER_ERROR', message, status);
};

const generateRequestId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // jsdom / 古いブラウザ向け fallback。本番モダンブラウザは crypto.randomUUID で 36 chars
    return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
};

const ensureRequestId = (body: unknown): unknown => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        const obj = body as Record<string, unknown>;
        if (typeof obj.requestId === 'string' && obj.requestId.length > 0) return body;
        return { ...obj, requestId: generateRequestId() };
    }
    // primitive / array body はそのまま（BE は object 前提なので 400 になるが、想定外形を勝手に変えない）
    return body;
};

const performFetch = async <T>(
    endpoint: string,
    body: unknown,
    idToken: string,
): Promise<{ success: true; data: T } | { success: false; error: ApiCallError }> => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null) as { success?: boolean; data?: T; error?: string; code?: string } | null;

    if (!res.ok) {
        return { success: false as const, error: classifyHttpError(res.status, json) };
    }
    if (!json || json.success === false) {
        return { success: false as const, error: classifyHttpError(res.status, json) };
    }
    return { success: true as const, data: json.data as T };
};

export async function apiCall<T>(
    endpoint: string,
    body: unknown,
): Promise<{ success: true; data: T } | { success: false; error: ApiCallError }> {
    const state = useStore.getState();
    const authStatus = state.authStatus;
    if (authStatus !== 'authenticated') {
        const error = authStatus === 'initializing'
            ? makeError('AUTH_INITIALIZING', AUTH_INITIALIZING_MESSAGE)
            : makeError('AUTH_REQUIRED', TIER0_API_BLOCK_MESSAGE);
        return { success: false as const, error };
    }

    // users/init が transient 失敗で残っている場合、AI 呼出前に 1 度 retry。
    // 失敗時は AUTH_REQUIRED で AI 呼出を止め、ユーザーに再ログインを促す
    // (in-flight guard は authSlice 側で実装済み)。
    if (state.needsUserInit) {
        try {
            await state.retryUserInit();
        } catch (retryErr) {
            console.error('retryUserInit failed:', retryErr);
            return { success: false as const, error: makeError('AUTH_REQUIRED', TIER0_API_BLOCK_MESSAGE) };
        }
    }

    const user = auth.currentUser;
    if (!user) {
        return { success: false as const, error: makeError('AUTH_REQUIRED', TIER0_API_BLOCK_MESSAGE) };
    }

    let idToken: string;
    try {
        idToken = await user.getIdToken();
    } catch (tokenErr) {
        console.error('getIdToken failed:', tokenErr);
        // refresh token revoke (再ログイン必須) と一時的な network 障害 (再試行で復帰可)
        // を区別する。前者は AUTH_EXPIRED、後者は SERVICE_UNAVAILABLE で UI 文言が
        // 真逆になるため。
        const tokenErrCode = (tokenErr as { code?: unknown }).code;
        const isNetworkErr = typeof tokenErrCode === 'string' && (
            tokenErrCode === 'auth/network-request-failed' ||
            tokenErrCode === 'auth/internal-error'
        );
        return {
            success: false as const,
            error: isNetworkErr
                ? makeError('SERVICE_UNAVAILABLE', SERVICE_UNAVAILABLE_MESSAGE)
                : makeError('AUTH_EXPIRED', AUTH_EXPIRED_MESSAGE),
        };
    }

    const bodyWithRequestId = ensureRequestId(body);

    try {
        return await performFetch<T>(endpoint, bodyWithRequestId, idToken);
    } catch (error: unknown) {
        // ユーザー取消 (AbortController) と本物の network 障害を区別する。前者は
        // debug 時に「ユーザー操作」として識別したいため REQUEST_ABORTED で分離。
        if (error instanceof Error && error.name === 'AbortError') {
            return { success: false as const, error: makeError('REQUEST_ABORTED', error.message || 'リクエストが取り消されました。') };
        }
        const message = error instanceof Error && error.message ? error.message : NETWORK_ERROR_MESSAGE;
        return { success: false as const, error: makeError('NETWORK_ERROR', message) };
    }
}

// テスト用に内部関数を export
export const __testing = { ensureRequestId, classifyHttpError, generateRequestId };
