import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

interface SafeError {
    name?: string;
    code?: string | number;
    message?: string;
    stack?: string;
}

function maskError(error: any): SafeError | any {
    if (isDev) return error;
    return {
        name: error?.name,
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
    };
}

function extractMessage(error: any): string {
    if (error?.error?.message) return error.error.message;
    if (error?.message) return error.message;
    if (typeof error === 'string') return error;
    return '不明なエラーが発生しました。';
}

export const handleApiError = (error: any, functionName: string): { status: number; message: string } => {
    try {
        console.error(`Error in ${functionName}:`, maskError(error));
    } catch {
        console.error(`Error in ${functionName}: <log mask failed>`);
    }

    const message = extractMessage(error);

    if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
        return { status: 429, message: 'AIの無料利用枠の上限に達してしまいました。APIは時間経過で回復しますが、しばらく待っても改善しない場合は、Google AI Studioでプランや支払い方法を確認してみてください。' };
    }
    if (message.includes('API key not valid') || message.includes('UNAUTHENTICATED')) {
        return { status: 401, message: 'AI認証エラーです。設定を確認してください。' };
    }
    if (message.includes('timeout') || message.includes('DEADLINE_EXCEEDED')) {
        return { status: 504, message: 'AIの応答がタイムアウトしました。ネットワーク接続を確認するか、少し待ってからもう一度お試しください。' };
    }

    return { status: 500, message };
};

export const errorHandlerMiddleware = (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const { status, message } = handleApiError(err, 'unhandled');
    res.status(status).json({ error: message });
};
