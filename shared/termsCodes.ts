// FE / BE 双方が参照する規約関連の共通定数。
// server/services/termsConfig.ts (BE 専用ロジック含む) からは re-export し、
// store/authSlice.ts (FE) は本ファイルから直接 import することで
// FE→server/ のレイヤー越境を避けつつ単一 source of truth を維持する。

// accept-terms route (BE) が `TERMS_VERSION` 不一致を返すときの error code。
// FE は 409 レスポンスの code がこの値の時に「再同意要求」と解釈する。
export const TERMS_VERSION_MISMATCH_CODE = 'TERMS_VERSION_MISMATCH' as const;

export type TermsVersionMismatchCode = typeof TERMS_VERSION_MISMATCH_CODE;
