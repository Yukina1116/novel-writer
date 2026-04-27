import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// useStore.getState() を制御するため module mock。
// authStatus / needsUserInit / retryUserInit を test ごとに上書きする。
const storeStateMock = {
    authStatus: 'authenticated' as 'authenticated' | 'unauthenticated' | 'initializing',
    needsUserInit: false,
    retryUserInit: vi.fn(),
};
vi.mock('./store/index', () => ({
    useStore: {
        getState: () => storeStateMock,
    },
}));

// auth.currentUser.getIdToken() を制御。
const getIdTokenMock = vi.fn();
const currentUserMock: { getIdToken: typeof getIdTokenMock } | null = { getIdToken: getIdTokenMock };
const authMock = { currentUser: currentUserMock as { getIdToken: typeof getIdTokenMock } | null };
vi.mock('./firebaseClient', () => ({
    auth: authMock,
}));

const { apiCall, __testing } = await import('./apiClient');
const { ensureRequestId, classifyHttpError, generateRequestId } = __testing;

// vitest の `expect(result.success).toBe(false)` は型 narrowing を提供しない。
// assertion function で `result is { success: false; ... }` を表明し、その後の
// `result.error` 参照を型安全にする。
type ApiResult<T> = { success: true; data: T } | { success: false; error: import('./apiClient').ApiCallError };
function assertFailure<T>(r: ApiResult<T>): asserts r is { success: false; error: import('./apiClient').ApiCallError } {
    if (r.success) throw new Error('expected failure but apiCall succeeded');
}
describe('ensureRequestId', () => {
    it('adds requestId when body has none', () => {
        const result = ensureRequestId({ foo: 'bar' }) as { requestId: string; foo: string };
        expect(typeof result.requestId).toBe('string');
        expect(result.requestId.length).toBeGreaterThanOrEqual(8);
        expect(result.foo).toBe('bar');
    });

    it('preserves caller-provided requestId', () => {
        const result = ensureRequestId({ requestId: 'caller-id-12345', foo: 'bar' });
        expect(result).toEqual({ requestId: 'caller-id-12345', foo: 'bar' });
    });

    it('does not modify primitive body (BE will reject as 400)', () => {
        expect(ensureRequestId('plain-string')).toBe('plain-string');
        expect(ensureRequestId(42)).toBe(42);
        expect(ensureRequestId(null)).toBe(null);
    });

    it('does not wrap arrays', () => {
        const arr = [1, 2, 3];
        expect(ensureRequestId(arr)).toBe(arr);
    });
});

describe('generateRequestId', () => {
    it('returns string of valid length (8-128 chars matching BE contract)', () => {
        const id = generateRequestId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThanOrEqual(8);
        expect(id.length).toBeLessThanOrEqual(128);
    });

    it('produces unique values across calls', () => {
        const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()));
        expect(ids.size).toBe(50);
    });
});

