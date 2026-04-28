// 暫定で GitHub repo md 直 link、本番公開時 (M7-β) に self-hosted /legal/*.html へ置換予定。
// 置換時は url 値のみ書き換え、参照側は無変更で済む。

export interface LegalDoc {
    label: string;
    url: string;
}

const REPO_BASE = 'https://github.com/Yukina1116/novel-writer/blob/main/docs/legal';

export const LEGAL_DOCS: ReadonlyArray<LegalDoc> = [
    { label: '利用規約', url: `${REPO_BASE}/terms-of-service.md` },
    { label: 'プライバシーポリシー', url: `${REPO_BASE}/privacy-policy.md` },
    { label: '特定商取引法に基づく表記', url: `${REPO_BASE}/tokushou.md` },
];
