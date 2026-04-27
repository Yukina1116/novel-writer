import { Router } from 'express';
import { generateImage } from '../services/imageService';
import { withUsageQuota } from '../middleware/withUsageQuota';

const router = Router();

router.post('/generate', withUsageQuota('image/generate', async (req) => {
    const { prompt } = req.body;
    return await generateImage(prompt);
}));

export default router;
