import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseFirestore } from '../firebaseAdmin';
import { verifyIdToken, type AuthedRequest } from '../middleware/verifyIdToken';
import { sanitizeForUpdate } from '../utils/sanitize';

const router = Router();

const ALLOWED_PLANS = ['free'] as const;
type AllowedPlan = typeof ALLOWED_PLANS[number];

// Firestore gRPC エラーは数値 / 文字列 code の両方で来うる。errorHandler.ts の
// `handleApiError` は AI 経路用の日本語文言を返すため users/init には流用せず、
// transient (UNAVAILABLE / DEADLINE_EXCEEDED) → 503、それ以外 → 500 に分類する
// (rules/error-handling.md §3)。Firestore 障害分類の汎用化は M3 で AI 経路と統合。
const TRANSIENT_FIRESTORE_CODES = new Set<string | number>([
    4, 14, 'DEADLINE_EXCEEDED', 'UNAVAILABLE',
]);

function formatFirestoreError(error: unknown): { status: number; message: string } {
    const code = (error as { code?: unknown }).code;
    if ((typeof code === 'string' || typeof code === 'number') && TRANSIENT_FIRESTORE_CODES.has(code)) {
        return { status: 503, message: 'データベースが一時的に利用できません。少し待って再試行してください。' };
    }
    return { status: 500, message: 'ユーザー初期化に失敗しました。' };
}

router.post('/init', verifyIdToken, async (req, res) => {
    try {
        // verifyIdToken が成功すれば req.user は必ず注入されている。AuthedRequest は
        // 「middleware 通過済」の意図を型に表明するが、declaration merging はランタイム
        // 保証ではないため、念のため二重防御として弾く（rules/error-handling.md §2）。
        const { user } = req as AuthedRequest;
        if (!user) {
            res.status(401).json({ success: false, error: 'Unauthenticated' });
            return;
        }
        const email = user.email;
        if (typeof email !== 'string' || email.length === 0) {
            res.status(400).json({ success: false, error: 'ID token does not contain a valid email claim' });
            return;
        }

        const db = getFirebaseFirestore();
        const ref = db.collection('users').doc(user.uid);
        const plan: AllowedPlan = 'free';

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) {
                tx.set(ref, sanitizeForUpdate({
                    email,
                    plan,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }));
            } else {
                tx.update(ref, sanitizeForUpdate({
                    email,
                    updatedAt: FieldValue.serverTimestamp(),
                }));
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('users/init failed:', error);
        const { status, message } = formatFirestoreError(error);
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
