// Tests for utils/backupCrypto.ts (M6 PR-B).
// Spec: docs/spec/m6/acceptance-criteria.md AC-1〜AC-4, AC-7, AC-10〜AC-14

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupValidationError } from './backupSchema';
import { buildLargeBackup, buildSampleBackup, tamperLastByte } from '../tests/fixtures/backup';
import {
    DECRYPT_FAILURE_MESSAGE,
    decryptBackup,
    encryptBackup,
    fromBase64,
    IV_BYTES,
    MAX_ACCEPTED_ITERATIONS,
    MIN_ACCEPTED_ITERATIONS,
    MIN_PASSPHRASE_GRAPHEMES,
    PBKDF2_ITERATIONS,
    randomBytes,
    SALT_BYTES,
    toBase64,
    validatePassphraseLength,
} from './backupCrypto';

const VALID_PASSPHRASE = 'test-passphrase-12-chars-ok';

describe('backupCrypto / AC-1 round-trip', () => {
    it('AC-1: encrypt then decrypt restores deep-equal payload', async () => {
        const plaintext = buildSampleBackup();
        const env = await encryptBackup(plaintext, VALID_PASSPHRASE, '1.0.0');
        const dec = await decryptBackup(env, VALID_PASSPHRASE);
        expect(JSON.parse(JSON.stringify(dec))).toEqual(JSON.parse(JSON.stringify(plaintext)));
    });

    it('AC-1: type-loss detection on direct field check', async () => {
        const plaintext = buildSampleBackup();
        const env = await encryptBackup(plaintext, VALID_PASSPHRASE, '1.0.0');
        const dec = await decryptBackup(env, VALID_PASSPHRASE);
        expect(dec.exportedAt).toBe(plaintext.exportedAt);
        expect(dec.projects.length).toBe(plaintext.projects.length);
        expect(dec.projects[0].id).toBe(plaintext.projects[0].id);
    });
});

describe('backupCrypto / AC-2 wrong passphrase rejection', () => {
    it('AC-2: throws BackupValidationError with constant message + cause', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        await expect(decryptBackup(env, 'wrong-passphrase-12c')).rejects.toMatchObject({
            name: 'BackupValidationError',
            message: DECRYPT_FAILURE_MESSAGE,
            cause: { kind: 'auth-tag-mismatch' },
        });
    });

    it('AC-2: console.warn fires with M6_DECRYPT_AUTH_TAG_FAILED event id and safe metadata only', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        await expect(decryptBackup(env, 'wrong-passphrase-12c')).rejects.toThrow(BackupValidationError);
        // Event id is asserted as the first positional argument so renames are caught at CI time.
        expect(warnSpy).toHaveBeenCalledWith(
            'M6_DECRYPT_AUTH_TAG_FAILED',
            expect.objectContaining({
                envelopeVersion: 1,
                algorithm: 'AES-GCM-256',
                kdf: 'PBKDF2-SHA256',
                iterations: expect.any(Number),
                encryptedAt: expect.any(String),
            }),
        );
        // No sensitive field leakage.
        const calls = warnSpy.mock.calls.flat();
        const serialized = JSON.stringify(calls);
        expect(serialized).not.toContain(VALID_PASSPHRASE);
        expect(serialized).not.toContain('wrong-passphrase-12c');
        // None of the exported safe-metadata fields should be a passphrase / plaintext / key payload.
        const meta = warnSpy.mock.calls[0][1] as Record<string, unknown>;
        expect(meta).not.toHaveProperty('passphrase');
        expect(meta).not.toHaveProperty('plaintext');
        expect(meta).not.toHaveProperty('salt');
        expect(meta).not.toHaveProperty('ciphertext');
        expect(meta).not.toHaveProperty('key');
        warnSpy.mockRestore();
    });
});

