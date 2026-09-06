# Handoff: 2026-09-06 マネタイズロードマップ策定・dev portal反映

- Session Date: 2026-09-06
- Owner: yasushi-honda
- Status: ✅ 完了（PR #312/#313/#314 マージ・dev反映確認済み）。M5（Tier 2有料化）着手前の予備検討として決済基盤を比較し、方針を確定・記録
- Previous: [2026-07-26c-terms-jurisdiction-todo-fix.md](./2026-07-26c-terms-jurisdiction-todo-fix.md)
- 注記: 前回記録（2026-07-26c）から今回までの間に PR #306〜#311（法務文書整理、faviconフォールバック、devポータルhead非共有ルール記録、GOAL.md開発者override実機確認完了）が発生しているが、これらの個別セッションのhandoffは作成されていない（記録ギャップ、git logとGOAL.mdで状態は追跡可能）。

## セッション要旨

### 1. catchup / PR #299事後レビュー

セッション冒頭の `/catchup` でGOAL.md（開発者override機構）が既に完了済み（PR #307、2026-09-06付）であることを確認。前回handoffの条件待ち項目だった `/code-review low`（PR #299対象）を実行し、指摘3件（Firebase用語残存・バージョン行削除2件）は全てPR #299の説明文で既に明示された意図的な設計判断であることをPR本文とコード（`server/services/termsConfig.ts`のTERMS_VERSION定数）で裏取りし、**修正不要と判断**（この条件待ち項目はクローズ）。

### 2. マネタイズロードマップの検討・確定

decision-makerから「マネタイズできるロードマップを考えてみて」との依頼を受け、以下を実施:

- 決済基盤（Stripe / Lemon Squeezy / Paddle / Polar）を公式一次情報（WebFetch/WebSearch）で比較検証。Stripe Managed Payments（MoR、日本事業者対応・SaaS/AIaaS税区分あり）とFirebase公式決済連携Extensionの**2027-03-31提供終了確定**を確認
- 初回提案時はStripe Managed Payments軸で設計したが、decision-makerとの対話で「まだ小規模なので難しい申請等は不要にしたい」との方針が示され、**標準Stripe（Billing + Tax、事業適格性の審査不要）でシンプルに始める方針に確定**。Managed Paymentsは規模拡大後の後回し事項に変更
- 実装工数を2〜3人日（15〜25時間）と見積もり、Phase B（決済導入）の内訳をタスク単位で提示
- 価格設定は既存メモ（`.claude/memory/pricing_tier2_reference_2026-06.md`、案A: ¥980単一プラン）の方針を継続確認
- 特商法表記の追加タイミングは「決済基盤確定後の限定公開開始時点で初回記載、以降は価格改定等のたびに更新する法的義務が継続する」方針で確定

### 3. ドキュメント反映とレビュー対応

- `docs/adr/0001-local-first-architecture.md` に決済基盤比較の経緯と最終方針を追記
- `.claude/memory/payment_provider_reference_2026-09.md` を新規作成（決済基盤比較の一次情報メモ、M5着手時の再参照用）
- `public/dev/index.html`（開発者ポータル）の「IV. マイルストーン」セクションに、簡略化したロードマップ図（Mermaid flowchart）・工数目安カード・Phase B内訳テーブルを追加
- **codex review**（`--base main --strict-config -c model_reasoning_effort=medium`、PR #312向け）で2件の指摘（P1: 特商法表記の継続更新義務が曖昧、P2: 「審査不要ですぐ使える」がページ内の他記述と矛盾する言い過ぎ）を検出、同PR内で修正
- decision-makerからの実機スクリーンショット指摘2件を受けた追加修正（別PR）:
  - PR #313: 太字乱用・長いファイルパスの不自然な折り返しを解消、参考資料を既存`.callout`パーツに分離
  - PR #314: 390px幅で`.callout`内の長いファイルパスが折り返せず横スクロールが発生する不具合を`overflow-wrap: anywhere`で修正、参考資料をGitHub上の実ファイルへのクリック可能なリンクに変更

各PRとも軽量チェックリストレビュー（PR #313/#314は1ファイル・小規模のためhookが`/review-pr`フルセットを不要と判定）を実施し、Playwright実機確認（モバイル390px幅・デスクトップ幅の両方）を経てマージ済み。

## PR一覧

| PR | 内容 | 状態 |
|---|---|---|
| #312 | 決済基盤比較の一次情報比較をADR/dev portalに反映 | ✅ マージ済み（codex review 2件反映後） |
| #313 | マネタイズロードマップ段落の可読性改善 | ✅ マージ済み |
| #314 | 参考資料の横スクロール解消とリンク化 | ✅ マージ済み |

## デプロイ検証

