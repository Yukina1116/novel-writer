# Handoff: アウトラインドラッグ統合化バグ修正 (chapterId 移行、PR #173 + #174)

- Session Date: 2026-06-08 〜 2026-06-09 (跨ぎ)
- Owner: yasushi-honda
- Status: ✅ **PR #173 + #174 マージ + Cloud Run デプロイ + 本番 Playwright MCP 実機確認完走**
- Previous: [2026-06-08c-pr171-help-modal-accordion.md](./2026-06-08c-pr171-help-modal-accordion.md)

## 修正対象バグ

アウトラインで「章に属さない文章」と名前付き章をドラッグ並び替えすると、uncategorized chunks が物理位置で名前付き章配下に絡め取られて統合される。本田様要望「章に属さない文章は独立した存在としたい」。

**Before** (位置依存ルール):
```
[本文A(uncat), # 第1章, 本文B]
↓ "# 第1章" を "章に属さない文章" の上にドラッグ
[# 第1章, 本文B, 本文A]  ← 本文A が物理的に章の後に来たため第1章配下に統合 (バグ)
```

**After** (chapterId 所属優先):
```
[本文A(chapterId=null), # 第1章(chapterId=B.id), 本文B(chapterId=B.id)]
↓ 同操作
[# 第1章, 本文B, 本文A(chapterId=null 維持)]  ← uncategorized のまま独立表示
```

## 採用設計 (D-2 案)

| 案 | 採否 | 理由 |
|----|------|------|
| D-1 | 不採用 | NovelChunk + chapter メタ配列の分離 (Project に chapters[] 追加) - 影響範囲過大 |
| **D-2** | **採用** | NovelChunk に `chapterId?: string \| null` 追加、章タイトルは引き続き `# ` 始まり chunk が保持 (最小変更) |
| D-3 | 不採用 | chapters: { id, titleChunkId, order }[] 別配列 + chunk.chapterId - PR-2 後の将来検討 |

確定 OQ (impl-plan + Codex セカンドオピニオン経由):
- R1 = ② sync (`handleNovelTextChange` で `# ` 有無変化時に chapterId 再同期)
- R2 = ① 最終章配下 (新規 append は末尾 chunk の chapterId を継承)
- R3 = ③ null + 仮想 id (`UNCATEGORIZED_CHAPTER_ID = '__uncategorized__'`)
- R4 = N/A (chunk drag は実装不在を grep 確認)
- R5 = 2 PR 分割 (PR-1 基盤 + PR-2 ロジック・UI)
- R6 = D-2 維持

## 本セッション PR

| PR | 内容 | 状態 |
|----|------|------|
| **#173** | feat(types): NovelChunk.chapterId 追加 + chapter group ユーティリティ (PR-1/2) | ✅ `5e2fe59` + 反映 commit |
| **#174** | feat(chapter): chapterId 移行で chapter merge バグを修正 (PR-2/2) | ✅ `0c8651f` + 反映 commit + Playwright MCP 実機確認 |

### PR #173 (基盤層、+660 行 / 3 ファイル)
- `types.ts`: `NovelChunk.chapterId?: string \| null` 追加
- `utils.ts`: 純粋関数 6 個 + `ChapterGroup` discriminated union + dev-only `warnOnceInDev`
- `validateAndSanitizeProjectData`: 読込時 1 回の `normalizeChapterIds` migration
- review 反映 (Codex + 5 専門エージェント): F1〜F5 (mutation 除去 / `@deprecated` 化 / 型 invariant 強化 / paired signal / 補強テスト)

