import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// firebaseAdmin の getFirebaseAuth のみ差し替え、isEmulatorMode と hasEmulatorHost は
// 実装を呼ぶ。これで env var 経由の skip 判定を実物の挙動で検証できる。
const getFirebaseAuthMock = vi.fn();
vi.mock('./firebaseAdmin', async () => {
    const actual = await vi.importActual<typeof import('./firebaseAdmin')>('./firebaseAdmin');
    return {
        ...actual,
        getFirebaseAuth: () => getFirebaseAuthMock(),
    };
});

const { probeFirebaseAuth, isEmulatorMode } = await import('./startupProbe');
const { logger } = await import('./utils/logger');

describe('probeFirebaseAuth', () => {
    let originalAuthEmu: string | undefined;
    let originalFirestoreEmu: string | undefined;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        getFirebaseAuthMock.mockReset();
        originalAuthEmu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
        originalFirestoreEmu = process.env.FIRESTORE_EMULATOR_HOST;
        delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        delete process.env.FIRESTORE_EMULATOR_HOST;
        logSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
        if (originalAuthEmu !== undefined) {
            process.env.FIREBASE_AUTH_EMULATOR_HOST = originalAuthEmu;
        } else {
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        }
        if (originalFirestoreEmu !== undefined) {
            process.env.FIRESTORE_EMULATOR_HOST = originalFirestoreEmu;
        } else {
            delete process.env.FIRESTORE_EMULATOR_HOST;
        }
        logSpy.mockRestore();
    });

    describe('emulator mode → skip getFirebaseAuth call', () => {
        it('skips when FIREBASE_AUTH_EMULATOR_HOST is set', () => {
            process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
            probeFirebaseAuth();
            expect(getFirebaseAuthMock).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith({ message: 'Firebase Admin probe: skipped (emulator mode)' });
        });

        it('skips when FIRESTORE_EMULATOR_HOST is set', () => {
            process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
            probeFirebaseAuth();
            expect(getFirebaseAuthMock).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith({ message: 'Firebase Admin probe: skipped (emulator mode)' });
        });

        it('skips when both emulator hosts are set', () => {
            process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
            process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
            probeFirebaseAuth();
            expect(getFirebaseAuthMock).not.toHaveBeenCalled();
        });
    });

    describe('non-emulator mode → eagerly resolves getFirebaseAuth', () => {
        it('calls getFirebaseAuth and returns when credential is resolved', () => {
            getFirebaseAuthMock.mockReturnValueOnce({} as unknown);
            expect(() => probeFirebaseAuth()).not.toThrow();
            expect(getFirebaseAuthMock).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith({ message: 'Firebase Admin probe: ok (credential resolved)' });
        });

        it('synchronously throws when applicationDefault() fails (ADC unset)', () => {
            // ADC 未設定で applicationDefault() が throw → そのまま伝播し app.listen() 到達前に
            // unhandled rejection で落ちる（fail-fast）。Cloud Run 起動失敗 → rollback の経路。
            const adcError = new Error('Could not load the default credentials.');
            getFirebaseAuthMock.mockImplementationOnce(() => {
                throw adcError;
            });
            expect(() => probeFirebaseAuth()).toThrow(adcError);
        });
    });
});

describe('isEmulatorMode', () => {
    let originalAuthEmu: string | undefined;
    let originalFirestoreEmu: string | undefined;

    beforeEach(() => {
        originalAuthEmu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
        originalFirestoreEmu = process.env.FIRESTORE_EMULATOR_HOST;
        delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        delete process.env.FIRESTORE_EMULATOR_HOST;
    });

    afterEach(() => {
        if (originalAuthEmu !== undefined) {
            process.env.FIREBASE_AUTH_EMULATOR_HOST = originalAuthEmu;
        } else {
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        }
        if (originalFirestoreEmu !== undefined) {
            process.env.FIRESTORE_EMULATOR_HOST = originalFirestoreEmu;
        } else {
            delete process.env.FIRESTORE_EMULATOR_HOST;
        }
    });

    it('returns false when neither emulator host is set', () => {
        expect(isEmulatorMode()).toBe(false);
    });

    it('returns true when FIREBASE_AUTH_EMULATOR_HOST is set', () => {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
        expect(isEmulatorMode()).toBe(true);
    });

    it('returns true when FIRESTORE_EMULATOR_HOST is set', () => {
        process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
        expect(isEmulatorMode()).toBe(true);
    });
});
