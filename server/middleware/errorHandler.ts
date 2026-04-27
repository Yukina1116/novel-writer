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

const GENERIC_PROD_MESSAGE_AI = 'AI処理でエラーが発生しました。時間を置いて再試行してください。';
const GENERIC_PROD_MESSAGE_FIRESTORE = 'データベース処理に失敗しました。';
const TRANSIENT_MESSAGE_AI = 'AIサービスが一時的に利用できません。少し待って再試行してください。';
const TRANSIENT_MESSAGE_FIRESTORE = 'データベースが一時的に利用できません。少し待って再試行してください。';

// Firestore / Vertex AI などの gRPC ベースのエラー code を共通分類する。
// 数値 (canonical gRPC code) と文字列 (英大文字 SNAKE_CASE) の両方が来うる。
// 文字列は trim + uppercase で正規化し、SDK が ' UNAVAILABLE' / 'unavailable' /
// 'UNAVAILABLE\n' を返した場合の silent permanent fallthrough を防ぐ。
const TRANSIENT_GRPC_CODES = new Set<string | number>([
    4, 14, 'DEADLINE_EXCEEDED', 'UNAVAILABLE',
]);

function isTransientGrpcError(error: unknown): boolean {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'number') return TRANSIENT_GRPC_CODES.has(code);
    if (typeof code === 'string') return TRANSIENT_GRPC_CODES.has(code.trim().toUpperCase());
    return false;
}

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

export type ErrorContext = 'ai' | 'firestore';

// context: 'ai' は Vertex AI 等の外部 AI サービス、'firestore' は Firestore Admin SDK。
// gRPC transient (UNAVAILABLE / DEADLINE_EXCEEDED) は両 context で 503 に統一し、
// 文言だけ context-aware に切り替える。
// IMPORTANT: Firestore / 他の gRPC backend を呼ぶ route は必ず context='firestore' を
// 明示すること。default = 'ai' に依存すると AI 用 message ベース分類 (quota → 429,
// UNAUTHENTICATED → 401) が誤発火し、データベース永続障害が一時的な 429 として
// FE に出る silent failure になる。
export const handleApiError = (
    error: any,
    functionName: string,
    context: ErrorContext = 'ai',
): { status: number; message: string } => {
    console.error(`Error in ${functionName}:`, isDev ? error : maskError(error));

    // gRPC transient は AI / Firestore 両 context で 503 透過 (FE が再試行を判断)
    if (isTransientGrpcError(error)) {
        return {
            status: 503,
            message: context === 'firestore' ? TRANSIENT_MESSAGE_FIRESTORE : TRANSIENT_MESSAGE_AI,
        };
    }

    if (error instanceof CorsRejectError) {
        return { status: 403, message: 'このオリジンからのアクセスは許可されていません。' };
    }

    // Firestore context は message ベースの AI 分類 (quota / API key / timeout) を適用しない。
    // gRPC code が transient セットにマッチしなかった場合は permanent として 500 に集約する。
    if (context === 'firestore') {
        return { status: 500, message: GENERIC_PROD_MESSAGE_FIRESTORE };
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

    return {
        status: 500,
        message: isDev ? message : GENERIC_PROD_MESSAGE_AI,
    };
};

export const errorHandlerMiddleware = (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return _next(err);
    const { status, message } = handleApiError(err, 'unhandled');
    res.status(status).json({ error: message });
};