// AC-1 supplementary: KDF determinism — fix salt/iv via getRandomValues spy
// so the only varying input is the underlying KDF/AES path. Two encrypts must
// produce byte-equal ciphertext when all entropy sources are pinned.
describe('backupCrypto / AC-1 KDF determinism', () => {
    it('AC-1: same passphrase + salt + iv -> byte-equal ciphertext (KDF is deterministic)', async () => {
        const fixedSalt = new Uint8Array(SALT_BYTES).fill(7);
        const fixedIv = new Uint8Array(IV_BYTES).fill(11);
        const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
            const u8 = arr as Uint8Array;
            const src = u8.length === SALT_BYTES ? fixedSalt : fixedIv;
            u8.set(src);
            return arr;
        });
        try {
            const fixedNow = new Date('2026-04-29T00:00:00.000Z');
            const e1 = await encryptBackup(buildSampleBackup(), 'det-test-12-chars-ok', '1.0.0', { now: fixedNow });
            const e2 = await encryptBackup(buildSampleBackup(), 'det-test-12-chars-ok', '1.0.0', { now: fixedNow });
            expect(e1.ciphertext).toBe(e2.ciphertext);
            expect(e1.iv).toBe(e2.iv);
            expect(e1.kdfParams.salt).toBe(e2.kdfParams.salt);
        } finally {
            spy.mockRestore();
        }
    });
});

describe('backupCrypto / AC-3 IV + salt uniqueness (smoke test)', () => {
    it('AC-3: 100 iv samples are all unique', () => {
        const ivs = new Set<string>();
        for (let i = 0; i < 100; i++) ivs.add(toBase64(randomBytes(IV_BYTES)));
        expect(ivs.size).toBe(100);
    });

    it('AC-3: 100 salt samples are all unique', () => {
        const salts = new Set<string>();
        for (let i = 0; i < 100; i++) salts.add(toBase64(randomBytes(SALT_BYTES)));
        expect(salts.size).toBe(100);
    });

    it('AC-3: 3 sequential encrypts produce distinct iv and salt (KDF-integrated)', async () => {
        const plaintext = buildSampleBackup();
        const e1 = await encryptBackup(plaintext, VALID_PASSPHRASE, '1.0.0');
        const e2 = await encryptBackup(plaintext, VALID_PASSPHRASE, '1.0.0');
        const e3 = await encryptBackup(plaintext, VALID_PASSPHRASE, '1.0.0');
        expect(new Set([e1.iv, e2.iv, e3.iv]).size).toBe(3);
        expect(new Set([e1.kdfParams.salt, e2.kdfParams.salt, e3.kdfParams.salt]).size).toBe(3);
    });
});

