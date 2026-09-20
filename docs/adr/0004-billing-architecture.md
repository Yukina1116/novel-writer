# ADR-0004: 課金アーキテクチャ (Tier 2 / Stripe) — 最小構成

- Status: Draft (AI 起草の草案。採否は decision-maker = オーナー。M5 着手はオーナーの明示指示後)
- Date: 2026-09-20
- 方針: ほぼ個人開発 (2 名以下) + ユーザー数 0。**最低限必要なものだけ**作る。Stripe の画面に任せられるものは任せる
- Related: [ADR-0001](./0001-local-first-architecture.md) / `.claude/memory/payment_provider_reference_2026-09.md` / `.claude/memory/pricing_tier2_reference_2026-06.md`

> **位置づけ: 構想であり、システムへの実装は未着手・実装の予定も未定。** 本書はロードマップ (dev ポータル §IV) を補足する設計メモで、エンドポイント名・環境変数名・rules 等の細部は **M5 着手が決まった時点で Stripe の公式 docs を再確認し、必要なら書き直す前提**。Stripe API は変わりうる (例: `current_period_end` の取得元は API バージョンで変わった)。本書の細部を、そのまま確定仕様として扱わない。

## 決定

### 1. 購入・契約管理は Stripe の画面に任せる

- 購入: **Payment Link** (ダッシュボードで ¥980 月額を作成) に `?client_reference_id={uid}` を付けて遷移。`client_reference_id` は `checkout.session.completed` Webhook で返る ([公式](https://docs.stripe.com/payment-links/url-parameters))
- 解約・支払方法変更: **コード不要のカスタマーポータル** のログインリンク (メールアドレスでログイン、[公式](https://docs.stripe.com/customer-management/activate-no-code-customer-portal))
- 自前の Checkout / ポータル / 同期 API は作らない
- Payment Link・ポータルの URL はサーバー環境変数 (`STRIPE_PAYMENT_LINK_URL` / `STRIPE_PORTAL_URL`) に置き、`/api/users/init` のレスポンスで FE に渡す。**未設定なら購入ボタンを出さない** (実装を先にデプロイしても無効のまま安全)

### 2. 課金状態は `billing/{uid}` に分離

- 項目: `status` (Stripe の値そのまま) / `stripeCustomerId` / `stripeSubscriptionId` / `currentPeriodEnd` / `cancelAtPeriodEnd` / `updatedAt`
- `firestore.rules`: **read = 本人のみ / write = 全拒否** (書くのは Webhook = Admin SDK のみ)
- **`users.plan` は `['free']` のまま触らない**。ルールの enum を広げると client が自分で有料化できるため
- `currentPeriodEnd` は Stripe API 2025-03-31.basil 以降 **subscription item 側** (`items.data[0].current_period_end`) にある ([changelog](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end))。API バージョンを固定して item 側から読む

### 3. Webhook は 1 本だけ (`POST /api/stripe/webhook`)

- `express.raw` を **`express.json` より前** に mount し、`constructEvent` で署名検証 (失敗は 400)
- 対象イベントは `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` の 3 種
- **イベント内容は信用せず、Stripe から Subscription を取り直して `billing/{uid}` を上書き**。順序逆転・重複配信でも結果が同じになるため、`stripeEvents` 冪等化コレクションは作らない (ADR-0001 の計画からの変更点)
- uid の解決: 購入時は `client_reference_id`、以降の更新は `billing` を `stripeSubscriptionId` で検索。解決できなければ 200 + WARN ログ (手動照合)。一時障害は 5xx で Stripe の自動再送に任せる
- 取りこぼしは Stripe ダッシュボードからのイベント手動再送で対応 (突合バッチは作らない)
- **失敗に気づけることを最優先にする** (一人開発では「決済されたのに未反映」を誰も知らないまま放置するのが最大のリスク): uid 未解決・署名不正の連続・Stripe/Firestore 失敗は構造化ログ (ERROR / WARN) で出し、既存の Cloud Logging 監視 ([ADR-0003](./0003-public-launch-operations.md)) のアラートに載せる。アラートの実体は実装時に既存設定を確認して相乗りする
- status は Stripe の値をそのまま保存し自前の状態遷移を持たないため、状態遷移図は作らない

### 4. Tier は保存せず導出する

```ts
resolveTier(billing, now) = (status ∈ {active, trialing, past_due} && now < currentPeriodEnd) ? 'paid' : 'free'
```

- `withUsageQuota` の `DEFAULT_TIER = 'free'` 固定を `resolveTier` に置換。`canceled` 通知を取りこぼしても期限で自然に free に戻る
- `Tier = 'free' | 'paid'` とし、`MONTHLY_LIMIT_SEN.paid` を追加。月の途中で昇格・降格しても `usage` は引き継ぎ、reserve 時の上限だけ切り替える (特別な移行処理なし)
- `/api/users/init` に `tier` / `cancelAtPeriodEnd` / `currentPeriodEnd` / `checkoutUrl` / `portalUrl` を追加。決済後は FE が `/api/users/init` を再取得して反映を確認する

### 5. 環境

- dev = Stripe テストモード、prod = 本番モード (Payment Link・ポータル・Webhook は環境ごとに作成)
- `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` は Secret Manager 経由 (`--update-secrets`)。`deploy.yml` は `--set-env-vars` を使っているため、追加時に既存の環境変数を消さない指定になっているか **実装時に確認**

## テスト (最小)

- Webhook: 署名不正 → 400 / 同一イベント 2 回 → 結果同一 / `client_reference_id` 欠落 → 200 + WARN
- `resolveTier`: `currentPeriodEnd` の境界 / status 全種 / `billing` なし
- rules: client が `billing/*` に書けない / `users.plan='paid'` にできない

## 既知の制約 (許容)

同じユーザーが Payment Link を 2 回購入すると二重購読になる (発生時は Stripe ダッシュボードで手動解約)。決済時のメールが Firebase のメールと違うとポータルにログインできない。ユーザー別 metadata・トライアル・クーポン・複数価格が必要になったら Checkout Session API へ移行する (Webhook 側は不変)。

## 未決事項 (decision-maker 判断)

| # | 論点 | AI の推奨 |
|---|---|---|
| A | `MONTHLY_LIMIT_SEN.paid`。案 A の「Tier 1 の 30 倍」は ¥980 の手取り (約 ¥850〜905) を超え、上限まで使うユーザーで赤字 | 暫定 50,000 sen (Tier 1 の 5 倍)。少人数テスト (Phase C) で調整 |
| B | Stripe Tax の ON/OFF・税込表示 | 課税事業者 / インボイス登録の有無と販売主体の確認が先 |
| C | M6.5 (Cloud Storage) が M5 より後なので、初期 Tier 2 は AI 枠のみ | 初期は価格を下げるか、Cloud Storage は後日追加と明記 |

工数の見込みは 1.5〜2 人日程度 (設計時点の見積もり)。
