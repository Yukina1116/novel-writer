import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

interface SafeError {
    name: string;
    message: string;
    code?: string | number;
    stack?: string;
    details?: unknown;
    cause?: unknown;
}

const GENERIC_PROD_MESSAGE = 'AI処理でエラーが発生しました。時間を置いて再試行してください。';

function maskError(error: unknown): SafeError {
    if (error == null || (typeof error !== 'object' && typeof error !== 'function')) {
        return { name: 'NonObjectError', message: String(error) };
    }
    const e = error as Record<string, unknown>;
    return {
        name: typeof e.name === 'string' ? e.name : 'UnknownError',
        message: typeof e.message === 'string' ? e.message : '',
        code: typeof e.code === 'string' || typeof e.code === 'number' ? e.code : undefined,
        stack: typeof e.stack === 'string' ? e.stack : undefined,
        details: e.details,
        cause: e.cause,
    };
}

function extractMessage(error: any): string {
    if (error?.error?.message) return error.error.message;
    if (error?.message) return error.message;
    if (typeof error === 'string') return error;
    return '不明なエラーが発生しました。';
}

export class CorsRejectError extends Error {
    constructor(message = 'Origin not allowed') {
        super(message);
        this.name = 'CorsRejectError';
    }
}

export const handleApiError = (error: any, functionName: string): { status: number; message: string } => {
    console.error(`Error in ${functionName}:`, isDev ? error : maskError(error));

    const message = extractMessage(error);

    if (error instanceof CorsRejectError) {
        return { status: 403, message: 'このオリジンからのアクセスは許可されていません。' };
    }
    if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
        return { status: 429, message: 'AIの無料利用枠の上限に達してしまいました。APIは時間経過で回復しますが、しばらく待っても改善しない場合は、Google AI Studioでプランや支払い方法を確認してみてください。' };
    }
    if (message.includes('API key not valid') || message.includes('UNAUTHENTICATED')) {
        return { status: 401, message: 'AI認証エラーです。設定を確認してください。' };
    }
    if (message.includes('timeout') || message.includes('DEADLINE_EXCEEDED')) {
        return { status: 504, message: 'AIの応答がタイムアウトしました。ネットワーク接続を確認するか、少し待ってからもう一度お試しください。' };
    }

    return {
        status: 500,
        message: isDev ? message : GENERIC_PROD_MESSAGE,
    };
};

export const errorHandlerMiddleware = (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return _next(err);
    const { status, message } = handleApiError(err, 'unhandled');
    res.status(status).json({ error: message });
};
