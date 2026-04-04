import { Router } from 'express';
import { updateCharacterData, generateCharacterReply, generateCharacterImagePrompt } from '../services/characterService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.post('/update', async (req, res) => {
    try {
        const { chatHistory, currentCharacterData, intent } = req.body;
        const data = await updateCharacterData(chatHistory, currentCharacterData, intent);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'updateCharacterData');
        res.status(status).json({ success: false, error: message });
    }
});

router.post('/reply', async (req, res) => {
    try {
        const { updatedCharacterData } = req.body;
        const reply = await generateCharacterReply(updatedCharacterData);
        res.json({ success: true, data: { reply } });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateCharacterReply');
        res.status(status).json({ success: false, error: message });
    }
});

router.post('/image-prompt', async (req, res) => {
    try {
        const { chatHistory } = req.body;
        const data = await generateCharacterImagePrompt(chatHistory);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateCharacterImagePrompt');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
