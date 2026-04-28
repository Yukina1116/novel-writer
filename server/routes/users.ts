import { Router } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseFirestore } from '../firebaseAdmin';
import { verifyIdToken, type AuthedRequest } from '../middleware/verifyIdToken';
import { handleApiError } from '../middleware/errorHandler';
import { sanitizeForUpdate } from '../utils/sanitize';
import { logger, serializeError } from '../utils/logger';
import { TERMS_VERSION, TERMS_VERSION_MISMATCH_CODE } from '../services/termsConfig';

const router = Router();

// USER_DOC_MISSING は accept-terms route 内部の sentinel error。
// 文字列 message でなく class で識別することで minifier / Babel 変換に強くする
// (rules/error-handling.md のロバスト分類原則)。
class UserDocMissingError extends Error {
    constructor() {
        super('USER_DOC_MISSING');
        this.name = 'UserDocMissingError';
    }
}

const ALLOWED_PLANS = ['free'] as const;
type AllowedPlan = typeof ALLOWED_PLANS[number];

interface UsersInitResponse {
    success: true;
    user: {
        plan: AllowedPlan;
        // 同意済みなら ISO 文字列、未同意なら null。FE は null か termsVersion 不一致を
        // needsTermsAccept = true として TermsConsentModal を出すトリガーにする。
        termsAcceptedAt: string | null;
        termsVersion: string | null;
    };
    // FE が比較する現行版バージョン。`termsVersion !== currentTermsVersion` で再同意要求。
    currentTermsVersion: string;
}

interface AcceptTermsResponse {
    success: true;
    termsAcceptedAt: string;
    termsVersion: string;
}

const toISOFromTimestamp = (value: unknown): string | null => {
    if (value instanceof Timestamp) {
        return value.toDate().toISOString();
    }
    return null;
};

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

        // transaction 内で create / update + 既存値読出を行い、レスポンスに同意状態を含める。
        const result = await db.runTransaction(async (tx): Promise<{
            termsAcceptedAt: string | null;
            termsVersion: string | null;
        }> => {
            const snap = await tx.get(ref);
            if (!snap.exists) {
                tx.set(ref, sanitizeForUpdate({
                    email,
                    plan,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    // 新規 user は未同意。次のリクエストで FE が TermsConsentModal を出す。
                    termsAcceptedAt: null,
                    termsVersion: null,
                }));
                return { termsAcceptedAt: null, termsVersion: null };
            }
            // 既存 user の場合、createdAt / plan は更新しない (rules で改ざん拒否、
            // CLAUDE.md MUST #5 Partial Update assertion)。同意フィールドも触らない。
            tx.update(ref, sanitizeForUpdate({
                email,
                updatedAt: FieldValue.serverTimestamp(),
            }));
            const data = snap.data() as Record<string, unknown> | undefined;
            const acceptedAt = toISOFromTimestamp(data?.termsAcceptedAt);
            const version = typeof data?.termsVersion === 'string' ? data.termsVersion : null;
            return { termsAcceptedAt: acceptedAt, termsVersion: version };
        });

        const response: UsersInitResponse = {
            success: true,
            user: {
                plan,
                termsAcceptedAt: result.termsAcceptedAt,
                termsVersion: result.termsVersion,
            },
            currentTermsVersion: TERMS_VERSION,
        };
        res.json(response);
    } catch (error) {
        // 「特定 uid だけ users/init が落ちる」事象を本番ログから追跡できるよう、
        // handleApiError 内部の汎用 logger.error より前に context 付きで先行 log する。
        logger.error({
            message: 'users/init failed',
            uid: user.uid,
            error: serializeError(error),
        });
        const { status, message } = handleApiError(error, 'users/init', 'firestore');
        res.status(status).json({ success: false, error: message });
    }
});

// 同意ボタン押下時に呼ばれる。`termsAcceptedAt` (server timestamp) と `termsVersion` を
// 現行値で書込む。create 経路は users/init で先行作成済みのため update のみ想定だが、
// 念のため exists チェック → 不在なら 409 を返す。
router.post('/accept-terms', verifyIdToken, async (req, res) => {
    const { user } = req as AuthedRequest;
    if (!user) {
        res.status(401).json({ success: false, error: 'Unauthenticated' });
        return;
    }
    try {
        // body.termsVersion で client が同意したバージョンを送る。サーバ現行と一致しない場合
        // (古い tab で表示中のモーダルから古い version を送ってくる等) は 409 で再同意誘導。
        const bodyVersion = (req.body as { termsVersion?: unknown } | null)?.termsVersion;
        if (typeof bodyVersion !== 'string' || bodyVersion.length === 0) {
            res.status(400).json({ success: false, error: 'termsVersion (string) が必要です。' });
            return;
        }
        if (bodyVersion !== TERMS_VERSION) {
            res.status(409).json({
                success: false,
                error: '規約バージョンが更新されています。最新版を確認のうえ再度同意してください。',
                code: TERMS_VERSION_MISMATCH_CODE,
                currentTermsVersion: TERMS_VERSION,
            });
            return;
        }

        const db = getFirebaseFirestore();
        const ref = db.collection('users').doc(user.uid);

        const fallbackAcceptedAt = await db.runTransaction(async (tx): Promise<string> => {
            const snap = await tx.get(ref);
            if (!snap.exists) {
                throw new UserDocMissingError();
            }
            tx.update(ref, sanitizeForUpdate({
                termsAcceptedAt: FieldValue.serverTimestamp(),
                termsVersion: TERMS_VERSION,
                updatedAt: FieldValue.serverTimestamp(),
            }));
            // server timestamp は transaction 内では未確定。fallback として tx 内で client 時刻を
            // 生成し、commit 後 re-read 失敗時にこの値を使う (silent re-read failure で 5xx を
            // 返さない、書込み自体は成功している)。server timestamp と数 ms ずれる許容範囲。
            return new Date().toISOString();
        });

        // commit 後の最新値を取得して ISO 化 (server timestamp の確定値)。
        // re-read が transient で失敗した場合は fallback (tx 内 client 時刻) を返す。
        // 書込みは成功しているので 200 を返し、UX を維持する。
        let finalAcceptedAt = fallbackAcceptedAt;
        try {
            const after = await ref.get();
            const data = after.data() as Record<string, unknown> | undefined;
            finalAcceptedAt = toISOFromTimestamp(data?.termsAcceptedAt) ?? fallbackAcceptedAt;
        } catch (rereadErr) {
            logger.warn({
                message: 'users/accept-terms post-commit re-read failed (using fallback)',
                uid: user.uid,
                error: serializeError(rereadErr),
            });
        }

        const response: AcceptTermsResponse = {
            success: true,
            termsAcceptedAt: finalAcceptedAt,
            termsVersion: TERMS_VERSION,
        };
        res.json(response);
    } catch (error) {
        if (error instanceof UserDocMissingError) {
            // /api/users/init 未実行のまま accept-terms が呼ばれた経路。
            // FE は users/init を呼び直してから retry する想定。
            res.status(409).json({
                success: false,
                error: 'ユーザー初期化が未完了です。リロードして再試行してください。',
                code: 'USER_DOC_MISSING',
            });
            return;
        }
        logger.error({
            message: 'users/accept-terms failed',
            uid: user.uid,
            error: serializeError(error),
        });
        const { status, message } = handleApiError(error, 'users/accept-terms', 'firestore');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
