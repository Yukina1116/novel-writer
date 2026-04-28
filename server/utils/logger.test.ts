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

    it('omits code if non-string', () => {
        const err = new Error('boom') as Error & { code?: unknown };
        err.code = 42;
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
