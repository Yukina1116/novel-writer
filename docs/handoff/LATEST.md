# Handoff: 2026-07-12/13 画像生成429問題の根本原因解明・UIクールダウン方式へ移行（PR #269）→ Imagen4調査・PR #269 prod反映完了

- Session Date: 2026-07-12 〜 2026-07-13
- Owner: yasushi-honda
- Status: ✅ 完了（PR #269 dev+prod両反映済み。Imagen4調査完了・不採用確定＝現行Nano Banana 2 Lite + UIクールダウン方式を継続）
- Previous: [2026-07-12d-icon-devportal-image-error-investigation.md](./2026-07-12d-icon-devportal-image-error-investigation.md)

## セッション要旨

前セッション（2026-07-12前半）で「アプリのバグではない、一時的なクォータ超過」と判定した画像生成429エラーが、その後の実利用で複数回再発。3段階の試行錯誤を経て、UIクールダウン方式（PR #269）に到達し、さらにdev実機検証で429の**真の原因が2系統ある**ことを解明した。

### 429対応の経緯（3段階）
1. **PR #267**: サーバー側リトライ実装（3秒→8秒）→ prodで再発
2. **PR #268**: リトライ待機時間延長（10秒→20秒→40秒、合計70秒）→ prodで再発
3. **PR #269**: 本田様の提案「連続では出来ないことを書いておく方が良い」を受け、リトライを撤去しFE側クールダウンUIに転換。実際のVertex AI quota（`generate_content_image_gen_per_project_per_base_model_global` = 2 req/分/プロジェクト/モデル）をgcloudで確認し、リトライ自体が同じ1分ウィンドウの追加消費になっていた疑いを特定

### PR #269 のlarge tier必須レビューで検出・修正した2件の重大バグ
- **Codex review-diff P1**: `handleGenerate`が`await onGenerate`完了後にクールダウンを開始していたため、生成中に閉じるボタンでモーダルを閉じてすぐ開き直すと、in-flightリクエストと新規リクエストが重複発行されquotaを倍消費しうる状態だった。クールダウン開始を`await`の前に移動して修正
- **silent-failure-hunter / comment-analyzer（2系統独立指摘）**: クールダウン時間120秒が、コメント自身が引用する実測回復時間169秒より短いという指摘。本田様確認の上180秒に引き上げ

### dev実機検証で判明した429の「真の原因は2系統」（本セッション最大の発見）
Codexへのセカンドオピニオン相談で「180秒固定クールダウンは429を防ぐ保証にならない」との指摘を受け、実際に何分間隔なら安全かをdev環境で実測しようとしたところ、想定外の事実が判明した。

1. **アプリ内部のTier 1月間予算（100円/月）の枯渇**: `image/generate`は1回12円のため月8回程度で枯渇する。当初の実測（3分半〜6分半間隔でも429が3連続）はこれが原因で、**Vertex AI側のクォータとは無関係**だった。Firestoreの`usage/{uid}_{yyyymm}`ドキュメントで`quotaExceededCounts.image/generate: 3`と実測回数が完全一致し確定
2. **Vertex AI側の実際のクォータ**: 上記の発見を受け、本田様の明示承認を得て`server/middleware/withUsageQuota.ts`にdev限定・二重ガード付き（`GCP_PROJECT !== 'novel-writer-prod'`）のTier 1バイパスコードを一時追加し、devに限定デプロイして実測。**2分39秒〜4分47秒の間隔で13回連続成功、1分33秒の間隔では429が発生**という結果を得た。境界は「1分33秒〜2分39秒」の間と推定され、180秒（3分）はこれを安全にカバーする値と確認。検証後、バイパスコードは完全に削除し、devは正規のCI/CDビルド（`4ba1b54`）に復旧済み

## 本セッション merged PR（1件）

| PR | 内容 | 規模 | 種別 |
|----|------|------|------|
| #269 | fix(image): 429リトライを撤去しUIクールダウンに置換 | 5 files, +168/-92 | バグ修正（large tier） |

## 同根再発スキャン（§4.6）— ⚠️ 重要な監視事項あり

過去7日のhandoffアーカイブを検索した結果、**2026-07-05のhandoff「model-migration-quota-redesign」で「dev実機で最後の成功から15分以上429が継続」「6回失敗後、約2時間のquota回復待ちで別プロンプトが成功」という観測**が記録されていた。これは本セッションの実測（13回連続成功、境界は1分33秒〜2分39秒）と一見矛盾する。

**上流の真のroot cause仮説（3つ）**:
1. Vertex AI側のクォータは`gcloud alpha services quota list`の公称値（2 req/分）とは別に、Dynamic Shared Quota（需要に応じて変動する共有容量）の影響を受けており、時間帯・全体負荷によって実際の許容範囲が大きく変動する（Codexのセカンドオピニオンでも同じ仮説が最有力とされた）
2. 7/5時点の観測は本当にVertex AI側の長時間の制限だった可能性が高い（Tier 1予算枯渇なら「来月まで」絶対回復しない設計のため、2時間で回復した事実と整合しない）
3. 今回の13回連続成功は「たまたま空いていた時間帯」だった可能性があり、180秒という値の恒久的な安全性を保証するものではない

