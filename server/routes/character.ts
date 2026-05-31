import { Router } from 'express';
import { updateCharacterData, generateCharacterReply, generateCharacterImagePrompt } from '../services/characterService';
import { withUsageQuota } from '../middleware/withUsageQuota';

const router = Router();

router.post('/update', withUsageQuota('character/update', async (req) => {
    const { chatHistory, currentCharacterData, intent } = req.body;
    return await updateCharacterData(chatHistory, currentCharacterData, intent);
}));

router.post('/reply', withUsageQuota('character/reply', async (req) => {
    const { updatedCharacterData, context } = req.body;
    const reply = await generateCharacterReply(updatedCharacterData, context);
    return { reply };
}));

router.post('/image-prompt', withUsageQuota('character/image-prompt', async (req) => {
    const { chatHistory } = req.body;
    return await generateCharacterImagePrompt(chatHistory);
}));

export default router;