describe('backupCrypto / AC-4 envelope schema', () => {
    it('AC-4: produces well-formed envelope', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        expect(env.envelopeVersion).toBe(1);
        expect(env.encrypted).toBe(true);
        expect(env.algorithm).toBe('AES-GCM-256');
        expect(env.kdf).toBe('PBKDF2-SHA256');
        expect(env.kdfParams.iterations).toBe(PBKDF2_ITERATIONS);
        expect(fromBase64(env.kdfParams.salt).length).toBe(SALT_BYTES);
        expect(fromBase64(env.iv).length).toBe(IV_BYTES);
        expect(env.iv).toMatch(/^[A-Za-z0-9+/=]+$/);
        expect(env.encryptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('AC-4: respects opts.now for deterministic encryptedAt', async () => {
        const fixed = new Date('2026-04-29T03:14:15.926Z');
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0', { now: fixed });
        expect(env.encryptedAt).toBe('2026-04-29T03:14:15.926Z');
    });
});

describe('backupCrypto / AC-7 tampering detection (4 cause kinds)', () => {
    it('AC-7: ciphertext tamper -> auth-tag-mismatch', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const tampered = { ...env, ciphertext: tamperLastByte(env.ciphertext) };
        await expect(decryptBackup(tampered, VALID_PASSPHRASE)).rejects.toMatchObject({
            message: DECRYPT_FAILURE_MESSAGE,
            cause: { kind: 'auth-tag-mismatch' },
        });
    });

    it('AC-7: AAD metadata tamper -> auth-tag-mismatch (appVersion)', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const tampered = { ...env, appVersion: 'tampered-1.0.0' };
        await expect(decryptBackup(tampered, VALID_PASSPHRASE)).rejects.toMatchObject({
            cause: { kind: 'auth-tag-mismatch' },
        });
    });

    it('AC-7: AAD metadata tamper -> auth-tag-mismatch (encryptedAt)', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const tampered = { ...env, encryptedAt: '2099-01-01T00:00:00.000Z' };
        await expect(decryptBackup(tampered, VALID_PASSPHRASE)).rejects.toMatchObject({
            cause: { kind: 'auth-tag-mismatch' },
        });
    });

    it('AC-7: kdf-import-failed when iterations is 0 (DOMException from importKey/deriveKey)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        // Bypass parseEncryptedEnvelope (which would reject iterations=0); inject directly.
        const broken = { ...env, kdfParams: { ...env.kdfParams, iterations: 0 } };
        await expect(decryptBackup(broken, VALID_PASSPHRASE)).rejects.toMatchObject({
            message: DECRYPT_FAILURE_MESSAGE,
            cause: { kind: 'kdf-import-failed' },
        });
        expect(warnSpy).toHaveBeenCalledWith('M6_DECRYPT_KDF_FAILED', expect.any(Object));
        warnSpy.mockRestore();
    });

    it('AC-7: plaintext-corrupted when decrypted bytes are not valid JSON', async () => {
        // not valid UTF-8 / JSON
        const garbage = new Uint8Array([0xff, 0xfe, 0xff, 0xfe, 0x00, 0xff, 0xfe]);
        const passphrase = 'plaintext-corrupted-12';
        const env = await buildEnvelopeWithRawPayload(passphrase, garbage);
        await expect(decryptBackup(env, passphrase)).rejects.toMatchObject({
            message: DECRYPT_FAILURE_MESSAGE,
            cause: { kind: 'plaintext-corrupted' },
        });
    });

    it('AC-7: schema-invalid when decrypted JSON has wrong schemaVersion', async () => {
        // Valid JSON but schemaVersion: 999 (not 1).
        const wrongSchema = new TextEncoder().encode(JSON.stringify({ schemaVersion: 999 }));
        const passphrase = 'schema-invalid-12-cha';
        const env = await buildEnvelopeWithRawPayload(passphrase, wrongSchema);
        await expect(decryptBackup(env, passphrase)).rejects.toMatchObject({
            message: DECRYPT_FAILURE_MESSAGE,
            cause: { kind: 'schema-invalid' },
        });
    });
});

// AAD canonical form must match production buildAad. If the production order
// changes, this helper's authentication will fail (auth-tag-mismatch) and the
// 'plaintext-corrupted' / 'schema-invalid' tests will surface the drift.
const buildEnvelopeWithRawPayload = async (
    passphrase: string,
    payloadBytes: Uint8Array,
) => {
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const meta = {
        envelopeVersion: 1 as const,
        algorithm: 'AES-GCM-256' as const,
        kdf: 'PBKDF2-SHA256' as const,
        kdfParams: { salt: toBase64(salt), iterations: PBKDF2_ITERATIONS },
        iv: toBase64(iv),
        appVersion: '1.0.0',
        encryptedAt: '2026-04-29T00:00:00.000Z',
    };
    const aad = new TextEncoder().encode(JSON.stringify({
        algorithm: meta.algorithm,
        appVersion: meta.appVersion,
        encryptedAt: meta.encryptedAt,
        envelopeVersion: meta.envelopeVersion,
        iv: meta.iv,
        kdf: meta.kdf,
        kdfParams: { iterations: meta.kdfParams.iterations, salt: meta.kdfParams.salt },
    }));
    const passKey = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase.normalize('NFC')),
        { name: 'PBKDF2' },
        false,
        ['deriveKey'],
    );
    const aesKey = await globalThis.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
        passKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    const ct = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
        aesKey,
        payloadBytes as BufferSource,
    );
    return { ...meta, encrypted: true as const, ciphertext: toBase64(new Uint8Array(ct)) };
};