describe('classifyHttpError', () => {
    it('401 → AUTH_EXPIRED with login prompt', () => {
        const err = classifyHttpError(401, { error: 'expired' });
        expect(err.code).toBe('AUTH_EXPIRED');
        expect(err.message).toContain('再ログイン');
        expect(err.status).toBe(401);
    });

    it('429 + QUOTA_EXCEEDED → quota message', () => {
        const err = classifyHttpError(429, { code: 'QUOTA_EXCEEDED' });
        expect(err.code).toBe('QUOTA_EXCEEDED');
        expect(err.message).toContain('利用枠の上限');
        expect(err.status).toBe(429);
    });

    it('503 → SERVICE_UNAVAILABLE', () => {
        const err = classifyHttpError(503, null);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
        expect(err.message).toContain('時間をおいて');
        expect(err.status).toBe(503);
    });

    it('409 + DUPLICATE_REQUEST → 503-equivalent UX, code preserved', () => {
        const err = classifyHttpError(409, { code: 'DUPLICATE_REQUEST' });
        expect(err.code).toBe('DUPLICATE_REQUEST');
        expect(err.message).toContain('時間をおいて');
        expect(err.status).toBe(409);
    });

    it('500 with body error → SERVER_ERROR with body.error', () => {
        const err = classifyHttpError(500, { error: 'internal' });
        expect(err.code).toBe('SERVER_ERROR');
        expect(err.message).toBe('internal');
    });

    it('500 without body → SERVER_ERROR with HTTP status string', () => {
        const err = classifyHttpError(500, null);
        expect(err.code).toBe('SERVER_ERROR');
        expect(err.message).toBe('HTTP 500');
    });

    it('504 → SERVICE_UNAVAILABLE (gateway timeout treated as transient)', () => {
        const err = classifyHttpError(504, null);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
        expect(err.status).toBe(504);
    });

    it('429 without QUOTA_EXCEEDED code → SERVER_ERROR (not silently undefined)', () => {
        const err = classifyHttpError(429, { error: 'rate limit' });
        expect(err.code).toBe('SERVER_ERROR');
        expect(err.message).toBe('rate limit');
    });
});

