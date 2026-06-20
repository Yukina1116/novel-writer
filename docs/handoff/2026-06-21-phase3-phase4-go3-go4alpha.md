# Handoff: Phase 3 完了 + Phase 4 段階 1 完了 + Phase 4 段階 2 GO-3 完了 + GO-4 PR α (起草) OPEN

- Session Date: 2026-06-20 evening → 2026-06-21 early morning
- Owner: yasushi-honda
- Status: ⚠️ **PR #208 merge 認可待ち**、それ以外はクリーン
- Previous: [2026-06-20c-phase2-complete.md](./2026-06-20c-phase2-complete.md)

## セッション要旨

Phase 3 (dev → prod 運用フロー文書化) を完走後、Phase 4 (一般公開準備) に着手し、段階 1 (起草) と段階 2 GO-3 (PITR 有効化) を完了、続いて GO-4 (monitoring 構築) の段階 1 (PR α 起草) まで進めた。

GO-3 では gcloud spec の ground truth 確認漏れで 5 PR 連続の修正が発生 (#203-#207)、その教訓を GO-4 PR α (#208) では事前確認強化として反映 (AlertPolicy / Dashboard 公式 docs を WebFetch で確認、gcloud --help で flag 確認)。

PR #208 は OPEN、本田様番号単位明示認可待ち + code-review で 1 件の起草意図-実装乖離 finding (A5 policy duration) を提示済。

## 本セッション merged PR (8 件)

| PR | 内容 |
|----|------|
| #200 | docs(prod-migration): Phase 3 — dev → prod 運用フロー文書化 (ADR-0002 + runbook prod-deploy-flow.md + phase3-tasks.md) |
| #201 | docs(prod-migration): Phase 4 PR α — phase4-tasks.md 枠組み先行 (タスク + AC + GO-1/2 tracker + Phase 5 GO チェック) |
| #202 | docs(prod-migration): Phase 4 PR β — ADR-0003 + 3 runbook (prod-pitr / prod-monitoring / prod-slo) |
| #203 | docs(runbook): fix prod-pitr.md PITR drill bash (macOS BSD date + DEST_DB 変数保持) |
| #204 | feat(workflows): add Firestore PITR drill + enable workflows (Phase 4 stage 2 GO-3) |
| #205 | fix(prod-pitr): use gcloud firestore databases clone for PITR (not restore) |
| #206 | fix(prod-pitr): wait for clone-LRO completion before verify |
| #207 | docs(prod-pitr): PITR enable evidence + dev-drill workflow fixes + drill strategy pivot |

## 本セッション OPEN PR (1 件)

| PR | 内容 | 状態 |
|----|------|------|
| **#208** | feat(monitoring): add prod monitoring YAML + setup workflow (Phase 4 stage 2 GO-4) | OPEN、本田様番号単位認可待ち、code-review 1 件 finding 提示済 |

## 本セッション実機操作 (証跡)

| 操作 | 環境 | 経路 | 結果 |
|----|------|------|------|
| dev PITR 有効化 | dev | gcloud 直接 | ✅ ENABLED, 7d retention, 2026-06-20T13:59:39Z |
| prod PITR 有効化 | prod | workflow [#27875198225](https://github.com/Yukina1116/novel-writer/actions/runs/27875198225) | ✅ ENABLED, 7d retention, 2026-06-20T15:15:16Z |
| dev/prod IAM 変更 (`roles/datastore.owner` 付与) | dev + prod | gcloud (AI 実行、包括認可) | ✅ 両 SA に付与済 |
| dev PITR drill workflow × 3 回試行 | dev | workflow #27874184216 / #27874472054 / #27874630851 | ❌ 全 fail (clone LRO 所要時間 + cleanup syntax)、orphan db 2 件 cleanup 済 |

## Phase 進捗

| Phase | 状態 |
|-------|------|
| Phase 1 (インフラ整備) | ✅ |
| Phase 2 (初回 prod deploy) | ✅ |
| Phase 3 (dev → prod 運用フロー) | ✅ 本セッション完了 (#200) |
| Phase 4 段階 1 (起草) | ✅ 本セッション完了 (#201, #202, #203) |
| **Phase 4 段階 2 GO-3 (PITR 有効化)** | ✅ 本セッション完了 (#204-#207、復旧演習は段階 3 で手動 Console に方針変更) |
| **Phase 4 段階 2 GO-4 (Logging dashboard)** | 🚧 PR α (#208) OPEN |
| Phase 4 段階 3 (SLO Accepted + 手動 PITR 演習) | ⏳ |
| Phase 5 (公開実行) | ⏳ |

## §4.6 同根再発スキャン (MUST)

### 本セッション内同根候補

本セッション fix PR 4 件 (#203, #205, #206, #207) の共通テーマ: **gcloud コマンドの spec 確認漏れによる連鎖修正**。

| PR | 失敗の root cause | 修正種別 |
|----|------------------|---------|
| #203 | `date -u -d` GNU date 専用、macOS で動かない | bash 互換性 fix |
| #205 | `gcloud firestore databases restore` を PITR 復旧に誤用 (実は Backup 専用) | gcloud spec 確認漏れ |
| #206 | `gcloud firestore databases clone` が LRO であることを確認せず | gcloud spec 確認漏れ |
| #207 | `gcloud firestore databases delete` の positional vs flag 誤用 + cleanup の clone LRO 所要時間考慮漏れ | gcloud spec 確認漏れ + 戦略変更 |

**判定**: 4 連続 fix はすべて「runbook / workflow を書く前に gcloud の `--help` と公式 docs を確認しなかった」という同根。**Phase 4 段階 1 PR β (#202) で runbook prod-pitr.md を起草した時点で `gcloud firestore databases clone` の存在を確認していれば 4 PR は防げた**。

### 過去 7 日 handoff archive スキャン

`docs/handoff/2026-06-1[4-9]-*.md` から `gcloud` / `clone` / `LRO` / `Firestore` keyword 検索: 該当する同根なし (Phase 1/2/3 はインフラ整備とフロー文書化、gcloud spec の深掘りは GO-3 が初出)。

### 真の root cause 仮説 (3 つ以上)

1. **runbook / workflow 起草段階で gcloud `--help` を確認しない pattern** が定着している。GO-3 で 4 PR、GO-4 で防いだ (前提として AlertPolicy / Dashboard の公式 docs を事前に WebFetch で確認、`gcloud monitoring policies create --help` も確認)
2. AI が記憶ベースで gcloud spec を書く誘惑 (深夜帯 + 連続作業の認知負荷で短絡しやすい)
3. Phase 4 段階 1 PR β #202 で runbook の起草内容 (X% rate / restore コマンド) が「意図表現」と「実装可能性」の区別なく書かれ、段階 2 で実装するときに乖離が顕在化

### 次に同根が出る経路 (1 つ以上)

**Phase 4 段階 2 GO-4 (PR #208) の workflow run 試行時** — 5 alerting policy YAML / dashboard YAML の filter syntax / metric type 名 / `--notification-channels` flag 動作などで未確認の不整合があれば再発する。事前にできる対策: PR #208 merge 前に dev で smoke run を 1 回試行 (dev-monitoring-setup.yml を別途用意するか、prod に dry-run option を追加するか)。本 PR では含めず、必要時は次セッションで判断。

## §4.7 対症療法判定 (MUST)

### 基準ヒット状況

| # | 基準 | 該当 |
|---|------|------|
| 1 | 修正が retry/timeout/fallback/エラー文言修正のみで構造調査ログなし | ❌ 各 fix は root cause まで掘り下げ |
| 2 | 「なぜそれが今起きたか」の外部要因調査ログなし | ⚠️ 部分的に該当 (gcloud spec の最新化を WebSearch で確認していない、ただし `--help` で十分かつ最新の公式 spec を参照) |
| 3 | 同症状の修正 PR が過去 30 日以内に 1 件以上 | ❌ なし |
| 4 | 修正後の動作確認が単体 test/smoke のみで構造的要因の差分検証なし | ⚠️ 部分的該当 (#207 は CI workflow 自体を pivot した、smoke 通過なし) |

### 判定

該当する対症療法疑い: なし (基準 2/4 の部分該当は process 改善の余地はあるが、各 fix は root cause 修正)。

ただし **次の Code Review (PR #208) で 1 件 finding を提示済**: A5 policy `duration: 300s` が起草意図 (5 分窓に 1 件) と乖離して「5 分継続 ERROR」を要求する条件になっている。これは本 PR α merge 前に修正するか、段階 2/3 で MQL refactor と一緒に修正するか本田様判断項目。

## §2.4 / §2.5 次のアクション (3 分割)

### 即着手タスク

なし。PR #208 は本田様番号単位明示認可待ち、AI 単独着手不可。

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger | 充足時のタスク |
|---|------|-------|---------|--------------|
| 1 | PR #208 merge | C 起点 | 本田様「PR #208 をマージしてよい」 (A5 finding を fix するなら同時にコメント、起草段階で許容するならそのまま) | squash merge → main 同期 |
| 2 | A5 policy duration 修正 | B 修正 | 本田様「A5 duration 修正してから merge」 | duration: 300s → 0s に変更、A1-A4 も同様の判断項目を本田様確認、修正後再 push |
| 3 | prod IAM 変更 (roles/monitoring.editor 付与) + workflow run | B 実行 | PR #208 merge 後、本田様「monitoring workflow を実行してよい」+ email address 確定 | AI が `gcloud add-iam-policy-binding` 実行 + `gh workflow run prod-monitoring-setup.yml -f email_address=...` 起動 + 完了確認 |
| 4 | GO-4 証跡 PR β | B 修正 | workflow run 完了後 | runbook prod-monitoring.md に dashboard URL + 構築日時を追記、phase4-tasks.md AC-P4-9 を完了に更新 |
| 5 | Phase 4 段階 3 (SLO Accepted 化 + 手動 PITR 演習) | A/B 混在 | Phase 5 公開後 1 ヶ月の real traffic 取得 (SLO 再校正) + 本田様「手動演習を実施したから証跡追記して」 | runbook prod-slo.md Status 変更、prod-pitr.md 演習履歴追記 |
| 6 | GO-1 法務確認 status 更新 | A housekeeping | 本田様「顧問弁護士から X 文書が Approved」明示報告 | phase4-tasks.md §GO-1 tracker の status を 4 値内で更新 |
| 7 | GO-2 課金クォータ判断 | C 起点 | 本田様判断 | phase4-tasks.md §GO-2 申請 draft を本田様が転用、または「default で OK」判断を tracker に反映 |
| 8 | Phase 5 着手 | C 起点 | GO-1〜GO-5 全 ✅ + 本田様「Phase 5 着手 GO」 | phase5-tasks.md 起草 (別 ADR / 別 runbook 起草) |

### 却下候補 (記録のみ)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | dev-monitoring-setup.yml で先行検証 | B 起案 | PR #208 description で「dev workflow は本 PR に含めない」と明記、本田様判断項目。GO-3 の dev drill workflow と同じく必要性が薄い (prod 構築は idempotent + verify step で十分) |
| 2 | dev-pitr-drill.yml の手動 trigger で実機 PITR 演習 | A/B 中間 | 段階 3 で手動 Console 演習に方針変更済 (#207)、CI 演習は将来課題として workflow を保持中 |
| 3 | MQL/PromQL への ratio 表現 refactor (A1-A4) | B 起案 | PR #208 では絶対 rate で起草、段階 2/3 で実機 traffic 観測してから refactor 予定 |
| 4 | promptSafety enhancement Issue 5 件 (#137/147/152/155/156) | C 起点 | 全て enhancement label、本田様明示指示なし、Phase 4 進行中は触れない |
| 5 | Slack/SMS 通知 channel 追加 | C 起点 | Phase 4 NG リスト記載、Phase 5+1 ヶ月後に再評価 (ADR-0003 §Consequences) |

## §7.1 Issue Net 変化

- close 数: 0 件
- 起票数: 0 件
- **Net: 0 件**

理由: 本セッションの fix は全て in-flight PR で resolve、別途 Issue 起票が必要な事象 (実害ありの bug / rating ≥7) は発生せず。GO-3 で発覚した clone LRO timeout 問題は #207 で「strategy pivot」として resolve、Issue 化不要。

## CI / 残留プロセス

- CI: PR #208 / Deploy to Cloud Run / **success** (1m2s, 2026-06-20T15:39:54Z)
- 残留プロセス: ✅ なし

## §8 最終結論

### ⚠️ **PR #208 merge 認可待ち、それ以外はクリーン**

#### 根拠
- OPEN PR 1 件 (#208、本田様番号単位明示認可待ち)
- main clean (origin/main と同期)
- 即着手タスク = 0 件 (PR #208 認可は本田様判断)
- 条件待ち = 8 件 (うち #208 関連が 3 件、Phase 5 系が 5 件、すべて本田様判断 trigger)
- 残留プロセスなし
- 同根再発スキャン: 本セッション内 fix 4 連続 (#203/#205/#206/#207) は同根 (gcloud spec 確認漏れ)、次に同根が出る経路は PR #208 workflow run 試行時。事前対策として WebFetch + `--help` 確認を行ったが、実走で不整合が出る可能性は残る
- 対症療法判定: 該当なし、ただし PR #208 code-review で A5 policy duration 1 件 finding 提示済 (本田様判断項目)

#### 推奨次セッション action

1. **`/catchup` で状態確認 → PR #208 認可有無を本田様に確認**
   - 「PR #208 をマージしてよい」or 「A5 duration 修正してから merge」or 「PR #208 close」 の 3 択
2. **PR #208 merge 後**: prod IAM 変更 + workflow run の包括 GO (email address 含む) を本田様確認
3. **workflow run 完了後**: 証跡 PR (PR β) 起票

本セッションは深夜帯 + 連続作業で認知負荷が高い。次セッション開始時に `/catchup` で context 復元してから慎重に進めることを推奨。
