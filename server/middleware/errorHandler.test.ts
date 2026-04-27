import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleApiError, CorsRejectError, __testing } from './errorHandler';

const { extractMessage } = __testing;

describe('handleApiError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    describe('gRPC transient errors → 503 (全 context で適用)', () => {
        const transientCases = [
            { name: 'UNAVAILABLE (string)', code: 'UNAVAILABLE' },
            { name: 'DEADLINE_EXCEEDED (string)', code: 'DEADLINE_EXCEEDED' },
            { name: 'gRPC code 14 (UNAVAILABLE)', code: 14 },
            { name: 'gRPC code 4 (DEADLINE_EXCEEDED)', code: 4 },
        ];

        for (const { name, code } of transientCases) {
            it(`returns 503 with AI message for transient ${name} (context=ai)`, () => {
                const error = Object.assign(new Error('boom'), { code });
                const result = handleApiError(error, 'test-fn', 'ai');
                expect(result.status).toBe(503);
                expect(result.message).toContain('AIサービスが一時的に利用できません');
            });

            it(`returns 503 with Firestore message for transient ${name} (context=firestore)`, () => {
                const error = Object.assign(new Error('boom'), { code });
                const result = handleApiError(error, 'test-fn', 'firestore');
                expect(result.status).toBe(503);
                expect(result.message).toContain('データベースが一時的に利用できません');
            });

            it(`returns 503 with Usage message for transient ${name} (context=usage)`, () => {
                const error = Object.assign(new Error('boom'), { code });
                const result = handleApiError(error, 'test-fn', 'usage');
                expect(result.status).toBe(503);
                expect(result.message).toContain('利用量の集計が一時的に失敗しました');
            });
        }
    });

    describe('gRPC string code normalization (whitespace / case)', () => {
        const variants = [
            { name: 'leading space', code: ' UNAVAILABLE' },
            { name: 'trailing newline', code: 'UNAVAILABLE\n' },
            { name: 'lowercase', code: 'unavailable' },
            { name: 'mixed case + whitespace', code: '  Deadline_Exceeded ' },
        ];
        for (const { name, code } of variants) {
            it(`recognizes "${name}" → 503`, () => {
                const error = Object.assign(new Error('boom'), { code });
                const result = handleApiError(error, 'fn', 'firestore');
                expect(result.status).toBe(503);
            });
        }
    });

    describe('Anomalous code values (boundary / coercion)', () => {
        const anomalousCases = [
            { name: 'boolean true', code: true },
            { name: 'object', code: { nested: 'UNAVAILABLE' } },
            { name: 'null', code: null },
            { name: 'undefined', code: undefined },
            { name: 'number 0 (gRPC OK)', code: 0 },
            { name: 'number 99999', code: 99999 },
        ];
        for (const { name, code } of anomalousCases) {
            it(`falls through to permanent for ${name} (firestore context → 500)`, () => {
                const error = Object.assign(new Error('boom'), { code });
                const result = handleApiError(error, 'fn', 'firestore');
                expect(result.status).toBe(500);
            });
        }
    });

    describe('CorsRejectError → 403', () => {
        it('returns 403 for CorsRejectError in ai context', () => {
            const result = handleApiError(new CorsRejectError(), 'cors', 'ai');
            expect(result.status).toBe(403);
            expect(result.message).toContain('オリジン');
        });

        it('returns 403 for CorsRejectError in firestore context', () => {
            const result = handleApiError(new CorsRejectError(), 'cors', 'firestore');
            expect(result.status).toBe(403);
        });
    });

    describe('AI context message-based classification', () => {
        const cases = [
            { name: 'quota in message', message: 'quota exceeded for project', expectedStatus: 429, expectedContains: '無料利用枠' },
            { name: 'RESOURCE_EXHAUSTED in message', message: 'RESOURCE_EXHAUSTED: too many requests', expectedStatus: 429, expectedContains: '無料利用枠' },
            { name: 'API key not valid in message', message: 'API key not valid', expectedStatus: 401, expectedContains: 'AI認証エラー' },
            { name: 'UNAUTHENTICATED in message', message: 'Request had invalid authentication credentials. UNAUTHENTICATED', expectedStatus: 401, expectedContains: 'AI認証エラー' },
            { name: 'timeout in message', message: 'request timeout', expectedStatus: 504, expectedContains: 'タイムアウト' },
            { name: 'DEADLINE_EXCEEDED in message (no code)', message: 'DEADLINE_EXCEEDED on Vertex call', expectedStatus: 504, expectedContains: 'タイムアウト' },
        ];

        for (const { name, message, expectedStatus, expectedContains } of cases) {
            it(`classifies "${name}" → ${expectedStatus}`, () => {
                const result = handleApiError(new Error(message), 'ai-call', 'ai');
                expect(result.status).toBe(expectedStatus);
                expect(result.message).toContain(expectedContains);
            });
        }
    });

    describe('Firestore context: skips AI message classification', () => {
        it('does not classify "quota" message as 429 in firestore context', () => {
            const result = handleApiError(new Error('quota check failed'), 'fs-call', 'firestore');
            expect(result.status).toBe(500);
            expect(result.message).toBe('データベース処理に失敗しました。');
        });

        it('does not classify "UNAUTHENTICATED" message as 401 in firestore context', () => {
            const result = handleApiError(new Error('UNAUTHENTICATED'), 'fs-call', 'firestore');
            expect(result.status).toBe(500);
            expect(result.message).toBe('データベース処理に失敗しました。');
        });

        it('does not classify "timeout" message as 504 in firestore context', () => {
            const result = handleApiError(new Error('connection timeout'), 'fs-call', 'firestore');
            expect(result.status).toBe(500);
            expect(result.message).toBe('データベース処理に失敗しました。');
        });
    });

    describe('Usage context: skips AI message classification', () => {
        it('does not classify "quota" message as 429 in usage context (QUOTA_EXCEEDED は usageService 側で 429 を返す)', () => {
            const result = handleApiError(new Error('quota lookup failed'), 'usage-call', 'usage');
            expect(result.status).toBe(500);
            expect(result.message).toBe('利用量の集計に失敗しました。');
        });

        it('returns 503 for transient gRPC error in usage context', () => {
            const error = Object.assign(new Error('boom'), { code: 'UNAVAILABLE' });
            const result = handleApiError(error, 'usage-call', 'usage');
            expect(result.status).toBe(503);
            expect(result.message).toContain('利用量の集計が一時的に失敗');
        });
    });

    describe('Fallback (no code, no message hit) → 500', () => {
        it('returns generic AI message when NODE_ENV !== "development" (production-safe default)', () => {
            // errorHandler.ts の isDev は module load 時に
            // `NODE_ENV === 'development'` で評価される定数。test 実行時は通常
            // NODE_ENV が未設定 or 'test' のため isDev=false で本番扱い。
            // 本番 Cloud Run で NODE_ENV 設定漏れがあっても raw message
            // (stack trace 含む内部 error) を FE に漏らさない安全側のフォールバック。
            const result = handleApiError(new Error('unknown error xyz'), 'fallback', 'ai');
            expect(result.status).toBe(500);
            expect(result.message).toBe('AI処理でエラーが発生しました。時間を置いて再試行してください。');
        });

        it('returns 500 with generic Firestore message for unknown code (context=firestore)', () => {
            const error = Object.assign(new Error('boom'), { code: 'INVALID_ARGUMENT' });
            const result = handleApiError(error, 'fallback', 'firestore');
            expect(result.status).toBe(500);
            expect(result.message).toBe('データベース処理に失敗しました。');
        });

        it('returns 500 for plain Error without code (context=firestore)', () => {
            const result = handleApiError(new Error('something went wrong'), 'fallback', 'firestore');
            expect(result.status).toBe(500);
            expect(result.message).toBe('データベース処理に失敗しました。');
        });
    });

    describe('Logging', () => {
        it('logs error with functionName prefix', () => {
            handleApiError(new Error('test'), 'my-handler', 'ai');
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error in my-handler:',
                expect.anything(),
            );
        });
    });
});

