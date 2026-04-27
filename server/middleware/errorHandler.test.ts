import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleApiError, CorsRejectError } from './errorHandler';

describe('handleApiError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    describe('gRPC transient errors → 503 (両 context で適用)', () => {
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
        }
    });

    describe('gRPC string code normalization (whitespace / case)', () => {
        // SDK が稀に ' UNAVAILABLE'、'unavailable'、'UNAVAILABLE\n' 等を返した場合に
        // permanent 経路に silent fallthrough しないことを保証する。
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
        // gRPC code に boolean / object / null / undefined / 0 が来た場合の挙動を固定。
        // どれも transient 判定にならず permanent 経路 (firestore: 500) へ落ちる。
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

    describe('CorsRejectError → 403 (AI context only)', () => {
        it('returns 403 for CorsRejectError', () => {
            const result = handleApiError(new CorsRejectError(), 'cors', 'ai');
            expect(result.status).toBe(403);
            expect(result.message).toContain('オリジン');
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
        // Firestore context では AI 経路の message ベース分類 (quota / API key / timeout) を
        // 適用しない。誤って 429/401/504 を返すと FE の error UI が混乱するため。
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

    describe('Fallback (no code, no message hit) → 500', () => {
        it('returns 500 with raw message in dev (context=ai, isDev fixed at module load)', () => {
            // errorHandler.ts の `isDev` は module load 時に process.env.NODE_ENV から
            // 評価される定数。テスト実行は NODE_ENV !== 'production' なので isDev=true。
            // dev パスでは message がそのまま返る (cf. prod パスの GENERIC_PROD_MESSAGE_AI は
            // module load 時に NODE_ENV=production で起動した本番環境でのみ発火)。
            const result = handleApiError(new Error('unknown error xyz'), 'fallback', 'ai');
            expect(result.status).toBe(500);
            expect(result.message).toBe('unknown error xyz');
        });

        it('returns 500 with generic Firestore message for unknown code (context=firestore)', () => {
            // Firestore context は isDev に依存せず固定の汎用文言を返す (gRPC 分類されない
            // permanent エラーは全て GENERIC_PROD_MESSAGE_FIRESTORE)。
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

    describe('Default context = ai', () => {
        it('treats omitted context as ai (既存 AI route の 2 引数呼び出しを保護)', () => {
            const result = handleApiError(new Error('quota exceeded'), 'legacy-call');
            expect(result.status).toBe(429);
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
