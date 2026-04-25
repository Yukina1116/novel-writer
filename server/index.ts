import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorHandlerMiddleware, CorsRejectError } from './middleware/errorHandler';

import novelRoutes from './routes/novel';
import characterRoutes from './routes/character';
import worldRoutes from './routes/world';
import imageRoutes from './routes/image';
import utilityRoutes from './routes/utility';
import analysisRoutes from './routes/analysis';
import dataRoutes from './routes/data';
import projectRoutes from './routes/projects';

const isDev = process.env.NODE_ENV !== 'production';

const allowedOrigins = isDev
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : [
        'https://novel-writer-ramnh3ulya-an.a.run.app',
        'https://novel-writer-446321146441.asia-northeast1.run.app',
    ];

async function startServer() {
    const app = express();
    const PORT = parseInt(process.env.PORT || '3000', 10);

    // Cloud Run is a single proxy hop; required for express-rate-limit IP detection.
    app.set('trust proxy', 1);

    app.use(helmet({
        contentSecurityPolicy: isDev
            ? false
            : {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'", 'data:'],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'none'"],
                },
            },
        crossOriginEmbedderPolicy: false,
    }));

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new CorsRejectError());
        },
    }));

    const aiLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: isDev ? 1000 : 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
    });

    app.use(express.json({ limit: '10mb' }));

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    app.use('/api/ai', aiLimiter);
    app.use('/api/ai/novel', novelRoutes);
    app.use('/api/ai/character', characterRoutes);
    app.use('/api/ai/world', worldRoutes);
    app.use('/api/ai/image', imageRoutes);
    app.use('/api/ai/utility', utilityRoutes);
    app.use('/api/ai/analysis', analysisRoutes);

    app.use('/api/projects', projectRoutes);
    app.use('/api', dataRoutes);

    if (isDev) {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('/{*path}', (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.use(errorHandlerMiddleware);

    app.listen(PORT, '0.0.0.0', () => {
        const mode = process.env.USE_VERTEX_AI === 'true' ? 'Vertex AI' : 'API Key';
        console.log(`Server running on http://localhost:${PORT} [AI: ${mode}, env: ${isDev ? 'dev' : 'prod'}]`);
    });
}

startServer();
