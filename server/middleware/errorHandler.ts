import { Request, Response, NextFunction } from 'express';

export const handleApiError = (error: any, functionName: string): { status: number; message: string } => {
    console.error(`Error in ${functionName}:`, error);

    let message = '不明なエラーが発生しました。';

    if (error?.error?.message) {
        message = error.error.message;
    } else if (error?.message) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    }

    if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
        return { status: 429, message: 'AIの無料利用枠の上限に達してしまいました。APIは時間経過で回復しますが、しばらく待っても改善しない場���は、Google AI Studioでプランや支払い方法を確認してみてください。' };
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
