// 認証フローの診断ログ収集エンドポイント (M7-α 後 / login 障害切り分け用)。
//
// 目的: signInWithPopup → users/init の各段階で FE からタイムスタンプ + 状態を
// fire-and-forget で送り、Cloud Logging に集約することで AI / 運用者が一次情報を
// 直接読めるようにする。FE 側のブラウザ console / network ペーストを介さない。
//
// 規律 (本 endpoint が常時 production にある間の安全性担保):
// - **認証なし**: pre-sign-in 段階のイベントも拾うため Bearer 必須にしない。
// - **rate limit**: 120 req/min/IP。spam による Cloud Logging 課金爆発を抑止。
// - **body サイズ**: 1KB cap。Express json parser を local 適用 (10MB の global parser を上書き)。
// - **event allowlist**: 既知 event 名のみ `eventKnown=true` でタグ。未知名も logging するが
//   `eventKnown=false` で grep フィルタを容易にする。
// - **PII 規律**: FE 呼出側で uid のみ送る (email / displayName / token は送らない)。
//   サーバ側でも detail を素通しにせず allowlist key だけ抽出する。
// - **撤去条件**: 障害切り分け完了後に PR で削除する (本ファイル + index.ts mount + FE 呼出)。
//   エンドポイントが常駐しても 1KB cap + rate limit + uid only なので即時の害はない。

import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

const router = Router();

const diagLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many diagnostic logs.' },
});

// 1KB cap の専用 json parser。global の 10MB parser より先にここで limit する。
const diagJsonParser = express.json({ limit: '1kb' });

const KNOWN_EVENTS = new Set([
    'signin:start',
    'signin:popup-resolve',
    'signin:popup-reject',
    'signin:users-init-start',
    'signin:users-init-success',
    'signin:users-init-error',
    'auth:state-changed',
    'auth:state-error',
]);

// detail から拾う key の allowlist。FE が誤って token / email を送っても
// ここで filtering される (defense in depth)。
const DETAIL_KEY_ALLOWLIST = new Set([
    'uid',
    'code',
    'message',
    'status',
    'hasUser',
    'hasCurrentTermsVersion',
    'providerId',
    'durationMs',
]);

function pickAllowlistedDetail(input: unknown): Record<string, unknown> | null {
    if (typeof input !== 'object' || input === null) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        if (!DETAIL_KEY_ALLOWLIST.has(k)) continue;
        // primitive のみ通す。object / array は素通しさせない (誤って大きな payload が
        // 入ったときに log ノイズ + Cloud Logging 課金になる)。
        if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            out[k] = v;
        }
    }
    return Object.keys(out).length > 0 ? out : null;
}

interface DiagBody {
    event?: unknown;
    ts?: unknown;
    sessionId?: unknown;
    detail?: unknown;
}

router.post('/auth-flow', diagLimiter, diagJsonParser, (req, res) => {
    const body = (req.body ?? {}) as DiagBody;
    const event = typeof body.event === 'string' ? body.event : null;
    const clientTs = typeof body.ts === 'number' && Number.isFinite(body.ts) ? body.ts : null;
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.length <= 64
        ? body.sessionId
        : null;
    if (!event || !clientTs) {
        return res.status(400).json({ error: 'invalid body' });
    }
    if (event.length > 64) {
        return res.status(400).json({ error: 'event name too long' });
    }
    const detail = pickAllowlistedDetail(body.detail);
    logger.info({
        message: 'auth-flow diag event',
        component: 'diagAuth',
        event,
        eventKnown: KNOWN_EVENTS.has(event),
        sessionId,
        clientTs,
        detail,
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip,
    });
    return res.status(204).send();
});

export default router;
