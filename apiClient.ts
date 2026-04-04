const API_BASE = '/api/ai';

export async function apiCall<T>(
    endpoint: string,
    body: unknown
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
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
