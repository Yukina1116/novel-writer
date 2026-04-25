/**
 * 前提: 別プロセスで `npm run dev:emu` または `firebase emulators:start --only auth`
 * が起動していること。未起動だと localhost:9099 への接続が無音でハング、または
 * `auth/network-request-failed` で失敗するため、本スクリプトは 15 秒で打ち切る。
 */

import './_setup-emulator-env.js';

import { initializeApp as initClientApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInAnonymously,
} from 'firebase/auth';

import { getFirebaseAuth } from '../server/firebaseAdmin.js';

const PROJECT_ID = 'novel-writer-dev';
const EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
const TIMEOUT_MS = 15_000;

async function run(): Promise<void> {
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `TIMEOUT ${ms}ms: emulator unreachable at ${EMULATOR_HOST}. ` +
                `先に \`npm run dev:emu\` を別ターミナルで起動してください。`,
            ),
          ),
        ms,
      ).unref(),
    ),
  ]);
}

withTimeout(run(), TIMEOUT_MS).then(
  () => process.exit(0),
  (err: unknown) => {
    console.error('FAIL:', err);
    process.exit(1);
  },
);
