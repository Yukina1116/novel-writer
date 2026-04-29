// Static check: components/ must not reference error.cause (AC-9).
// UI must always show the constant DECRYPT_FAILURE_MESSAGE; reading
// error.cause would leak the auth-tag-mismatch / plaintext-corrupted /
// schema-invalid distinction to fingerprint-prevention surface.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            collectSourceFiles(full, acc);
        } else if (/\.(tsx?|jsx?)$/.test(entry)) {
            acc.push(full);
        }
    }
    return acc;
};

describe('components/ no error.cause references (AC-9)', () => {
    it('AC-9: components/ source does not read error.cause', () => {
        const componentsDir = resolve(__dirname, '../../components');
        const files = collectSourceFiles(componentsDir);
        const offenders: string[] = [];
        for (const file of files) {
            const lines = readFileSync(file, 'utf-8').split('\n');
            lines.forEach((line, i) => {
                if (/\.cause\b/.test(line)) {
                    offenders.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});