### PR #174 (ロジック展開 + UI、+1018 行 / 10 ファイル)
- `store/dataSlice.ts`: `handleChapterDrop` (バグ修正本丸) / `handleSaveChapterSettings` / `handleDeleteChapter` / `addChapter` / `handleAddNewChunk` / `handleNovelTextChange` (R1 sync) / `exportHtml` (TOC + 本文 anchor 同一 source)
- `store/aiSlice.ts`: continuation 採用時に `assignChapterIdForAppend` で R2 + title invariant
- `components/panels/OutlinePanel.tsx`: `getChapterGroups` ベース、drag id を groupId 化
- `components/NovelEditor.tsx`: chapters useMemo を `getChapterGroups` ベース
- `components/GlobalSearchModal.tsx`: `isChapterTitleChunk` / `extractChapterTitle` 経由に統一
- `utils.ts`: 旧 `getChapterChunks` (位置依存) 削除
- review 反映 (Codex + 5 専門エージェント + evaluator): F-A〜F-F (title invariant 維持 / body→title 後続再 tag / silent fail paired signal / AC-11 テスト / aiSlice wiring guard / 非連続 uncategorized 昇格時 normalize)

## 実機確認結果 (Playwright MCP)

dev URL `https://novel-writer-ramnh3ulya-an.a.run.app/` で確認:

| AC | シナリオ | 結果 |
|----|--------|------|
| **AC-1** | 名前付き章を「章に属さない文章」の上にドラッグ → 統合化されない | ✅ PASS |
| **AC-2** | 「章に属さない文章」を名前付き章の上にドラッグ → 統合化されない | ✅ PASS |
| **F-A** | 「本文を直接入力」で `# 第2章` 追加 → 新章 group として認識 | ✅ PASS |

旧バグでは「章に属さない文章」グループが消失するはずだが、両方向ドラッグともに独立 group 維持を確認。

## Acceptance Criteria 達成状況

