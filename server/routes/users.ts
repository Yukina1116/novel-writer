import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseFirestore } from '../firebaseAdmin';
import { verifyIdToken, type AuthedRequest } from '../middleware/verifyIdToken';
import { handleApiError } from '../middleware/errorHandler';
import { sanitizeForUpdate } from '../utils/sanitize';

const router = Router();

const ALLOWED_PLANS = ['free'] as const;
type AllowedPlan = typeof ALLOWED_PLANS[number];

router.post('/init', verifyIdToken, async (req, res) => {
    // verifyIdToken が成功すれば req.user は必ず注入されている。AuthedRequest は
    // middleware 通過済の意図を型に表明するが declaration merging はランタイム保証
    // ではないため、念のため二重防御として弾く。
    const { user } = req as AuthedRequest;
    if (!user) {
        res.status(401).json({ success: false, error: 'Unauthenticated' });
        return;
    }
    try {
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
        // 「特定 uid だけ users/init が落ちる」事象を本番ログから追跡できるよう、
        // handleApiError 内部の汎用 console.error より前に context 付きで先行 log する。
        console.error('users/init failed', { uid: user.uid, error });
        const { status, message } = handleApiError(error, 'users/init', 'firestore');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
