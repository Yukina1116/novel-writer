---
updated: 2026-07-13
---

## 現在のミッション
開発者アカウント（本田様）をTier 1月間予算（100円/月）から恒久的に免除し、prodでのAI機能テストが予算枯渇でブロックされないようにする。

## 背景・why
本田様がprodで頻繁にAI機能（特に画像生成）をテストする際、Tier 1月間予算（100円/月=10000sen）を使い切ってしまう事態が繰り返し発生している。2026-07-13セッションで1回限りのGitHub Actions workflowを都度作成してFirestoreのusageドキュメントを手動リセットする対応（PR #273/#274）を行ったが、ADCアカウント不一致・IAM権限不足のトラブルシューティングを含め手順が重く、次回以降の再発に備えて恒久的な仕組みが必要と判断した。Codexへのセカンドオピニオンを得て、Tier概念（課金プラン）とは分離した「開発者override」として実装する設計に決定（本田様承認済み）。

**設計変更 (2026-07-13、`/code-review high` 指摘反映)**: 当初 `reserve()` の `limit` を `number | undefined` にし `undefined` = 完全無制限とする設計だったが、code review で「暴走ループ・リトライバグ等への歯止めが一切ない」と CONFIRMED 指摘を受け、本田様の判断で「高いが有限の上限」方式に変更した。`usageConfig.ts` に `DEVELOPER_OVERRIDE_LIMIT_SEN = 100_000`（Tier 1 の10倍 = 1000円相当）を追加し、`reserve()` のシグネチャは `limit: number` のまま維持（undefined対応は不採用・巻き戻し済み）。あわせて (a) override発動時に `logger.info` を出す（サイレント発動の監査性欠如指摘への対応）、(b) `deploy-prod.yml` の `--set-env-vars` 値をダブルクォートで囲む（secret値に空白が入ると flags パーサーがトークン分割してデプロイが壊れるリスクへの対応）も実施済み。

## 完了の定義
- `npm run test` が全件PASSする（新規テストケース含む、証明: コマンド実行結果が `Tests X passed (X)` で失敗0件）
- `npm run lint` がPASSする（証明: `tsc --noEmit` がエラーなしで終了）
- `.github/workflows/deploy-prod.yml` に `DEVELOPER_UIDS` 環境変数が `gcloud topic escaping` の区切り文字構文（ダブルクォート囲み）で追加され、prodへの実デプロイ後 `gcloud run services describe novel-writer --project=novel-writer-prod --region=asia-northeast1 --format="value(spec.template.spec.containers[0].env)"` でカンマを含む値が破壊されずに反映されていることを確認
- 実装PRがレビュー（`/code-review high`、4件CONFIRMED/PLAUSIBLE指摘を全て反映済み）を経てmainにマージされ、prodへ反映される
- 対象uid（本田様）でprodのAI機能（image/generate等）を呼び出してもクォータ超過エラーが発生しないことを実機確認

## 進行中のtasks
- [x] A: `usageService.ts` の `reserve()` — `limit: number | undefined` 化を検討したが code review 指摘で巻き戻し、`limit: number` のまま維持（DEVELOPER_OVERRIDE_LIMIT_SEN 方式に変更）
- [x] B: `usageService.test.ts` — limit undefined 関連テストは不要になったため削除
- [x] C: `developerOverride.ts` 新規作成（DEVELOPER_UIDS環境変数パース + trim済みSet完全一致）
- [x] D: `developerOverride.test.ts` 新規作成（未設定/空/空白/連続カンマ/複数uid/部分文字列誤マッチ防止）
- [x] E: `withUsageQuota.ts` で developerOverride を呼び出しDEVELOPER_OVERRIDE_LIMIT_SENに反映 + override発動ログ追加
- [x] F: `withUsageQuota.test.ts` に開発者override時の回帰テスト追加
- [x] G: `deploy-prod.yml` に DEVELOPER_UIDS を `^;^` 区切り文字構文（ダブルクォート囲み）でGitHub Secrets経由追加
- [x] 実装後 `/safe-refactor` → `/code-review high`（Evaluator分離対象、4件CONFIRMED/PLAUSIBLE指摘を全て反映）+ `/review`（PR diff再確認で古いコメント発見・修正）+ `codex review-diff`（重大な問題なしと評価）
- [x] GitHub Secrets `PROD_DEVELOPER_UIDS` の登録
- [x] PR #275 マージ・prod反映（`gh workflow run deploy-prod.yml`、イメージSHA `7e2a19c` 一致確認済み）
- [x] `gcloud run services describe` で `DEVELOPER_UIDS` を含む全環境変数が破壊されずに反映されていることを確認（`^;^` 区切り文字構文が正常動作、他5つの既存環境変数も無事）
- [ ] 対象uid（本田様）でprodのAI機能（image/generate等）を呼び出してもクォータ超過エラーが発生しないことの実機確認（本田様ご自身の操作が必要、AIはIDトークンで代行不可）

## 🔄 中断点（in-flight）
なし（残るタスクは本田様ご自身によるprod実機確認のみ。DEVELOPER_UIDSにはまだ単一uidのみ設定のため、カンマ区切り複数uidでの区切り文字構文検証は将来複数アカウント追加時に別途実施）
