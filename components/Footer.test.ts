import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Footer は SOCIAL_LINKS (X 等の外部 SNS) を LegalLinkList の extraLinks として渡す契約を pin。
// TermsConsentModal (同意ダイアログ) は同じ LegalLinkList を使うが SNS リンクは不要なため、
// extraLinks を渡さない (デフォルト空配列) ことも合わせて防御する。

describe('Footer social link wiring', () => {
    const footerSource = readFileSync(resolve(__dirname, 'Footer.tsx'), 'utf-8');
    const termsConsentModalSource = readFileSync(
        resolve(__dirname, 'modals/TermsConsentModal.tsx'),
        'utf-8',
    );

    it('imports SOCIAL_LINKS from legalDocs', () => {
        expect(footerSource).toMatch(/import \{ SOCIAL_LINKS \} from ['"]\.\.\/legalDocs['"]/);
    });

    it('passes SOCIAL_LINKS as extraLinks to LegalLinkList', () => {
        expect(footerSource).toMatch(/extraLinks=\{SOCIAL_LINKS\}/);
    });

    it('TermsConsentModal does not pass extraLinks (no SNS link in consent dialog)', () => {
        expect(termsConsentModalSource).not.toMatch(/extraLinks/);
    });
});
