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
    code?: string | number;
} {
    if (err instanceof Error) {
        const out: { message: string; name?: string; stack?: string; code?: string | number } = {
            message: err.message,
            name: err.name,
        };
        if (err.stack) {
            out.stack = err.stack;
        }
        const codeCandidate = (err as { code?: unknown }).code;
        if (typeof codeCandidate === 'string' || typeof codeCandidate === 'number') {
            // gRPC 等の numeric code (e.g. UNAVAILABLE=14) も保持。
            out.code = codeCandidate;
        }
        return out;
    }
    return { message: String(err) };
}

// 循環参照や非直列化値 (Symbol/BigInt 等) で JSON.stringify が throw するのを防ぐ。
// rules/error-handling.md §1: ログ記録の失敗が呼び出し側の状態復旧を阻害してはならない。
function circularReplacer(): (key: string, value: unknown) => unknown {
    const seen = new WeakSet<object>();
    return (_key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value as object)) return '[Circular]';
            seen.add(value as object);
        }
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'symbol') return value.toString();
        return value;
    };
}

function safeStringify(entry: Record<string, unknown>, level: LogLevel, payloadMessage: unknown): string {
    try {
        return JSON.stringify(entry, circularReplacer());
    } catch (e) {
        // 最後の砦: 最低限 severity / message / loggerError を JSON で出す。
        return JSON.stringify({
            severity: level,
            timestamp: new Date().toISOString(),
            service: SERVICE,
            message: typeof payloadMessage === 'string' ? payloadMessage : '[unserializable payload]',
            _loggerError: String(e),
        });
    }
}

function safeWrite(stream: NodeJS.WriteStream, line: string): void {
    try {
        stream.write(line);
    } catch {
        // EPIPE / stream destroyed 等を swallow。logger 自体の失敗で
        // 呼び出し側の状態復旧 (cancel/cleanup) を阻害しない。
    }
}

function emit(level: LogLevel, payload: LogPayload): void {
    // 予約キーは payload で上書きさせない (severity 誤分類 / Cloud Logging 仕様逸脱を防止)。
    // spread 順を `{ ...payload, severity, timestamp, service }` にして確実に上書きする。
    const entry: Record<string, unknown> = {
        ...payload,
        severity: level,
        timestamp: new Date().toISOString(),
        service: SERVICE,
    };

    if (isProd()) {
        // Cloud Logging structured logging: stderr for ERROR, stdout for others.
        const line = safeStringify(entry, level, payload.message) + '\n';
        if (level === 'ERROR') {
            safeWrite(process.stderr, line);
        } else {
            safeWrite(process.stdout, line);
        }
        return;
    }

    // Dev: pretty-print。残りの構造化フィールドは末尾に JSON で添える。
    // JSON.stringify は循環参照で throw するため safeStringify ベースで rest 抽出。
    const restEntry: Record<string, unknown> = { ...payload };
    delete restEntry.message;
    let restStr = '';
    if (Object.keys(restEntry).length > 0) {
        try {
            restStr = ' ' + JSON.stringify(restEntry, circularReplacer());
        } catch {
            restStr = ' [unserializable payload]';
        }
    }
    const messageStr = typeof payload.message === 'string' ? payload.message : String(payload.message);
    const line = `[${level}] ${messageStr}${restStr}\n`;
    if (level === 'ERROR') {
        safeWrite(process.stderr, line);
    } else {
        safeWrite(process.stdout, line);
    }
}

export const logger = {
    info: (payload: LogPayload): void => emit('INFO', payload),
    warn: (payload: LogPayload): void => emit('WARNING', payload),
    error: (payload: LogPayload): void => emit('ERROR', payload),
};
