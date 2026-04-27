import type { Request, Response, NextFunction } from 'express';
import { FirebaseAuthError } from 'firebase-admin/auth';
import { getFirebaseAuth } from '../firebaseAdmin';

declare module 'express-serve-static-core' {
    interface Request {
        user?: { uid: string; email: string | null };
    }
}

export type AuthedRequest = Request & { user: NonNullable<Request['user']> };

const TRANSIENT_AUTH_CODES = new Set<string>([
    'auth/internal-error',
    'auth/network-request-failed',
    'auth/service-unavailable',
    // app/network-error は firebase-admin が下層 fetch エラーを wrap した際の文字列形式
    'app/network-error',
]);

const TRANSIENT_NETWORK_CODES = new Set<string>([
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EAI_AGAIN',
]);

// 期待された permanent エラー = ユーザー操作（再ログイン）で復旧する経路。
// このリストにない permanent は分類漏れ / SDK breaking / 設定ミスの可能性があり、
// catch ブロック末尾 (verifyIdToken rejected (unexpected)) の console.error で
// 観測性を確保する。Sentry 等で異常な permanent code を拾って本リストに追加する運用。
//
// auth/quota-exceeded は意図的に追加していない: 公式ドキュメント
// (https://firebase.google.com/docs/auth/admin/errors) では verifyIdToken() の
// 文書化された throw は id-token-expired / id-token-revoked / invalid-id-token /
// argument-error / internal-error のみ。auth/quota-exceeded は SMS 送信経路で
// 発生するため verifyIdToken では出ない想定。万一観測した場合は上記 unexpected
// ログ経由で検知される。
const EXPECTED_PERMANENT_AUTH_CODES = new Set<string>([
    'auth/argument-error',
    'auth/id-token-expired',
    'auth/id-token-revoked',
    'auth/invalid-id-token',
]);

const isExpectedPermanentAuthError = (error: unknown): boolean => {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && EXPECTED_PERMANENT_AUTH_CODES.has(code);
};

const isTransientAuthError = (error: unknown): boolean => {
    if (error instanceof FirebaseAuthError) {
        return TRANSIENT_AUTH_CODES.has(error.code);
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
        if (TRANSIENT_AUTH_CODES.has(code)) return true;
        if (TRANSIENT_NETWORK_CODES.has(code)) return true;
    }
    return false;
};

export async function verifyIdToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
        return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
        res.status(401).json({ success: false, error: 'Empty bearer token' });
        return;
    }

    try {
        const decoded = await getFirebaseAuth().verifyIdToken(token);
        req.user = { uid: decoded.uid, email: decoded.email ?? null };
        next();
    } catch (error: unknown) {
        // transient (Firebase Auth サービス障害) は 503 透過で FE が再試行を判断、
        // permanent (invalid/expired token) は 401 で再ログイン誘導。
        if (isTransientAuthError(error)) {
            console.error('verifyIdToken transient error:', error);
            res.status(503).json({ success: false, error: 'Auth service temporarily unavailable' });
            return;
        }
        // 期待された permanent (期限切れ等) は warn 止まり、それ以外は error で
        // 観測性を確保し、Sentry 等で `auth/quota-exceeded` 分類漏れや SDK breaking
        // 等を検知できるようにする
        if (isExpectedPermanentAuthError(error)) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('verifyIdToken rejected (expected):', message);
        } else {
            console.error('verifyIdToken rejected (unexpected):', error);
        }
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// 内部関数だが test から TRANSIENT 判定を直接検証するため export する
export const __testing = { isTransientAuthError, TRANSIENT_AUTH_CODES, TRANSIENT_NETWORK_CODES };
