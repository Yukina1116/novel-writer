import { Router } from 'express';
import { analyzeTextForImport } from '../services/analysisService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.post('/import', async (req, res) => {
    try {
        const { importedText, existingCharacters, existingWorldSettings, existingKnowledge } = req.body;
        const data = await analyzeTextForImport(importedText, existingCharacters, existingWorldSettings, existingKnowledge);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'analyzeTextForImport');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
