/**
 * 1回限りの本番 usage リセットツール。
 *
 * 実行: GCLOUD_PROJECT=novel-writer-prod npx tsx scripts/prod-usage-reset-oneoff.ts <email>
 * (.github/workflows/prod-usage-reset-oneoff.yml から WIF 経由で実行する想定)
 *
 * 対象アカウントの今月分 usage/{uid}_{yyyymm} の usedCost / reservedCost /
 * reservations のみ 0 にリセットする。processedIds / routeCounts /
 * quotaExceededCounts / imageGenerationCounts (Issue #232 計測用) は保持する。
 *
 * 実行前後の値を必ず標準出力に記録し、GitHub Actions のログを監査証跡とする。
 */

import { getFirebaseAuth, getFirebaseFirestore } from '../server/firebaseAdmin.js';
import { getUsageDocId } from '../server/services/usageService.js';

async function run(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    throw new Error('Usage: tsx scripts/prod-usage-reset-oneoff.ts <email>');
  }
  if (process.env.GCLOUD_PROJECT !== 'novel-writer-prod') {
    throw new Error(
      `GCLOUD_PROJECT must be 'novel-writer-prod' (got: ${process.env.GCLOUD_PROJECT ?? 'unset'})`
    );
  }

  const user = await getFirebaseAuth().getUserByEmail(email);
  console.log(`[target] email=${email} uid=${user.uid}`);

  const docId = getUsageDocId(user.uid);
  const ref = getFirebaseFirestore().collection('usage').doc(docId);

  const before = await ref.get();
  if (!before.exists) {
    console.log(`[before] usage/${docId} does not exist — nothing to reset.`);
    return;
  }
  console.log(`[before] usage/${docId} =`, JSON.stringify(before.data()));

  await ref.update({
    usedCost: 0,
    reservedCost: 0,
    reservations: {},
  });

  const after = await ref.get();
  console.log(`[after]  usage/${docId} =`, JSON.stringify(after.data()));
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error('FAIL:', err);
    process.exit(1);
  }
);