describe('backupCrypto / AC-9 cause kind enumeration', () => {
    it('error.cause is always a structured object, never a string', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        try {
            await decryptBackup(env, 'wrong-passphrase-12c');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(BackupValidationError);
            const cause = (e as Error).cause as { kind?: string } | undefined;
            expect(cause?.kind).toBe('auth-tag-mismatch');
        }
    });
});

describe('backupCrypto / AC-11 AbortSignal', () => {
    it('AC-11: pre-aborted signal rejects encryptBackup with AbortError', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0', { signal: controller.signal }),
        ).rejects.toThrow(/aborted/i);
    });

    it('AC-11: pre-aborted signal rejects decryptBackup with AbortError', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const controller = new AbortController();
        controller.abort();
        await expect(decryptBackup(env, VALID_PASSPHRASE, { signal: controller.signal })).rejects.toThrow(/aborted/i);
    });
});

describe('backupCrypto / AC-12 passphrase normalization + grapheme length', () => {
    it('AC-12: NFC normalization makes NFC and NFD passphrases interoperable', async () => {
        const nfc = 'érest12chars'; // é + 11 ASCII = 12 graphemes
        const nfd = 'érest12chars'; // e + combining acute + 11 ASCII (13 code units, 12 graphemes)
        const env = await encryptBackup(buildSampleBackup(), nfc, '1.0.0');
        const dec = await decryptBackup(env, nfd);
        expect(dec.schemaVersion).toBe(1);
    });

    it('AC-12: CJK passphrase round-trip', async () => {
        const cjk = '日本語パスワード長め文字列'; // 13 graphemes
        const env = await encryptBackup(buildSampleBackup(), cjk, '1.0.0');
        const dec = await decryptBackup(env, cjk);
        expect(dec.schemaVersion).toBe(1);
    });

    it('AC-12: emoji passphrase counted by grapheme not utf-16 code units', async () => {
        // 🔑 is 2 utf-16 code units. 4 of them = 8 .length but 4 graphemes.
        const fourEmoji = '🔑🔑🔑🔑';
        expect(fourEmoji.length).toBe(8);
        expect([...fourEmoji].length).toBe(4);
        expect(() => validatePassphraseLength(fourEmoji)).toThrow(/12 文字/);
    });

    it('AC-12: empty passphrase rejected', () => {
        expect(() => validatePassphraseLength('')).toThrow(/12 文字/);
    });

    it('AC-12: boundary 11/12/13 graphemes', () => {
        expect(() => validatePassphraseLength('a'.repeat(MIN_PASSPHRASE_GRAPHEMES - 1))).toThrow(/12 文字/);
        expect(() => validatePassphraseLength('a'.repeat(MIN_PASSPHRASE_GRAPHEMES))).not.toThrow();
        expect(() => validatePassphraseLength('a'.repeat(MIN_PASSPHRASE_GRAPHEMES + 1))).not.toThrow();
    });

    it('AC-12: 1000 character passphrase accepted (no upper limit)', async () => {
        const long = 'a'.repeat(1000);
        const env = await encryptBackup(buildSampleBackup(), long, '1.0.0');
        const dec = await decryptBackup(env, long);
        expect(dec.schemaVersion).toBe(1);
    });
});

