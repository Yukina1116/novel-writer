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

describe('refreshCurrentTermsVersion (M7-α PR-D-2)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        getIdTokenMock.mockReset();
        getIdTokenMock.mockResolvedValue('id-token-xyz');
        authMock.currentUser = { getIdToken: getIdTokenMock };
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const { __testing } = await import('./authSlice');
        __testing.resetInFlightUserInitRetry();
        __testing.resetInFlightAcceptTerms();
    });

    it('updates terms state without touching needsUserInit on success', async () => {
        const { slice, state } = createTestSlice();
        state.needsUserInit = true; // refresh は needsUserInit を変えない契約
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                user: { termsAcceptedAt: null, termsVersion: null },
                currentTermsVersion: '2026-04-28',
            }),
        });
        await slice.refreshCurrentTermsVersion();
        expect(state.currentTermsVersion).toBe('2026-04-28');
        expect(state.needsTermsAccept).toBe(true);
        expect(state.needsUserInit).toBe(true); // 触っていないことを pin
    });

    it('throws when called without authenticated user', async () => {
        const { slice } = createTestSlice();
        authMock.currentUser = null;
        await expect(slice.refreshCurrentTermsVersion()).rejects.toThrow(
            /without authenticated user/,
        );
    });

    it('rethrows fetch failure (UI 側でハンドリング)', async () => {
        const { slice } = createTestSlice();
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({ error: 'down' }),
        });
        await expect(slice.refreshCurrentTermsVersion()).rejects.toThrow();
    });
});

describe('isTermsVersionMismatch (M7-α PR-D-2 helper)', () => {
    it('returns true for Error with status=409 + code=TERMS_VERSION_MISMATCH', async () => {
        const { isTermsVersionMismatch } = await import('./authSlice');
        const err = new Error('mismatch') as Error & { status: number; code: string };
        err.status = 409;
        err.code = 'TERMS_VERSION_MISMATCH';
        expect(isTermsVersionMismatch(err)).toBe(true);
    });

    it('returns false when status is 409 but code differs', async () => {
        const { isTermsVersionMismatch } = await import('./authSlice');
        const err = new Error('other') as Error & { status: number; code: string };
        err.status = 409;
        err.code = 'OTHER_CONFLICT';
        expect(isTermsVersionMismatch(err)).toBe(false);
    });

    it('returns false when status is not 409', async () => {
        const { isTermsVersionMismatch } = await import('./authSlice');
        const err = new Error('server error') as Error & { status: number; code: string };
        err.status = 500;
        err.code = 'TERMS_VERSION_MISMATCH';
        expect(isTermsVersionMismatch(err)).toBe(false);
    });

    it('returns false for non-Error / plain Error / objects without status', async () => {
        const { isTermsVersionMismatch } = await import('./authSlice');
        expect(isTermsVersionMismatch('string')).toBe(false);
        expect(isTermsVersionMismatch(null)).toBe(false);
        expect(isTermsVersionMismatch({ status: 409, code: 'TERMS_VERSION_MISMATCH' })).toBe(false);
        expect(isTermsVersionMismatch(new Error('plain'))).toBe(false);
    });
});

describe('AcceptTermsError class (M7-α D2-followup-1)', () => {
    it('sets status=0 and code=undefined for network init', async () => {
        const { AcceptTermsError } = await import('./authSlice');
        const err = new AcceptTermsError('network error', { status: 0 });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(AcceptTermsError);
        expect(err.status).toBe(0);
        expect(err.code).toBeUndefined();
        expect(err.name).toBe('AcceptTermsError');
        expect(err.message).toBe('network error');
    });

    it('sets status=409 + code=TERMS_VERSION_MISMATCH for mismatch init', async () => {
        const { AcceptTermsError } = await import('./authSlice');
        const err = new AcceptTermsError('mismatch', { status: 409, code: 'TERMS_VERSION_MISMATCH' });
        expect(err.status).toBe(409);
        expect(err.code).toBe('TERMS_VERSION_MISMATCH');
    });

    it('sets status=409 + code=USER_DOC_MISSING for missing-doc init', async () => {
        const { AcceptTermsError } = await import('./authSlice');
        const err = new AcceptTermsError('missing', { status: 409, code: 'USER_DOC_MISSING' });
        expect(err.status).toBe(409);
        expect(err.code).toBe('USER_DOC_MISSING');
    });

    it('keeps code undefined for non-409 init even if numeric status', async () => {
        const { AcceptTermsError } = await import('./authSlice');
        const err = new AcceptTermsError('server', { status: 502 });
        expect(err.status).toBe(502);
        expect(err.code).toBeUndefined();
    });

    it('isTermsVersionMismatch picks up class instance with mismatch code', async () => {
        const { AcceptTermsError, isTermsVersionMismatch } = await import('./authSlice');
        expect(isTermsVersionMismatch(
            new AcceptTermsError('m', { status: 409, code: 'TERMS_VERSION_MISMATCH' }),
        )).toBe(true);
        expect(isTermsVersionMismatch(
            new AcceptTermsError('m', { status: 409, code: 'USER_DOC_MISSING' }),
        )).toBe(false);
        expect(isTermsVersionMismatch(
            new AcceptTermsError('m', { status: 500 }),
        )).toBe(false);
    });

    // AC-1 pin: discriminated union が「status === 409 のとき code 必須」を型として強制することを
    // ts-expect-error で機械的に固定する。コンパイル時に検知される (vitest 実行時には何もしない)。
    it('rejects status=409 without code at compile time (ts-expect-error pin)', async () => {
        const { AcceptTermsError } = await import('./authSlice');
        // @ts-expect-error - status=409 は code が必須 (KnownAcceptTerms409Code)
        new AcceptTermsError('no code', { status: 409 });
        // @ts-expect-error - status=409 は KnownAcceptTerms409Code 以外の code を許容しない
        new AcceptTermsError('bad code', { status: 409, code: 'OTHER_CONFLICT' });
        // @ts-expect-error - 非 409 arm では code を渡せない
        new AcceptTermsError('mixed', { status: 500, code: 'TERMS_VERSION_MISMATCH' });
        // @ts-expect-error - 非 409 arm の status は具体列挙のみ (422 は範囲外)
        new AcceptTermsError('unknown status', { status: 422 });
        // 正常系 (型エラーが出ないことを確認)
        new AcceptTermsError('ok', { status: 409, code: 'TERMS_VERSION_MISMATCH' });
        new AcceptTermsError('ok', { status: 409, code: 'USER_DOC_MISSING' });
        new AcceptTermsError('ok', { status: 0 });
        new AcceptTermsError('ok', { status: 502 });
        expect(true).toBe(true); // 型エラーが出ないこと自体が assertion
    });
});

