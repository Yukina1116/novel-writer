# Handoff: 2026-07-06 Codexレビューで発見したP1バグ修正 + ドキュメント精度向上

- Session Date: 2026-07-05〜2026-07-06（日付跨ぎの連続セッション）
- Owner: yasushi-honda
- Status: ✅ 完了（Codexレビューで発見したP1バグ修正済み、AIモデル移行プロジェクトは実装・検証・レビューの三重の裏付けで完全クローズ）
- Previous: [2026-07-05b-task-l-prod-verification.md](./2026-07-05b-task-l-prod-verification.md)

## セッション要旨

前回ハンドオフ（Task L完了）の後、本田様から「これで確実に対応が完了したか」と3回にわたり確認を求められたことを契機に、ドキュメント記述の裏付けを段階的に強化した結果、**実際のコードバグを1件発見・修正する**という実質的な成果に至った。

1. **1回目の確認**: `git status` / `npm run lint` / `npm run test`（889/889 PASS）を再実行し、prod実機（Playwright MCP）でテストキャラクター削除済みを目視確認。ここでは問題なし。
2. **2回目の確認**: より横断的に検証した結果、PR #236で書いた「prodはCI/CDが自動デプロイする構成のため追加デプロイ操作は不要」という記述が**事実誤認**だと判明。`deploy-prod.yml`は`workflow_dispatch`専用（手動実行のみ）で、実際は本田様が過去セッションで手動デプロイ済みだった。`gh api`でイベント種別を確認して実証し、PR #238で訂正。さらに根本原因として、CLAUDE.md自体の「CI/CD: GitHub Actions → WIF → Cloud Run自動デプロイ（mainブランチ）」という記述がdev/prodを区別しておらず誤解を招く構造だったため、PR #239で明確化した。
3. **3回目の確認**: 本田様から「CodexかOpus 4.8かFable 5に見てもらった方がいい？」という提案を受け、Codex（別ベンダーのGPT系モデル）による独立レビューを実施することで合意。`codex review --base <PR#230直前のcommit>`でモデル移行プロジェクト全体（コード実装+ドキュメント）をxhigh effortでレビューした結果、**P1バグを1件発見**: `personGeneration: 'ALLOW_ADULT'`はVertex AI専用パラメータであり、APIキーモード（`USE_VERTEX_AI`未設定時）では`@google/genai` SDKがclient-sideで`personGeneration parameter is not supported in Gemini API`をrejectすることを実際にコードを実行して証明された。dev/prodは`USE_VERTEX_AI=true`固定のため実害はなかったが、CLAUDE.mdが説明する「APIキーモード」の実行経路は画像生成が100%失敗する状態だった（PR #230のモデル移行で新規混入した回帰、移行前のImagen実装は`personGeneration`を使用していなかった）。
4. TDDで再現テストを先に追加してから修正（`server/aiClient.ts`に`isVertexAiMode()`を追加、`imageService.ts`でVertexモード時のみ`personGeneration`を含めるよう変更）。続けて`/code-review`（medium、8角度並列+3件verify）を実施し、CONFIRMED指摘1件（`process.env.USE_VERTEX_AI`の判定が`aiClient.ts`と`server/index.ts`で二重管理になっていた）を追加修正。PR #240としてマージ。

**教訓**: 自己検証（self-verification）は同じ視点の見落としを繰り返しやすい。本田様の3回にわたる確認要求と、別ベンダーモデル（Codex）による独立レビューの組み合わせが、実際のコードバグの発見につながった。「テストが通っている」「実機で動いた」という確認だけでは、実行されていないコードパス（今回はAPIキーモード）の欠陥は検出できない。

## 本セッション merged PR（3件、前回ハンドオフのPR #236/#237に続く）

| PR | 内容 | 規模 | 発見経緯 |
|----|------|------|---------|
| #238 | docs(model-migration): prod自動デプロイの事実誤認を訂正 | 1 file, +1/-1 | 自己の横断的再検証（2回目の確認要求時） |
| #239 | docs(claude-md): prod CI/CDがworkflow_dispatch専用であることを明記 | 1 file, +1/-1 | 同上（根本原因側の修正） |
| #240 | fix(image-gen): personGenerationをVertex AIモード限定にする | 4 files, +28/-5 | **Codex独立レビュー（xhigh effort）で発見したP1バグ** + `/code-review`（medium）で追加発見したDRY違反1件 |

## 変更ファイル概要

- `server/aiClient.ts`: `isVertexAiMode()` を新規export（`process.env.USE_VERTEX_AI === 'true'` の単一情報源）
- `server/services/imageService.ts`: `personGeneration: 'ALLOW_ADULT'` を `isVertexAiMode()` が true の場合のみ含めるよう条件分岐化
- `server/services/imageService.test.ts`: APIキーモード用のテストケースを追加（TDD）、冗長な代入を削除
- `server/index.ts`: 起動ログの `aiMode` 判定を独自inline実装から `isVertexAiMode()` 呼び出しに統一（`/code-review` CONFIRMED指摘の修正）
- `CLAUDE.md`: prod CI/CDが`workflow_dispatch`専用であることを明記
- `docs/spec/model-migration/tasks.md`: 上記経緯を追記

