import type { Application, RequestHandler } from 'express';
import { verifyIdToken } from './middleware/verifyIdToken';
import novelRoutes from './routes/novel';
import characterRoutes from './routes/character';
import worldRoutes from './routes/world';
import imageRoutes from './routes/image';
import utilityRoutes from './routes/utility';
import analysisRoutes from './routes/analysis';

/**
 * `/api/ai/*` 配下の middleware と route mount を一箇所に集約する。
 * 本番（server/index.ts）とテスト（ai-auth.test.ts / integration）で同じ mount
 * 順序を共有し、drift（test では認証あり、本番では認証なし等）を防ぐ。
 *
 * preMiddlewares: prefix mount に prepend する middleware（例: aiLimiter）。
 * 順序は preMiddlewares → verifyIdToken → 各 route handler。認証エラー時も
 * pre-middleware（rate limit 等）は先に消費されるため、brute-force 防御が効く。
 */
export function mountAiRoutes(app: Application, ...preMiddlewares: RequestHandler[]): void {
    app.use('/api/ai', ...preMiddlewares, verifyIdToken);
    app.use('/api/ai/novel', novelRoutes);
    app.use('/api/ai/character', characterRoutes);
    app.use('/api/ai/world', worldRoutes);
    app.use('/api/ai/image', imageRoutes);
    app.use('/api/ai/utility', utilityRoutes);
    app.use('/api/ai/analysis', analysisRoutes);
}
