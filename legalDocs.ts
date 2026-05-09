// self-host された静的 HTML ページ (public/legal/*.html) を指す。
// md 本体は public/legal/*.md に配置され、legal.js が CDN 経由 marked + DOMPurify で
// fetch + sanitize + render する。LEGAL_REVIEW_REQUIRED 警告は md 内に保持される。
//
// docs/legal/*.md は履歴用に残置 (handoff 文書等の参照を壊さない)。
// 編集時は **public/legal/*.md** を正本とし、必要に応じて docs/legal にも反映する
// (運用ルール: CLAUDE.md「## 法務文書」項を参照)。

export interface LegalDoc {
    label: string;
    url: string;
}

export const LEGAL_DOCS: ReadonlyArray<LegalDoc> = [
    { label: '利用規約', url: '/legal/terms-of-service.html' },
    { label: 'プライバシーポリシー', url: '/legal/privacy-policy.html' },
    { label: '特定商取引法に基づく表記', url: '/legal/tokushou.html' },
];
