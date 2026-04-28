// 利用規約 / プライバシーポリシー / 特商法のバージョン管理。
//
// この定数を bump (例: '2026-04-28' → '2026-06-01') すると、
// `users/{uid}.termsVersion` がこの値と異なるユーザーは再同意を求められる
// (FE: needsTermsAccept = true → TermsConsentModal 表示)。
//
// bump タイミング:
// - 法務文案の本確定 (LEGAL_REVIEW_REQUIRED マーカー除去後)
// - 重要条項の改定 (Tier 2 追加、特商法本文確定等)
//
// 注意: bump すると全ログイン済ユーザーが再同意モーダルを見る。
// 軽微な typo 修正等では bump しない (FE には影響しない docs 修正で済ます)。

export const TERMS_VERSION = '2026-04-28' as const;

export type TermsVersion = typeof TERMS_VERSION;
