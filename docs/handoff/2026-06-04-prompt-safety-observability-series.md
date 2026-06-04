# Handoff: promptSafety 観測性整備 5 連続 PR (Issue #137 #7 + #149 全 3 件)

- Session Date: 2026-06-04 (本セッション通算)
- Owner: yasushi-honda
- Status: ⏸ **再開待ち** — PR #153 OPEN 中断 (review-pr 4 並列指摘の fix 途中、本田様マージ認可前)
- Previous handoff: [LATEST.md](./LATEST.md) (PR #143/#144/#145 まで)
- Context 切替: 72% 到達で session 切替指示

## 本セッションのトリガー

前セッション handoff 「Issue #137 残サブ着手 (本田様優先順位判断待ち、緊急性 LOW)」に対し、本田様から `次のアクション:優先順にすすめて` 指示。Issue #137 #7 (observability metric counter、umbrella サブ最後) を着手し、その後発見された残課題 (Issue #149 残-A/B/C) を連続で進める「観測性 / 保守性向上シリーズ」を実施。

途中で本田様から「保守監視性のアップデート」の確認 → 「今後、多くのユーザーに使ってもらう予定のシステムなので、早いうちに保守性が上がる様なことはしておきましょう」の方針確認。以降 PR #150 (残-C) → PR #151 (残-A) → PR #153 (残-B、中断) と継続。

## 完了 PR (本セッション、4 件マージ + 1 件 OPEN)

| PR | 内容 | merge | commit |
|---|---|---|---|
| #148 | feat: observability metric counter (safetyEvent enum + gcloud script + runbook) (Refs #137 #7) | ✅ | `298af7d` |
| #150 | fix: histogram-overflow warn に firstOverflowPath 追加 (Refs #149 残-C) | ✅ | `e22f835` |
| #151 | fix: dry-run output に gcloud command paired signal 追加 (Refs #149 残-A) | ✅ | `e177a09` |
| **#153** | feat: bytes-estimation-failed paired signal (7 件目 safetyEvent、Closes #149) | **⏸ OPEN** | branch `8456b87` |

合計 (マージ済 3 件): ~12 ファイル新規 + 既存修正、テスト 619 → 640 (+21)、Cloud Run デプロイ success。

## アーキテクチャ進化 (5 段階 paired signal pattern 確立)

### PR #148 (Issue #137 #7、SAFETY_EVENTS enum + lockstep test 基盤)

- `SAFETY_EVENTS` const (6 件) + `SafetyEventName` 型派生 + `ALL_SAFETY_EVENT_NAMES`
- `scripts/setup-safety-event-metrics.sh` で gcloud log-based metric + alert policy scaffold
- `docs/runbook/cloud-logging-safety-event-metrics.md` 7 章 (setup / 6 metric 解説 / grep / alert / トリアージ / 同期規律)
- `tests/static/safety-events-{lockstep,bash-syntax}.test.ts` で TS↔sh drift 検知
- Quality Gate: brainstorm → impl-plan → safe-refactor (M-1〜M-3) → /code-review medium 7-angle → Evaluator → /codex review (HIGH 3 → fix) → /review-pr 5 並列 (HIGH 5 → fix) → 計 6 段で commit 6 件

### PR #150 (Issue #149 残-C、histogram-overflow forensic gap)

- `histogram-overflow` warn payload に `firstOverflowPath: desired` 追加
- runbook §6.1 に「pathPrefixes + truncatedBucketCount + 個別 warn 4 種組合せ」の forensic 経路明示
- AC-10 既存 test に `not.toBe('(no-path)')` + `not.toBe('(overflow)')` sentinel 排除 assertion 追加 (pr-test-analyzer Rating 7 指摘反映)

### PR #151 (Issue #149 残-A、dry-run gcloud paired signal)

- script の dry-run 分岐に `command: gcloud logging metrics create ...` 行追加 (案 D、最小コスト)
- test 4 assertion (件数 / 命名規約 / filter regex / project 展開) + `--description=` / `--log-filter=` flag literal pin
- silent-failure-hunter MEDIUM-A (OQ-2 完全カバー) 反映、MEDIUM-B (update path 不在) は **Issue #152 起票** で別追跡

### PR #153 (Issue #149 残-B、estimateElementBytes paired signal) ⏸ OPEN

- SAFETY_EVENTS 7 件目 `BYTES_ESTIMATION_FAILED` 追加
- `estimateElementBytes` に optional callback DI、`stripPromptHeavyFields` 内 `bytesEstimationAggregator` (5 件目 aggregator)
- AC-5a (BigInt) / AC-5b (toJSON throw、循環参照は depth guard 上位のため代替) / AC-5c (false positive ゼロ) / AC-3 (backward compat) の 4 件 test
- Quality Gate 4 段 (safe-refactor / code-review medium 7-angle / Evaluator APPROVE / review-pr 4 並列) 実施済
- **/review-pr 4 並列指摘の fix 途中で中断**

## PR #153 中断状況詳細 (次セッション再開ポイント)

### Quality Gate 結果

| 段階 | 結果 | 反映状況 |
|------|------|---------|
| safe-refactor | HIGH/MEDIUM 0、LOW 3 件 | 修正なし (将来検討) |
| /code-review medium 7-angle 並列 | 1 MEDIUM (runbook 6→7 drift 3 箇所) | ✅ fix 済 |
| Evaluator | APPROVE、LOW 2 件 (§4.1 grep query drift) | ✅ fix 済 |
| /review-pr 4 並列 | Critical/Important 7 件 + Medium 2 件 | **⏸ 未 fix で中断** |

### /review-pr 4 並列指摘 (本田様「確実 drift / 誤記修正 + Medium 2 件別 Issue 起票」採択)

**A. 本 PR 内 fix 対象** (確実な drift / 誤記、~30 行修正):

1. `scripts/setup-safety-event-metrics.sh:188`: comment `(6 件、histogram-overflow のみ enabled)` → `(7 件、histogram-overflow のみ enabled)`
2. `server/utils/promptSafety.test.ts:1505-1508`: group comment「`JSON.stringify` failure (BigInt / 循環参照)」→「`JSON.stringify` failure (BigInt / `toJSON` throw — 循環参照は depth guard 経由で先処理)」
3. `server/utils/promptSafety.test.ts:1534`: AC-5b test 名「toJSON throwing element で aggregator.tick が emit」→「AC-5b (proxy for circular ref): toJSON throwing element で aggregator.tick が emit」+ 将来 `MAX_RECURSION_DEPTH` 変更時の置換指針コメント
4. `docs/spec/promptSafety/2026-06-04-bytes-estimation-paired-signal-design.md`:
   - **line 4**: 壊れた URL `https://github.com/Yukina1116/users/Yukina1116/novel-writer/issues/149` → `https://github.com/Yukina1116/novel-writer/issues/149`
   - **line 7**: `**ステータス**: Design (Phase 6, brainstorm Skill)` → `**ステータス**: Implemented (PR #153)` または削除
   - **line 14**: 「PR #148 review-pr silent-failure-hunter agent **Medium #5** として指摘された **HIGH severity** 残課題」→ 「PR #148 review-pr agent #5 (HIGH severity)」
   - **line 63 (NFR-1) / line 335 (AC-10)**: 「636 + 新規 3 = 639」→「636 + 新規 4 = 640」
   - **line 186 (FR-4) / line 315 (AC-4)**: 行番号 `:563` → symbolic 参照「`stripPromptHeavyFields` 内 array recurse ループ末尾の `cumulativeBytes += estimateElementBytes(replaced, ...)`」
   - **line 319 (AC-5) / line 351 (テスト構成表)**: AC-5b 文言「循環参照を含む array element で aggregator.tick が 1 回 emit」→「`toJSON` throwing element で aggregator.tick が 1 回 emit (循環参照は depth guard で先処理されるため代替)」
   - **line 340 (AC-12)**: 「AC-9 manual failing path 手動確認 (TS enum から ...)」自己参照誤り → 「lockstep test の manual failing path 手動確認 (TS enum から BYTES_ESTIMATION_FAILED を一時削除 → lockstep test 3 件 fail → 復元で全 PASS)」

**B. 別 Issue 起票対象** (Medium 2 件、follow-up):

1. **AC-3 backward compat test の検証経路 gap** (pr-test-analyzer I3 / silent-failure-hunter Medium-1):
   - 現状: `stripPromptHeavyFields` 経由で normal data の false positive ゼロを確認 (AC-5c との重複)
   - 改善: `estimateElementBytes` を internal export して `callback 未指定で BigInt 渡しても warn 0` を直接 pin、または AC-3 test 削除
2. **estimateElementBytes callback register-or-forget リスク** (silent-failure-hunter Medium-2):
   - 現状: `onStringifyFailure?` optional のため将来 callsite 追加で callback 渡し忘れ silent 復活
   - 改善: callback required + 不要 callsite に `() => {}` 明示、または lint rule、または aggregator 必須化

### 再開手順 (次セッション)

```bash
# 1. ブランチに戻る
git checkout feature/issue-149-b-estimate-byte-fallback

# 2. 上記 A の 4 ファイル fix
#    - scripts/setup-safety-event-metrics.sh (1 行)
#    - server/utils/promptSafety.test.ts (group comment + AC-5b test 名)
#    - docs/spec/promptSafety/2026-06-04-bytes-estimation-paired-signal-design.md (8 箇所)

# 3. 動作確認
npm run lint && npm run test  # 640 tests PASS 維持

# 4. commit + push
git add -A && git commit -m "docs(spec): review-pr 4 並列指摘の drift/誤記修正 (Refs #149 残-B)"
git push

# 5. 別 Issue 起票 (Medium 2 件)
gh issue create --title "[enhancement] promptSafety: AC-3 backward compat test の検証経路 gap" ...
gh issue create --title "[enhancement] promptSafety: estimateElementBytes callback register-or-forget リスク" ...

# 6. PR コメント更新 (反映状況通知)
gh pr comment 153 --body "..."

# 7. 本田様マージ認可後
gh pr merge 153 --squash --delete-branch  # Closes #149 で umbrella close
git checkout main && git pull --ff-only
```

## Issue Net 変化 (本セッション通算)

- **Close 数**: 0 件
  - PR #153 マージ後に Issue #149 が auto-close される予定だが、本セッション内では未マージ
- **起票数**: 3 件 (#147 PII path leak, #149 promptSafety umbrella, #152 update path paired signal)
- **Net**: **-3 件** (進捗負、CLAUDE.md 「Net ≤ 0 は進捗ゼロ扱い」)

**進捗負の理由 (言語化)**:
- PR #148 review-pr で silent-failure-hunter agent が 3 件の構造的 surface を発見、これらが #147/#149/#152 として可視化された
- Issue #149 は umbrella として PR #150/#151/#153 で 3 サブ全対応中 (PR #153 マージで close 予定)
- Issue #137 #7 (PR #148) サブ完了は umbrella 進捗、umbrella close は #6/#8 残のため未達

**triage 評価**: 3 件全て review agent 由来だが rating ≥ 7 + 構造的セキュリティ surface (PII / silent fail / update path drift) のため triage 基準満たす。rating 5-6 の機械的起票ではない。

## アーキテクチャ確立 (paired signal pattern の集大成)

PR #148-#153 で確立した「silent fail 一対設計」5 段:

1. **SAFETY_EVENTS enum + lockstep test** (PR #148): drift 機械検知の基盤
2. **firstOverflowPath** (PR #150): 個別 paired signal の forensic 強化
3. **dry-run command echo** (PR #151): CI gcloud 不在環境での regression 検知
4. **bytes-estimation-failed aggregator** (PR #153、OPEN): JSON.stringify failure の paired signal
5. **lockstep test の 6→7 拡張実証** (PR #153): SAFETY_EVENTS 拡張時の 6 ファイル同時更新 drift 検知能力の実証

`feedback_silent_fail_paired_signal.md` 規律を完全構造化、`feedback_simplify_vs_review.md` の effort 選択 (low/medium) も実証。

## 本田様判断待ち項目 (継続)

| 項目 | 状態 |
|---|---|
| PR #153 マージ認可 (上記再開手順実施後) | ⏸ |
| Cloud Logging で 7 種 safetyEvent 実発火確認 | dev デプロイ後 |
| `./scripts/setup-safety-event-metrics.sh --project novel-writer-dev` 実行 → 7 metric 作成 + alert policy 初期 disabled で create | 本田様運用 |
| `bytes-estimation-failed` baseline 観察後 alert enable | 1〜4 週間後 |
| Issue #137 残サブ #6 (logger.warnSampled altitude) / #8 (truncateOversizedStrings path 追跡) | 別 milestone (blast radius 大) |
| Issue #147 PII path leak 対応時期 | 規模拡大時 |
| Issue #152 update path paired signal | LOW、SDK rename 時 |

## 残 Open Issue (PR #153 マージ後想定)

| Issue | 内容 | 状態 |
|---|---|---|
| #137 | promptSafety umbrella (サブ #7 完了、#6/#8 残) | OPEN (残 2 件) |
| #147 | PII path leak (codex review 由来) | OPEN |
| #149 | promptSafety umbrella (本 PR マージで close) | **PR #153 マージで close 予定** |
| #152 | update path paired signal | OPEN |
| (新) | AC-3 test gap | 起票予定 |
| (新) | estimateElementBytes register-or-forget | 起票予定 |

## 学び (本セッション総括)

1. **brainstorm Phase 9 → impl-plan → 実装 → 4 段 Quality Gate → review-pr の流れ** が本セッションで 4 連続実証 (PR #148/#150/#151/#153)、所要時間 70-90 分/PR で安定
2. **observability 整備の連続 PR は安定性向上ではなく保守性向上**、本田様の規模拡大方針 (「多くのユーザー」想定) と整合した投資判断
3. **review-pr が PR ごとに新たな MEDIUM 残課題を発見** (Issue #147/#149/#152) → Net 負だが構造的 surface 可視化の価値
4. **PR #150 sentinel 排除 + PR #151 flag literal pin + PR #153 lockstep 6→7 拡張** で「paired signal 規律を機械検知する test patternの体系」が確立
5. **AC-5b 「循環参照は depth guard で先処理」設計制約を test comment で明示** することで、将来の MAX_RECURSION_DEPTH 変更時の test 意義保守が成立 (responsibility separation 文書化の好例)

---

## 2026-06-04 セッション再開 → 完走 (本ファイル末尾の追記、再開後 commit)

中断時 (PR #154 マージ時点) は PR #153 OPEN + 4 並列 review-pr 指摘の fix が未適用だった。再開セッションで以下を完了:

### 適用済 (本 PR 内 drift / 誤記修正、commit `72ae428`)

- `scripts/setup-safety-event-metrics.sh:188` コメント「6 件」→「7 件」
- `server/utils/promptSafety.test.ts`:
  - L1505-1508 group comment の「循環参照」→「toJSON throw (循環参照は depth guard 上位)」
  - L1534 AC-5b test 名に「(proxy for circular ref)」追記
- `docs/spec/promptSafety/2026-06-04-bytes-estimation-paired-signal-design.md` 8 箇所:
  - line 4: 壊れた URL (`/users/Yukina1116/` 重複) を正しい URL に
  - line 7: 「Design (Phase 6, brainstorm Skill)」→「Implemented (PR #153)」
  - line 14: 「Medium #5 として指摘された HIGH severity」→「#5 (HIGH severity)」圧縮
  - lines 63 / 335 (NFR-1 / AC-10): 「636 + 新規 3 = 639」→「636 + 新規 4 = 640」
  - lines 186 / 315 (FR-4 / AC-4): 行番号「:563」→ symbolic 参照 (stripPromptHeavyFields 内 array recurse ループ末尾)
  - lines 319 / 351 (AC-5 / テスト構成表): AC-5b 「循環参照」→「toJSON throw (循環参照は depth guard 上位)」
  - line 340 (AC-12): 「AC-9 manual failing path」自己参照誤り → lockstep test 3 件 (TS↔sh 件数 / 集合一致 / canonical entries) の正しい記述

### 別 Issue 起票 (Medium follow-up)

- [#155](https://github.com/Yukina1116/novel-writer/issues/155) — AC-3 backward compat test の検証経路 gap (estimateElementBytes 内部関数 export 経路欠落)
- [#156](https://github.com/Yukina1116/novel-writer/issues/156) — estimateElementBytes callback register-or-forget リスク (lint rule / aggregator 必須化検討)

### マージ完了

- **PR #153 マージ**: squash merge → `cdbe187`、branch delete 済
- **Issue #149 (umbrella) auto-close**: 残-A/B/C 全完了 (`Closes #149` 記載で auto-fire)

### 検証

- `npm run lint` PASS (tsc --noEmit エラーゼロ)
- `npm run test` PASS (640/640)
- CI Deploy to Cloud Run `cdbe187` ✅ SUCCESS (3m3s)

### 中断 → 再開サイクルの学び

中断時の handoff (PR #154) で残した「再開ポイント」が再開時に **そのまま executor 用 task graph** として機能した。`docs/handoff/` を単に「次セッションへのメモ」でなく「中断時の future-self 向け task spec」として書くと、context 72% 中断 → 別セッション再開でも drift ゼロで完走できる、というパターンが本セッションで実証された。
