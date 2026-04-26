import { useStore } from './store/index';
import { TIER0_API_BLOCK_MESSAGE } from './store/authConstants';

const API_BASE = '/api/ai';

// FE-side defense-in-depth Tier gate. UI button-disable is the primary
// surface, but if a code path slips through this prevents the request
// from reaching the BE. The real authorization check (Bearer token
// verification) is BE-side work tracked separately; this gate is purely
// a soft guardrail and surfaces an actionable error toast.

const AUTH_INITIALIZING_MESSAGE = '認証確認中です。数秒後にお試しください。';

export type AuthGateErrorCode = 'AUTH_REQUIRED' | 'AUTH_INITIALIZING';
export type ApiCallError = Error & { code?: AuthGateErrorCode };

const makeAuthGateError = (code: AuthGateErrorCode, message: string): ApiCallError => {
    const err = new Error(message) as ApiCallError;
    err.code = code;
    return err;
};

export async function apiCall<T>(
    endpoint: string,
    body: unknown
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
    const authStatus = useStore.getState().authStatus;
    if (authStatus !== 'authenticated') {
        const error = authStatus === 'initializing'
            ? makeAuthGateError('AUTH_INITIALIZING', AUTH_INITIALIZING_MESSAGE)
            : makeAuthGateError('AUTH_REQUIRED', TIER0_API_BLOCK_MESSAGE);
        return { success: false as const, error };
    }
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const json = await res.json();

        if (!res.ok || json.success === false) {
            const message = json.error || `HTTP ${res.status}`;
            return { success: false as const, error: new Error(message) };
        }

        return { success: true as const, data: json.data };
    } catch (error: any) {
        return { success: false as const, error: new Error(error?.message || '通信エラーが発生しました。') };
    }
}
