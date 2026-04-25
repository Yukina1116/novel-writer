/**
 * Firebase Auth Emulator + Admin SDK の疎通検証スクリプト。
 *
 * 前提: 別プロセスで `firebase emulators:start --only auth` が起動済み。
 * 手順: client SDK で匿名ログイン → idToken を取得 → admin SDK で verifyIdToken。
 */

const EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULATOR_HOST;

const PROJECT_ID = 'novel-writer-dev';

import { initializeApp as initClientApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInAnonymously,
} from 'firebase/auth';

import { getFirebaseAuth } from '../server/firebaseAdmin.js';

async function main(): Promise<void> {
  const clientApp = initClientApp({
    apiKey: 'fake-api-key-for-emulator',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
  });
  const clientAuth = getClientAuth(clientApp);
  connectAuthEmulator(clientAuth, `http://${EMULATOR_HOST}`, {
    disableWarnings: true,
  });

  const cred = await signInAnonymously(clientAuth);
  const idToken = await cred.user.getIdToken();
  console.log(`[client] idToken issued (length=${idToken.length})`);

  const decoded = await getFirebaseAuth().verifyIdToken(idToken);
  console.log(`[admin] verifyIdToken OK uid=${decoded.uid}`);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error('FAIL:', err);
    process.exit(1);
  },
);
