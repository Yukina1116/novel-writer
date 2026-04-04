import { Router } from 'express';
import { updateWorldData, generateWorldReply } from '../services/worldService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.post('/update', async (req, res) => {
    try {
        const { chatHistory, currentWorldData, intent } = req.body;
        const data = await updateWorldData(chatHistory, currentWorldData, intent);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'updateWorldData');
        res.status(status).json({ success: false, error: message });
    }
});

router.post('/reply', async (req, res) => {
    try {
        const { updatedWorldData } = req.body;
        const data = await generateWorldReply(updatedWorldData);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateWorldReply');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
