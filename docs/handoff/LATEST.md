# Handoff: 2026-07-05 AIモデル移行 quotaバグ発見・段階呼び出し方式への再設計

- Session Date: 2026-07-05
- Owner: yasushi-honda
- Status: ⚠️ prod実機検証（Task L）未実施、次アクションとして明示
- Previous: [2026-06-28b-terminology-chart-boundary-knowledge-integration.md](./2026-06-28b-terminology-chart-boundary-knowledge-integration.md)

## セッション要旨

AIモデルを Gemini 2.5 Flash / Imagen 4 系から **Gemini 3.1 Flash-Lite / Nano Banana 2 Lite**（`gemini-3.1-flash-lite-image`）へ移行（PR #230）。prod実機検証で2つの重大な構造的欠陥を発見し、いずれも根本修正した。

1. **リージョン404**（PR #231）: 新モデルは `asia-northeast1` で404。テキスト・画像とも `global` エンドポイント固定に統一。
2. **quota構造欠陥**（PR #233）: `gcloud alpha services quota list` で実測した結果、画像生成 quota は **2 req/分/プロジェクト/モデル**。既存の「4枚並列生成」設計は**理論上どんな条件でも4枚同時成功があり得ない**（quota=2に対し常に2倍要求する構造的バグ）。本田様指示「段階呼び出し（最初2枚+追加生成ボタン）」に基づき `NUM_IMAGES` を4→2に変更し、UIに「追加で2枚生成する」ボタンを新設。

