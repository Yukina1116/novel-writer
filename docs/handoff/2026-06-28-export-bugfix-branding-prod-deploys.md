# Handoff: 2026-06-28 export bug fix + branding + 構成順変更、prod 3 連続反映

- Session Date: 2026-06-28 (前 handoff #218 / 2026-06-21 セッション終了後の新セッション)
- Owner: yasushi-honda
- Status: ✅ クリーン、executor 領分の作業ゼロ
- Previous: [2026-06-21c-policy-update-completed.md](./2026-06-21c-policy-update-completed.md)

## セッション要旨

本田様が dev 上で実機操作中に発見した **HTML 書き出し関連 2 件のバグ** と、**正式ブランド画像の導入** を 1 セッションで連続対応し、本日中に **prod へ 3 リリース**まで完遂。

最後の PR #221 では `/codex review` をスキップする代わりに **Playwright MCP で AI が E2E 自動検証** を実施 (本田様明示指示)。fixture project を IndexedDB に注入 → 書き出しボタン操作 → Blob constructor を spy で capture → section 順序 6/6 が期待通りであることを確認 → cleanup まで AI 完結。

途中 PR #220 では Claude 内部 review が PASS だったが `/codex review --effort high` で High issue (アプリ UI が dark 固定なのに OS prefers-color-scheme 連動だと低コントラスト) を発見、in-app は dark 固定化へ修正、Codex セカンドオピニオンの構造的価値が再確認された。

## 本セッション merged PR (3 件)

| PR | 内容 | 種別 | prod tag |
|----|------|------|----------|
| #219 | fix(export): HTML 書き出しでキャラの「性格」が説明文に混入する fallback を除去 | bug fix | `prod-20260628-1219-d6802ac` |
| #220 | feat(branding): logo / favicon 追加 + Header / ProjectSelection ロゴ画像化 (light/dark 自動切替) | feature | `prod-20260628-1304-737dc2b` |
| #221 | fix(export): HTML 書き出しの構成順を「題名→登場人物→世界観・用語集→目次→本文→あとがき」に変更 | bug fix | `prod-20260628-1336-bde4047` |

## 本セッション追加成果

| 項目 | 結果 |
|------|------|
| キャラ書き出し説明文の personality 混入バグ修正 | `char.exportDescription \|\| char.personality` fallback を削除、`<p>` ごと省略 |
| 登場人物 / 世界観 fixture プロジェクトの safety 設計 | Playwright fixture を IndexedDB に注入 + 検証後削除、本田様の本物 project (PR183/PR185) は touch なし |
| pure function 化による testability 向上 | `buildCharacterAppendixHtml` + `composeExportSections` を `utils/htmlExport.ts` に extract |
| Codex セカンドオピニオン構造的価値の再確認 | PR #220 で in-app dark 固定不整合を発見、UI 状態 vs OS theme の整合性は Claude が見落とした |
| 本日 prod 3 リリース | bug fix → feature → bug fix の混在運用、env_var_drift 再発防止 C-1〜C-5 すべてクリア |
| Playwright MCP による AI 完結 E2E 検証パターン確立 | Blob spy + fixture inject 経由で本田様の手動検証なしに section 順序検証 |

## 変更ファイル (本セッション合計 8 件 / +753-25 lines)

### PR #219 (3 files)
- `utils/htmlExport.ts` (新規、+45) — `escapeHtmlForExport` + `buildCharacterAppendixHtml` pure function
- `utils/htmlExport.test.ts` (新規、+148, 16 tests) — regression: personality 非混入 / XSS escape pin
- `store/dataSlice.ts` — exportHtml 内のキャラ section block を helper 呼び出しに置換

### PR #220 (7 files)
- `public/branding/icon-light.svg` / `icon-dark.svg` / `logo-light.svg` / `logo-dark.svg` (新規 4 file)
- `index.html` — favicon link 3 行追加 (prefers-color-scheme で light/dark + fallback dark)
- `components/ProjectSelectionScreen.tsx` — `<h1>小説らいたー</h1>` を `<img src="/branding/logo-dark.svg">` に置換、h1 fallback styling 復元
- `components/Header.tsx` — `<Icons.BookIcon>` × 2 を `<img src="/branding/icon-dark.svg" alt="">` に置換

### PR #221 (4 files)
- `utils/htmlExport.ts` — `ExportSections` interface + `composeExportSections` pure function 追加
- `utils/htmlExport.test.ts` — 順序 pin の test 6 件追加
- `store/dataSlice.ts` — section を変数化 (coverSection / tocSection / contentSection / worldsSection / afterwordSection) + composeExportSections 経由で結合
- `store/dataSlice.exportHtml.test.ts` (新規、+196, 6 integration tests) — Blob spy + document/URL stub 経由で dataSlice 全体の wiring + 順序を assert

**触らないもの (規律遵守)**:
- 世界観 `world.exportDescription || world.longDescription` fallback (`longDescription` は名称・意味的に妥当な fallback、PR #219 で scope 外確認)
- dataSlice 内 local `escapeHtml` と utils 側 `escapeHtmlForExport` の二重化 (将来 cleanup 候補、本 PR scope 外)
- 既存 docs / ADR / handoff / runbook (本セッションの変更内容は本 handoff にのみ反映)

## Phase 進捗 (前 handoff #218 から変化なし)

| Phase | 状態 |
|-------|------|
| Phase 1-3 (インフラ + deploy + 運用フロー) | ✅ |
| Phase 4 段階 1 (起草) | ✅ |
| Phase 4 段階 2 GO-3 (PITR) | ✅ |
| Phase 4 段階 2 GO-4 (監視) | ✅ |
| Phase 4 段階 3 (SLO Accepted + 手動 PITR 演習) | ⏳ Phase 5 公開後 real traffic 観測時 |
| GO-1 法務 | ✅ 方針変更: Tier 2 開始時の前提に移行済 |
| GO-2 課金クォータ | ⏳ 本田様判断 |
| GO-5 SLO Accepted | ⏳ 本田様レビュー → AI 更新 PR |
| Phase 5 公開実行 GO-6 | ⏳ GO-3〜GO-5 + 本田様 GO |

## §4.5 グローバル memory scope チェック

本セッションは `~/.claude/memory/` 変更なし、本田様の Playwright MCP 検証 + Codex セカンドオピニオン体験は **教訓 memory 化候補**だが、グローバル memory への自動書き込みは越権のため見送り。本田様判断で書き起こす場合は次セッションで明示指示を待つ。

候補メモ (本田様判断時の起点用):
- Codex セカンドオピニオンが Claude 内部 review の見落としを補う構造的価値 (PR #220 dark 固定不整合発見)
- Playwright MCP で fixture を IndexedDB 注入 + Blob spy で書き出し検証する E2E パターン
- 本田様の本物 IndexedDB データを touch しない fixture safety 設計

## §4.6 同根再発スキャン

### 本セッション内同根候補
- fix PR 2 件 (#219 / #221) が **共に `store/dataSlice.ts:exportHtml` + `utils/htmlExport.ts` を touch**
- ドメイン: HTML 書き出し機能

### root cause 分析
- #219: `char.exportDescription || char.personality` の **意図しないフィールド連結 fallback**
- #221: section 順序の **UX 設計選択** (本文先頭 vs 設定資料先頭)
- 同じドメインだが root cause は構造的に異なる (fallback バグ vs 順序設計選択)

### 仮説 3 件 (handoff 規範に従い列挙)
1. HTML export 機能の元設計時に UX レビューが不足していた (ユーザーが使ってみて初めて不満が浮上)
2. 「設定資料 (キャラ/世界観) と本文の関係」について明確な仕様がなく、実装者の暗黙判断で決まっていた
3. exportHtml は長らくメンテされておらず、累積負債が本日まとめて顕在化

### 次に同根 1 件出るとしたらどこか
- 表紙位置 / 目次有無 / フォント設定 / 印刷スタイル等の追加要望
- 別フォーマット (EPUB / PDF) 機能要望
- 一括書き出し (複数 project) 機能要望

### 過去 7 日 handoff スキャン
- `docs/handoff/archive/` ディレクトリは存在しない (handoff/ 直下フラット運用)
- 直近 handoff (`2026-06-21*` × 3 + `2026-06-04*` 以前) で HTML export 関連の記録なし
- 候補ヒット 0 件 → 同根は本セッション内 2 件 + 過去なし、判定: **「同根候補あり、ただし root cause は異なる + 過去再発なし、対症療法判定へ進める」**

## §4.7 対症療法判定

| # | 基準 | 該当? | 根拠 |
|---|------|------|------|
| 1 | retry / timeout / fallback / エラー文言修正のみで外部要因調査ログなし | ❌ | PR #219/#221 はロジック・設計を直接修正 (retry 等の防御策ではない) |
| 2 | 「なぜ今起きたか」の WebSearch / changelog 確認ログなし | ❌ | UX 修正で外部依存非関連 (pure な内部設計修正)、WebSearch 不要 |
| 3 | 同症状の修正 PR が過去 30 日以内に 1 件以上ある | ❌ | 過去 30 日に export 関連 fix PR なし、本セッション 2 件のみ |
| 4 | 修正後の動作確認が unit / smoke のみ | ❌ | unit 6 + integration 6 + Playwright MCP E2E 1 (実機 fixture 注入 + Blob spy + section 順序 assert + cleanup) |

**判定: 該当 0 件、対症療法ではない**。両 PR は構造的根本修正 + regression test 追加。

## §2.4 / §2.5 次のアクション (3 分割)

前 handoff #218 と内容はほぼ同じ。条件待ち #6 (M5 課金実装) と #7 (Phase 5 公開) を含む 7 件はそのまま継承。本セッションで完了したものは反映済。

### 即着手タスク

**0 件**。executor 領分の作業ゼロ。

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger | 充足時のタスク |
|---|------|-------|---------|--------------|
| 1 | A1-A5 policy の MQL ratio refactor (絶対 rate → X%) | B 修正 | Phase 5 公開後 1 ヶ月の real traffic + 本田様「ratio refactor を進める」 | A1 (5% rate) / A2 (50% rate) / A3 (10% rate) の MQL 化、policy YAML 更新 |
| 2 | Phase 4 段階 3 (SLO Accepted 化 + 手動 PITR 演習 + 通知到達確認) | A/B 混在 | Phase 5 公開後 1 ヶ月の real traffic + 本田様「段階 3 を進める」 | runbook prod-slo.md Status 変更、prod-pitr.md 演習履歴追記、prod-monitoring.md 通知到達確認追記 |
| 3 | GO-1 法務 (Tier 2 開始時) | A housekeeping | 本田様「Tier 2 着手 + 法務確認を進める」 | 一般的な最低限の自己整備確認、必要なら顧問弁護士、`LEGAL_REVIEW_REQUIRED` 削除、tracker Status 更新 |
| 4 | GO-2 課金クォータ判断 | C 起点 | 本田様判断 (Tier 2 着手時) | phase4-tasks.md §GO-2 申請 draft を本田様が転用 |
| 5 | GO-5 SLO Accepted | A housekeeping (review→更新) | 本田様「SLO Accepted」明示報告 | runbook prod-slo.md Status 変更 PR |
| 6 | M5 課金実装着手 (PSP/MoR 比較選定 + Subscription + Webhook) | C 起点 | 本田様「M5 着手 + 決済基盤 X で決定」 | impl-plan → 実装、ADR-0001 2026-06-21 更新の Roadmap M5 に従う |
| 7 | Phase 5 着手 (Tier 0/1 公開実行) | C 起点 | 本田様「Phase 5 着手 GO」 (GO-3/4 ✅ + GO-5 ✅ + GO-6) | phase5-tasks.md 起草、公開告知 + KPI 追跡開始 |
| 8 | promptSafety enhancement Issue 5 件 (#137/147/152/155/156) | B/C 混在 | 本田様明示「Issue #XX 着手」 | 各 Issue 個別対応、triage 基準再評価 |
| 9 | dataSlice.ts 内 local `escapeHtml` と `escapeHtmlForExport` の二重化統合 | A housekeeping | 本田様「export ロジック cleanup を進める」 | dataSlice 側を helper に統一 |

### 却下候補 (記録のみ・包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | dev-monitoring-setup.yml で先行検証 | B 起案 | PR #208 で「dev workflow は含めない」と明記 |
| 2 | dev-pitr-drill.yml の手動 trigger | A/B 中間 | 段階 3 で手動 Console 演習に方針変更済 |
| 3 | A1-A5 placeholder filter refactor (W7/W8 log-based metric) | B 起案 | 段階 2/3 で実機 traffic 観測してから refactor 予定 |
| 4 | Slack/SMS 通知 channel 追加 | C 起点 | Phase 4 NG リスト記載、Phase 5+1 ヶ月後再評価 |
| 5 | docs/legal/*.md (履歴用) を public/legal と同期 | A housekeeping | CLAUDE.md「必要なら docs/legal にも反映」が任意 |
| 6 | グローバル memory への教訓反映 (Codex セカンドオピニオン価値 / Playwright fixture inject パターン) | A housekeeping | 本田様明示指示時のみ書き起こす、AI 自走では越権 |
| 7 | Header の app icon サイズが小さく潰れて見える視認性改善 | C 起点 | 本セッション Playwright 検証時の所感、本田様明示指示なし |
| 8 | SVG ファイルの SVGO 圧縮 (約 50% 削減余地、Codex Low) | A housekeeping | 本田様提供の正本 SVG をビルド時加工は AI 領分外 |
| 9 | 世界観 longDescription fallback の意味的妥当性再評価 | B 検出 | 過去 3 PR 連続で scope 外判定済、本田様明示時に再評価 |

## §7.1 Issue Net 変化

- **close 数: 0 件** (PR は Issues ではない、PR description に Closes #XX 記載なし)
- **起票数: 0 件** (review agent 指摘は PR コメントで処理、triage 基準未満で却下)
- **Net: 0 件**

理由: 本セッションの 3 PR はすべて in-flight で resolve、Issue 化対象なし。Open Issues 5 件 (promptSafety enhancement) は前 handoff #218 から継承、本セッションで touch なし。

## CI / 残留プロセス

- CI: 最新 main `bde4047` / Deploy to Cloud Run (prod) / `success` (3m30s、12:36 完了)
- 残留プロセス: ✅ なし

## 本日 prod 反映 3 リリースサマリ

| 時刻 | tag | revision | 内容 |
|------|-----|----------|------|
| 12:19 | `prod-20260628-1219-d6802ac` | `novel-writer-00003-qmt` | PR #219 export bug fix (キャラ personality 混入除去) |
| 13:04 | `prod-20260628-1304-737dc2b` | `novel-writer-00004-mgp` | PR #220 branding (logo/favicon, dark 固定) |
| 13:36 | `prod-20260628-1336-bde4047` | `novel-writer-00005-gr5` | PR #221 export 構成順変更 (登場人物→世界観→目次→本文→あとがき) |

env_var_drift 再発防止 (`GCLOUD_PROJECT=novel-writer-prod` / `USE_VERTEX_AI=true`) は 3 回とも事後確認済。Auth middleware retest (POST /api/users/init → 401) も 3 回 PASS。

## §8 最終結論

### ✅ **セッション終了可** — HTML export 関連 2 件 bug fix + branding feature + Playwright MCP E2E 自動検証 + 本日 prod 3 リリース完全クローズ

#### 根拠

- OPEN PR ゼロ (本セッション計 3 件 全 merge 済: #219 / #220 / #221)
- main clean (origin/main と同期、最新 commit `bde4047`)
- 即着手タスク = 0 件 / 条件待ち = 9 件 (全本田様 trigger)
- 残留プロセスなし
- §4.5 グローバル memory scope: 変更なし、スキップ
- §4.6 同根再発スキャン: 同ドメイン 2 件あるが root cause 異なる、過去 30 日同種なし、対症療法判定へ進める
- §4.7 対症療法判定: 4 基準すべて該当なし、両 PR とも構造的根本修正 + regression test
- Issue Net 変化: 0 件

#### 推奨次セッション action

1. `/catchup` で状態確認 → 残作業ゼロを確認
2. 本田様判断項目があれば順次対応 (条件待ち #1〜#9 のいずれか)
3. 特に「Phase 5 公開実行 GO-6」「M5 課金実装着手」のいずれかが次の主要マイルストーン
4. もし「Codex セカンドオピニオン価値」「Playwright MCP E2E パターン」を memory 化するなら本田様明示指示後に起票

本セッションは本日合計 3 回の prod deploy + Playwright MCP の自動 E2E 検証で executor として走り切った。次セッションは静的状態 (clean) からの再開で問題なし。
