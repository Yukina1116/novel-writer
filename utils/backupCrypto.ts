// AES-GCM-256 + PBKDF2-SHA256 client-side encrypted backup.
// Spec: docs/spec/m6/acceptance-criteria.md (AC-1 through AC-14)
//
// Threat model boundaries (ADR-0001 §Consequences):
//   - XSS attacker has full access to passphrase + plaintext (acknowledged limit)
//   - Encrypted file at-rest is protected against passive disclosure
//   - Local IndexedDB is NOT encrypted (only Export files / future Cloud Storage blobs)
//   - Memory wipe is best-effort only (JS strings are immutable)
//
// Forward-locking decisions (cannot change without invalidating existing envelopes):
//   - Passphrase normalization: NFC (AC-12)
//   - AAD canonical form: key-sorted JSON.stringify of metadata fields (AC-13)
//   - Minimum passphrase length: 12 grapheme clusters (AC-9, AC-12)

import { BackupV1, EncryptedBackupV1 } from '../types';
import { BackupErrorCauseKind, BackupValidationError } from './backupErrors';

// Re-export for convenience: callers importing from backupCrypto can grab
// the cause kind union without adding a second import.
export type { BackupErrorCauseKind };

// --- constants (AC-4, AC-9, AC-12) ---

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_ACCEPTED_ITERATIONS = 100_000;
export const MAX_ACCEPTED_ITERATIONS = 10_000_000;
export const MAX_CIPHERTEXT_BYTES = 100 * 1024 * 1024;
// Counted in Unicode code points (`[...s].length`), not true grapheme clusters
// — Intl.Segmenter results vary by ICU version so we pin code-point semantics
// for forward stability across engines. Naming reflects implementation.
export const MIN_PASSPHRASE_CODEPOINTS = 12;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const DECRYPT_FAILURE_MESSAGE = 'パスフレーズが正しくないか、ファイルが壊れています。';

// --- low-level helpers ---

export const randomBytes = (len: number): Uint8Array => {
    const out = new Uint8Array(len);
    globalThis.crypto.getRandomValues(out);
    return out;
};

export const toBase64 = (bytes: Uint8Array): string => {
    // Chunked apply avoids the O(n²) string-rope cost of byte-at-a-time
    // concatenation. 32 KB stays well under V8's argument-count limit.
    const CHUNK = 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK))));
    }
    return btoa(parts.join(''));
};

export const fromBase64 = (b64: string): Uint8Array => {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
};

const codepointLength = (s: string): number => [...s].length;

export const validatePassphraseLength = (passphrase: string): void => {
    if (codepointLength(passphrase) < MIN_PASSPHRASE_CODEPOINTS) {
        throw new BackupValidationError(
            `パスフレーズは ${MIN_PASSPHRASE_CODEPOINTS} 文字以上にしてください。`,
        );
    }
};

const normalizePassphrase = (passphrase: string): Uint8Array =>
    new TextEncoder().encode(passphrase.normalize('NFC'));

// --- AAD canonical form (AC-13) ---
//
// Bind envelope metadata to the ciphertext's auth tag so any tampering of
// algorithm / kdf / kdfParams / iv / appVersion / encryptedAt / envelopeVersion
// is detected on decrypt.
const buildAad = (meta: {
    envelopeVersion: 1;
    algorithm: 'AES-GCM-256';
    kdf: 'PBKDF2-SHA256';
    kdfParams: { salt: string; iterations: number };
    iv: string;
    appVersion: string;
    encryptedAt: string;
}): Uint8Array => {
    // Key-sorted JSON to keep AAD canonical regardless of object literal order.
    const ordered = {
        algorithm: meta.algorithm,
        appVersion: meta.appVersion,
        encryptedAt: meta.encryptedAt,
        envelopeVersion: meta.envelopeVersion,
        iv: meta.iv,
        kdf: meta.kdf,
        kdfParams: { iterations: meta.kdfParams.iterations, salt: meta.kdfParams.salt },
    };
    return new TextEncoder().encode(JSON.stringify(ordered));
};

// --- KDF (AC-14) ---
//
// extractable=false prevents key extraction (CryptoKey is not exportable to
// raw bytes). usages limited to encrypt/decrypt — no wrap/unwrap surface.
export const deriveKey = async (
    passphrase: string,
    salt: Uint8Array,
    iterations: number,
): Promise<CryptoKey> => {
    const passphraseBytes = normalizePassphrase(passphrase);
    let baseKey: CryptoKey;
    try {
        baseKey = await globalThis.crypto.subtle.importKey(
            'raw',
            passphraseBytes,
            { name: 'PBKDF2' },
            false,
            ['deriveKey'],
        );
    } finally {
        // Best-effort zeroize of UTF-8 passphrase bytes (string itself remains).
        passphraseBytes.fill(0);
    }
    return globalThis.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
};

// --- abort handling (AC-11) ---

const checkAborted = (signal?: AbortSignal): void => {
    if (signal?.aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
    }
};

// --- public API ---

export interface EncryptOptions {
    signal?: AbortSignal;
    now?: Date;
}

