import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from './utils/logger';

const EMULATOR_HOST_PATTERN = /^[\w.-]+:\d+$/;

// 既知の emulator host env var のみ許容し typo (FIRESBASE_... 等) を compile error にする。
export type EmulatorEnvVar = 'FIREBASE_AUTH_EMULATOR_HOST' | 'FIRESTORE_EMULATOR_HOST';

export function hasEmulatorHost(envVar: EmulatorEnvVar): boolean {
  const host = process.env[envVar]?.trim();
  if (!host) return false;
  if (EMULATOR_HOST_PATTERN.test(host)) return true;
  // host が設定されているが pattern 不一致 (port 忘れ / typo) → 開発者は emulator
  // 接続を意図しているはず。ここで本番 mode に silent fallback すると ADC 未設定で
  // cryptic な applicationDefault() error になり原因究明が困難。明示的に warn する。
  logger.warn({
    message: `Emulator host env looks invalid (expected host:port format); treating as production mode`,
    envVar,
    value: host,
  });
  return false;
}

// emulator 用の admin SDK 初期化は credential を渡さない。Auth または
// Firestore のいずれかが host:port 形式で設定されていれば credential を省略する
// （ADC 未設定環境で applicationDefault() を呼ばないため）。
// startupProbe.ts もこの判定を共有する（lax な Boolean(env) 判定で誤って
// probe が skip され silent failure になるリスクを排除）。
export function isEmulatorMode(): boolean {
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
