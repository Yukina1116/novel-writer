import { Router } from 'express';
import { generateImage } from '../services/imageService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.post('/generate', async (req, res) => {
    try {
        const { prompt } = req.body;
        const data = await generateImage(prompt);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateImage');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
