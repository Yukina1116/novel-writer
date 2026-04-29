// Error types shared between backup schema parsing and encrypted backup
// crypto. Lives in its own module to avoid backupSchema ↔ backupCrypto
// circular import (constants flow schema → crypto, errors flow crypto/schema
// → backupErrors, never the reverse).

// Discriminated union of internal failure causes carried via Error.cause.
// UI must NOT branch on this — it exists for log triage / debug only.
// See AC-2/AC-7/AC-9 (fingerprinting prevention vs developer debuggability).
export type BackupErrorCauseKind =
    | 'auth-tag-mismatch'
    | 'plaintext-corrupted'
    | 'schema-invalid'
    | 'kdf-import-failed'
    | 'envelope-incomplete';

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
