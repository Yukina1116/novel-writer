import { getFirebaseAuth, isEmulatorMode } from './firebaseAdmin';

export { isEmulatorMode };

/**
 * Firebase Admin SDK の credential resolve を起動時に強制し、ADC 未設定環境では
 * `app.listen()` 到達前に process を落とす（fail-fast）。これがないと verifyIdToken の
 * 遅延評価まで気付けず、本番で全リクエストが 500 連発するリスクがある。
 *
 * emulator mode（host が `host:port` 形式で設定済み）では credential を渡さない設計
 * のため probe を skip する。判定は firebaseAdmin.ts と共有して挙動の乖離を防ぐ。
 */
export function probeFirebaseAuth(): void {
    if (isEmulatorMode()) {
        console.log('Firebase Admin probe: skipped (emulator mode)');
        return;
    }
    getFirebaseAuth();
    console.log('Firebase Admin probe: ok (credential resolved)');
}
