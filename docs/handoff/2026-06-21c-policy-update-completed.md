# Handoff: Phase 4 段階 2 GO-4 完全クローズ + 方針変更 3 軸の docs 反映完了

- Session Date: 2026-06-21 (前 handoff #216 セッション継続、PR #217 追加)
- Owner: yasushi-honda
- Status: ✅ クリーン、executor 領分の作業ゼロ
- Previous: [2026-06-21b-go4-complete.md](./2026-06-21b-go4-complete.md)

## セッション要旨

前 handoff #216 で「Phase 4 段階 2 GO-4 完全クローズ + memory 化候補 3 件を次セッション提示予定」と起票したが、その後本田様確認で **「課金実装のベストプラクティス調査」→「方針変更を docs に反映」** の追加指示が発生し、本セッション内で完結させた (PR #217)。

これにより方針変更 3 軸 (GO-1 軽量化 / MoR 最適解 / 有料化未定) は docs (CLAUDE.md / ADR-0001/2/3 / phase4-tasks.md / spec m1/m7 / public/legal) に反映済で、次セッション以降の AI は新方針で動ける状態。

## 本セッション merged PR (#216 後の追加分)

| PR | 内容 | 種別 |
|----|------|------|
| #217 | docs(policy): 2026-06-21 方針変更反映 (GO-1 軽量化 + MoR 最適解 + 有料化未定) | docs |

(PR #210-#215 は前 handoff #216 で記録済)

## 本セッション追加成果 (#216 以降)

| 項目 | 結果 |
|------|------|
| 2026 年 6 月時点課金ベストプラクティス調査 | WebSearch 3 回実施、Stripe (PSP) vs MoR (Paddle / Lemon Squeezy / Polar 等) 比較整理。個人開発 + 小単価では MoR が業界推奨 |
| 法務確認方針の軽量化 | Tier 0/1 は LEGAL_REVIEW_REQUIRED stub のまま公開可、顧問弁護士確認は Tier 2 開始時の前提条件に移行 |
| 課金実装方針の変更 | Stripe 単独前提 → M5 着手時に PSP/MoR を比較選定 |
| 本番 prod URL 確定 | https://novel-writer-df263ic6wa-an.a.run.app/ |

## 変更ファイル (9 件、PR #217 内訳)

| ファイル | 変更内容 |
|---------|---------|
| CLAUDE.md | 法務文書 self-host / Schema 説明 (MoR 反映) |
| docs/adr/0001-local-first-architecture.md | Tier 2 定義 / 開放する課題 (2026-06-21 更新追記) / Roadmap M5/M7-α/M7-β |
| docs/adr/0002-dev-prod-deploy-flow.md | 法務確認 MUST → 緩和注記 (2 箇所) |
| docs/adr/0003-public-launch-operations.md | 同上 (2 箇所) |
| docs/spec/prod-migration/phase4-tasks.md | §GO-1 tracker + 進め方 + Phase 5 GO 影響、Phase 5 GO チェック GO-1 trigger |
| docs/spec/m1/tasks.md | Stripe 連携 → 課金連携 |
| docs/spec/m7/acceptance-criteria.md | Stripe 確定後 → 課金実装確定後 (2 箇所) |
| public/legal/tokushou.md | Stripe 言及 4 箇所を「Stripe / MoR 比較選定」に汎化 |
| public/legal/terms-of-service.md | Tier 2 詳細記述 + 末尾 TODO (2 箇所) |

**触らないもの (規律遵守)**: `docs/handoff/*.md` (過去事実記録) / ADR 過去 PR 完了履歴記述 / `docs/legal/*.md` (履歴用、必要なら次セッション本田様判断で同期)

## Phase 進捗 (前 handoff #216 から変化なし)

| Phase | 状態 |
|-------|------|
| Phase 1-3 (インフラ + deploy + 運用フロー) | ✅ |
| Phase 4 段階 1 (起草) | ✅ |
| Phase 4 段階 2 GO-3 (PITR) | ✅ |
| Phase 4 段階 2 GO-4 (監視) | ✅ |
| Phase 4 段階 3 (SLO Accepted + 手動 PITR 演習) | ⏳ Phase 5 公開後 real traffic 観測時 |
| GO-1 法務 | ✅ **本セッション方針変更**: Tier 2 開始時の前提に移行、Phase 5 ブロッカーから外す |
| GO-2 課金クォータ | ⏳ 本田様判断 |
| GO-5 SLO Accepted | ⏳ 本田様レビュー → AI 更新 PR |
| Phase 5 公開実行 GO-6 | ⏳ GO-3〜GO-5 + 本田様 GO |

## §4.5 グローバル memory scope チェック

本セッションは `~/.claude/memory/` 変更なし。スキップ。

**注**: 前 handoff #216 で「教訓 memory 化候補 3 件 (gcloud spec cross-check / workflow dry-run / consecutive failure 拡張)」を次セッション提示予定としていたが、本セッションでは memory 化せず **プロジェクト内 docs (PR #217 で反映済) に閉じる方針** に変更。グローバル memory は触らず。

## §4.6 同根再発スキャン

本セッション #216 以降の追加 PR は #217 のみで、これは fix ではなく方針変更反映。前 handoff #216 で記録済の 5 連続 fix (#210-#214) + GO-3 4 連続 fix の同根分析は変化なし。

## §4.7 対症療法判定

PR #217 は方針変更反映で対症療法判定の対象外。前 handoff #216 の判定 (基準 3 のみ部分該当、対症療法ではない) から変化なし。

## §2.4 / §2.5 次のアクション (3 分割)

前 handoff #216 と内容は同じだが、条件待ち #6 が完了したので削減。

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

### 却下候補 (記録のみ・包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | dev-monitoring-setup.yml で先行検証 | B 起案 | PR #208 で「dev workflow は含めない」と明記 |
| 2 | dev-pitr-drill.yml の手動 trigger | A/B 中間 | 段階 3 で手動 Console 演習に方針変更済 |
| 3 | A1-A5 placeholder filter refactor (W7/W8 log-based metric) | B 起案 | 段階 2/3 で実機 traffic 観測してから refactor 予定 |
| 4 | promptSafety enhancement Issue 5 件 (#137/147/152/155/156) | C 起点 | 全 enhancement label、本田様明示指示なし |
| 5 | Slack/SMS 通知 channel 追加 | C 起点 | Phase 4 NG リスト記載、Phase 5+1 ヶ月後再評価 |
| 6 | docs/legal/*.md (履歴用) を public/legal と同期 | A housekeeping | CLAUDE.md「必要なら docs/legal にも反映」が任意、次セッション本田様判断 |
| 7 | グローバル memory への教訓反映 | A housekeeping | 本セッションで「プロジェクト内 docs に閉じる」方針確定、グローバル memory は触らず |

## §7.1 Issue Net 変化

- close 数: 0 件
- 起票数: 0 件
- **Net: 0 件**

理由: 本セッション全体で fix 5 件 + docs 3 件 (#215/#216/#217)、すべて in-flight PR で resolve。Issue 化対象なし。

## CI / 残留プロセス

- CI: PR #217 / Deploy to Cloud Run / **in_progress** (本 handoff 起票時点 40s 経過、doc-only で完走見込み)
- 残留プロセス: ✅ なし

## §8 最終結論

### ✅ **セッション終了可** — Phase 4 段階 2 GO-4 + 方針変更 docs 反映 完全クローズ

#### 根拠

- OPEN PR ゼロ (本セッション計 7 件 全 merge 済: #210-#215 / #216 / #217)
- main clean (origin/main と同期、最新 commit `9b66ed5`)
- 即着手タスク = 0 件 / 条件待ち = 7 件 (全本田様 trigger)
- 残留プロセスなし
- §4.5 グローバル memory scope: 変更なし、スキップ
- §4.6 同根再発スキャン: 前 handoff #216 から変化なし
- §4.7 対症療法判定: 前 handoff #216 から変化なし
- Issue Net 変化: 0 件

#### 推奨次セッション action

1. `/catchup` で状態確認 → 残作業ゼロを確認
2. 本田様判断項目があれば順次対応 (条件待ち #1〜#7 のいずれか)
3. 特に「Phase 5 公開実行 GO-6」「M5 課金実装着手」のいずれかが次の主要マイルストーン

本セッションは深夜帯 + 連続作業で認知負荷が高い。次セッション開始時に `/catchup` で context 復元してから慎重に進めることを推奨。
