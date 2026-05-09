// FE 側の認証フロー診断ログ helper (M7-α 後 / login 障害切り分け用)。
//
// signInWithPopup → users/init → onAuthStateChanged の各段階で fire-and-forget
// で BE の /api/diag/auth-flow に POST する。BE 側で構造化ログとして Cloud Logging
// に集約され、AI / 運用者がブラウザ console を介さず直接読める。
//
// 規律:
// - **fire-and-forget**: 失敗を sign-in フローの邪魔にしない (catch で握りつぶす)。
// - **PII 規律**: detail に email / displayName / token を入れない。uid のみ可。
// - **同期 send (sendBeacon 不使用)**: sendBeacon は即時送信されるが先頭で失敗を
//   検知できないため、本診断目的では fetch + keepalive を採用。
// - **撤去条件**: 障害切り分け完了後にこのファイル + 呼出箇所を削除する PR。

const DIAG_ENDPOINT = '/api/diag/auth-flow';

// ブラウザタブ単位の ephemeral session id。複数イベントを横断 grep で
// 1 ログイン試行に correlate するための識別子。値は uid と無関係 (PII でない)。
const sessionId: string = (() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
})();

// detail に許可する key (BE 側 allowlist と揃える)。誤って token / email を渡すのを
// 型レベルで弾く。
export interface AuthDiagDetail {
    uid?: string;
    code?: string;
    message?: string;
    status?: number;
    hasUser?: boolean;
    hasCurrentTermsVersion?: boolean;
    providerId?: string;
    durationMs?: number;
}

export type AuthDiagEvent =
    | 'signin:start'
    | 'signin:popup-resolve'
    | 'signin:popup-reject'
    | 'signin:users-init-start'
    | 'signin:users-init-success'
    | 'signin:users-init-error'
    | 'auth:state-changed'
    | 'auth:state-error';

export function postAuthDiag(event: AuthDiagEvent, detail?: AuthDiagDetail): void {
    const body = JSON.stringify({
        event,
        ts: Date.now(),
        sessionId,
        detail: detail ?? null,
    });
    try {
        // keepalive: ページ遷移 / popup close 直後でも送信を完走させる。
        // 失敗 (rate limit 429 / network) は握りつぶして sign-in 本体を妨害しない。
        void fetch(DIAG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => {
            // intentionally swallow
        });
    } catch {
        // intentionally swallow (keepalive 非対応 / fetch 未定義環境等)
    }
}