## Codexレビューで見つからなかった／見送った項目

- **PLAUSIBLE判定で見送り**: `isVertexAiMode()`が毎回`process.env`を読み直す一方、`getAiClient()`はクライアントをモジュールスコープでキャッシュするため、理論上は環境変数がプロセス起動後に変化した場合に不整合が起き得る。ただし現在のコードベース・Cloud Run運用（環境変数は起動時固定）のいずれにも実際のトリガーが存在しないため、`/code-review`の検証エージェントがPLAUSIBLE（REFUTEDではないが確定的トリガーなし）と判定。過剰な構造変更（`getAiClient()`自体がモードを公開する設計への変更等）は本PRのスコープでは見送り、次に同種のVertex専用パラメータを追加する際に再検討する。

## 次のアクション（3分割）

### 即着手タスク

即着手タスクなし。AIモデル移行プロジェクト（Gemini 3.1 Flash-Lite / Nano Banana 2 Lite 移行）は、実装・dev/prod実機検証・独立コードレビュー（Codex）・自動レビュー（`/code-review`）の四重の裏付けで完全クローズ。

### 条件待ち（明示 trigger 付き）

条件待ちなし

### 却下候補（記録のみ）

| # | 項目 | 検討経緯 | 着手しない理由 | 参照条件 |
|---|------|---------|---------------|---------|
| 1 | コンテンツ生成失敗率 p≈50%への対応（Issue化/診断ログ追加/静観） | 前々セッションで統計的サンプリング（n=14）により実測、明示的にdecision-maker判断待ちとして却下済み | 起点判断はdecision-maker領分 | 本田様から「Issue化して」等の明示指示時のみ着手可 |
| 2 | 「追加生成」ボタンのクールダウンUI実装（quota=2req/分対策） | `tasks.md`リスク欄に記載済み、本田様の「すぐ簡単に追加生成させれる」意図を優先し意図的にスコープ外と判断済み | 本田様が既にスコープ外と明示判断し[Issue #232](https://github.com/Yukina1116/novel-writer/issues/232)に切り出し済み | Issue #232への明示着手指示があれば着手可 |
| 3 | `isVertexAiMode()`のcacheとlive-read不整合リスクの構造的解消（`getAiClient()`自体がモードを公開する設計への変更） | 本セッションの`/code-review`でPLAUSIBLE判定、現状トリガーなし | 過剰な構造変更を避ける（CLAUDE.md「不要な抽象化を追加しない」原則）、次にVertex専用パラメータが増えた際に再評価が妥当 | 新たなVertex専用パラメータ追加時、または実際に不整合が観測された時に再検討 |

> ⚠️ 「優先順にすすめて」等の包括指示で次セッションが動けるのは即着手タスクのみ（今回は0件）。却下候補は本田様の明示指示時のみ参照する。

## Issue Net 変化

- Close数: 0件
- 起票数: 0件
- Net: 0件

本セッションはIssue triage対象の新規作業ではなく、既存タスクの検証精度向上とバグ修正が目的だったため、Issue起票・close活動は発生しなかった。実質的な進捗は、Codexレビューで発見したP1バグの修正（本来ならAPIキーモードへの将来の移行時や別環境立ち上げ時に発覚していたはずの潜在障害を未然に防いだ）で評価すべき。

Open Issue（#232/#156/#155/#152/#147/#137）はいずれも本セッション以前からの既存事項で、本セッションの作業対象外。

## 再開可能性判定

✅ **再開可能** - ドキュメントから開発再開できます。AIモデル移行プロジェクトは完全クローズ済みで、次セッションが着手すべき明示タスクはありません。

## 最終結論

✅ **セッション終了可** — 残作業ゼロ、クリーン状態達成

- OPEN PR: 0件（#238〜#240すべてマージ・ブランチ削除済み）
- active Issue: 6件（全て本セッション以前からの既存事項、着手trigger未充足）
- Git: clean（`main`ブランチ、`origin/main`と同期済み）
- 即着手タスク: 0件 / 条件待ち: 0件 / 却下候補: 3件（いずれもdecision-maker明示指示待ち）
- 残留プロセス: なし
- 既知の blocker: なし
- テスト: 890/890 PASS、lint clean（本セッションの修正含め再確認済み）
- § 4.6 同根再発スキャン: 本セッションのPR#238/#239はdocsのみ、PR#240は`fix:`プレフィックスのバグ修正だが、Codexレビュー+`/code-review`という二重の独立検証を経ており、同一根本原因の再発というより「元々存在した見落とし」の発見。過去7日archiveとの重複なし
- 特記: 自己検証の限界と、複数ラウンドの確認要求+別ベンダーモデルレビューの組み合わせが実バグ発見に繋がった経緯を「セッション要旨」に記録済み（次回同種プロジェクトでの教訓として活用可能）
