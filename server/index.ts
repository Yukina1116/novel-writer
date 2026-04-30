import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorHandlerMiddleware, CorsRejectError } from './middleware/errorHandler';
import { probeFirebaseAuth } from './startupProbe';
import { mountAiRoutes } from './aiRoutes';
import { logger, serializeError } from './utils/logger';

import usersRoutes from './routes/users';

const isDev = process.env.NODE_ENV !== 'production';

const allowedOrigins = isDev
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : [
        'https://novel-writer-ramnh3ulya-an.a.run.app',
        'https://novel-writer-446321146441.asia-northeast1.run.app',
    ];

async function startServer() {
    probeFirebaseAuth();

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
                    // aistudiocdn.com: ESM importmap targets (react/zustand/etc.).
                    // 旧: cdn.tailwindcss.com (ランタイム JIT script) を許可していたが、
                    // Tailwind は PostCSS でビルド時に self-host (dist/assets/index-*.css)
                    // するようになったため scriptSrc から除去。
                    scriptSrc: [
                        "'self'",
                        "'unsafe-inline'",
                        'https://aistudiocdn.com',
                        // cdn.jsdelivr.net: /dev/ 開発者ポータルが Mermaid ESM を CDN から
                        // 読み込むため。本番アプリ本体 (FE bundle) は jsdelivr を使わないので
                        // 影響なし。/dev/ ページは認証ゲートなしの公開ドキュメント (M7-α 完了時点)。
                        'https://cdn.jsdelivr.net',
                    ],
                    // fonts.googleapis.com: webfont stylesheets referenced in index.html.
                    styleSrc: [
                        "'self'",
                        "'unsafe-inline'",
                        'https://fonts.googleapis.com',
                    ],
                    // lh3.googleusercontent.com: Google profile avatars (Firebase Auth).
                    imgSrc: ["'self'", 'data:', 'https:', 'https://lh3.googleusercontent.com'],
                    // Firebase Auth REST endpoints (identitytoolkit/securetoken) +
                    // generic googleapis (token endpoint) + firebaseapp (auth handler).
                    connectSrc: [
                        "'self'",
                        'https://*.googleapis.com',
                        'https://*.firebaseapp.com',
                        'https://identitytoolkit.googleapis.com',
                        'https://securetoken.googleapis.com',
                    ],
                    // fonts.gstatic.com: webfont binaries served by Google Fonts.
                    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
                    objectSrc: ["'none'"],
                    // Firebase Auth popup needs to load auth handler iframe + Google sign-in.
                    frameSrc: ['https://*.firebaseapp.com', 'https://accounts.google.com'],
                    frameAncestors: ["'none'"],
                },
            },
        crossOriginEmbedderPolicy: false,
    }));

    // Same-origin requests (Origin host === request host) are always allowed:
    // browsers send an Origin header for modules/fonts/preconnect even when
    // the loading page is on the same host, so a static asset fetch under
    // `npm run build && NODE_ENV=production` would otherwise 403 itself.
    // Cross-origin requests must be in `allowedOrigins`.
    app.use((req, res, next) => cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            try {
                if (new URL(origin).host === req.headers.host) {
                    return callback(null, true);
                }
            } catch {
                // origin is not a valid URL — fall through to allowedOrigins
            }
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new CorsRejectError());
        },
    })(req, res, next));

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

    // 順序: aiLimiter → verifyIdToken → 各 route。認証失敗も rate limit を消費させて
    // brute-force / DoS から守る。詳細は server/aiRoutes.ts。
    mountAiRoutes(app, { rateLimit: aiLimiter });

    app.use('/api/users', usersRoutes);

    // Any unmatched /api/* path must 404 instead of falling through to the
    // SPA fallback (dev: Vite middleware / prod: index.html static). Without
    // this, unknown API endpoints would return HTML and look "alive".
    app.use('/api', (_req, res) => {
        res.status(404).json({ success: false, error: 'Not Found' });
    });

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
        logger.info({
            message: `Server running on http://localhost:${PORT}`,
            port: PORT,
            aiMode: mode,
            env: isDev ? 'dev' : 'prod',
        });
    });
}

// probeFirebaseAuth() が同期 throw した場合、async startServer 内で reject に
// なるが Node のバージョンや起動オプションによっては unhandledRejection 警告だけで
// process が alive のまま残る経路がある。Cloud Run の rollback 判定を確実化するため
// 明示的に exit 1 する（fail-fast の意義保全）。
startServer().catch((err) => {
    logger.error({
        message: 'Fatal startup error',
        error: serializeError(err),
    });
    process.exit(1);
});