加えて、コスト（$0.034/枚 vs 旧見積り）のファクトチェック要求に対応し `image/generate` の sen単価を実コスト連動で1000→1200に補正（`docs/spec/m3/usage-cost-config.md`）。無料枠のコンバージョン最適化（有料誘導UX）は本田様判断でスコープ外とし [Issue #232](https://github.com/Yukina1116/novel-writer/issues/232) に切り出し済み。

**訂正（本ハンドオフ作成中に発覚）**: 当初この文書は「「追加生成」ボタン押下後の2枚追記成功は dev実機で一度も確認できていない」としていたが誤り。圧縮前の会話ログを本田様の指摘で再確認したところ、6回の失敗試行の**後**、約2時間以上のquota回復待ちを経て別プロンプトで再試行したところ Trial 1・Trial 2 とも1回目の試行で成功し、既存2枚を保持したまま新規2枚が追記され計4枚表示されることを `browser_snapshot` で直接確認済みだった。この成功は `tasks.md` に書き戻される前にセッションが compaction されたため、"未達成のまま" という古い記述が一次情報として残ってしまっていた。`tasks.md` は本ハンドオフと同時に修正済み。**残る未確認事項は「prodでの実地確認」のみ**（devでは論理的にも実地的にも確認済み）。

## 本セッション merged PR（4件）

| PR | 内容 | 規模 | dev検証 | prod検証 |
|----|------|------|---------|---------|
| #230 | feat(ai): Gemini 3.1 Flash-Lite / Nano Banana 2 Lite へモデル移行 | 19 files, +589/-55 | - | 本田様指示で直接デプロイ・検証 |
| #231 | fix(ai): Vertex AI呼び出しをglobalエンドポイントに統一（asia-northeast1で404） | 4 files, +77/-89 | - | ✅ 再検証済み |
| #233 | fix(image-gen): 画像生成をquota互換の段階呼び出し方式に変更 | 12 files, +178/-92 | ✅ 完全検証済み（追記マージ4枚表示まで確認） | ⚠️ 未実施 |
| #234 | docs(model-migration): dev実機検証結果とquota回復時間の実測を記録 | 1 file, +14/-9 | - | - |

## 実機検証で新たに判明した2つの経験則（次回モデル移行時の教訓）

1. **quota回復時間は「2 req/分」ラベルから期待される60秒よりはるかに長い**: dev実機で最後の成功から15分以上429が継続（`gcloud logging read` で実測、無関係な穏当なプロンプトに変更しても再現）。Google公式ドキュメントに明記なし。WebSearchで他ユーザーの同一症状報告を確認（Google AI Developers Forum「DSQ increase request: gemini-3.1-flash-image on Vertex AI (429 after 2 sequential requests)」）— quota挙動は当プロジェクト固有の設定ミスではなく、新モデル系のDynamic Shared Quotaデフォルト値という外部要因と確認。
2. **新モデルのリージョン可用性・quotaは公式ドキュメントのWeb調査だけでは確定できない**: `asia-northeast1` 404もquota=2/分も、実際のAPI呼び出しでしか判明しなかった。tasks.md に「モデル移行時は最初から対象リージョンで最小限の1回呼び出しテストを計画に組み込む」という教訓を明記済み。

## 変更ファイル概要

- `server/services/imageService.ts`: `NUM_IMAGES` を `shared/imageGenerationConfig.ts` の共通定数経由に変更（4→2）
- `shared/imageGenerationConfig.ts`（新規）: FE/BE共有のバッチサイズ定数（`shared/termsCodes.ts` と同じ共有定数パターンを踏襲）
- `components/ImageGenerationModal.tsx`: `handleGenerate(promptToUse, append)` に拡張、「追加で2枚生成する」ボタン追加、`selectedImage` クリア漏れのバグ修正（code-review CONFIRMED）
- `server/services/usageConfig.ts`: `image/generate` sen 1000→1200
- `server/services/imageService.test.ts` / `server/middleware/withUsageQuota.test.ts`: N=2境界値に書き直し
- `components/ImageGenerationModal.handlers.test.ts`（新規）: static pin 回帰テスト
- `CLAUDE.md` / `docs/runbook/prod-infrastructure-setup.md` / `docs/spec/m3/usage-cost-config.md` / `docs/spec/model-migration/tasks.md`: 上記変更に追従

詳細は [docs/spec/model-migration/tasks.md](../spec/model-migration/tasks.md) 参照（Acceptance Criteria 9項目・品質ゲート・リスク欄に一次情報を集約済み、本ハンドオフでの重複記載は避ける）。

## § 4.6 同根再発スキャン

過去7日 archive: **0件ヒット**。本セッション内: PR #231・#233 の2件が「同じ `aiClient.ts` 経由の Vertex AI 呼び出し」という層を共有するため、字義通りには同根候補としてカウントする。ただしメカニズムは独立（#231=リージョンルーティング404、#233=プロジェクト単位quota超過）。

**上流の真の root cause 仮説（3つ）**:
1. GA直後の新モデル（Nano Banana 2 Lite系）はドキュメント整備がインフラ展開に追いついておらず、region/quotaの制約は実機でしか判明しない
2. 旧モデル世代からの設計前提（4並列呼び出し・リージョン固定）が新モデルに対して再検証されないまま引き継がれた
3. モデル移行のレビュープロセスに「対象リージョン・quotaでの実機事前検証」ステップが計画段階で組み込まれていなかった（今回2件とも実機投入後に偶発的発見）

**3件目が起きるとしたらどこか**: 他のAIルート（novelService/characterService/worldService/utilityService/analysisService）は全て同じ `aiClient.ts` 経由だが、`Promise.all`/`allSettled` による並列呼び出しは `imageService.ts` のみ（grep確認済み）。「quota倍化」パターンの再発可能性は低いが、「新モデルの未知の運用制約」という上流要因自体は他機能でも将来的に顕在化しうる（例: text生成側のquota、高負荷時の挙動は未検証）。

## § 4.7 対症療法判定

判定基準4項目中、**基準3（同症状PRが過去30日以内に複数）が該当**（#230→#231→#233→#234 が連続する同一migration内PR）。該当のためWebSearchを実施:

- Google AI Developers Forumに第三者の同一症状報告を発見（"429 after 2 sequential requests" for `gemini-3.1-flash-image`）→ quota挙動が当プロジェクト固有の設定ミスではなく、Google側の新モデル系DSQデフォルト値という**外部要因**であることを確認
- 副次確認: `gemini-3.1-flash-lite-preview`（サフィックス付き）が2026-07-09廃止予定と判明。当プロジェクトの `aiClient.ts` は非preview版 `gemini-3.1-flash-lite` を使用しており**影響なし**（確認のみ、対応不要）

基準1（retry/fallbackのみ）・基準4（テスト検証のみ）は非該当（`gcloud` quota実測 + Playwright実機検証という構造的検証を実施済み）。→ **対症療法ではなく外部要因に基づく恒久的アーキテクチャ修正と判定**。

## 次のアクション（3分割）

### 即着手タスク

| # | タスク | ROI | 想定工数 | 完了条件 | 関連ファイル / コマンド |
|---|--------|-----|----------|---------|------------------------|
| 1 | Task L: prod実機で「追加生成」ボタンの2枚追記成功（合計4枚表示）を確認 | devでは論理的（static pin+4段階レビュー）にも実地的（Trial 1/2とも成功、4枚表示を`browser_snapshot`で確認済み）にも既に立証済み。prodは既にデプロイ済み（CI success確認済み）で、残るのは「同じ挙動がprodでも成立するか」の最終確認のみ（新規リスクの洗い出しではなく確認作業） | 15-30分（quota回復待ちが発生する可能性あり） | prod上でPlaywright MCPにより、初回2枚生成→「追加で2枚生成する」クリック→4枚表示を1回確認、Cloud Runログで想定通りのPartialSuccessError/成功ログを確認（devのTrial 2ではログ未確認だったため、ここで併せて埋める）→ `docs/spec/model-migration/tasks.md` の Acceptance Criteria #9 を「prod含め完全達成」に更新 | `docs/spec/model-migration/tasks.md` L82-89, L94-98 |

### 条件待ち（明示 trigger 付き）

条件待ちなし

### 却下候補（記録のみ）

| # | 項目 | 検討経緯 | 着手しない理由 | 参照条件 |
|---|------|---------|---------------|---------|
| 1 | コンテンツ生成失敗率 p≈50%（両方成功だが画像データ無しで返るケース）への対応（新規Issue化 / 診断ログ追加 / 静観） | 本セッションで実測（n=14、quota由来429を除く個別generateContent呼び出しの成否）。ユーザー依頼「実際の失敗率を見積もりたい」に応じ統計的サンプリングで対応、p≈50%（当初粗い推定70%から精緻化）と判明。N=4→2への変更は全滅確率を悪化させるどころか改善する（`(1-p)^N` が減少）ことも算出し説明済み | 次にどう動くか（Issue化/診断ログ追加/静観）の起点判断はdecision-maker領分。診断ログ追加は本セッションで一度提案し、統計的サンプリングを優先する形で明示的に却下された経緯あり | 本田様から「Issue化して」または「診断ログを追加して」の明示指示があれば着手可。判断材料: p≈50%はモデル自体の生成信頼性特性であり、本セッションの変更に起因するものではない |

> ⚠️ 「優先順にすすめて」等の包括指示で次セッションが動けるのは即着手タスクのみ。却下候補は本田様の明示指示時のみ参照する。

## Issue Net 変化

- Close数: 0件
- 起票数: 1件（[#232](https://github.com/Yukina1116/novel-writer/issues/232) 画像生成の無料枠をコンバージョン最適化の観点で再設計する）
- Net: -1件

Net < 0だが、triage基準（ユーザー明示指示）を満たした起票であり、CLAUDE.mdが却下すべきとする「rating 5-6の任意改善提案」には該当しない（本田様が「今回は最小限で先に直す」とスコープを明確に切り分けた結果の意図的な切り出し）。

他のopen Issue（#156/#155/#152/#147/#137）は本セッション以前からのpromptSafety関連で、本セッションの作業対象外。

## 再開可能性判定

⚠️ **要対応** - 以下を対応してからクリアしてください:
1. Task L（prod実機での追加生成成功確認）

---

## 補足: 圧縮（compaction）跨ぎの事実確認について

本ハンドオフは `/handoff` スキル実行中に会話が compaction されたセッションで作成された。本田様から「重要なコンテキストが抜け落ちている可能性はないか」との指摘を受け、圧縮前の完全な会話ログ（transcript）と現在の `tasks.md` を突き合わせて事実確認を行った。結果、**要約側ではなく `tasks.md`（コミット済みドキュメント）側が古い状態のまま**だったことが判明（「追加生成」の4枚追記成功は実際には確認済みだったが、ドキュメントに書き戻される前に compaction されていた）。「コミット済みファイル＝常に正しいground truth」という前提が本セッションでは成立しなかった点は、次セッションへの申し送り事項として記録する。`tasks.md` は本ハンドオフと同時に訂正済み。

## 最終結論

⚠️ **セッション終了前に要対応** — 1件の即着手タスクあり（Task L: prod実機検証。ただしdevでは確認済みのため、prodでの最終確認という位置づけに縮小）

- OPEN PR: 本ハンドオフ更新PR 1件（マージ待ち、番号認可要）/ active Issue: 6件（うち本セッション起票1件・他5件はpostponed対象外の既存事項）
- Git: clean（本ハンドオフ用のfeatureブランチ以外に変更なし）
- 即着手タスク: 1件 / 条件待ち: 0件 / 却下候補: 1件
- 残留プロセス: なし（`cleanup-node.sh` 確認済み）
- 既知のblocker: なし（prod環境は既にデプロイ済み、devで成立済みの挙動のprod確認のみのため、Playwright MCPで次セッション即実行可能）
- § 4.6 同根再発スキャン: 過去7日archive 0件、本セッション内候補2件（PR #231/#233、同一依存層だが独立メカニズムと判定、保留判定は不要）
- § 4.7 対症療法判定: 基準3該当 → WebSearchで外部要因（Google側DSQデフォルト値、第三者フォーラムで裏付け）を確認、恒久修正と判定
- 圧縮跨ぎの事実確認: 実施済み（上記補足参照）、1件の記載誤り（tasks.mdの古い記述）を発見し訂正済み
