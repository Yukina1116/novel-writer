// self-host された静的 HTML ページ (public/legal/*.html) を指す。
// md 本体は public/legal/*.md に配置され、legal.js が CDN 経由 marked + DOMPurify で
// fetch + sanitize + render する。
//
// docs/legal/*.md は履歴用に残置 (handoff 文書等の参照を壊さない)。
// 編集時は **public/legal/*.md** を正本とし、必要に応じて docs/legal にも反映する
// (運用ルール: CLAUDE.md「## 法務文書」項を参照)。

export interface LegalDoc {
    label: string;
    url: string;
    ariaLabel?: string;
}

// 特定商取引法に基づく表記 (public/legal/tokushou.html) は 2026-07-24 時点で Footer から意図的に除外。
// 有料プラン（＋ブックプラン）未提供のため同法の表記義務対象外（tokushou.md §現状 参照）、
// ページファイル自体は有料プラン提供開始時の復活に備えて残置。
export const LEGAL_DOCS: ReadonlyArray<LegalDoc> = [
    { label: '利用規約', url: '/legal/terms-of-service.html' },
    { label: 'プライバシーポリシー', url: '/legal/privacy-policy.html' },
];

// Footer にのみ表示する外部 SNS リンク。LEGAL_DOCS とは意味が異なる
// (法的文書ではない、same-origin でもない) ため別定数として保持する。
export const SOCIAL_LINKS: ReadonlyArray<LegalDoc> = [
    { label: 'X', url: 'https://x.com/novelwriter_app', ariaLabel: 'X（旧Twitter）' },
];
