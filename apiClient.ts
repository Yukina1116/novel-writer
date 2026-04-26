import { useStore } from './store/index';

const API_BASE = '/api/ai';

// FE-side defense-in-depth Tier gate. UI button-disable is the primary
// surface, but if a code path slips through (e.g. inner drawer button not
// yet gated), this prevents the request from reaching the BE. The real
// authorization check (Bearer token verification) is M3 BE work; this gate
// is purely a soft guardrail and surfaces an actionable error toast.
const TIER0_BLOCK_MESSAGE = 'ログインしてから AI 機能をご利用ください。';

export async function apiCall<T>(
    endpoint: string,
    body: unknown
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
    if (useStore.getState().authStatus !== 'authenticated') {
        return { success: false as const, error: new Error(TIER0_BLOCK_MESSAGE) };
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