describe('backupCrypto / AC-13 AES-GCM AAD metadata binding', () => {
    it('AC-13: tampering envelopeVersion in transit fails decrypt (AAD second line of defense)', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        // Cast through unknown to bypass the literal type so we can simulate
        // an in-transit tamper to a future envelope version. parseEncryptedEnvelope
        // would reject this earlier in real flow, but AAD provides a 2nd defense
        // layer for callers that bypass the parser.
        const tampered = { ...env, envelopeVersion: 2 } as unknown as typeof env;
        await expect(decryptBackup(tampered, VALID_PASSPHRASE)).rejects.toMatchObject({
            cause: { kind: 'auth-tag-mismatch' },
        });
    });

    it('AC-13: tampering iv in transit fails decrypt', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const otherIv = toBase64(randomBytes(IV_BYTES));
        const tampered = { ...env, iv: otherIv };
        await expect(decryptBackup(tampered, VALID_PASSPHRASE)).rejects.toMatchObject({
            cause: { kind: 'auth-tag-mismatch' },
        });
    });

    it('AC-13: tampering kdfParams.iterations in transit fails decrypt', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const tampered = {
            ...env,
            kdfParams: { ...env.kdfParams, iterations: env.kdfParams.iterations + 1 },
        };
        await expect(decryptBackup(tampered, VALID_PASSPHRASE)).rejects.toMatchObject({
            cause: { kind: 'auth-tag-mismatch' },
        });
    });
});

describe('backupCrypto / AC-14 extractable=false + zeroize hygiene', () => {
    it('AC-14: deriveKey is invoked with extractable=false and usages=[encrypt, decrypt]', async () => {
        const subtleSpy = vi.spyOn(globalThis.crypto.subtle, 'deriveKey');
        try {
            await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
            // Last call (avoid coupling to internal call ordering).
            const callArgs = subtleSpy.mock.calls.find(
                (c) => Array.isArray(c[4]) && (c[4] as unknown[]).includes('encrypt'),
            );
            expect(callArgs).toBeDefined();
            // Signature: (algorithm, baseKey, derivedKeyAlgorithm, extractable, usages)
            const [, , , extractable, usages] = callArgs!;
            expect(extractable).toBe(false);
            expect(usages).toEqual(['encrypt', 'decrypt']);
        } finally {
            subtleSpy.mockRestore();
        }
    });

    it('AC-14: derived CryptoKey reports extractable: false', async () => {
        // Capture the actual CryptoKey produced and verify its extractable flag.
        const origDeriveKey = globalThis.crypto.subtle.deriveKey.bind(globalThis.crypto.subtle);
        let captured: CryptoKey | undefined;
        const spy = vi.spyOn(globalThis.crypto.subtle, 'deriveKey').mockImplementation(
            async (...args: Parameters<SubtleCrypto['deriveKey']>) => {
                const key = await origDeriveKey(...args);
                captured = key;
                return key;
            },
        );
        try {
            await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
            expect(captured).toBeDefined();
            expect(captured!.extractable).toBe(false);
            expect(captured!.usages.sort()).toEqual(['decrypt', 'encrypt']);
        } finally {
            spy.mockRestore();
        }
    });

    it('AC-14: backupCrypto module does not export "exportKey"', async () => {
        const mod = await import('./backupCrypto');
        expect((mod as Record<string, unknown>).exportKey).toBeUndefined();
    });
});

describe('backupCrypto / AC-10 large payload performance (Node)', () => {
    it('AC-10: 10MB payload encrypt+decrypt under env-conditional limit', async () => {
        const limit = process.env.CI === 'true' ? 15_000 : 10_000;
        const plaintext = buildLargeBackup(50, 200_000);
        const t0 = performance.now();
        const env = await encryptBackup(plaintext, VALID_PASSPHRASE, '1.0.0');
        const dec = await decryptBackup(env, VALID_PASSPHRASE);
        const elapsed = performance.now() - t0;
        expect(dec.projects.length).toBe(50);
        expect(elapsed).toBeLessThan(limit);
    }, 30_000);
});

describe('backupCrypto / boundary cases for parse-time guards', () => {
    // The parse-time iterations floor/ceiling is enforced by parseEncryptedEnvelope
    // (AC-4) — see backupSchema.test.ts. encryptBackup itself only emits the
    // current PBKDF2_ITERATIONS, so we sanity-check that constant is in range.
    it('AC-4: PBKDF2_ITERATIONS within MIN/MAX accepted', () => {
        expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(MIN_ACCEPTED_ITERATIONS);
        expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(MAX_ACCEPTED_ITERATIONS);
    });
});