describe('extractMessage (Issue #40)', () => {
    it('returns "不明" for null/undefined', () => {
        expect(extractMessage(null)).toBe('不明なエラーが発生しました。');
        expect(extractMessage(undefined)).toBe('不明なエラーが発生しました。');
    });

    it('returns string error as-is', () => {
        expect(extractMessage('plain string error')).toBe('plain string error');
    });

    it('returns outer message when only outer is present', () => {
        const error = new Error('outer message');
        expect(extractMessage(error)).toBe('outer message');
    });

    it('returns inner message when only inner is present', () => {
        const error = { error: { message: 'inner only' } };
        expect(extractMessage(error)).toBe('inner only');
    });

    it('concatenates outer and inner when both differ (Vertex AI Issue #40 シナリオ)', () => {
        // SDK が外側に gRPC code を、内側に generic を入れたケース。
        // 連結することで `RESOURCE_EXHAUSTED` substring 判定が確実に発火する。
        const error = Object.assign(new Error('RESOURCE_EXHAUSTED: quota exceeded'), {
            error: { message: 'Internal' },
        });
        const result = extractMessage(error);
        expect(result).toContain('RESOURCE_EXHAUSTED');
        expect(result).toContain('Internal');
    });

    it('does not duplicate when outer and inner are identical', () => {
        const error = Object.assign(new Error('same'), { error: { message: 'same' } });
        expect(extractMessage(error)).toBe('same');
    });

    it('returns "不明" when neither outer nor inner are strings', () => {
        const error = { foo: 'bar' };
        expect(extractMessage(error)).toBe('不明なエラーが発生しました。');
    });
});

