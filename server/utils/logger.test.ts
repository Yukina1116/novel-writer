import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, serializeError } from './logger';

describe('serializeError', () => {
    it('extracts message / name / stack from Error instance', () => {
        const err = new Error('boom');
        const out = serializeError(err);
        expect(out.message).toBe('boom');
        expect(out.name).toBe('Error');
        expect(typeof out.stack).toBe('string');
    });

    it('extracts code property if string', () => {
        const err = new Error('boom') as Error & { code?: string };
        err.code = 'E_TEST';
        const out = serializeError(err);
        expect(out.code).toBe('E_TEST');
    });

    it('preserves numeric code (e.g. gRPC numeric code)', () => {
        const err = new Error('boom') as Error & { code?: unknown };
        err.code = 14;
        const out = serializeError(err);
        expect(out.code).toBe(14);
    });

    it('omits code if neither string nor number', () => {
        const err = new Error('boom') as Error & { code?: unknown };
        err.code = { nested: true };
        const out = serializeError(err);
        expect(out.code).toBeUndefined();
    });

    it('falls back to String() for non-Error', () => {
        expect(serializeError('plain string').message).toBe('plain string');
        expect(serializeError(null).message).toBe('null');
        expect(serializeError({ foo: 'bar' }).message).toBe('[object Object]');
    });
});

describe('logger', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    describe('production (NODE_ENV=production)', () => {
        beforeEach(() => {
            vi.stubEnv('NODE_ENV', 'production');
        });

        it('emits JSON with severity / timestamp / service / message to stdout for INFO', () => {
            logger.info({ message: 'hello', requestId: 'req-1' });
            expect(stdoutSpy).toHaveBeenCalledTimes(1);
            const written = stdoutSpy.mock.calls[0][0] as string;
            expect(written.endsWith('\n')).toBe(true);
            const entry = JSON.parse(written.trimEnd());
            expect(entry.severity).toBe('INFO');
            expect(entry.service).toBe('novel-writer-server');
            expect(entry.message).toBe('hello');
            expect(entry.requestId).toBe('req-1');
            expect(typeof entry.timestamp).toBe('string');
            expect(stderrSpy).not.toHaveBeenCalled();
        });

        it('emits WARNING to stdout', () => {
            logger.warn({ message: 'warn-msg' });
            expect(stdoutSpy).toHaveBeenCalledTimes(1);
            const entry = JSON.parse((stdoutSpy.mock.calls[0][0] as string).trimEnd());
            expect(entry.severity).toBe('WARNING');
            expect(stderrSpy).not.toHaveBeenCalled();
        });

        it('emits ERROR to stderr (not stdout)', () => {
            logger.error({ message: 'err-msg', code: 'X' });
            expect(stderrSpy).toHaveBeenCalledTimes(1);
            expect(stdoutSpy).not.toHaveBeenCalled();
            const entry = JSON.parse((stderrSpy.mock.calls[0][0] as string).trimEnd());
            expect(entry.severity).toBe('ERROR');
            expect(entry.code).toBe('X');
        });

        it('preserves arbitrary nested fields', () => {
            logger.info({
                message: 'nested',
                payload: { a: 1, b: ['x', 'y'] },
            });
            const entry = JSON.parse((stdoutSpy.mock.calls[0][0] as string).trimEnd());
            expect(entry.payload).toEqual({ a: 1, b: ['x', 'y'] });
        });

        it('reserved keys (severity / timestamp / service) cannot be overridden by payload', () => {
            // 呼び出し側が誤って severity を渡しても、Cloud Logging 仕様の severity が優先される。
            logger.warn({
                message: 'attempt to inject severity',
                severity: 'INFO',
                timestamp: '1970-01-01T00:00:00.000Z',
                service: 'fake-service',
            } as unknown as Parameters<typeof logger.warn>[0]);
            const entry = JSON.parse((stdoutSpy.mock.calls[0][0] as string).trimEnd());
            expect(entry.severity).toBe('WARNING');
            expect(entry.service).toBe('novel-writer-server');
            // timestamp は emit 時刻が入る (1970 ではない)
            expect(entry.timestamp).not.toBe('1970-01-01T00:00:00.000Z');
        });

        it('handles circular reference without throwing', () => {
            type Cyclic = { self?: Cyclic; name: string };
            const cyclic: Cyclic = { name: 'root' };
            cyclic.self = cyclic;
            expect(() =>
                logger.info({ message: 'cyclic', cyclic } as unknown as Parameters<typeof logger.info>[0]),
            ).not.toThrow();
            const written = stdoutSpy.mock.calls[0][0] as string;
            const entry = JSON.parse(written.trimEnd());
            expect(entry.message).toBe('cyclic');
            expect(entry.cyclic.self).toBe('[Circular]');
        });

        it('handles BigInt / Symbol payload without throwing', () => {
            expect(() =>
                logger.info({
                    message: 'bigint-symbol',
                    big: BigInt(9007199254740993),
                    sym: Symbol('test'),
                } as unknown as Parameters<typeof logger.info>[0]),
            ).not.toThrow();
            expect(stdoutSpy).toHaveBeenCalledTimes(1);
        });

        it('write() failure does not bubble up to caller', () => {
            stdoutSpy.mockImplementationOnce(() => {
                throw new Error('EPIPE');
            });
            // logger 自体の失敗が呼び出し側を阻害しない (rules/error-handling.md §1)
            expect(() => logger.info({ message: 'hi' })).not.toThrow();
        });
    });

    describe('dev (NODE_ENV != production)', () => {
        beforeEach(() => {
            vi.stubEnv('NODE_ENV', 'development');
        });

        it('emits human-readable line (not JSON) for INFO', () => {
            logger.info({ message: 'hello' });
            expect(stdoutSpy).toHaveBeenCalledTimes(1);
            const written = stdoutSpy.mock.calls[0][0] as string;
            expect(written.startsWith('[INFO] hello')).toBe(true);
            // dev は human-readable のため、severity / timestamp / service フィールドは表示文字列に含まれない
            expect(written).not.toContain('"severity"');
        });

        it('appends extra fields as JSON suffix', () => {
            logger.info({ message: 'hello', requestId: 'r1', uid: 'u1' });
            const written = stdoutSpy.mock.calls[0][0] as string;
            expect(written).toContain('hello');
            expect(written).toContain('"requestId":"r1"');
            expect(written).toContain('"uid":"u1"');
        });

        it('emits ERROR to stderr in dev too', () => {
            logger.error({ message: 'oops' });
            expect(stderrSpy).toHaveBeenCalledTimes(1);
            expect(stdoutSpy).not.toHaveBeenCalled();
        });
    });
});
