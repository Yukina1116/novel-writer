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
        // transient: Firebase Auth サービス障害は 503 透過、FE が再試行を判断する
        // permanent: invalid/expired token は 401（rules/error-handling.md §3）
        if (isTransientAuthError(error)) {
            console.error('verifyIdToken transient error:', error);
            res.status(503).json({ success: false, error: 'Auth service temporarily unavailable' });
            return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.warn('verifyIdToken rejected:', message);
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// 内部関数だが test から TRANSIENT 判定を直接検証するため export する
export const __testing = { isTransientAuthError, TRANSIENT_AUTH_CODES, TRANSIENT_NETWORK_CODES };