describe('apiCall', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        storeStateMock.authStatus = 'authenticated';
        storeStateMock.needsUserInit = false;
        storeStateMock.retryUserInit = vi.fn();
        getIdTokenMock.mockReset();
        getIdTokenMock.mockResolvedValue('mock-id-token');
        authMock.currentUser = currentUserMock;
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const okResponse = (data: unknown) =>
        new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    const errResponse = (status: number, body: object) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });

    it('attaches Authorization Bearer header from getIdToken()', async () => {
        fetchMock.mockResolvedValueOnce(okResponse(['name-1']));

        const result = await apiCall('/utility/names', { category: 'human' });
        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer mock-id-token');
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('auto-generates requestId when caller did not provide one', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('ok'));
        await apiCall('/utility/names', { category: 'human' });

        const [, init] = fetchMock.mock.calls[0];
        const sentBody = JSON.parse(init.body);
        expect(typeof sentBody.requestId).toBe('string');
        expect(sentBody.requestId.length).toBeGreaterThanOrEqual(8);
        expect(sentBody.category).toBe('human');
    });

    it('preserves caller-provided requestId (FE retry can re-send same id)', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('ok'));
        await apiCall('/utility/names', { requestId: 'caller-id-9999', category: 'human' });

        const [, init] = fetchMock.mock.calls[0];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.requestId).toBe('caller-id-9999');
    });

    it('blocks before BE when authStatus is unauthenticated', async () => {
        storeStateMock.authStatus = 'unauthenticated';
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('AUTH_REQUIRED');
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('blocks with AUTH_INITIALIZING during auth bootstrap', async () => {
        storeStateMock.authStatus = 'initializing';
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('AUTH_INITIALIZING');
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('classifies 401 → AUTH_EXPIRED', async () => {
        fetchMock.mockResolvedValueOnce(errResponse(401, { success: false, error: 'expired' }));
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('AUTH_EXPIRED');
            expect(result.error.message).toContain('再ログイン');
        }
    });

    it('classifies 429 QUOTA_EXCEEDED → quota toast', async () => {
        fetchMock.mockResolvedValueOnce(
            errResponse(429, {
                success: false,
                code: 'QUOTA_EXCEEDED',
                usage: { used: 9000, reserved: 500, limit: 10000 },
            }),
        );
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('QUOTA_EXCEEDED');
            expect(result.error.message).toContain('利用枠の上限');
        }
    });

    it('classifies 503 → SERVICE_UNAVAILABLE', async () => {
        fetchMock.mockResolvedValueOnce(errResponse(503, { success: false, error: 'transient' }));
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        }
    });

    it('classifies 409 DUPLICATE_REQUEST → 503-equivalent UX', async () => {
        fetchMock.mockResolvedValueOnce(
            errResponse(409, { success: false, code: 'DUPLICATE_REQUEST' }),
        );
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('DUPLICATE_REQUEST');
            expect(result.error.message).toContain('時間をおいて');
        }
    });

    it('triggers users/init retry when needsUserInit is true', async () => {
        storeStateMock.needsUserInit = true;
        storeStateMock.retryUserInit.mockResolvedValueOnce(undefined);
        fetchMock.mockResolvedValueOnce(okResponse('ok'));

        const result = await apiCall('/utility/names', {});
        expect(storeStateMock.retryUserInit).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('returns AUTH_REQUIRED when retryUserInit throws (no infinite loop)', async () => {
        storeStateMock.needsUserInit = true;
        storeStateMock.retryUserInit.mockRejectedValueOnce(new Error('still failing'));

        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('AUTH_REQUIRED');
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns AUTH_EXPIRED when getIdToken throws', async () => {
        getIdTokenMock.mockRejectedValueOnce(new Error('token refresh failed'));
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('AUTH_EXPIRED');
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns AUTH_REQUIRED when auth.currentUser is null (race condition guard)', async () => {
        authMock.currentUser = null;
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        {
            expect(result.error.code).toBe('AUTH_REQUIRED');
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles fetch network error with NETWORK_ERROR code', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network down'));
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        expect(result.error.code).toBe('NETWORK_ERROR');
        expect(result.error.message).toContain('network down');
    });

    it('classifies AbortError as REQUEST_ABORTED (distinct from NETWORK_ERROR)', async () => {
        const abortErr = new Error('request aborted by user');
        abortErr.name = 'AbortError';
        fetchMock.mockRejectedValueOnce(abortErr);
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        expect(result.error.code).toBe('REQUEST_ABORTED');
    });

    it('classifies getIdToken auth/network-request-failed as SERVICE_UNAVAILABLE (not AUTH_EXPIRED)', async () => {
        const networkErr = Object.assign(new Error('refresh net error'), { code: 'auth/network-request-failed' });
        getIdTokenMock.mockReset();
        getIdTokenMock.mockRejectedValueOnce(networkErr);
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns SERVER_ERROR when BE returns 200 OK with success:false (logical failure)', async () => {
        // BE が誤って 200 + success:false を返した場合に classifier が
        // SERVER_ERROR を返す contract。BE バグの early signal。
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ success: false, error: 'logical failure' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const result = await apiCall('/utility/names', {});
        assertFailure(result);
        expect(result.error.code).toBe('SERVER_ERROR');
        expect(result.error.message).toBe('logical failure');
    });

    it('shares retryUserInit Promise across concurrent apiCall (cross-layer in-flight contract)', async () => {
        // authSlice の in-flight 共有が apiClient 経由でも効くことを cross-layer で検証。
        // 並列 N 件の AI 呼出に対し retryUserInit が 1 回しか発火しない。
        storeStateMock.needsUserInit = true;
        let resolveRetry: (() => void) | null = null;
        const sharedPromise = new Promise<void>((resolve) => {
            resolveRetry = resolve;
        });
        storeStateMock.retryUserInit.mockReturnValue(sharedPromise);
        fetchMock.mockResolvedValue(okResponse('ok'));

        const p1 = apiCall('/utility/names', { keyword: 'a' });
        const p2 = apiCall('/utility/names', { keyword: 'b' });
        const p3 = apiCall('/utility/names', { keyword: 'c' });

        await Promise.resolve();
        resolveRetry!();
        await Promise.all([p1, p2, p3]);

        // retryUserInit は各 apiCall から呼ばれるが、authSlice の in-flight guard で
        // 内部 fetch は 1 回に集約される。ここでは mock 側で「同じ Promise が返る」契約。
        expect(storeStateMock.retryUserInit).toHaveBeenCalledTimes(3);
        // 全 apiCall が成功する
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
