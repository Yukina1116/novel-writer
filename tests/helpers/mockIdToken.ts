import type { Auth } from 'firebase-admin/auth';
import { resolveEmulatorProjectId } from './firestoreEmulator';

/**
 * Firebase Auth Emulator 経由でユーザーを作成し、Custom Token → ID Token に変換する。
 *
 *   1. admin SDK で createUser（既存 uid なら 'auth/uid-already-exists' を許容）
 *   2. admin SDK で createCustomToken(uid)
 *   3. emulator の signInWithCustomToken REST 経由で idToken を取得
 *
 * Auth Emulator は API key 検証を行わないため key="fake-api-key" でよい。
 * 本物の Firebase project には使用禁止（emulator 専用ヘルパー）。
 */
export async function getEmulatorIdToken(
    auth: Auth,
    options: { uid?: string; email?: string } = {},
): Promise<{ idToken: string; uid: string; email: string }> {
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (!emulatorHost) {
        throw new Error('FIREBASE_AUTH_EMULATOR_HOST is not set; this helper is emulator-only');
    }

    const uid = options.uid ?? `test-uid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = options.email ?? `${uid}@example.com`;

    // 既存 uid を許容しつつ、ラウンドトリップは createUser 1 回に抑える。
    try {
        await auth.createUser({ uid, email });
    } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code !== 'auth/uid-already-exists') throw error;
    }

    const customToken = await auth.createCustomToken(uid);

    const url = `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`signInWithCustomToken failed (${response.status}): ${text}`);
    }

    const body = (await response.json()) as { idToken?: string };
    if (!body.idToken) {
        throw new Error(`signInWithCustomToken returned no idToken: ${JSON.stringify(body)}`);
    }

    return { idToken: body.idToken, uid, email };
}

/** Auth Emulator 上の全ユーザーを削除する。emulator 未起動時は no-op。 */
export async function clearEmulatorUsers(): Promise<void> {
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (!emulatorHost) return;
    const url = `http://${emulatorHost}/emulator/v1/projects/${resolveEmulatorProjectId()}/accounts`;
    await fetch(url, { method: 'DELETE' }).catch(() => {
        // emulator 未起動時は無視
    });
}