| AC | 内容 | 状態 |
|----|------|------|
| AC-1 | 統合化されない (順方向) | ✅ unit + Playwright MCP |
| AC-2 | 統合化されない (逆方向) | ✅ unit + Playwright MCP |
| AC-3 | migration 推論 | ✅ unit |
| AC-4 | migration 冪等性 | ✅ unit |
| AC-5 | sanitizer (不正参照修復) | ✅ unit |
| AC-6 | `handleDeleteChapter` 範囲限定 | ✅ unit |
| AC-7 | uncategorized → 名前付き昇格時 chapterId 一括 | ✅ unit |
| AC-8 | 末尾 append → 最終章継承 (R2) | ✅ unit (aiSlice 含む) |
| AC-9 | R1 sync (# 編集で title↔body 切替) | ✅ unit |
| AC-10 | BackupV1 / encrypted / legacy bare 3 経路 roundtrip | ✅ unit |
| AC-11 | export TOC + 本文 anchor 同一 source | ✅ unit |
| AC-12 | group 連続性 invariant | ✅ unit (write path 4 経路) |

## 品質指標

| 項目 | 状態 |
|------|------|
| Test files | 43 (前 41) |
| Tests | 726 pass (前 676、**+50 件**) |
| Lint (tsc --noEmit) | clean |
| Build | 成功 |
| Cloud Run deploy | success (2m59s) |
| Codex review | High 4 件 (PR-1) + High 3 件 (PR-2) 全反映 |
| review-pr (5 agents + evaluator) | Critical/HIGH 全反映、defer 4 件は別 issue 候補 |

## Issue Net 変化 (本セッション)

- **Close 数**: 0 件
- **起票数**: 0 件
- **Net**: **0 件**

(本セッションは既存 Issue に紐付かないユーザー要望由来のバグ修正。CLAUDE.md GitHub Issues triage 基準を満たす起票候補なし)

## 残 Open Issue (前 handoff から不変)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (サブ #7 完了、残 #6 / #8) | LOW |
| #147 | PII path leak (codex review 由来) | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

## defer (本 PR では見送り、別 issue 起票候補)

PR-1 / PR-2 review で defer 判定したもの。**いずれも本田様明示指示なしでは起票しない**:

| # | 指摘 | defer 理由 |
|---|------|----------|
| D1 | `lastModified` 更新漏れ (`handleSaveChapterSettings` / `addChapter` / `handleAddNewChunk`) | code-reviewer が pre-existing と確認、本 PR scope 外 |
| D2 | branded type 導入 (groupId vs chunkId 区別) | 低 ROI、将来検討 |
| D3 | `validateArrayItems` drop observability | 既存挙動、本 PR scope 外 |
| D4 | `handleNovelTextChange` title→title リネームテスト | nice-to-have |
| D5 | migration / runtime mode 分離 (`putProject` で throw) | 既存パス全体改変、大規模変更 |

## 次のアクション (3 分割構造、MUST)

### 即着手タスク

なし

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger 内容 | 充足時のタスク |
|---|------|-------|--------------|--------------|
| 1 | description セクションの視覚強調 (HelpModal) | C | 本田様判断指示 | UI 調整実装 |
| 2 | 「タイムラインへ送る」後のタイムライン未反映の挙動切り分け | B 修正 | 本田様からの再現指示 / バグ確認指示 | 調査 → 修正 |
| 3 | `novel-writer-prod` への構築着手 | C | bugfix 完了 + 本田様指示 | デプロイ移行作業 |
| 4 | setup-safety-event-metrics 実行 | A | 本田様指示 | 実行 |
| 5 | Cloud Logging baseline 観察 → alert enable 判断 | B 検出 | 1〜4 週間後の経過 + 本田様判断 | metrics 観察 + 判断材料提示 |
| 6 | 残 Open Issue (#137 / #147 / #152 / #155 / #156) の優先順位決定 | C | 本田様の優先順位指示 | 個別実装 |
| 7 | defer 5 件 (D1〜D5) の起票判断 | A | 本田様の起票指示 | gh issue create |

### 却下候補 (記録のみ・包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | handoff 整理 / memory 整理 | A (指示なし) | housekeeping、明示指示なし |
| 2 | 残 Issue への AI 起点実装提案 | C (unclear) | 4 原則 §1 越権防止 |
| 3 | 他箇所の UI / 機能改善提案 | C (unclear) | 起点 unclear |
| 4 | 第三 PR で D1〜D5 の同時対応 | C (unclear) | 個別 trigger 待ち |
| 5 | prod 移行の前倒し着手 | C | trigger 未充足 |
| 6 | 既存テスト (titleSync 等) の chapterId 対応見直し | A (指示なし) | 既存テストは pass 維持中、housekeeping |

## 再開可能性判定

| 項目 | 状態 |
|------|------|
| Git Status | ✅ clean (untracked PNG 10 枚は本 handoff で削除済) |
| Open PR | ✅ ゼロ (本 handoff PR を除く) |
| Active Issue | 5 件 (全て LOW + 本田様判断待ち) |
| CI | ✅ Deploy to Cloud Run #27156145682 (PR #174) success (2m59s) |
| 残留プロセス | ✅ なし |
| 即着手タスク | 0 件 |
| 条件待ち | 7 件 (全て decision-maker trigger / 指示待ち) |

## 構造的整合性チェック

| 変更内容 | 該当スキル | 実施状況 |
|---------|---------|---------|
| 型 (`NovelChunk.chapterId` 追加) | `/impact-analysis` | ✅ Codex + type-design-analyzer + 5 agent review で網羅評価実施 |
| 共有ロジック (`utils.ts` 新規 6 関数) | `/impact-analysis` | ✅ 同上 |
| データフロー (`chapterId` を全 write/read path に展開) | `/trace-dataflow` | ✅ Codex review + evaluator で全レイヤー追跡確認 |
| 新規 API / テーブル | `/check-api-impact` | ⏭️ 該当なし (FE のみ、サーバー影響なし) |

## 最終結論

🛑 **executor 領分の作業ゼロ、即時セッション終了推奨**

- Open PR ゼロ (本 handoff PR を除く) / Git clean / CI success
- PR #173 + #174 完走 (マージ + デプロイ + 本番 Playwright MCP 実機確認 AC-1/AC-2 PASS)
- 即着手タスク 0 件 / 条件待ち 7 件すべて decision-maker からの trigger / 指示待ち
- 残 Open Issue 5 件すべて LOW + 本田様判断待ち
