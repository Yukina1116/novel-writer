/**
 * Firestore セキュリティルールのユニットテスト。
 *
 * 実行: `npm run test:firestore-rules`
 *  → `firebase emulators:exec --only firestore "tsx scripts/test-firestore-rules.ts"`
 *
 * rules/firebase.md MUST: firestore.rules を変更したらデプロイ前に必ず実行する。
 */
import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { setDoc, getDoc, doc, serverTimestamp, updateDoc, Timestamp } from 'firebase/firestore';

const PROJECT_ID = 'novel-writer-test';
const HOST = (process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080').split(':');

const baseUserDoc = (override: Record<string, unknown> = {}) => ({
    email: 'alice@example.com',
    plan: 'free',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // M7-α (P4) で追加。create 時は両者 null (= 未同意) 必須。
    termsAcceptedAt: null,
    termsVersion: null,
    ...override,
});

let env: RulesTestEnvironment;
let failures = 0;

async function run(name: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`  ✗ ${name}`);
        console.error(error);
    }
}

async function main(): Promise<void> {
    env = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules: readFileSync('firestore.rules', 'utf-8'),
            host: HOST[0],
            port: parseInt(HOST[1] ?? '8080', 10),
        },
    });

    console.log('Firestore rules unit tests');

    await run('未認証で users/{x} read → DENIED', async () => {
        const ctx = env.unauthenticatedContext();
        await assertFails(getDoc(doc(ctx.firestore(), 'users/alice')));
    });

    await run('未認証で users/{x} write → DENIED', async () => {
        const ctx = env.unauthenticatedContext();
        await assertFails(setDoc(doc(ctx.firestore(), 'users/alice'), baseUserDoc()));
    });

    await run('他 uid の users/{otherUid} read → DENIED', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertFails(getDoc(doc(ctx.firestore(), 'users/bob')));
    });

    await run('他 uid の users/{otherUid} write → DENIED', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/bob'), baseUserDoc()));
    });

    await run('自 uid で正常書込（許可フィールドのみ） → ALLOWED', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertSucceeds(setDoc(doc(ctx.firestore(), 'users/alice'), baseUserDoc()));
    });

    await run('自 uid で read → ALLOWED', async () => {
        // 直前のテストで alice の doc は seed 済み
        const ctx = env.authenticatedContext('alice');
        await assertSucceeds(getDoc(doc(ctx.firestore(), 'users/alice')));
    });

    await run('自 uid で update（createdAt 不変） → ALLOWED', async () => {
        // admin context で createdAt 固定値の doc を seed
        const seededCreatedAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
        await env.withSecurityRulesDisabled(async (admin) => {
            await setDoc(doc(admin.firestore(), 'users/aliceUpdate'), {
                email: 'alice@example.com',
                plan: 'free',
                createdAt: seededCreatedAt,
                updatedAt: seededCreatedAt,
                termsAcceptedAt: null,
                termsVersion: null,
            });
        });
        const ctx = env.authenticatedContext('aliceUpdate');
        await assertSucceeds(updateDoc(doc(ctx.firestore(), 'users/aliceUpdate'), {
            email: 'alice@example.com',
            plan: 'free',
            createdAt: seededCreatedAt,
            updatedAt: serverTimestamp(),
        }));
    });

    // M7-α (P4) accept-terms 関連
    await run('自 uid で termsAcceptedAt + termsVersion update → ALLOWED', async () => {
        const seededCreatedAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
        await env.withSecurityRulesDisabled(async (admin) => {
            await setDoc(doc(admin.firestore(), 'users/aliceTerms'), {
                email: 'alice@example.com',
                plan: 'free',
                createdAt: seededCreatedAt,
                updatedAt: seededCreatedAt,
                termsAcceptedAt: null,
                termsVersion: null,
            });
        });
        const ctx = env.authenticatedContext('aliceTerms');
        await assertSucceeds(updateDoc(doc(ctx.firestore(), 'users/aliceTerms'), {
            email: 'alice@example.com',
            plan: 'free',
            createdAt: seededCreatedAt,
            updatedAt: serverTimestamp(),
            termsAcceptedAt: serverTimestamp(),
            termsVersion: '2026-04-28',
        }));
    });

    await run('create で termsAcceptedAt が null 以外 → DENIED', async () => {
        const ctx = env.authenticatedContext('aliceTermsBad');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/aliceTermsBad'), baseUserDoc({
            termsAcceptedAt: serverTimestamp(),
        })));
    });

    await run('create で termsVersion が null 以外 → DENIED', async () => {
        const ctx = env.authenticatedContext('aliceTermsBad2');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/aliceTermsBad2'), baseUserDoc({
            termsVersion: '2026-04-28',
        })));
    });

    await run('update で termsVersion が空文字 → DENIED', async () => {
        const seededCreatedAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
        await env.withSecurityRulesDisabled(async (admin) => {
            await setDoc(doc(admin.firestore(), 'users/aliceTermsEmpty'), {
                email: 'alice@example.com',
                plan: 'free',
                createdAt: seededCreatedAt,
                updatedAt: seededCreatedAt,
                termsAcceptedAt: null,
                termsVersion: null,
            });
        });
        const ctx = env.authenticatedContext('aliceTermsEmpty');
        await assertFails(updateDoc(doc(ctx.firestore(), 'users/aliceTermsEmpty'), {
            email: 'alice@example.com',
            plan: 'free',
            createdAt: seededCreatedAt,
            updatedAt: serverTimestamp(),
            termsAcceptedAt: serverTimestamp(),
            termsVersion: '',
        }));
    });

    await run('update で termsVersion が 32 文字超過 → DENIED', async () => {
        const seededCreatedAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
        await env.withSecurityRulesDisabled(async (admin) => {
            await setDoc(doc(admin.firestore(), 'users/aliceTermsLong'), {
                email: 'alice@example.com',
                plan: 'free',
                createdAt: seededCreatedAt,
                updatedAt: seededCreatedAt,
                termsAcceptedAt: null,
                termsVersion: null,
            });
        });
        const ctx = env.authenticatedContext('aliceTermsLong');
        await assertFails(updateDoc(doc(ctx.firestore(), 'users/aliceTermsLong'), {
            email: 'alice@example.com',
            plan: 'free',
            createdAt: seededCreatedAt,
            updatedAt: serverTimestamp(),
            termsAcceptedAt: serverTimestamp(),
            termsVersion: 'x'.repeat(33),
        }));
    });

    await run('自 uid で email: null → DENIED', async () => {
        const ctx = env.authenticatedContext('alice2');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/alice2'), baseUserDoc({ email: null })));
    });

    await run("自 uid で plan: 'pro' → DENIED", async () => {
        const ctx = env.authenticatedContext('alice3');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/alice3'), baseUserDoc({ plan: 'pro' })));
    });

    await run('自 uid で extra フィールド → DENIED', async () => {
        const ctx = env.authenticatedContext('alice4');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/alice4'), baseUserDoc({ extra: 'x' })));
    });

    await run('自 uid で email 空文字 → DENIED', async () => {
        const ctx = env.authenticatedContext('aliceEmpty');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/aliceEmpty'), baseUserDoc({ email: '' })));
    });

    await run('自 uid で updatedAt が timestamp ではない → DENIED', async () => {
        const ctx = env.authenticatedContext('aliceUpdatedAt');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/aliceUpdatedAt'), {
            email: 'x@example.com',
            plan: 'free',
            createdAt: serverTimestamp(),
            updatedAt: 'not-a-timestamp',
            termsAcceptedAt: null,
            termsVersion: null,
        }));
    });

    await run('自 uid で create に createdAt 欠如 → DENIED', async () => {
        const ctx = env.authenticatedContext('aliceMissing');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/aliceMissing'), {
            email: 'x@example.com',
            plan: 'free',
            updatedAt: serverTimestamp(),
            termsAcceptedAt: null,
            termsVersion: null,
        }));
    });

    await run('自 uid で create に termsAcceptedAt キー欠如 → DENIED (hasAll)', async () => {
        const ctx = env.authenticatedContext('aliceMissingTerms');
        await assertFails(setDoc(doc(ctx.firestore(), 'users/aliceMissingTerms'), {
            email: 'x@example.com',
            plan: 'free',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            termsVersion: null,
            // termsAcceptedAt 意図的に欠如
        }));
    });

    await run('自 uid で createdAt 改ざん（update） → DENIED', async () => {
        // 1. admin context でシードデータ書込（ルール bypass）
        await env.withSecurityRulesDisabled(async (admin) => {
            await setDoc(doc(admin.firestore(), 'users/alice5'), {
                email: 'alice5@example.com',
                plan: 'free',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                termsAcceptedAt: null,
                termsVersion: null,
            });
        });
        // 2. authenticated context で createdAt を改ざんする update を試みる
        const ctx = env.authenticatedContext('alice5');
        await assertFails(updateDoc(doc(ctx.firestore(), 'users/alice5'), {
            email: 'alice5@example.com',
            plan: 'free',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }));
    });

    await run('他コレクション（projects 等） → 全拒否', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertFails(getDoc(doc(ctx.firestore(), 'projects/p1')));
        await assertFails(setDoc(doc(ctx.firestore(), 'projects/p1'), { name: 'x' }));
    });

    // usage/{uidYyyymm} client 全拒否（PR-F、Admin SDK 経由のみ書込み）
    await run('未認証で usage/{x} read → DENIED', async () => {
        const ctx = env.unauthenticatedContext();
        await assertFails(getDoc(doc(ctx.firestore(), 'usage/alice_202604')));
    });

    await run('未認証で usage/{x} write → DENIED', async () => {
        const ctx = env.unauthenticatedContext();
        await assertFails(setDoc(doc(ctx.firestore(), 'usage/alice_202604'), { usedCost: 0 }));
    });

    await run('自 uid prefix の usage 自分のドキュメント read → DENIED (PR-F は全拒否)', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertFails(getDoc(doc(ctx.firestore(), 'usage/alice_202604')));
    });

    await run('自 uid prefix の usage 自分のドキュメント write → DENIED', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertFails(setDoc(doc(ctx.firestore(), 'usage/alice_202604'), { usedCost: 100 }));
    });

    await run('他 uid の usage read → DENIED', async () => {
        const ctx = env.authenticatedContext('alice');
        await assertFails(getDoc(doc(ctx.firestore(), 'usage/bob_202604')));
    });

    await env.cleanup();

    if (failures > 0) {
        console.error(`\n${failures} test(s) FAILED`);
        process.exit(1);
    }
    console.log('\nAll tests passed.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
