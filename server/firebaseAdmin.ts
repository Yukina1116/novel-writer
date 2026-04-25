import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let cachedApp: App | null = null;

export function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }

  const projectId =
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    'novel-writer-dev';

  const useEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

  cachedApp = initializeApp(
    useEmulator
      ? { projectId }
      : { credential: applicationDefault(), projectId },
  );
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