describe('callAcceptTerms throw paths (M7-α D2-followup-1, AC-7 fallback pin)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        getIdTokenMock.mockResolvedValue('token');
        authMock.currentUser = { getIdToken: getIdTokenMock };
        __testing.resetInFlightAcceptTerms();
    });

    const callAccept = async () => {
        const { slice, state } = createTestSlice();
        state.currentTermsVersion = '2026-04-28';
        await slice.acceptTerms();
    };

    const expectAcceptTermsError = async (
        expected: { status: number; code?: string },
    ) => {
        const { AcceptTermsError } = await import('./authSlice');
        try {
            await callAccept();
            throw new Error('expected to throw');
        } catch (e) {
            expect(e).toBeInstanceOf(AcceptTermsError);
            const err = e as InstanceType<typeof AcceptTermsError>;
            expect(err.status).toBe(expected.status);
            if (expected.code === undefined) {
                expect(err.code).toBeUndefined();
            } else {
                expect(err.code).toBe(expected.code);
            }
        }
    };

    it('409 + known code (TERMS_VERSION_MISMATCH) preserves status=409 + code', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: 'mismatch', code: 'TERMS_VERSION_MISMATCH' }),
            { status: 409 },
        ));
        await expectAcceptTermsError({ status: 409, code: 'TERMS_VERSION_MISMATCH' });
    });

    it('409 + known code (USER_DOC_MISSING) preserves status=409 + code', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: 'missing', code: 'USER_DOC_MISSING' }),
            { status: 409 },
        ));
        await expectAcceptTermsError({ status: 409, code: 'USER_DOC_MISSING' });
    });

    it('409 + unknown code falls back to status=502 + code=undefined (BE contract violation)', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: 'other', code: 'OTHER_CONFLICT' }),
            { status: 409 },
        ));
        await expectAcceptTermsError({ status: 502, code: undefined });
    });

    it('unknown status (422) falls back to status=502 (narrow)', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: 'unprocessable' }),
            { status: 422 },
        ));
        await expectAcceptTermsError({ status: 502, code: undefined });
    });

    it('500 stays as 500 (within enumerated NonConflictAcceptTermsStatus)', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: 'internal' }),
            { status: 500 },
        ));
        await expectAcceptTermsError({ status: 500, code: undefined });
    });

    it('fetch reject (network failure) → status=0 + AcceptTermsError', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expectAcceptTermsError({ status: 0, code: undefined });
    });

    it('200 malformed body (missing termsAcceptedAt) → status=502', async () => {
        fetchMock.mockResolvedValueOnce(new Response(
            JSON.stringify({ termsVersion: '2026-04-28' }), // termsAcceptedAt 欠落
            { status: 200 },
        ));
        await expectAcceptTermsError({ status: 502, code: undefined });
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

    it('releases in-flight Promise on failure (allows retry after error)', async () => {
        // 例外パスでも finally の inFlightAcceptTerms=null が効くか pin。
        // 効かないと「1 度失敗後永久に同じ Promise を返し続ける」silent failure が発生する。
        const { slice, state } = createTestSlice();
        state.currentTermsVersion = '2026-04-28';
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'down' }), { status: 503 }),
        );
        await expect(slice.acceptTerms()).rejects.toMatchObject({ status: 503 });

        // 2 回目: 別の fetch mock を消費すれば in-flight guard が解放されている証拠
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({
                success: true,
                termsAcceptedAt: '2026-04-29T00:00:00Z',
                termsVersion: '2026-04-28',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        );
        await slice.acceptTerms();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(state.termsAcceptedAt).toBe('2026-04-29T00:00:00Z');
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
