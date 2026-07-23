import { describe, expect, it } from 'vitest';
import { LEGAL_DOCS, SOCIAL_LINKS } from './legalDocs';

// PR-D-2: legalDocs.ts は静的定数で、Footer / TermsConsentModal が link 先として参照する。
// AC-7 (footer 3 link 表示) の前提条件として URL 形状と件数を pin する。
// PR #91 で self-host 化: GitHub blob URL から /legal/*.html (同 origin) に切替。

describe('LEGAL_DOCS', () => {
    it('contains exactly 3 entries (terms / privacy / tokushou)', () => {
        expect(LEGAL_DOCS).toHaveLength(3);
    });

    it('every entry has a non-empty label and a same-origin /legal/*.html URL', () => {
        for (const doc of LEGAL_DOCS) {
            expect(doc.label.length).toBeGreaterThan(0);
            expect(doc.url).toMatch(/^\/legal\/[a-z-]+\.html$/);
        }
    });

    it('covers all 3 required documents (terms-of-service / privacy-policy / tokushou)', () => {
        const filenames = LEGAL_DOCS.map(doc => doc.url.split('/').pop());
        expect(filenames).toEqual(
            expect.arrayContaining([
                'terms-of-service.html',
                'privacy-policy.html',
                'tokushou.html',
            ]),
        );
    });

    it('labels are unique (avoid duplicate footer entries)', () => {
        const labels = LEGAL_DOCS.map(doc => doc.label);
        expect(new Set(labels).size).toBe(labels.length);
    });
});

describe('SOCIAL_LINKS', () => {
    it('every entry has a non-empty label and an https URL', () => {
        for (const link of SOCIAL_LINKS) {
            expect(link.label.length).toBeGreaterThan(0);
            expect(link.url).toMatch(/^https:\/\//);
        }
    });

    it('does not overlap with LEGAL_DOCS urls', () => {
        const legalUrls = new Set(LEGAL_DOCS.map(doc => doc.url));
        for (const link of SOCIAL_LINKS) {
            expect(legalUrls.has(link.url)).toBe(false);
        }
    });

    it('every entry has a descriptive ariaLabel (WCAG 2.4.4 Link Purpose)', () => {
        // 'X' のような短いラベルだけでは、外部SNSリンクであることがスクリーンリーダーで伝わらないため必須。
        for (const link of SOCIAL_LINKS) {
            expect(link.ariaLabel?.length ?? 0).toBeGreaterThan(0);
        }
    });
});
