import type { Request, Response, NextFunction } from 'express';
import { FirebaseAuthError } from 'firebase-admin/auth';
import { getFirebaseAuth } from '../firebaseAdmin';

declare module 'express-serve-static-core' {
    interface Request {
        user?: { uid: string; email: string | null };
    }
}

const TRANSIENT_AUTH_CODES = new Set([
    'auth/internal-error',
    'auth/network-request-failed',
    'auth/service-unavailable',
]);

const isTransientAuthError = (error: unknown): boolean => {
    if (error instanceof FirebaseAuthError) {
        return TRANSIENT_AUTH_CODES.has(error.code);
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
        if (TRANSIENT_AUTH_CODES.has(code)) return true;
        if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND') return true;
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
