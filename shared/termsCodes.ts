// FE / BE 双方が参照する規約関連の共通定数。
// server/services/termsConfig.ts (BE 専用ロジック含む) からは re-export し、
// store/authSlice.ts (FE) は本ファイルから直接 import することで
// FE→server/ のレイヤー越境を避けつつ単一 source of truth を維持する。

// accept-terms route (BE) が `TERMS_VERSION` 不一致を返すときの error code。
// FE は 409 レスポンスの code がこの値の時に「再同意要求」と解釈する。
export const TERMS_VERSION_MISMATCH_CODE = 'TERMS_VERSION_MISMATCH' as const;

// accept-terms route (BE) が users/{uid} ドキュメント未初期化のときに返す error code。
// users/init を呼び直してから retry する経路の sentinel。
export const USER_DOC_MISSING_CODE = 'USER_DOC_MISSING' as const;

export type TermsVersionMismatchCode = typeof TERMS_VERSION_MISMATCH_CODE;
export type UserDocMissingCode = typeof USER_DOC_MISSING_CODE;

// accept-terms route の 409 レスポンスで FE が exhaustively 扱う code 集合。
// BE が新コードを追加した時は本 union を拡張し、FE 側 switch を追従させる。
export type KnownAcceptTerms409Code = TermsVersionMismatchCode | UserDocMissingCode;

const KNOWN_ACCEPT_TERMS_409_CODES: ReadonlySet<string> = new Set([
    TERMS_VERSION_MISMATCH_CODE,
    USER_DOC_MISSING_CODE,
]);

export const isKnownAcceptTerms409Code = (code: unknown): code is KnownAcceptTerms409Code =>
    typeof code === 'string' && KNOWN_ACCEPT_TERMS_409_CODES.has(code);
