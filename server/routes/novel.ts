import { Router } from 'express';
import { generateNovelContinuation } from '../services/novelService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.post('/generate', async (req, res) => {
    try {
        const data = await generateNovelContinuation(req.body);
        res.json({ success: true, data });
    } catch (error) {
        const { status, message } = handleApiError(error, 'generateNovelContinuation');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
