import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const DATA_FILE = path.join(process.cwd(), 'tutorial_data.json');
const ANALYSIS_HISTORY_FILE = path.join(process.cwd(), 'analysis_history.json');

router.get('/tutorial', (_req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } else {
        res.json({});
    }
});

router.post('/tutorial', (req, res) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

router.get('/analysis-history', (_req, res) => {
    if (fs.existsSync(ANALYSIS_HISTORY_FILE)) {
        const data = fs.readFileSync(ANALYSIS_HISTORY_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } else {
        res.json({ history: [] });
    }
});

router.post('/analysis-history', (req, res) => {
    fs.writeFileSync(ANALYSIS_HISTORY_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

export default router;
