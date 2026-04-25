import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

const EMULATOR_HOST_PATTERN = /^[\w.-]+:\d+$/;

function isEmulatorMode(): boolean {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
  return Boolean(host) && EMULATOR_HOST_PATTERN.test(host!);
}

export function getFirebaseAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId =
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    'novel-writer-dev';

  // emulator 利用時は credential を渡さない: applicationDefault() は ADC 未設定環境
  // (CI / ローカル開発初期端末) で初期化エラーになり、emulator は credential 不要
  return isEmulatorMode()
    ? initializeApp({ projectId })
    : initializeApp({ credential: applicationDefault(), projectId });
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
