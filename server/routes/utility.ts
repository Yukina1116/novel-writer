import { Router } from 'express';
import { generateNames, generateKnowledgeName, extractCharacterInfo } from '../services/utilityService';
import { withUsageQuota } from '../middleware/withUsageQuota';

const router = Router();

router.post('/names', withUsageQuota('utility/names', async (req) => {
    const { category, keywords } = req.body;
    return await generateNames(category, keywords);
}));

router.post('/knowledge-name', withUsageQuota('utility/knowledge-name', async (req) => {
    const { sentence } = req.body;
    return await generateKnowledgeName(sentence);
}));

router.post('/extract-character', withUsageQuota('utility/extract-character', async (req) => {
    const { characterName, novelContent } = req.body;
    return await extractCharacterInfo(characterName, novelContent);
}));

export default router;