**もう1件同根が出るとしたらどこか**: prodで複数ユーザーが同時にアクセスする、またはGoogle側のリソースが逼迫する時間帯に、180秒のクールダウンでも429が再発する可能性がある。その場合は「UI側の対策では不十分、サーバー側の共有状態管理（既知の限界としてPR説明文に明記済み）が必要」という結論に至る可能性が高い。

## 対症療法判定（§4.7）

判定基準3（同症状の修正PRが過去30日以内に複数：#266→#267→#268→#269）に該当。ただしCodexセカンドオピニオン内でのWeb Search（Vertex AI公式ドキュメント参照）とgcloud quota実測・Firestore実データ確認・13回のdev実機検証という構造的検証を実施しており、対症療法ではなく根本原因（Tier 1予算枯渇という新発見の経路＋Vertex AI側の変動するDSQ）の特定に至っている。ただし上記の同根再発スキャンで判明した通り、180秒という値自体はVertex AI側の変動要因に対する理論保証ではなく実測ベースの安全マージンである点はPR説明文にも明記済み。

## Issue Net 変化

- Close数: 0件
- 起票数: 0件
- Net: 0件（今回の発見はtriage基準の「実害」「再現バグ」には該当せず、PR説明文・本handoffへの記録で対応）

## 2026-07-13 追記: Imagen4調査結果 + PR #269 prod反映完了

### Imagen4調査結果（即着手タスク#1、完了）

`gcloud alpha services quota list --service=aiplatform.googleapis.com`（asia-northeast1実測）で、Imagen4系（fast/standard/ultra全ライン）のクォータは`online_prediction_requests_per_base_model` = **20 req/分**と判明。現行Nano Banana 2 Lite（`generate_content_image_gen_per_project_per_base_model` = 2 req/分）の**10倍**で、数字だけ見れば魅力的だった。

しかし公式ドキュメント（`docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/4-0-{generate,fast-generate,ultra-generate}-001`、およびVertex AI release notes）を個別に直接確認したところ、**Imagen4は`imagen-4.0-{,fast-,ultra-}generate-001`全ラインが2026年3月24日付で公式に廃止発表済み、Discontinuation date 2026年6月30日を経過している**ことが判明（移行推奨先: `gemini-2.5-flash-image`、現行モデルより旧世代）。検索結果に出た`imagen-4.0-generate-preview-06-06`という別バージョンもcurlで確認したところ301リダイレクトで同一の廃止対象ページに転送されるだけで、抜け道は存在しない。

**結論: Imagen4への切替は不採用**。10倍クォータは公式に廃止された製品ラインの数字であり、実生成テスト（速度・成功率比較）は実施する意味がないため見送った。現行のNano Banana 2 Lite + UIクールダウン方式（PR #269、180秒）を継続するのが現時点の最適解と判断（本田様確認済み、「最適解で進めましょう」の指示を受けPR #269 prod反映を実施）。

料金（$0.02〜$0.06/画像という数字）は複数の二次情報源はあったが、公式pricing pageが長大でWebFetchツールがtruncateし一次ソースでの裏取りはできなかった。ただし廃止済みモデルのため実務上の影響はない。

### PR #269 prod反映（条件待ち#1、完了）

本田様の明示指示「最適解で進めましょう。prod反映ができたら」を受け、`gh workflow run deploy-prod.yml --ref main`を実行。

