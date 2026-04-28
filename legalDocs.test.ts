import { describe, expect, it } from 'vitest';
import { LEGAL_DOCS } from './legalDocs';

// PR-D-2: legalDocs.ts は静的定数で、Footer / TermsConsentModal が link 先として参照する。
// AC-7 (footer 3 link 表示) の前提条件として URL 形状と件数を pin する。

describe('LEGAL_DOCS', () => {
    it('contains exactly 3 entries (terms / privacy / tokushou)', () => {
        expect(LEGAL_DOCS).toHaveLength(3);
    });

    it('every entry has a non-empty label and a https URL', () => {
        for (const doc of LEGAL_DOCS) {
            expect(doc.label.length).toBeGreaterThan(0);
            expect(doc.url).toMatch(/^https:\/\//);
        }
    });

    it('every URL points to docs/legal/*.md under the official repo', () => {
        for (const doc of LEGAL_DOCS) {
            expect(doc.url).toMatch(
                /^https:\/\/github\.com\/Yukina1116\/novel-writer\/blob\/main\/docs\/legal\/[a-z-]+\.md$/,
            );
        }
    });

    it('covers all 3 required documents (terms-of-service / privacy-policy / tokushou)', () => {
        const filenames = LEGAL_DOCS.map(doc => doc.url.split('/').pop());
        expect(filenames).toEqual(
            expect.arrayContaining([
                'terms-of-service.md',
                'privacy-policy.md',
                'tokushou.md',
            ]),
        );
    });

    it('labels are unique (avoid duplicate footer entries)', () => {
        const labels = LEGAL_DOCS.map(doc => doc.label);
        expect(new Set(labels).size).toBe(labels.length);
    });
});
