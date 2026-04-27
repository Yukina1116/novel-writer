import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { isEmulatorReady, teardownAllAdminApps, clearEmulatorCollection } from '../helpers/firestoreEmulator';
import { getEmulatorIdToken, clearEmulatorUsers } from '../helpers/mockIdToken';

// Vertex AI を呼ばないため utility service だけ mock。verifyIdToken は本物の
// firebase-admin/auth を通し、FirebaseAuthError instanceof 分岐も網羅する
// （単体テストは plain object の string code 経路しか検証していない）。
const generateNamesMock = vi.fn();
vi.mock('../../server/services/utilityService', () => ({
    generateNames: (...args: unknown[]) => generateNamesMock(...args),
    generateKnowledgeName: vi.fn(),
    extractCharacterInfo: vi.fn(),
}));

// emulator 未起動時は skip。CI は npm run test:integration（firebase emulators:exec 配下）で実行。
const skipIfNoEmulator = isEmulatorReady() ? describe : describe.skip;

skipIfNoEmulator('/api/ai/* with real Firebase Auth Emulator', () => {
    beforeAll(async () => {
        await clearEmulatorUsers();
        await clearEmulatorCollection('users');
    });

    afterAll(async () => {
        await teardownAllAdminApps();
    });

    const buildApp = async () => {
        // dynamic import で vi.mock 適用後の module を取得
        const { mountAiRoutes } = await import('../../server/aiRoutes');
        const app = express();
        app.use(express.json());
        mountAiRoutes(app);
        return app;
    };

    it('returns 200 with valid Emulator-issued ID Token', async () => {
        const { getFirebaseAuth } = await import('../../server/firebaseAdmin');
        const auth = getFirebaseAuth();
        const { idToken } = await getEmulatorIdToken(auth, { email: 'e4-success@example.com' });

        generateNamesMock.mockResolvedValueOnce(['mock-name-1']);
        const app = await buildApp();
        const res = await request(app)
            .post('/api/ai/utility/names')
            .set('Authorization', `Bearer ${idToken}`)
            .send({ category: 'human', keywords: 'test' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: ['mock-name-1'] });
        expect(generateNamesMock).toHaveBeenCalledTimes(1);
    });

    it('returns 401 with malformed bearer token (real FirebaseAuthError instanceof path)', async () => {
        // 不正トークンで firebase-admin が本物の FirebaseAuthError を throw し、
        // verifyIdToken.ts の `error instanceof FirebaseAuthError` 分岐が発火することを確認。
        const app = await buildApp();
        const res = await request(app)
            .post('/api/ai/utility/names')
            .set('Authorization', 'Bearer invalid.token.here')
            .send({ category: 'human', keywords: 'test' });

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false });
        expect(generateNamesMock).not.toHaveBeenCalled();
    });

    it('returns 401 when token is missing entirely', async () => {
        const app = await buildApp();
        const res = await request(app)
            .post('/api/ai/utility/names')
            .send({ category: 'human', keywords: 'test' });
        expect(res.status).toBe(401);
        expect(generateNamesMock).not.toHaveBeenCalled();
    });
});