export const encryptBackup = async (
    plaintext: BackupV1,
    passphrase: string,
    appVersion: string,
    opts: EncryptOptions = {},
): Promise<EncryptedBackupV1> => {
    validatePassphraseLength(passphrase);
    checkAborted(opts.signal);

    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const encryptedAt = (opts.now ?? new Date()).toISOString();

    const meta = {
        envelopeVersion: 1 as const,
        algorithm: 'AES-GCM-256' as const,
        kdf: 'PBKDF2-SHA256' as const,
        kdfParams: { salt: toBase64(salt), iterations: PBKDF2_ITERATIONS },
        iv: toBase64(iv),
        appVersion,
        encryptedAt,
    };
    const aad = buildAad(meta);

    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
    checkAborted(opts.signal);

    const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext));
    let ciphertextBytes: Uint8Array;
    try {
        const ab = await globalThis.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
            key,
            plaintextBytes as BufferSource,
        );
        ciphertextBytes = new Uint8Array(ab);
    } finally {
        plaintextBytes.fill(0);
    }
    checkAborted(opts.signal);

    return {
        envelopeVersion: 1,
        encrypted: true,
        algorithm: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA256',
        kdfParams: { salt: meta.kdfParams.salt, iterations: meta.kdfParams.iterations },
        iv: meta.iv,
        ciphertext: toBase64(ciphertextBytes),
        appVersion,
        encryptedAt,
    };
};

export interface DecryptOptions {
    signal?: AbortSignal;
}

// Internal: stage-specific catch wrappers preserve the cause kind without
// using a broad `catch (e) {}`. Each stage wraps its narrow throw set.
const wrapAsBackupError = (
    kind: BackupErrorCauseKind,
    cause: unknown,
): BackupValidationError =>
    new BackupValidationError(DECRYPT_FAILURE_MESSAGE, { cause: { kind, original: cause } });

/**
 * Decrypt an `EncryptedBackupV1` envelope to its inner `BackupV1` payload.
 *
 * **Contract**: `envelope` is expected to come from `parseEncryptedEnvelope`
 * (or `parseAnyBackup`). Direct hand-constructed envelopes that bypass parse-time
 * guards (length / range / literal checks) may surface envelope corruption
 * as `auth-tag-mismatch` or `kdf-import-failed` instead of `envelope-incomplete`,
 * which is harmless for end users (UI shows the same `DECRYPT_FAILURE_MESSAGE`)
 * but degrades log-triage signal quality.
 */
export const decryptBackup = async (
    envelope: EncryptedBackupV1,
    passphrase: string,
    opts: DecryptOptions = {},
): Promise<BackupV1> => {
    checkAborted(opts.signal);

    // Base64 decode failures (atob InvalidCharacterError) need to be classified
    // — otherwise callers that bypass parseEncryptedEnvelope (tests, future
    // direct-decrypt paths) get a raw DOMException instead of a typed
    // BackupValidationError.
    let salt: Uint8Array;
    let iv: Uint8Array;
    let ciphertext: Uint8Array;
    try {
        salt = fromBase64(envelope.kdfParams.salt);
        iv = fromBase64(envelope.iv);
        ciphertext = fromBase64(envelope.ciphertext);
    } catch (e) {
        console.warn('M6_DECRYPT_KDF_FAILED', {
            envelopeVersion: envelope.envelopeVersion,
            algorithm: envelope.algorithm,
            kdf: envelope.kdf,
            iterations: envelope.kdfParams.iterations,
            encryptedAt: envelope.encryptedAt,
        });
        throw wrapAsBackupError('kdf-import-failed', e);
    }

    let key: CryptoKey;
    try {
        key = await deriveKey(passphrase, salt, envelope.kdfParams.iterations);
    } catch (e) {
        console.warn('M6_DECRYPT_KDF_FAILED', {
            envelopeVersion: envelope.envelopeVersion,
            algorithm: envelope.algorithm,
            kdf: envelope.kdf,
            iterations: envelope.kdfParams.iterations,
            encryptedAt: envelope.encryptedAt,
        });
        throw wrapAsBackupError('kdf-import-failed', e);
    }
    checkAborted(opts.signal);

    const aad = buildAad({
        envelopeVersion: envelope.envelopeVersion,
        algorithm: envelope.algorithm,
        kdf: envelope.kdf,
        kdfParams: envelope.kdfParams,
        iv: envelope.iv,
        appVersion: envelope.appVersion,
        encryptedAt: envelope.encryptedAt,
    });

    let plaintextBytes: Uint8Array;
    try {
        const ab = await globalThis.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
            key,
            ciphertext as BufferSource,
        );
        plaintextBytes = new Uint8Array(ab);
    } catch (e) {
        console.warn('M6_DECRYPT_AUTH_TAG_FAILED', {
            envelopeVersion: envelope.envelopeVersion,
            algorithm: envelope.algorithm,
            kdf: envelope.kdf,
            iterations: envelope.kdfParams.iterations,
            encryptedAt: envelope.encryptedAt,
        });
        throw wrapAsBackupError('auth-tag-mismatch', e);
    }
    checkAborted(opts.signal);

    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(plaintextBytes));
    } catch (e) {
        console.warn('M6_DECRYPT_PLAINTEXT_CORRUPTED', {
            envelopeVersion: envelope.envelopeVersion,
            encryptedAt: envelope.encryptedAt,
        });
        throw wrapAsBackupError('plaintext-corrupted', e);
    } finally {
        plaintextBytes.fill(0);
    }

    // Shape check the decrypted payload — schemaVersion alone is too weak
    // (a crafted authenticated payload could pass with `projects: "not-array"`
    // and surface as a runtime crash later).
    const obj = parsed as Record<string, unknown>;
    const isValidShape =
        !!parsed
        && typeof parsed === 'object'
        && obj.schemaVersion === 1
        && Array.isArray(obj.projects)
        && typeof obj.tutorialState === 'object'
        && obj.tutorialState !== null
        && Array.isArray(obj.analysisHistory)
        && typeof obj.exportedAt === 'string'
        && typeof obj.appVersion === 'string';
    if (!isValidShape) {
        console.warn('M6_DECRYPT_SCHEMA_INVALID', {
            envelopeVersion: envelope.envelopeVersion,
            encryptedAt: envelope.encryptedAt,
        });
        throw wrapAsBackupError('schema-invalid', null);
    }
    return parsed as BackupV1;
};
