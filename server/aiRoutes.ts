import type { Application, RequestHandler } from 'express';
import { verifyIdToken } from './middleware/verifyIdToken';
import novelRoutes from './routes/novel';
import characterRoutes from './routes/character';
import worldRoutes from './routes/world';
import imageRoutes from './routes/image';
import utilityRoutes from './routes/utility';
import analysisRoutes from './routes/analysis';

export interface MountAiRoutesOptions {
    // /api/ai/* prefix で verifyIdToken の前に走らせる rate limiter（任意）。
    // 認証エラー時も rate limit が先に消費されるため brute-force 防御が効く。
    rateLimit?: RequestHandler;
}

/**
 * `/api/ai/*` 配下の middleware と route mount を一箇所に集約する。
 * 本番（server/index.ts）とテスト（ai-auth.test.ts / integration）で同じ mount
 * 順序を共有し、drift（test では認証あり、本番では認証なし等）を防ぐ。
 *
 * 順序: rateLimit → verifyIdToken → 各 route handler。
 *
 * 名前付きオプション化（PR-F）の理由: 旧 API (`...preMiddlewares: RequestHandler[]`)
 * では `verifyIdToken` を二重に渡せてしまう経路があり、認証 middleware の二重 mount
 * を type 段で禁止できなかった。`{ rateLimit?: RequestHandler }` に絞ることで
 * 用途を rate limit のみに限定する。
 */
export function mountAiRoutes(app: Application, options: MountAiRoutesOptions = {}): void {
    const middlewares: RequestHandler[] = [];
    if (options.rateLimit) middlewares.push(options.rateLimit);
    middlewares.push(verifyIdToken);

    app.use('/api/ai', ...middlewares);
    app.use('/api/ai/novel', novelRoutes);
    app.use('/api/ai/character', characterRoutes);
    app.use('/api/ai/world', worldRoutes);
    app.use('/api/ai/image', imageRoutes);
    app.use('/api/ai/utility', utilityRoutes);
    app.use('/api/ai/analysis', analysisRoutes);
}
