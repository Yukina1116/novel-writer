import { Request, Response, NextFunction } from 'express';

// NODE_ENV 未設定時は production 扱い (raw message 漏洩を防ぐ)。
// Cloud Run / 本番デプロイで `NODE_ENV=production` 設定漏れがあっても
// stack trace 含む内部 error を FE に流さない安全側に倒す。
const isDev = process.env.NODE_ENV === 'development';

interface SafeError {
    name: string;
    message: string;
    code?: string | number;
    stack?: string;
    details?: unknown;
    cause?: unknown;
}

// context ごとの文言と分類戦略を一箇所で table-driven に管理する。
// 新しい context を追加する場合は ErrorContext ユニオンを拡張し、
// MESSAGES に対応エントリを追加すれば self-exhaustive に強制される。
export type ErrorContext = 'ai' | 'firestore' | 'usage';

interface ContextConfig {
    transient: string;
    generic: string;
    // AI message ベース分類 (quota / API key / timeout) を適用するか。
    // Firestore / usage では誤発火を防ぐため false にする。
    useAiMessageClassification: boolean;
}

const MESSAGES = {
    ai: {
        transient: 'AIサービスが一時的に利用できません。少し待って再試行してください。',
        generic: 'AI処理でエラーが発生しました。時間を置いて再試行してください。',
        useAiMessageClassification: true,
    },
    firestore: {
        transient: 'データベースが一時的に利用できません。少し待って再試行してください。',
        generic: 'データベース処理に失敗しました。',
        useAiMessageClassification: false,
    },
    usage: {
        transient: '利用量の集計が一時的に失敗しました。少し待って再試行してください。',
        generic: '利用量の集計に失敗しました。',
        useAiMessageClassification: false,
    },
} as const satisfies Record<ErrorContext, ContextConfig>;

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

// SDK が外側 (`error.message`) と内側 (`error.error.message`) の両方に文言を持つ
// ケース (Vertex AI: 外側に "RESOURCE_EXHAUSTED: ..." / 内側に generic fetch error 等)。
// Issue #40: 内側だけ参照すると quota / UNAUTHENTICATED 分類が silent fallthrough する。
// 各候補文字列を取り出し、分類器は候補集合に対して `some` で substring 判定する
// （連結文字列での判定は境界に偶然マッチが出るリスクがあるため避ける）。
function getMessageCandidates(error: unknown): string[] {
    if (error == null) return [];
    if (typeof error === 'string') return [error];
    const e = error as { error?: { message?: unknown }; message?: unknown };
    const candidates: string[] = [];
    if (typeof e.message === 'string' && e.message) candidates.push(e.message);
    if (typeof e.error?.message === 'string' && e.error.message && e.error.message !== e.message) {
        candidates.push(e.error.message);
    }
    return candidates;
}

// dev mode の fallback 表示用に連結文字列で返す（分類は getMessageCandidates 経由）。
function extractMessage(error: unknown): string {
    const candidates = getMessageCandidates(error);
    if (candidates.length === 0) {
        return typeof error === 'string' ? error : '不明なエラーが発生しました。';
    }
    return candidates.join(' / ');
}

export class CorsRejectError extends Error {
    constructor(message = 'Origin not allowed') {
        super(message);
        this.name = 'CorsRejectError';
    }
}

// IMPORTANT: context は必須引数。Firestore / 他の gRPC backend を呼ぶ route で
// 'ai' を指定すると AI 用 message ベース分類 (quota → 429, UNAUTHENTICATED → 401)
// が誤発火し、データベース永続障害が一時的な 429 として FE に出る silent failure
// になる。呼出元が必ず明示する設計。
export const handleApiError = (
    error: unknown,
    functionName: string,
    context: ErrorContext,
): { status: number; message: string } => {
    console.error(`Error in ${functionName}:`, isDev ? error : maskError(error));

    const config = MESSAGES[context];

    // gRPC transient は全 context で 503 透過 (FE が再試行を判断)
    if (isTransientGrpcError(error)) {
        return { status: 503, message: config.transient };
    }

    if (error instanceof CorsRejectError) {
        return { status: 403, message: 'このオリジンからのアクセスは許可されていません。' };
    }

    if (!config.useAiMessageClassification) {
        return { status: 500, message: config.generic };
    }

    // 連結文字列ではなく候補配列に対して個別判定する。outer に "timeout"、
    // inner に "RESOURCE_EXHAUSTED" のような混在ケースで、優先度の高い方
    // (quota → 429) が確実に採用される。判定順 = 深刻度順 (429 > 401 > 504)。
    const candidates = getMessageCandidates(error);
    const matchesAny = (predicate: (msg: string) => boolean): boolean => candidates.some(predicate);

    if (matchesAny(m => m.includes('quota') || m.includes('RESOURCE_EXHAUSTED'))) {
        return { status: 429, message: 'AIの無料利用枠の上限に達してしまいました。APIは時間経過で回復しますが、しばらく待っても改善しない場合は、Google AI Studioでプランや支払い方法を確認してみてください。' };
    }
    if (matchesAny(m => m.includes('API key not valid') || m.includes('UNAUTHENTICATED'))) {
        return { status: 401, message: 'AI認証エラーです。設定を確認してください。' };
    }
    if (matchesAny(m => m.includes('timeout') || m.includes('DEADLINE_EXCEEDED'))) {
        return { status: 504, message: 'AIの応答がタイムアウトしました。ネットワーク接続を確認するか、少し待ってからもう一度お試しください。' };
    }

    return {
        status: 500,
        message: isDev ? extractMessage(error) : config.generic,
    };
};

export const errorHandlerMiddleware = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return _next(err);
    const { status, message } = handleApiError(err, 'unhandled', 'ai');
    res.status(status).json({ error: message });
};

// テスト用: 内部関数の挙動を直接検証するため export
export const __testing = { extractMessage, isTransientGrpcError };