- **dev環境**: 3PRとも`push→main`で`deploy.yml`自動デプロイ、`gh run list`で全てsuccess確認（各3〜4分で完了）
- 実機確認: `public/`を静的配信したローカル環境およびdev本番URL（`novel-writer-ramnh3ulya-an.a.run.app/dev/`）の両方でPlaywright MCPを使用。390pxモバイル幅で`documentElement.scrollWidth === clientWidth`（横スクロールなし）、`.callout a`のhref/textが正しいことを確認。コンソールエラー0件
- prod環境: 本セッションの変更は`/dev/`ポータルとADR/メモリファイルのみで、prodビルドから`/dev/`は除外される（`ENABLE_DEV_PORTAL`ビルド引数）ため、**prod反映は対象外**（デプロイ不要）

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|------|------|------|
| GOAL.md ↔ 今セッション作業 | ✅ | GOAL.mdのミッション（開発者override機構）は既に完了済み、今セッションの作業（マネタイズ検討）とは別テーマのため更新不要と判断（新規GOAL.md作成は、decision-maker合意を得た多セッション実装計画がある場合のみ行う運用のため、今回は見送り） |
| ADR-0001 ↔ 実装判断 | ✅ | 決済基盤選定の方針転換（Managed Payments軸→標準Stripe軸）を追記済み |
| dev portal ↔ ADR/メモリ | ✅ | 3ファイルで内容が一致するよう相互参照リンクを設置 |

## Git状態

| 項目 | 状態 |
|------|------|
| 未コミット変更 | なし |
| 未プッシュコミット | なし（`origin/main`と同期済み、`ff85c58`） |
| CI/CD | ✅成功（PR #312/#313/#314、全てtest + dev自動デプロイsuccess） |

## 品質ゲート

| 項目 | 状態 |
|------|------|
| `codex review`（PR #312、medium tier該当） | ✅実行済み、2件検出・同PR内で修正反映 |
| 軽量チェックリストレビュー（PR #313/#314、small tier） | ✅実施、問題なし |
| 実機検証 | ✅実施（Playwright MCP、モバイル390px幅+デスクトップ幅、dev本番URLでも再確認） |

## ADR状態

| 項目 | 状態 |
|------|------|
| ADR数 | 3件（0001/0002/0003） |
| 今セッションで更新 | あり（ADR-0001、決済基盤方針の追記2箇所） |
| 要ADR判断 | なし（既存ADR-0001の範囲内の更新で対応） |

## 次のアクション（3分割）

### 即着手タスクなし

前回handoffの条件待ち項目のうち、GOAL.md開発者override実機確認（PR #307で完了済み）と `/code-review low`（PR #299対象、本セッションで実施・修正不要と判断）の2件はクローズ済み。今セッション内で完結すべき作業は全て完了しており、次に着手すべき具体タスクはdecision-maker側の優先度指示待ちのみ。

### 条件待ち（明示trigger付き）

| # | 項目 | trigger（充足条件） | 充足時のタスク | 充足確認方法 |
|---|------|------------------|--------------|------------|
| 1 | M5（Tier 2有料化）Phase A着手 | decision-makerの着手指示 | 無料枠上限到達・画像生成利用状況の計測基盤を実装（決済不要で着手可能な範囲） | `docs/handoff/GOAL.md`または本田様への確認 |
| 2 | M5 Phase B（決済導入）着手 | decision-makerの着手指示 + Stripeアカウント開設（本田様側の本人確認・銀行口座紐付け） | Checkout実装・Webhook・Tier2クォータ設定等（2〜3人日、内訳は`public/dev/index.html` Fig IV-2下部参照） | `.claude/memory/payment_provider_reference_2026-09.md` / dev portal参照 |
| 3 | Issue #232/#152/#147/#137 | 各Issue本文記載のtrigger、または本田様の優先度指示 | 各Issue本文参照 | `gh issue view <番号>` |

### 却下候補（記録のみ）

| # | 項目 | 検討経緯 | 着手しない理由 | 参照条件 |
|---|------|---------|--------------|---------|
| 1 | dev portal `.stack-table` / 生の`<p>`要素への`overflow-wrap`一括付与（サイトワイド予防的ハードニング） | §4.6同根再発スキャンで発見（下記参照）。今セッションの`.callout`横スクロールバグは、2026-07-13セッションで`.card`に対して同種の修正（長い不可分文字列によるコンテナ幅押し広げ）を行った経緯と同じ失敗パターン。今回は`.callout`個別に対症したが、`.stack-table`や`.callout`/`.card`以外の生`<p>`要素は依然無防備 | 現時点で実害（表示崩れ）が出ているわけではなく、範囲拡大はdecision-maker指示があってから着手するのが適切。予防的リファクタは新規価値創出寄りの判断でありAI起点では着手しない | decision-makerから「dev portal全体のCSS堅牢化をやって」等の明示指示があった場合 |

## 同根再発スキャン（§4.6、必須実施）

