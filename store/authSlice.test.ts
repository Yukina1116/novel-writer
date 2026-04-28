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

const { createAuthSlice, __testing, computeNeedsTermsAccept } = await import('./authSlice');

interface TestState {
    needsUserInit: boolean;
    showToast?: (message: string, type: string) => void;
    retryUserInit: () => Promise<void>;
    // M7-α (P4) 追加 fields
    termsAcceptedAt?: string | null;
    termsVersion?: string | null;
    currentTermsVersion?: string | null;
    needsTermsAccept?: boolean;
    termsAccepting?: boolean;
    acceptTerms?: () => Promise<void>;
}

const createTestSlice = () => {
    const state: TestState = {
        needsUserInit: false,
        retryUserInit: async () => {},
        termsAcceptedAt: null,
        termsVersion: null,
        currentTermsVersion: null,
        needsTermsAccept: false,
        termsAccepting: false,
    };
    const set = (partial: Partial<TestState>) => Object.assign(state, partial);
    const get = () => state;
    const slice = createAuthSlice(set, get);
    state.retryUserInit = slice.retryUserInit;
    state.acceptTerms = slice.acceptTerms;
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

describe('computeNeedsTermsAccept (M7-α 派生ロジック)', () => {
    // AC-6-3 / AC-6-4 の核心ロジック。境界条件を機械的に固定する。

    it('returns false when currentTermsVersion is null (users/init 未完了)', () => {
        // モーダル抑止: サーバ現行版が分からない段階では再同意を要求しない
        expect(computeNeedsTermsAccept(null, null, null)).toBe(false);
        expect(computeNeedsTermsAccept('2026-01-01T00:00:00Z', '2026-01-01', null)).toBe(false);
    });

    it('returns true when termsAcceptedAt is null (未同意)', () => {
        expect(computeNeedsTermsAccept(null, null, '2026-04-28')).toBe(true);
    });

    it('returns true when termsVersion mismatches currentTermsVersion (古い版に同意)', () => {
        expect(computeNeedsTermsAccept(
            '2026-01-01T00:00:00Z',
            '2026-01-01',
            '2026-04-28',
        )).toBe(true);
    });

    it('returns false when termsAcceptedAt + termsVersion match current (同意済み)', () => {
        expect(computeNeedsTermsAccept(
            '2026-04-28T00:00:00Z',
            '2026-04-28',
            '2026-04-28',
        )).toBe(false);
    });

    it('treats empty string termsVersion same as mismatch (defensive)', () => {
        expect(computeNeedsTermsAccept(
            '2026-04-28T00:00:00Z',
            '',
            '2026-04-28',
        )).toBe(true);
    });
});

describe('acceptTerms (M7-α、in-flight Promise pattern)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        getIdTokenMock.mockReset();
        getIdTokenMock.mockResolvedValue('mock-id-token');
        authMock.currentUser = { getIdToken: getIdTokenMock };
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        __testing.resetInFlightAcceptTerms();
    });

    it('throws when called without authenticated user', async () => {
        const { slice } = createTestSlice();
        authMock.currentUser = null;
        await expect(slice.acceptTerms()).rejects.toThrow(/without authenticated user/);
    });

    it('throws when currentTermsVersion is null (users/init 未完了)', async () => {
        const { slice, state } = createTestSlice();
        state.currentTermsVersion = null;
        await expect(slice.acceptTerms()).rejects.toThrow(/before users\/init completed/);
    });

    it('updates state on success and sets needsTermsAccept=false', async () => {
        const { slice, state } = createTestSlice();
        state.currentTermsVersion = '2026-04-28';
        state.needsTermsAccept = true;
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    success: true,
                    termsAcceptedAt: '2026-04-28T12:00:00Z',
                    termsVersion: '2026-04-28',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );

        await slice.acceptTerms();

        expect(state.termsAcceptedAt).toBe('2026-04-28T12:00:00Z');
        expect(state.termsVersion).toBe('2026-04-28');
        expect(state.needsTermsAccept).toBe(false);
        expect(state.termsAccepting).toBe(false);
    });

    it('shares in-flight Promise across concurrent acceptTerms calls (single accept-terms call)', async () => {
        const { slice, state } = createTestSlice();
        state.currentTermsVersion = '2026-04-28';
        let resolveFetch: ((value: Response) => void) | null = null;
        const fetchPromise = new Promise<Response>((resolve) => {
            resolveFetch = resolve;
        });
        fetchMock.mockReturnValue(fetchPromise);

        const p1 = slice.acceptTerms();
        const p2 = slice.acceptTerms();
        const p3 = slice.acceptTerms();

        await Promise.resolve();
        resolveFetch!(new Response(
            JSON.stringify({
                success: true,
                termsAcceptedAt: '2026-04-28T12:00:00Z',
                termsVersion: '2026-04-28',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
        await Promise.all([p1, p2, p3]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clears termsAccepting flag and propagates error on failure', async () => {
        const { slice, state } = createTestSlice();
        state.currentTermsVersion = '2026-04-28';
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'mismatch', code: 'TERMS_VERSION_MISMATCH' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(slice.acceptTerms()).rejects.toMatchObject({ status: 409 });
        expect(state.termsAccepting).toBe(false);
    });
});

describe('signOut (M7-α: terms* state リセット)', () => {
    beforeEach(() => {
        getIdTokenMock.mockReset();
    });

    it('resets terms* state and termsAccepting on signOut (uid 切替時の漏洩防止 + silent failure 防止)', async () => {
        const { slice, state } = createTestSlice();
        state.termsAcceptedAt = '2026-04-28T00:00:00Z';
        state.termsVersion = '2026-04-28';
        state.currentTermsVersion = '2026-04-28';
        state.needsTermsAccept = false;
        state.termsAccepting = true; // acceptTerms 実行中の signOut を想定

        await slice.signOut();

        expect(state.termsAcceptedAt).toBeNull();
        expect(state.termsVersion).toBeNull();
        expect(state.currentTermsVersion).toBeNull();
        expect(state.needsTermsAccept).toBe(false);
        expect(state.termsAccepting).toBe(false);
    });
});
