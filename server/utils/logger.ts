// Structured logger for server-side code (M7-α).
//
// Cloud Logging structured logging compatible:
//   https://cloud.google.com/logging/docs/structured-logging
//
// stdout/stderr に JSON 1 行を書き出すと Cloud Run + Cloud Logging が自動で
// LogEntry にマッピングする。`severity` フィールドが Cloud Logging 側の
// LogSeverity enum に直接対応する。dev (NODE_ENV !== 'production') では
// 人間可読な pretty-print に切り替えて開発時のノイズを抑える。

type LogLevel = 'INFO' | 'WARNING' | 'ERROR';

export interface LogPayload {
    // 人間が読む短い説明。Cloud Logging の textPayload 相当。必須。
    message: string;
    // 任意の構造化フィールド (requestId, route, uid, code, error 等)。
    [key: string]: unknown;
}

const SERVICE = 'novel-writer-server';

// process.env.NODE_ENV を関数評価で読むことで、テスト時の vi.stubEnv が反映される。
const isProd = (): boolean => process.env.NODE_ENV === 'production';

// Error オブジェクトは JSON.stringify で `{}` になる。明示的に property を抽出する。
export function serializeError(err: unknown): {
    message: string;
    name?: string;
    stack?: string;
    code?: string;
} {
    if (err instanceof Error) {
        const out: { message: string; name?: string; stack?: string; code?: string } = {
            message: err.message,
            name: err.name,
        };
        if (err.stack) {
            out.stack = err.stack;
        }
        const codeCandidate = (err as { code?: unknown }).code;
        if (typeof codeCandidate === 'string') {
            out.code = codeCandidate;
        }
        return out;
    }
    return { message: String(err) };
}

function emit(level: LogLevel, payload: LogPayload): void {
    const entry: Record<string, unknown> = {
        severity: level,
        timestamp: new Date().toISOString(),
        service: SERVICE,
        ...payload,
    };

    if (isProd()) {
        // Cloud Logging structured logging: stderr for ERROR, stdout for others.
        const line = JSON.stringify(entry) + '\n';
        if (level === 'ERROR') {
            process.stderr.write(line);
        } else {
            process.stdout.write(line);
        }
        return;
    }

    // Dev: pretty-print。残りの構造化フィールドは末尾に JSON で添える。
    const { severity, timestamp, service, message, ...rest } = entry;
    void severity;
    void timestamp;
    void service;
    const restStr = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';
    const line = `[${level}] ${message}${restStr}`;
    if (level === 'ERROR') {
        process.stderr.write(line + '\n');
    } else if (level === 'WARNING') {
        process.stdout.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }
}

export const logger = {
    info: (payload: LogPayload): void => emit('INFO', payload),
    warn: (payload: LogPayload): void => emit('WARNING', payload),
    error: (payload: LogPayload): void => emit('ERROR', payload),
};