- Workflow run: [29212549257](https://github.com/Yukina1116/novel-writer/actions/runs/29212549257)（test job → deploy job、共に success）
- 反映確認: `gcloud run services describe novel-writer --project=novel-writer-prod --region=asia-northeast1 --format="value(spec.template.spec.containers[0].image)"` → イメージタグ `1e1b614...`（mainのHEAD、PR #269 + #270まで反映）と一致確認済み

## 次のアクション（3分割）

### 即着手タスク

なし（Imagen4調査は完了・PR #269 prod反映も完了）。

<details>
<summary>完了済みタスク（参考、折りたたみ）</summary>

| # | タスク | ROI | 想定工数 | 完了条件 | 関連ファイル / コマンド |
|---|--------|-----|----------|---------|------------------------|
| 1 | ~~Imagen4モデルでの画像生成クォータ・生成体験を調査し、Nano Banana 2 Lite（現行）と比較~~ ✅完了(2026-07-13) | 本田様から明示指示「imagen4だったらこんなにも不便なのか、確認してください」。現行モデルはTier 1予算(100円/月=8回程度)+Vertex AIクォータ(2 req/分、実測境界1分33秒〜2分39秒)の二重の不便さがある | 30-60分（gcloud quota確認+実際の生成テスト） | Imagen4の`gcloud alpha services quota list`でのクォータ値確認、可能であれば実際に数回生成して体感速度・成功率を比較、現行モデルとのトレードオフ（画質・速度・コスト・クォータ）を本田様に報告 | `gcloud alpha services quota list --service=aiplatform.googleapis.com` |

</details>

### 条件待ち（明示 trigger 付き）

| # | 項目 | trigger（充足条件） | 充足時のタスク | 充足確認方法 |
|---|------|------------------|--------------|------------|
| 1 | ~~PR #269（429リトライ撤去+UIクールダウン）のprodへの反映~~ | ✅完了(2026-07-13)。本田様の明示指示「最適解で進めましょう。prod反映ができたら」 | `gh workflow run deploy-prod.yml --ref main`実行、run [29212549257](https://github.com/Yukina1116/novel-writer/actions/runs/29212549257)成功、イメージSHA `1e1b614`一致確認済み | 完了 |
| 2 | prodで429が再発した場合の調査 | 実際の429再発報告 | 同根再発スキャンで記録した仮説（DSQ変動）を優先的に検証。Cloud Loggingで429本文（`Quota exceeded`か`Resource exhausted, please try again later`か）を確認し、明示クォータ超過か共有容量不足かを判別 | `gcloud logging read` |
| 3 | Issue #232の次の一手（可視化/サブ上限/コンバージョン導線） | 計測データが一定量蓄積された後の本田様の方針判断 | Issue #232本文の4論点から選択、`/impl-plan`で計画立案 | `gh issue view 232` |
| 4 | Issue #156/#152/#147/#137 | 各Issue本文記載のtrigger | 各Issue本文参照 | `gh issue view <N>` |
| 5 | Issue #243 対応候補(b)（安全フィルタ拒否時の専用エラーメッセージ分岐、PR #266で一部実装済み）/(c)（追加検証） | 本田様の優先度判断 | Issue #243本文の対応候補(b)(c)から選択、`/impl-plan`で計画立案 | `gh issue view 243` |

### 却下候補（記録のみ、前セッションから引き継ぎ）

| # | 項目 | 検討経緯 | 着手しない理由 |
|---|------|---------|---------------|
| 1 | サーバー側での共有状態管理（Firestore等）によるプロジェクト全体のクォータ制御 | Codex review-diff P1指摘、PR #269の既知の限界に明記済み | 複数タブ/複数ユーザーの合算超過防止には必要だが、現状の利用規模では過剰実装の可能性。本田様の明示指示なし |
| 2 | `characterService.ts`/`ImageGenerationModal.tsx` の `full body`/`solo`/`simple white background` ハードコード | 前々セッションのExplore agent二次発見 | 「AI立ち絵生成」機能の性質上、意図的な仕様である可能性が高くROI不明確 |
| 3 | 未成年設定キャラクターのAI立ち絵生成が構造的に失敗する制約 | PR #266で`personGeneration: ALLOW_ALL`に変更し一部緩和済み | 残る制約はGoogle Prohibited Use Policyによる安全フィルタの正常動作であり、AIが「直すべき」と判断すること自体が越権 |

> ⚠️ 「優先順にすすめて」等の包括指示で次セッションが動けるのは即着手タスクのみ（今回は1件、Imagen4調査）。

## デプロイ状況

- dev: `1e1b614`（PR #269 + #270マージ後の正規CI/CDビルド）に一致、CI（Deploy to Cloud Run）成功確認済み
- prod: `1e1b614`に一致（2026-07-13、workflow run [29212549257](https://github.com/Yukina1116/novel-writer/actions/runs/29212549257)で反映完了、`gcloud run services describe`で実イメージSHA確認済み）。**dev/prod完全同期**

## 再開可能性判定

✅ **再開可能** - ドキュメントから開発再開できます。即着手タスクなし（Imagen4調査・PR #269 prod反映とも完了）。

## 最終結論

✅ **セッション終了可** — 残作業ゼロ、Git clean、dev/prod完全同期済み

- OPEN PR: 0件（#269マージ・ブランチ削除済み）
- active Issue: 5件（すべてdecision-maker明示指示待ちまたはtrigger待ち、Net 0）
- Git: clean（`main`ブランチ、`origin/main`と同期済み、`1e1b614`）
- 即着手タスク: 0件（Imagen4調査・PR #269 prod反映とも完了） / 条件待ち: 4件（元5件から#1解消） / 却下候補: 3件
- 同根再発スキャン: **⚠️ 監視事項あり** — 2026-07-05のhandoffに記録された「15分〜2時間の429継続」観測と、本セッションの「180秒で十分」という結論の間に未解消の緊張関係。180秒はVertex AI側の変動するDynamic Shared Quotaに対する理論保証ではなく実測ベースの安全マージン（PR説明文に明記済み）。prodで429が再発した場合は条件待ち#2の手順で調査すること
- 対症療法判定: 基準3該当（同症状PRの連続）→ 実測・Codexセカンドオピニオン・Firestore実データ確認による構造的検証を実施、対症療法ではなく根本原因（Tier 1予算枯渇という新発見＋Vertex AI側DSQ変動）の特定と判定
- 残留プロセス: なし
- テスト: CI(test) PASS（PR #269）、`npx vitest run` 933/933 PASS、lint（tsc --noEmit）clean
- 既知の blocker: なし（prod反映は本田様の意図的な見送り判断、blockerではなく条件待ち）