本セッションにPR #313/#314（`fix:`趣旨の修正）が含まれるため実施。過去のhandoffファイル全体を「callout」「横スクロール」「overflow-wrap」でgrepしたところ、**2026-07-13セッション（`docs/handoff/2026-07-13-dev-portal-image-gen-ux-completion.md:211`）で同一ファイル（`public/dev/index.html`）の`.card`コンポーネントに対し、全く同じ失敗パターン（空白なしの長い文字列がCSS Gridアイテムの`min-width:auto`によりコンテナ幅を押し広げる）の修正を行った記録がヒット**（過去7日ではなく約2ヶ月前だが、同一ファイル内での再発のため報告）。

**同根の真のroot cause仮説（3件）**:
1. dev portalのCSSはコンポーネント（`.card`/`.stack-table`/`.callout`/`.milestone-row`等）ごとに個別に育ってきており、「長い不可分文字列（コード識別子・ファイルパス・URL）を含みうる全コンテナに`overflow-wrap`を適用する」という共通ルールが存在しない。2026-07-13に`.card`で学んだ教訓が他コンポーネントに一般化されなかった
2. `public/dev/index.html`の横スクロール（`documentElement.scrollWidth`）を検証する自動テスト・CI check が存在せず、2026-05-31の1回限りの手動レスポンシブ監査で「issue #35のMermaid横はみ出し懸念を否定」と結論づけられて以降、回帰を検知する仕組みがない
3. このファイルへのAI主導のコンテンツ追加時、狭幅ビューポートでの実機確認が標準チェックリスト化されておらず、decision-makerの実機スクリーンショット指摘という受動的経路でのみ発見されている

**もう1件同根が出るとしたら想定される経路**: 今セッションで新規追加した`.stack-table`（Phase B内訳テーブル）に、将来長い不可分な識別子（環境変数名やAPIパス等）を含むセルが追加された場合、同じ横スクロールが再発しうる（`.stack-table td`に`overflow-wrap`指定なし、確認済み）。

**対応方針**: 今回は`.callout`個別の修正に留め、サイトワイドな予防的ハードニングは上記却下候補#1として記録。decision-maker判断待ち。

## 対症療法判定（§4.7）

PR #314（`.callout`横スクロール修正）について判定。4基準いずれにも該当せず、根本対応と判定:
1. retry/fallback/エラー文言修正ではなく、`overflow-wrap: anywhere`というCSS構造レベルの根本修正（`.callout`クラス自体に適用、今後の`.callout`利用全てに効く）
2. 外部要因によるregressionではなく、新規追加コンテンツが既存の未対応ギャップを初めて露呈させたケースのため、外部調査は非該当
3. 過去30日以内の同症状PRなし（2026-07-13の類似修正は約2ヶ月前で30日超、`.card`という別コンポーネント）
4. Playwright実機で390px幅の`scrollWidth`を数値検証済み（単体テスト/smokeのみではない）

PR #313（可読性改善）は機能バグ修正ではなくコンテンツ品質改善のため本判定の対象外。

## Issue Net 変化

- Close数: 0件
- 起票数: 0件
- Net: 0件（§4.6で発見した予防的ハードニング候補はIssue化基準（実害/再現バグ/CI破壊/rating≥7かつconfidence≥80/明示指示）を満たさないため却下候補に留め、Issue化せず）

## 残留プロセスチェック

⚠️ マシン全体スコープのチェックのため現在のプロジェクトに限りません。以下を検出:

```
91833 node /Users/yyyhhh/Projects/sanwa/sanwa-houkai-app/web/node_modules/.bin/next dev --port 3003（起動: 2026-09-06 15:56:19）
```

`sanwa-houkai-app`プロジェクト由来で本プロジェクト（novel-writer）とは無関係。起動時刻が直近のため別プロジェクトでの並行セッション実行中の可能性があり、停止提案は条件待ち（trigger=decision-makerの停止指示）に留める。

## 再開可能性判定

✅ **再開可能** - ドキュメントから開発再開できます。即着手タスク0件、全て条件待ちまたは却下候補。

## 最終結論

✅ **セッション終了可** — マネタイズロードマップの検討・確定・ドキュメント反映・実機修正が完了、クリーン

- OPEN PR: 0件（#312/#313/#314すべてマージ・ブランチ削除済み）
- active Issue: 4件（#232/#152/#147/#137、すべてdecision-maker明示指示待ちまたはtrigger待ち、今セッションで変化なし）
- Git: clean（`main`ブランチ、`origin/main`と同期済み、`ff85c58`）
- 即着手タスク: 0件 / 条件待ち: 3件 / 却下候補: 1件
- 同根再発スキャン（§4.6）: 1件ヒット（2026-07-13の`.card`修正と同根、根本原因仮説3件・次回発生経路1件を上記に記録、範囲拡大はdecision-maker判断待ちとして却下候補に計上）
- 対症療法判定（§4.7）: 該当なし、根本対応と判定
- 残留プロセス: 別プロジェクト（sanwa-houkai-app）由来1件検出、本プロジェクトとは無関係
- 品質ゲート: codex review PASS（2件検出・修正済み）、軽量チェックリストPASS×2
- 既知のblocker: なし（残タスクは全てdecision-makerの着手判断待ち）
