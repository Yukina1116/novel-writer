#!/usr/bin/env tsx
// Phase 4 段階 2 GO-3: Firestore PITR 復旧演習用 CRUD script
// 隔離 collection `pitr-drill/test-doc-1` のみを扱う。本番データには触れない。
// 用途: .github/workflows/dev-pitr-drill.yml から呼ばれる。
// usage: tsx scripts/pitr-drill.ts {create|delete|verify} [restore-db-name]

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.GCLOUD_PROJECT
if (!PROJECT_ID) {
  console.error('GCLOUD_PROJECT env var is required')
  process.exit(1)
}

const COLLECTION = 'pitr-drill'
const DOC_ID = 'test-doc-1'

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
}

const action = process.argv[2]
const restoreDb = process.argv[3]

const db = restoreDb ? getFirestore(restoreDb) : getFirestore()

async function main() {
  if (action === 'create') {
    await db.collection(COLLECTION).doc(DOC_ID).set({
      label: 'PITR drill test data',
      createdAt: new Date().toISOString(),
      session: 'phase4-stage2-go-3-evidence',
    })
    console.log(`Created ${COLLECTION}/${DOC_ID} in (default) database of ${PROJECT_ID}`)
  } else if (action === 'delete') {
    await db.collection(COLLECTION).doc(DOC_ID).delete()
    console.log(`Deleted ${COLLECTION}/${DOC_ID} from (default) database of ${PROJECT_ID}`)
  } else if (action === 'wait-ready') {
    // gcloud firestore databases clone は LRO で、コマンド return 後も
    // database が restoring 状態のことがある (FAILED_PRECONDITION エラー)。
    // ready になるまで poll する。
    const dbLabel = restoreDb || '(default)'
    const maxAttempts = 60
    const intervalMs = 10_000
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await db.collection(COLLECTION).limit(1).get()
        console.log(`OK: Database ${dbLabel} is READY (attempt ${i + 1})`)
        return
      } catch (e: unknown) {
        const code = (e as { code?: number }).code
        if (code === 9 /* FAILED_PRECONDITION = restoring */) {
          console.log(`Attempt ${i + 1}/${maxAttempts}: not ready yet, waiting ${intervalMs / 1000}s...`)
          await new Promise(r => setTimeout(r, intervalMs))
          continue
        }
        throw e
      }
    }
    console.error(`NG: Timeout waiting for ${dbLabel} to become READY (${maxAttempts * intervalMs / 1000}s)`)
    process.exit(2)
  } else if (action === 'verify') {
    const doc = await db.collection(COLLECTION).doc(DOC_ID).get()
    const dbLabel = restoreDb || '(default)'
    if (doc.exists) {
      console.log(`OK: Doc EXISTS in ${dbLabel}: ${COLLECTION}/${DOC_ID}`)
      console.log('  Data:', JSON.stringify(doc.data(), null, 2))
    } else {
      console.error(`NG: Doc does NOT exist in ${dbLabel}: ${COLLECTION}/${DOC_ID}`)
      process.exit(2)
    }
  } else {
    console.error('Usage: tsx scripts/pitr-drill.ts {create|delete|wait-ready|verify} [restore-db-name]')
    process.exit(1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
