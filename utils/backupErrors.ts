// Error types shared between backup schema parsing and encrypted backup
// crypto. Lives in its own module to avoid backupSchema ↔ backupCrypto
// circular import (constants flow schema → crypto, errors flow crypto/schema
// → backupErrors, never the reverse).

// Discriminated union of internal failure causes carried via Error.cause.
// UI must NOT branch on this — it exists for log triage / debug only.
// See AC-2/AC-7/AC-9 (fingerprinting prevention vs developer debuggability).
//
// Categories:
//   crypto / parse — produced inside utils/backupCrypto.ts and
//     utils/backupSchema.ts when an envelope or its payload is malformed.
//   flow guard (M6 PR-C) — produced by store/backupSlice.ts state machine
//     guards. These never bubble up to the UI as user-visible messages
//     (the slice transitions back to a recoverable state and lets the UI
//     re-prompt) but remain on the typed cause chain so tests and Sentry
//     breadcrumbs can discriminate them from real crypto failures.
export type BackupErrorCauseKind =
    // crypto / parse
    | 'auth-tag-mismatch'
    | 'plaintext-corrupted'
    | 'schema-invalid'
    | 'kdf-import-failed'
    | 'envelope-incomplete'
    // flow guard
    | 'no-pending-decryption'
    | 'concurrent-decrypt';

export interface BackupErrorCause {
    kind: BackupErrorCauseKind;
    original?: unknown;
}

export class BackupValidationError extends Error {
    // Override the lib.es2022.error type (cause: unknown) with our structured
    // cause shape. `declare` skips a runtime field initializer; the actual
    // value lands via `super(message, options)` per ES2022 semantics, so
    // DevTools / Sentry / util.inspect see the cause chain natively.
    declare public readonly cause?: BackupErrorCause;
    constructor(message: string, options?: { cause?: BackupErrorCause }) {
        super(message, options);
        this.name = 'BackupValidationError';
    }
}

/**
 * Thrown by prepareImport when the *preflight* (flushSave-blocking)
 * step fails — i.e. before any backup parsing happens. Distinct from
 * BackupValidationError which is reserved for malformed backup files.
 * Aborting at this layer prevents the silent edit-loss path where a
 * stale on-disk snapshot would be used for conflict detection.
 */
export class BackupPreflightError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BackupPreflightError';
    }
}

/**
 * decryptAndPrepareImport が「stale session race」(cancel/overwrite が in-flight 中に
 * 走った後、KDF/decrypt が遅延 resolve したケース) で throw する標識エラー。
 *
 * UI 層は AbortError と並んで本クラスを「ユーザー意図のキャンセル」として扱い、
 * DECRYPT_FAILURE_MESSAGE を表示しない (AC-9 fingerprinting 防止 + cause 不参照規律)。
 * `name === 'BackupCancelledError'` で判別 (AC-9 規律: UI は cause を読まない)。
 *
 * BackupValidationError と分けた理由: 旧実装は「復号処理がキャンセルされました。」
 * というメッセージを BackupValidationError として throw していたが、UI 側で
 * AbortError と区別できず DECRYPT_FAILURE_MESSAGE が誤表示される silent-failure を
 * 招いていた (PR-D silent-failure-hunter B4)。独立 class 化で機械判定可能にした。
 */
export class BackupCancelledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BackupCancelledError';
    }
}
