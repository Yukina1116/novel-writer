// Static check: utils/backupCrypto.ts must not surface crypto.subtle.exportKey
// (AC-14). The derived AES-GCM key is created with extractable=false; any
// public exportKey helper would create a leakable surface for XSS.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('utils/backupCrypto exportKey absence (AC-14)', () => {
    it('AC-14: backupCrypto.ts source does not reference exportKey', () => {
        const path = resolve(__dirname, '../../utils/backupCrypto.ts');
        const src = readFileSync(path, 'utf-8');
        expect(src).not.toMatch(/\bexportKey\b/);
    });
});
