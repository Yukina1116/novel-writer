import { Router } from 'express';
import { analyzeTextForImport } from '../services/analysisService';
import { withUsageQuota } from '../middleware/withUsageQuota';

const router = Router();

router.post('/import', withUsageQuota('analysis/import', async (req) => {
    const { importedText, existingCharacters, existingWorldSettings, existingKnowledge } = req.body;
    return await analyzeTextForImport(importedText, existingCharacters, existingWorldSettings, existingKnowledge);
}));

export default router;
