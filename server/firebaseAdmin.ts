import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const EMULATOR_HOST_PATTERN = /^[\w.-]+:\d+$/;

function hasEmulatorHost(envVar: string): boolean {
  const host = process.env[envVar]?.trim();
  return Boolean(host) && EMULATOR_HOST_PATTERN.test(host!);
}

// emulator 用の admin SDK 初期化は credential を渡さない。Auth または
// Firestore のいずれかが emulator 設定されていれば credential を省略する
// （ADC 未設定環境で applicationDefault() を呼ばないため）。
function isEmulatorMode(): boolean {
  return hasEmulatorHost('FIREBASE_AUTH_EMULATOR_HOST') || hasEmulatorHost('FIRESTORE_EMULATOR_HOST');
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

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}
