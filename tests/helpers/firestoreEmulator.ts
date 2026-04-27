import { getApps, deleteApp } from 'firebase-admin/app';

/**
 * tests/helpers 共通: emulator が使う project id を環境変数から解決する。
 * GCLOUD_PROJECT → FIREBASE_PROJECT_ID → 'novel-writer-dev' の順でフォールバック。
 */
export function resolveEmulatorProjectId(): string {
    return (
        process.env.GCLOUD_PROJECT ??
        process.env.FIREBASE_PROJECT_ID ??
        'novel-writer-dev'
    );
}

/**
 * 同一ファイル内で複数テストが admin SDK app を初期化する場合、Firestore connection が
 * leak すると次の suite を妨害する。afterAll で全 app を確実に破棄する。
 */
export async function teardownAllAdminApps(): Promise<void> {
    const apps = getApps();
    await Promise.all(apps.map((app) => deleteApp(app)));
}

/**
 * Firestore Emulator 上の指定 collection を全削除する。emulator 未起動時は no-op。
 */
export async function clearEmulatorCollection(collection: string): Promise<void> {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (!emulatorHost) return;
    const url = `http://${emulatorHost}/emulator/v1/projects/${resolveEmulatorProjectId()}/databases/(default)/documents/${collection}`;
    await fetch(url, { method: 'DELETE' }).catch(() => {
        // emulator 未起動 / collection 不在時は無視
    });
}

/** Auth + Firestore emulator が両方起動済みなら true。テスト先頭の skip 判定に使う。 */
export function isEmulatorReady(): boolean {
    return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) && Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}
