---
name: payment-provider-reference-2026-09
description: novel-writer Tier 2 (有料プラン) の決済基盤比較の一次情報調査メモ。M5 Stripe/MoR連携着手時に再参照。
metadata:
  type: project
  created: 2026-09-06
  source: 本田様からのマネタイズロードマップ相談依頼、公式一次情報のWebFetch/WebSearch検証
---

# 決済基盤 比較検討メモ (2026-09-06 時点)

## 経緯

- 本田様からの依頼: 「マネタイズできるロードマップを考えてみて」（2026-09-06）
- ADR-0001 では M5 (Stripe Tier 2 課金) 着手時に決済基盤を比較選定する方針のみ決まっており未確定だった
- 本メモは M5 着手前の予備調査。**着手時期は本田様判断待ちで未定**（2026-09-06 時点、Stripe Managed Payments の利用審査申請もまだ行わない）
- 価格設定については別メモ [`pricing_tier2_reference_2026-06.md`](./pricing_tier2_reference_2026-06.md) を参照（案A: ¥980 単一プラン → 半年後に案Bへ拡張、の方針は本メモ作成時点でも有効と本田様確認済み）

## 1. 決済サービス比較（公式一次情報で個別検証、2026-09-06時点）

| サービス | 位置づけ | 日本の事業者への対応 | 手数料目安 | 消費税・請求書対応 | 情報の確度 |
|---|---|---|---|---|---|
| Stripe（標準 Billing + Tax） | PSP（決済処理のみ代行） | 対応 | 決済額の3.6%前後、Billing+0.7%、Tax+0.5%/取引 | 税額の計算のみ代行。申告・納付は自社対応 | 公式pricingページで確認 |
| **Stripe Managed Payments（新方式）** | MoR（決済+税務処理を一括代行） | **対応**（`docs.stripe.com/payments/managed-payments/eligibility` で日本(JP)がアジア太平洋のサポート対象事業所在地に明記、公式ドキュメント直接フェッチで確認済み） | 決済額の3.5%前後（標準手数料に加算） | 消費税の計算・徴収・申告納付までStripeが代行。SaaS/AIaaS個人利用の税区分（`txcd_10103000`, `txcd_10105001`等）あり。サブスクリプション（カード/Apple Pay/Google Pay/Link）に対応 | 公式ドキュメント直接フェッチで確認済み（`how-it-works`ページも参照） |
| Lemon Squeezy | MoR | 不明確（新規マーチャント受付停止の明示公式発表は未確認） | 不明 | 2024-07にStripeが買収。2026-01に「Stripe Managed Payments」への統合方針を発表、既存顧客はMigrated Payments waitlistへ誘導 | 二次情報中心、公式ブログ本文は403で直接確認不可。新規に依存するのは非推奨 |
| Paddle | MoR | 対応 | 決済額の5%＋$0.50前後 | 代行 | 二次情報中心、Paddle公式ヘルプ本文は未フェッチ（要フォローアップ） |
| Polar (polar.sh) | MoR | 対応（`polar.sh/docs/merchant-of-record/supported-countries`で確認） | 無料プラン: 決済額の5%＋$0.50前後。有料プラン加入で減額可（Pro $20/mo等） | 代行 | 一部公式ドキュメント確認、料金体系は二次情報経由 |

## 2. 重要な確定事実（一次情報で直接検証済み）

- **Firebase公式Extension「Run Payments with Stripe」等は非推奨扱い**: Firebase Extensionsサービス自体が **2027-03-31 に提供終了**することが公式発表済み（`firebase.google.com/docs/extensions/faq-and-troubleshooting`）。既存デプロイ済みExtensionはCloud Functions等の標準GCPインフラ上で稼働継続するが、廃止後は設定変更・再構成・バグ修正が一切不可能になる。**新規に依存する設計は避けるべき**
- **Stripe Managed Payments は日本の個人開発規模のAI SaaSに適合的**: 対象製品カテゴリーに「ウェブサイトホスティング等の電子的に提供されるビジネス・ウェブサービス」が含まれ、AIaaS個人利用の税区分も用意されている。ただし「事業形態や地域などの要素を考慮した審査」があり、個人事業主の可否は個別申請しないと確定できない
- Managed Paymentsは Connect プラットフォーム/Express アカウント構成とは併用不可（本プロダクトは直接連携想定のため影響なし）

## 3. 推奨方針（本メモ作成時点の暫定判断）

- Stripe を軸に進める。理由: (a) 新方式(Managed Payments)が使えれば消費税処理を丸ごと代行でき個人開発の事務負担を最小化できる、(b) 審査に通らなくても同じStripe内で標準Billing+Taxに切替可能、(c) Lemon Squeezy等は買収・統合の動きで新規依存の不確実性が残る
- Firebase公式の決済連携Extensionは新規に採用しない（2027-03-31 EOL確定のため）

### 2026-09-06 追記: Managed Payments は当面見送り

- 本田様判断: サービス規模がまだ小さい段階のため、**まずは審査不要な標準Stripe（Billing + Tax）でシンプルに始める**方針に確定
- Managed Payments（消費税・請求書処理までまとめて代行する追加オプション。事業形態・地域による利用資格審査があり、通常のStripe決済処理そのものには審査は不要）は、規模が大きくなってから改めて検討する後回し事項とする
- 標準Stripeのメリット: サインアップ後、本人確認・銀行口座登録を済ませればテストモードは即座に、本番決済も通常数分〜1日程度で使える（審査待ちで止まるプロセスではない）
- デメリット: 消費税の計算はStripe Tax（+0.5%/取引）で代行可能だが、申告・納付は自社対応が必要。規模が小さい間は運用負荷は軽微
- M5 の当面のスコープは「標準Stripe Billing + Stripe Tax」のみ。Managed Payments比較の詳細（§1テーブル）は将来の再検討用に本メモに残す

## 4. 確定前に再確認すべき項目（M5 着手時）

- [ ] Stripe Managed Payments の利用審査を実際に申請し、個人開発規模で承認されるか確認
- [ ] Paddle / Polar の公式ヘルプ本文の直接フェッチ未実施分の裏取り
- [ ] Lemon Squeezy の新規マーチャント受付可否の公式発表確認（本メモ時点で不明）
- [ ] Webhook設計・サブスクリプション状態同期の実装パターン（Stripe公式ドキュメント本文の直接確認、本メモは二次情報中心）

## 関連

- [`pricing_tier2_reference_2026-06.md`](./pricing_tier2_reference_2026-06.md)（Tier 2 価格設定の市場調査）
- `docs/spec/m3/usage-cost-config.md`（Tier 構造の根拠）
- ADR-0001（3層プラン Tier 0/1/2 設計、2026-09-06 更新で本メモへのポインタを追記済み）