describe('handleApiError integration with extractMessage (Issue #40)', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('classifies as 429 when outer message has RESOURCE_EXHAUSTED but inner message is generic (#40 silent failure)', () => {
        // 旧実装: extractMessage が `error.error.message` 優先で 'Internal' を返し、
        // RESOURCE_EXHAUSTED を見逃して 500 に落ちていた。修正後は連結で 429 になる。
        const error = Object.assign(new Error('RESOURCE_EXHAUSTED: quota exceeded for project'), {
            error: { message: 'Internal' },
        });
        const result = handleApiError(error, 'vertex-ai', 'ai');
        expect(result.status).toBe(429);
        expect(result.message).toContain('無料利用枠');
    });

    it('classifies as 401 when outer has UNAUTHENTICATED but inner is generic', () => {
        const error = Object.assign(new Error('UNAUTHENTICATED: auth failed'), {
            error: { message: 'Internal' },
        });
        const result = handleApiError(error, 'vertex-ai', 'ai');
        expect(result.status).toBe(401);
    });

    it('still works when only inner message has RESOURCE_EXHAUSTED (legacy SDK shape)', () => {
        const error = { error: { message: 'RESOURCE_EXHAUSTED on inner' } };
        const result = handleApiError(error, 'vertex-ai', 'ai');
        expect(result.status).toBe(429);
    });

    it('prefers higher-severity classification when outer/inner match different categories', () => {
        // outer に "timeout"、inner に "RESOURCE_EXHAUSTED" の混在ケース。
        // 連結文字列の substring 判定だと判定順 (quota → ... → timeout) で
        // どちらが先に hit するかが文字列の前後関係に依存するが、本実装は
        // 候補配列を `some` で個別判定するため必ず深刻度の高い 429 が選ばれる。
        const error = Object.assign(new Error('timeout connecting to upstream'), {
            error: { message: 'RESOURCE_EXHAUSTED on quota service' },
        });
        const result = handleApiError(error, 'vertex-ai', 'ai');
        expect(result.status).toBe(429);
    });

    it('avoids false positive from concatenation boundary (timeout in outer alone)', () => {
        // outer 単独で timeout のみ → 504 になる。連結境界に偶然 quota 等の
        // 文字列が出現するリスクを排除する個別判定の挙動。
        const error = Object.assign(new Error('connection timeout'), {
            error: { message: 'fetch failed' },
        });
        const result = handleApiError(error, 'vertex-ai', 'ai');
        expect(result.status).toBe(504);
    });
});
