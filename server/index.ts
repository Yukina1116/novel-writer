import express from 'express';
import path from 'path';
import { errorHandlerMiddleware } from './middleware/errorHandler';

import novelRoutes from './routes/novel';
import characterRoutes from './routes/character';
import worldRoutes from './routes/world';
import imageRoutes from './routes/image';
import utilityRoutes from './routes/utility';
import analysisRoutes from './routes/analysis';
import dataRoutes from './routes/data';
import projectRoutes from './routes/projects';

async function startServer() {
    const app = express();
    const PORT = parseInt(process.env.PORT || '3000', 10);

    app.use(express.json({ limit: '10mb' }));

    // Health check for Cloud Run
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    // AI API routes
    app.use('/api/ai/novel', novelRoutes);
    app.use('/api/ai/character', characterRoutes);
    app.use('/api/ai/world', worldRoutes);
    app.use('/api/ai/image', imageRoutes);
    app.use('/api/ai/utility', utilityRoutes);
    app.use('/api/ai/analysis', analysisRoutes);

    // Project CRUD routes
    app.use('/api/projects', projectRoutes);

    // Data routes (tutorial, analysis-history)
    app.use('/api', dataRoutes);

    // Vite middleware for development / static serving for production
    if (process.env.NODE_ENV !== 'production') {
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

    // Error handler
    app.use(errorHandlerMiddleware);

    app.listen(PORT, '0.0.0.0', () => {
        const mode = process.env.USE_VERTEX_AI === 'true' ? 'Vertex AI' : 'API Key';
        console.log(`Server running on http://localhost:${PORT} [AI: ${mode}]`);
    });
}

startServer();
