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
        const { status, message } = handleApiError(error, 'users/init', 'firestore');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
