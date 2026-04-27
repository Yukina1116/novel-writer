import { Router } from 'express';
import { generateNovelContinuation } from '../services/novelService';
import { withUsageQuota } from '../middleware/withUsageQuota';

const router = Router();

router.post('/generate', withUsageQuota('novel/generate', async (req) => {
    return await generateNovelContinuation(req.body);
}));

export default router;
