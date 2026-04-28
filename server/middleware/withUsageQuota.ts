// AI route を usage クォータでラップする高階関数。
//
// route.post('/generate', withUsageQuota('novel/generate', async (req) => {
//     return await generateNovelContinuation(req.body);
// }));
//
// 内部で reserve → handler → commit / cancel の 3 phase を統括する。
// handler 引数は AuthedRequest で narrow されており、`req.user.uid` を安全に使える。

import type { RequestHandler, Response } from 'express';
import type { AuthedRequest } from './verifyIdToken';
import { handleApiError } from './errorHandler';
import {
    cancel,
    commit,
    DuplicateRequestError,
    QuotaExceededError,
    reserve,
    type ReservationHandle,
} from '../services/usageService';
import { MONTHLY_LIMIT_SEN, ROUTE_COST_SEN, type AiRouteKey, type Tier } from '../services/usageConfig';
import { logger, serializeError } from '../utils/logger';

// 現状 Tier 取得経路がないため固定。将来 users.plan からの取得に切替予定。
const DEFAULT_TIER: Tier = 'free';

// requestId は client が UUID v4 (36 chars) を body.requestId に入れる前提。
// 同一リクエストの再送（FE retry）は同じ requestId を再送する。
// 8-128 文字レンジは UUID v4 を内包しつつ、将来 client 実装が短い nanoid 系
// (>= 8 chars) や長い prefix 付き ID (<= 128) を採用しても許容できる範囲。
const isValidRequestId = (value: unknown): value is string =>
    typeof value === 'string' && value.length >= 8 && value.length <= 128;

export type AiHandler<TData> = (req: AuthedRequest) => Promise<TData>;

export const withUsageQuota = <TData>(
    routeKey: AiRouteKey,
    handler: AiHandler<TData>,
): RequestHandler => {
    return async (req, res: Response): Promise<void> => {
        const authed = req as AuthedRequest;
        if (!authed.user?.uid) {
            // verifyIdToken middleware が抜けていない限りここには来ない。二重防御。
            logger.error({
                message: 'withUsageQuota: req.user missing',
                route: routeKey,
            });
            res.status(500).json({ success: false, error: '認証コンテキストが取得できませんでした。' });
            return;
        }

        const uid = authed.user.uid;
        const requestId: unknown = req.body?.requestId;
        if (!isValidRequestId(requestId)) {
            res.status(400).json({
                success: false,
                error: 'requestId が必要です（8〜128 文字の文字列）。',
                code: 'INVALID_REQUEST_ID',
            });
            return;
        }

        const tier = DEFAULT_TIER;
        const limit = MONTHLY_LIMIT_SEN[tier];
        const estimatedCost = ROUTE_COST_SEN[routeKey];

        let handle: ReservationHandle;
        try {
            handle = await reserve(uid, requestId, estimatedCost, limit);
        } catch (err) {
            if (err instanceof DuplicateRequestError) {
                res.status(409).json({
                    success: false,
                    error: '同一リクエストが進行中または完了済みです。',
                    code: 'DUPLICATE_REQUEST',
                });
                return;
            }
            if (err instanceof QuotaExceededError) {
                res.status(429).json({
                    success: false,
                    error: '今月の AI 利用枠の上限に達しました。来月の更新をお待ちください。',
                    code: 'QUOTA_EXCEEDED',
                    usage: {
                        used: err.used,
                        reserved: err.reserved,
                        limit: err.limit,
                    },
                });
                return;
            }
            const { status, message } = handleApiError(err, `usage:reserve:${routeKey}`, 'usage');
            res.status(status).json({ success: false, error: message });
            return;
        }

        try {
            const data = await handler(authed);
            try {
                await commit(uid, requestId, estimatedCost, handle);
            } catch (commitErr) {
                // commit 失敗時も AI 結果は返す（ユーザーに損なし）。reservation が
                // 残ると次回以降の上限判定に加算され続け、false positive 429 の経路に
                // なるため、best-effort で cancel を試行して reservedCost を解放する。
                // actualCost は記録されないが、上限到達誤判定よりリスクが小さい。
                // どちらも失敗した場合は観測ログのみ（同一月内の reservation 残存を
                // Sentry 等で監視 → 必要に応じ reconciliation job 検討）。
                logger.error({
                    message: 'usage:commit failed',
                    route: routeKey,
                    uid,
                    requestId,
                    estimatedCost,
                    error: serializeError(commitErr),
                });
                try {
                    await cancel(uid, requestId, handle);
                } catch (cancelErr) {
                    logger.error({
                        message: 'usage:cancel-after-commit-failure also failed',
                        route: routeKey,
                        uid,
                        requestId,
                        error: serializeError(cancelErr),
                    });
                }
            }
            res.json({ success: true, data });
        } catch (handlerErr) {
            try {
                await cancel(uid, requestId, handle);
            } catch (cancelErr) {
                logger.error({
                    message: 'usage:cancel failed',
                    route: routeKey,
                    uid,
                    requestId,
                    estimatedCost,
                    error: serializeError(cancelErr),
                });
            }
            const { status, message } = handleApiError(handlerErr, routeKey, 'ai');
            res.status(status).json({ success: false, error: message });
        }
    };
};
