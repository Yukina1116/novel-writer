import { Router } from 'express';
import { generateNames, generateKnowledgeName, extractCharacterInfo } from '../services/utilityService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.post('/names', async (req, res) => {
    try {
        const { category, keywords } = req.body;
        const data = await generateNames(category, keywords);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateNames');
        res.status(status).json({ success: false, error: message });
    }
});

router.post('/knowledge-name', async (req, res) => {
    try {
        const { sentence } = req.body;
        const data = await generateKnowledgeName(sentence);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateKnowledgeName');
        res.status(status).json({ success: false, error: message });
    }
});

router.post('/extract-character', async (req, res) => {
    try {
        const { characterName, novelContent } = req.body;
        const data = await extractCharacterInfo(characterName, novelContent);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'extractCharacterInfo');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
