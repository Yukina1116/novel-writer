import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebaseClient の auth を vi.mock。currentUser と getIdToken を制御。
const getIdTokenMock = vi.fn();
const authMock = {
    currentUser: { getIdToken: getIdTokenMock } as { getIdToken: typeof getIdTokenMock } | null,
};
vi.mock('../firebaseClient', () => ({ auth: authMock }));

// firebase/auth は initAuth / signInWithGoogle / signOut で使うが、本 test では
// retryUserInit のみ検証するので onAuthStateChanged 等は no-op stub で十分。
vi.mock('firebase/auth', () => ({
    GoogleAuthProvider: class {},
    onAuthStateChanged: () => () => {},
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
}));

const { createAuthSlice, __testing } = await import('./authSlice');

interface TestState {
    needsUserInit: boolean;
    showToast?: (message: string, type: string) => void;
    retryUserInit: () => Promise<void>;
}

const createTestSlice = () => {
    const state: TestState = {
        needsUserInit: false,
        retryUserInit: async () => {},
    };
    const set = (partial: Partial<TestState>) => Object.assign(state, partial);
    const get = () => state;
    const slice = createAuthSlice(set, get);
    state.retryUserInit = slice.retryUserInit;
    return { slice, state };
};

describe('retryUserInit', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        getIdTokenMock.mockReset();
        getIdTokenMock.mockResolvedValue('mock-id-token');
        authMock.currentUser = { getIdToken: getIdTokenMock };
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        // module-scope inFlightUserInitRetry の前 test リーク防止
        __testing.resetInFlightUserInitRetry();
    });

    it('clears needsUserInit on successful retry', async () => {
        const { slice, state } = createTestSlice();
        state.needsUserInit = true;
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

        await slice.retryUserInit();

        expect(state.needsUserInit).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clears needsUserInit even when retry throws (no permanent retry loop)', async () => {
        // retryUserInit が permanent 失敗で throw した場合、needsUserInit=true
        // のままだと AI 呼出のたびに無限 retry ループに入る。throw しつつ flag
        // を false に戻す contract を固定。
        const { slice, state } = createTestSlice();
        state.needsUserInit = true;
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'permanent' }), { status: 401 }),
        );

        await expect(slice.retryUserInit()).rejects.toThrow();
        expect(state.needsUserInit).toBe(false);
    });

    it('shares in-flight Promise across concurrent retries (single users/init call)', async () => {
        const { slice, state } = createTestSlice();
        state.needsUserInit = true;
        let resolveFetch: ((value: Response) => void) | null = null;
        const fetchPromise = new Promise<Response>((resolve) => {
            resolveFetch = resolve;
        });
        fetchMock.mockReturnValue(fetchPromise);

        const p1 = slice.retryUserInit();
        const p2 = slice.retryUserInit();
        const p3 = slice.retryUserInit();

        // microtask を 1 段進めて fetchMock を発火させる
        await Promise.resolve();
        // resolveFetch が代入されている時点で response を返す
        resolveFetch!(new Response(null, { status: 200 }));
        await Promise.all([p1, p2, p3]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(state.needsUserInit).toBe(false);
    });

    it('throws when called without authenticated user', async () => {
        const { slice } = createTestSlice();
        authMock.currentUser = null;
        await expect(slice.retryUserInit()).rejects.toThrow(/without authenticated user/);
    });

    it('classifies fetch network failure (status=0) and propagates', async () => {
        const { slice, state } = createTestSlice();
        state.needsUserInit = true;
        fetchMock.mockRejectedValueOnce(new Error('network down'));

        await expect(slice.retryUserInit()).rejects.toMatchObject({ status: 0 });
        // network 断は transient だが、上位 retry を 1 回に止めるため flag は false に戻す
        expect(state.needsUserInit).toBe(false);
    });
});
