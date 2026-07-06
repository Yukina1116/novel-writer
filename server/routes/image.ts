import { Router } from 'express';
import { generateImage } from '../services/imageService';
import { withUsageQuota } from '../middleware/withUsageQuota';
import { PartialSuccessError, recordImageGenerationKind } from '../services/usageService';
import { logger, serializeError } from '../utils/logger';

const router = Router();

router.post('/generate', withUsageQuota('image/generate', async (req, handle) => {
    const { prompt } = req.body;
    const isAdditionalGeneration = req.body?.isAdditionalGeneration === true;

    // Issue #232（コンバージョン最適化検討）向けの計測。best-effort のため
    // 失敗しても画像生成のレスポンス自体には影響させない。
    const recordKind = async (): Promise<void> => {
        try {
            await recordImageGenerationKind(req.user.uid, isAdditionalGeneration, handle);
        } catch (err) {
            logger.error({
                message: 'usage:recordImageGenerationKind failed',
                uid: req.user.uid,
                isAdditionalGeneration,
                error: serializeError(err),
            });
        }
    };

    try {
        const result = await generateImage(prompt);
        await recordKind();
        return result;
    } catch (err) {
        // PartialSuccessError（一部枚数のみ成功）も「生成は実行された」ため計測対象に含める。
        // 完全失敗（0 枚成功、通常の Error）は計測しない。
        if (err instanceof PartialSuccessError) {
            await recordKind();
        }
        throw err;
    }
}));

export default router;
