import { Router } from 'express';
import { updateWorldData, generateWorldReply } from '../services/worldService';
import { withUsageQuota } from '../middleware/withUsageQuota';

const router = Router();

router.post('/update', withUsageQuota('world/update', async (req) => {
    const { chatHistory, currentWorldData, intent } = req.body;
    return await updateWorldData(chatHistory, currentWorldData, intent);
}));

router.post('/reply', withUsageQuota('world/reply', async (req) => {
    const { updatedWorldData } = req.body;
    return await generateWorldReply(updatedWorldData);
}));

export default router;
