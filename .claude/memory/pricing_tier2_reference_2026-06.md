---
name: pricing-tier2-reference-2026-06
description: novel-writer Tier 2 (有料プラン) 価格設定の市場調査と提案メモ。M5 Stripe 連携着手時に再参照。
metadata:
  type: project
  created: 2026-06-20
  source: 本田様との対話 (catchup セッション内、PR #190/#191 完走後)
---

# Tier 2 価格設定 参考メモ (2026-06-20 時点)

## 経緯
- 本田様からの依頼: 「有料化エリアの課金金額イメージについて、2026-06-20 時点での一般的な価格帯を提案レベルで」
- 現状 Tier 2 未実装。`server/services/usageConfig.ts` の `Tier = 'free'` のみ
- M5 (Stripe 連携) 着手時に本メモを再参照する想定
- **重要**: あくまで提案レベル、確定価格ではない

## 1. 2026-06 時点の市場相場 (調査結果)

### 海外 AI 小説特化
| サービス | 月額 (USD) | 月額換算 (JPY) |
|---|---|---|
| NovelAI | $10〜25 | ¥1,500〜3,800 |
| Sudowrite | $19〜44 | ¥2,900〜6,600 |
| DreamGen | $8 | 約¥1,200 |
| Jenova Plus | $20 | 約¥3,000 |

### 国内
| サービス | 月額 (JPY) |
|---|---|
| AIのべりすと | ¥1,000〜2,500 (プラン別) |
| 汎用AIライティング ボリュームゾーン | ¥3,000〜5,000 |
| Gemini AI Plus (参考) | ¥1,200 |
| Gemini AI Pro (参考) | ¥2,900 |

→ **個人向け創作 AI SaaS の中心価格帯は ¥1,000〜3,000/月**

## 2. 本プロダクト固有の価格決定要素

| 要素 | 内容 | 価格への影響 |
|---|---|---|
| 原価 | Vertex Flash (安価) + Imagen (1回約10円) | Imagen 上限が原価を支配 |
| 決済原価 | Stripe 3.6% + ¥40/件 | ¥500未満は手数料負け |
| Tier 1 基準 | 月100円コスト上限 (`usageConfig.ts` MONTHLY_LIMIT_SEN: 10000 sen) | Tier 2 は 10倍〜30倍枠が自然 |
| 差別化 | E2EE バックアップ (M6 完了) + Cloud Storage (M6.5 予定) | Sudowrite 等にない付加価値 |
| 開発体制 | 個人開発・学校プロジェクト | サポート負荷を価格転嫁不可 → 廉価寄り推奨 |
| 顧客層 | 同人作家・趣味執筆層 | 心理的閾値 ¥980 / ¥1,480 / ¥2,980 |

## 3. 提案 3 案

### 案A: シンプル単一プラン (MVP 向け / 推奨スタート)
- **¥980/月 or ¥1,280/月**
- AI コスト上限 = Tier 1 の 30倍 (月3,000円相当)
- Imagen 月50回まで
- Cloud Storage バックアップ 1GB

### 案B: 2段階プラン (標準)
| プラン | 月額 | 内容 |
|---|---|---|
| Tier 1 (無料) | ¥0 | 現状維持 |
| Tier 2 スタンダード | ¥1,480 | AI上限月3,000円相当 / Imagen 50回 / Cloud 1GB |
| Tier 3 プロ | ¥2,980 | AI上限月8,000円相当 / Imagen 200回 / Cloud 10GB |

### 案C: 3段差別化
| プラン | 月額 | ターゲット |
|---|---|---|
| ライト | ¥780 | 月1-2話書く趣味層 |
| スタンダード | ¥1,980 | 週1更新の同人作家 |
| プロ | ¥3,980 | 専業・連載執筆者 |

## 4. 推奨

**初期は案A (¥980 単一プラン) → 半年後にデータを見て案B へ拡張**

### 理由
- 個人開発・運用実績ゼロの段階で複雑な階層は管理コストが高い
- ¥980 は「迷わず買える」心理的閾値 (Netflix ベーシック / Spotify 個人と同帯)
- Stripe 手数料込みでも粗利確保可能 (¥980 → 手数料約¥75 → 手取り¥905、Vertex Flash 原価は数十円〜数百円)
- 顧問弁護士確認後の特商法表記 (M7-β) も単一プランの方が記述が単純

## 5. 確定前に再確認すべき項目

- [ ] Vertex AI / Imagen の実コスト実績データ (M3 PR-F の usage commit ログから集計可)
- [ ] 決済代行の比較 (Stripe / Paddle / Komoju)
- [ ] 年額プラン (月額×10ヶ月相当) の LTV シミュレーション
- [ ] M6.5 Cloud Storage の容量別単価試算
- [ ] 特商法表記の確定文案 (M7-β、顧問弁護士確認後)

## 参考リンク

- [生成AI、利用料はいくらになった？ 2026年5月の主要8サービス料金早見表 | Business Insider Japan](https://www.businessinsider.jp/article/2605-how-much-did-major-generative-ai-service-fees-become-in-may-2026/)
- [AI小説ストーリージェネレーター (2026年5月) | Jenova](https://www.jenova.ai/ja/resources/novel-ai-story-generator)
- [AIツール月額コスパ比較2026](https://aitool-guide.net/ai-tools-cost-comparison-2026/)
- [AIのべりすと と AI teller 比較 (2026年版)](https://aiteller.jp/blog/ainoberist-vs-aiteller-2026)
- [Gemini 料金プラン完全ガイド (2026年最新) | はてなベース](https://hatenabase.jp/blog/gemini-pricing-guide-2026/)

## 関連
- `docs/spec/m3/usage-cost-config.md` (Tier 構造の根拠)
- `docs/spec/m6/tasks.md` (M6.5 Cloud Storage で Tier 2 ゲート初発生)
- `docs/spec/m7/tasks.md` (M7-β で特商法本文確定、Stripe 後)
- ADR-0001 (3層プラン Tier 0/1/2 設計)
