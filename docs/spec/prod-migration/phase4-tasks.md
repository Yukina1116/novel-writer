# Phase 4: 一般公開準備 タスク表

- Status: 🚧 **進行中** (2026-06-20 着手、本 PR α = 枠組み先行)
- Owner: yasushi-honda
- Related: [docs/adr/0003-public-launch-operations.md](../../adr/0003-public-launch-operations.md) (PR β で起票、本 PR では未存在)
- Related runbook: [docs/runbook/prod-pitr.md](../../runbook/prod-pitr.md) / [prod-monitoring.md](../../runbook/prod-monitoring.md) / [prod-slo.md](../../runbook/prod-slo.md) (いずれも PR β で起票)
- Related: [phase3-tasks.md](./phase3-tasks.md) §Phase 4 GO チェック (本 Phase で答える GO-1〜GO-6)
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST) / [ADR-0002](../../adr/0002-dev-prod-deploy-flow.md) (dev → prod 運用フロー、本 Phase でも authoritative)

> **本書の位置付け**: 本ドキュメント・関連 ADR-0003・関連 runbook は AI (Claude Code) が起草した **公開準備の草案** である。最終的な運用判断 (PITR 有効化実行、Logging dashboard 構築実行、SLO 採用、課金クォータ申請、法務確認、公開実行 GO-6) は **decision-maker (owner = 本田様)** に委ねる。AI は executor として手順実行と起草を担当する (AI 駆動開発 4 原則 §1)。

## 背景

Phase 3 (PR #200, 2026-06-20) で dev → prod 運用フロー (ADR-0002 + runbook prod-deploy-flow.md) が完成。続く Phase 4 では **一般公開「直前」まで** の運用基盤を整える。

**Phase 4 完了 ≠ 公開実行**。公開実行 (GO-6 = 本田様の公開告知) は **Phase 5** に分離する。Phase 5 GO チェックは本書末尾に独立 section として置く (Phase 3 で Phase 4 GO チェックを起こしたパターンを踏襲)。

## Phase 分割 (再掲)

| Phase | スコープ | 状態 |
|---|---|---|
| Phase 1 | prod インフラ整備 | ✅ 完了 (PR #192/#193/#194) |
| Phase 2 | CI/CD 二環境化 + 初回 prod デプロイ | ✅ 完了 (PR #195/#197/#199) |
| Phase 3 | dev → prod 運用フロー確立 | ✅ 完了 (PR #200) |
| **Phase 4** (本ドキュメント) | 一般公開準備 (GO-3 PITR / GO-4 Logging / GO-5 SLO 文書化 + 法務/課金 tracker) | 🚧 進行中 |
| Phase 5 | 公開実行 (GO-6 本田様公開告知 + KPI 追跡開始) | ⏳ |

## Codex セカンドオピニオン反映済の修正点 (Phase 4 計画段階)

| 修正 | 内容 | 重要度 |
|---|---|---|
| 修正 1 | **PR 分割 2 本** に確定 (PR α = phase4-tasks.md 枠組み先行 / PR β = ADR-0003 + 3 runbook) | M |
| 修正 2 | **ADR-0003 は ADR-0002 補強** の位置付け、冒頭に「ADR-0002 remains authoritative for dev → prod deploy flow; ADR-0003 adds public-launch readiness controls」明記 | **H** |
| 修正 3 | **Firestore データ rollback 設計を prod-pitr.md で完結**。ADR-0002 rollback 3→4 段階拡張案を runbook に記載、ADR-0002 本体は本 PR では変更しない (段階 2 PITR 有効化後 or 別 PR で反映) | **H** |
| 修正 4 | SLO 指標は **`initial draft / to be recalibrated after Phase 5 real traffic`** 注記、99.5% 等は推測値として扱う | M |
| 修正 5 | incident 通知は **email を最小案、Slack/SMS は future work**、確定は本田様判断 | M |
| 修正 6 | 法務 status tracker は **phase4-tasks.md 内 section**、独立ファイル化しない。Status は `Not started / In review / Approved / Blocked` 4 値限定、AI は事実更新のみ | M |
| 修正 7 | 課金クォータ申請 draft は **optional**、`default quota likely sufficient for private testing; public launch quota decision remains owner-approved` 明記 | L |
| 修正 8 | **Phase 5 GO チェック section を本書末尾に独立**、ADR-0003 内には参照 link のみ | **H** |

## タスク一覧

### PR α: 枠組み先行 (本書のみ、約 350 行)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T1 | `docs/spec/prod-migration/phase4-tasks.md` (本ドキュメント) 作成 | 🚧 | AI | AC-P4-1 / AC-P4-6 / AC-P4-10 |
| T2 | lint + test 確認 → PR α 起票 → 番号単位認可 → merge | ⏳ | AI → 本田様 | AC-P4-7 |

### PR β: 詳細設計 (ADR-0003 + 3 runbook、約 750 行、PR α merge 後に起票)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T3 | `docs/adr/0003-public-launch-operations.md` 新規 (Context / Decision / Consequences + ADR-0002 補強位置付け明示) | ⏳ | AI | AC-P4-2 / AC-P4-11 |
| T4 | `docs/runbook/prod-pitr.md` 新規 (有効化 / retention 判断 / 復旧演習 / ADR-0002 rollback 4 段階拡張案) | ⏳ | AI | AC-P4-3 |
| T5 | `docs/runbook/prod-monitoring.md` 新規 (dashboard 構成 / alerting policy / email 最小通知設計) | ⏳ | AI | AC-P4-4 |
| T6 | `docs/runbook/prod-slo.md` 新規 (initial draft 注記 + 3 指標候補 + incident response 草案) | ⏳ | AI | AC-P4-5 |
| T7 | lint + test 確認 → PR β 起票 (reviewer checklist で 4 領域分割) → 番号単位認可 → merge | ⏳ | AI → 本田様 | AC-P4-7 |

### 段階 2 (本 Phase 対象外、別セッション・別 PR、番号単位認可必須)

| # | タスク | AC |
|---|--------|----|
| - | GO-3 PITR 実機有効化 + 復旧演習 + 証跡を `prod-pitr.md` に追記 | AC-P4-8 |
| ✅ | GO-4 Logging dashboard / alerting 実機構築 + 通知到達確認 + 証跡を `prod-monitoring.md` に追記 (実機構築 ✅ 2026-06-21、通知到達確認 ✅ 2026-07-06、A2 実発火 + email 到達確認、A1/A3-A5 は config read-only 確認) | AC-P4-9 |
| ✅ | (段階 3) SLO 草案 → Accepted 化 PR (✅ 2026-07-06、initial draft target をそのまま採用、詳細 `prod-slo.md` §実際の判断根拠) | - |

## Acceptance Criteria

| # | 基準 | 検証方法 |
|---|------|---------|
| AC-P4-1 | `phase4-tasks.md` に T1-T7 タスク表 + AC ≥ 10 項目 + GO-1 法務 status tracker + GO-2 課金クォータ申請 draft + Phase 5 GO チェック section が存在 | `grep -c '^| AC-P4-' docs/spec/prod-migration/phase4-tasks.md` ≥ 10 かつ `grep -cE '^## (GO-1\|GO-2\|Phase 5 GO チェック)' docs/spec/prod-migration/phase4-tasks.md` ≥ 3 |
| AC-P4-2 | ADR-0003 に Context / Decision / Consequences の 3 section + ADR-0002 補強位置付け明示 + 冒頭に「草案、最終判断は decision-maker」 (PR β で検証) | `grep -cE '^## (Context\|Decision\|Consequences)' docs/adr/0003-public-launch-operations.md` = 3 かつ `grep -c 'ADR-0002 remains authoritative' docs/adr/0003-public-launch-operations.md` ≥ 1 |
| AC-P4-3 | `prod-pitr.md` に「有効化手順」「retention 期間判断」「復旧演習」「ADR-0002 rollback 4 段階拡張案」の 4 section + 関連 ADR link (PR β で検証) | `grep -cE '^## (有効化\|retention\|復旧演習\|ADR-0002 rollback)' docs/runbook/prod-pitr.md` ≥ 4 |
| AC-P4-4 | `prod-monitoring.md` に「dashboard 構成」「alerting policy」「通知先設計 (email 最小)」の 3 section + Slack/SMS を future work として明示 (PR β で検証) | `grep -cE '^## (dashboard\|alerting\|通知)' docs/runbook/prod-monitoring.md` ≥ 3 かつ `grep -c 'future work\|Future work' docs/runbook/prod-monitoring.md` ≥ 1 |
| AC-P4-5 | `prod-slo.md` に「SLO 指標 (可用性/エラー率/AI応答失敗率)」「incident response」「通知 channel」の 3 section + initial draft 注記 (PR β で検証) | `grep -cE '^## (SLO 指標\|incident response\|通知)' docs/runbook/prod-slo.md` ≥ 3 かつ `grep -c 'initial draft\|recalibrated after Phase 5' docs/runbook/prod-slo.md` ≥ 1 |
| AC-P4-6 | `phase4-tasks.md` 内に GO-1 法務 status tracker (4 値 status) + GO-2 課金クォータ申請 draft section | `grep -c 'Not started\|In review\|Approved\|Blocked' docs/spec/prod-migration/phase4-tasks.md` ≥ 4 かつ `grep -c '課金クォータ申請\|owner-approved' docs/spec/prod-migration/phase4-tasks.md` ≥ 1 |
| AC-P4-7 | `npm run lint` PASS + `npm run test` PASS (本 PR は doc のみだが、規律として実行) | tsc エラー 0 件 + vitest 全 PASS |
| AC-P4-8 | GO-3 PITR 実機有効化 (dev / prod 両方) + 証跡が `prod-pitr.md` に追記。復旧演習は CI 自動化困難 (clone LRO の所要時間) により Phase 4 段階 3 で手動 Console 演習に方針変更 | gcloud + grep (本セッション 2026-06-20 完了、prod_workflow #27875198225) |
| AC-P4-9 | GO-4 Logging dashboard / alerting 実機構築 + 証跡が `prod-monitoring.md` に追記 (✅ 2026-06-21、workflow #27887069695、dashboard ID 5d5790d9、5 alerting policies ENABLED。通知到達確認 ✅ 2026-07-06、A2 は `/api/users/init` 無認証 POST の合成テストで実発火 + email 到達確認、A1/A3-A5 は `gcloud` read-only 確認のみで Phase 5 実トラフィックに委ねる) | gcloud + grep (`prod-monitoring.md` 「監視 dashboard 履歴」「監視構築履歴」テーブルに dashboard URL + 5 policy 行 + GO-4 判断根拠 section) |
| AC-P4-10 | `phase4-tasks.md` 末尾に「Phase 5 GO チェック」独立 section + Phase 4 完了 ≠ Phase 5 GO 明文化 + GO-1〜GO-6 全項目 trigger 条件記載 | `grep -c '^## Phase 5 GO チェック' docs/spec/prod-migration/phase4-tasks.md` = 1 かつ `awk '/^## Phase 5 GO チェック/,/^## 参考/' docs/spec/prod-migration/phase4-tasks.md \| grep -cE 'GO-1\|GO-2\|GO-3\|GO-4\|GO-5\|GO-6'` ≥ 6 |
| AC-P4-11 | ADR-0003 冒頭に「ADR-0002 remains authoritative for dev → prod deploy flow; ADR-0003 adds public-launch readiness controls without superseding ADR-0002」が記載 (PR β で検証) | `grep -c 'without superseding ADR-0002' docs/adr/0003-public-launch-operations.md` ≥ 1 |

## Phase 4 スコープ外 (NG リスト、本 Phase に含めない)

| カテゴリ | 項目 | 理由 |
|---|---|---|
| Phase 5 領分 | prod 公開告知 traffic 切替 | GO-6 は decision-maker 操作 |
| Phase 5 領分 | 一般公開後 KPI 追跡 | Phase 5 で別途設計 |
| 別マイルストーン | M5 (Stripe Tier 2 課金) 実装 | 別軸 |
| 段階 2 (別 PR) | Firestore PITR の AI 単独実機有効化 | 番号単位認可必須、本 PR は手順記載のみ |
| 段階 2 (別 PR) | Cloud Logging dashboard / alerting の AI 単独実機構築 | 同上 |
| decision-maker 領分 | 法務文書 (規約 3 文書) の AI 単独修正 | content は法務、AI は status 更新のみ |
| decision-maker 領分 | 顧問弁護士との連絡・進捗確認・督促 | 4 原則 §1 |
| decision-maker 領分 | 課金クォータ申請提出可否判断 | template 起草のみ AI、提出は本田様 |
| Future work (Phase 5 以降) | Slack / SMS 通知 channel 実装 | email 最小案で Phase 4 完了 |
| Future work (Phase 5 以降) | SLO 実値ベース再校正 | Phase 5 公開後の real traffic データ必須 |
| Future work (一般公開後) | secret rotation 方針詳細 | Phase 3 NG リスト維持 |
| ADR-0002 本体修正 | rollback 3→4 段階拡張の ADR-0002 反映 | 本 PR は prod-pitr.md に拡張案のみ記載、ADR-0002 本体は段階 2 PITR 有効化後 or 別 PR で反映 |

## GO-1: 法務確認 status

> **担当**: 本田様。AI は事実更新のみ executor 領分 (内容判断は decision-maker)。
>
> **2026-06-21 方針変更**: 本セッションで本田様判断により、**Tier 0/1 無料運用範囲では「一般的な最低限の自己整備」で stub のまま本番公開可**とし、顧問弁護士確認は **Tier 2 (有料化) 開始時の前提条件**に移行。Phase 5 GO チェックのブロッカーから外す (詳細 ADR-0001 §開放する課題 2026-06-21 更新)。
>
> **Status 4 値**: `Not started` / `In review` / `Approved` / `Blocked` / `Deferred (Tier 2 開始時)`
>
> 正本は `public/legal/*.md` (HTML render は `public/legal/*.html`)。本 section は status 追跡のみ。

| 文書 | Status | 最終更新 | 備考 |
|---|---|---|---|
| 利用規約 (terms-of-service) | Deferred (Tier 2 開始時) | 2026-06-21 | Tier 0/1 範囲は LEGAL_REVIEW_REQUIRED stub で本番公開済、有料化前に「最低限の自己整備」で本田様確認 |
| プライバシーポリシー (privacy-policy) | Deferred (Tier 2 開始時) | 2026-06-21 | 同上 (個人情報保護法 21 条のプライバシーポリシー設置義務は自己整備済 stub で履行) |
| 特商法表記 (tokushou) | Deferred (Tier 2 開始時) | 2026-06-21 | 現状無料 (Tier 0/1) のため特商法表記義務対象外、Tier 2 開始時に本文確定 |

### 法務確認の進め方 (2026-06-21 方針変更後)

**Tier 0/1 無料運用フェーズ (現状)**:
- `LEGAL_REVIEW_REQUIRED` stub のまま本番公開で OK (本田様確認済)
- 法的義務 (個人情報保護法 21 条のプライバシーポリシー設置 + 利用目的通知) は stub の内容で履行
- 顧問弁護士確認は任意

**Tier 2 有料化開始時 (本田様明示指示後)**:
1. 「一般的な最低限の自己整備」を本田様が確認 (顧問弁護士は任意、必要なら投げる)
2. 必要に応じて `public/legal/*.md` を本田様 or 本田様承認後 AI が編集
3. 承認後、`LEGAL_REVIEW_REQUIRED` 警告ヘッダーを削除 (別 PR)
4. 本 tracker の Status を `Approved` に更新

### Phase 5 GO への影響

**2026-06-21 方針変更**: GO-1 は Phase 5 GO チェックの **ブロッカーから外す**。Phase 5 (Tier 0/1 公開実行) は GO-3〜GO-5 + 本田様 GO-6 のみで判定。GO-1 は **Tier 2 (有料化) 開始時の前提条件** として再評価する。

## GO-2: 課金クォータ申請 draft (optional)

> **Phase 2 smoke test 結果 (68 文字 / 1 回呼出) からは default quota likely sufficient for private testing; public launch quota decision remains owner-approved.**
>
> 本 section は申請が必要になった場合の template 起草。提出可否判断は本田様。

### 現状の quota 利用状況 (Phase 2 時点)

| サービス | quota | 利用率 (推定) | 一般公開後の懸念 |
|---|---|---|---|
| Vertex AI (`gemini-2.5-flash`) | region default | < 1% (smoke test 1 call) | ユーザー数 × AI 呼出頻度で増加 |
| Vertex AI (`Imagen`) | region default | 0% | 1 リクエスト 4 画像生成、コスト重め |
| Cloud Run | default (1000 req/sec) | 〜 | 公開後の DAU 次第 |
| Firestore (read/write) | default (10K req/sec) | < 1% | 同上 |

### 申請 template (本田様が Google Cloud Console に転記可能な形)

> **本 template は AI が起草した optional draft**。本田様が「申請が必要」と判断したときに転用してください。

**Vertex AI Quota Increase Request (英文):**

```
Subject: Quota Increase Request for Vertex AI (gemini-3.1-flash-lite, Nano Banana 2 Lite) — novel-writer-prod

Project ID: novel-writer-prod
Region: asia-northeast1 (text) / global (image)
Current default quota: <現状値、Google Cloud Console で確認>
Requested quota: <希望値>
Use case: AI-assisted novel writing SaaS. Each end user invokes
gemini-3.1-flash-lite for prose generation (~200-2000 input tokens, ~300-1000
output tokens per call, average ~3 calls/session). Nano Banana 2 Lite
(gemini-3.1-flash-lite-image) invoked opt-in for character portrait
generation (~4 parallel calls per session, 1 image per call).
Expected DAU at public launch: <本田様見積もり>
Expected concurrent peak: <本田様見積もり>
Project status: Pre-launch, private testing complete (Phase 2 smoke
test successful: 68 chars generated in 1 call).
Contact: <本田様 email>
```

**Cloud Run / Firestore quota**: 公開後の実利用データを 1〜2 週間取得してから申請判断。Phase 5 公開後 GO-2 再評価。

### Phase 5 GO への影響

GO-2 は **「default quota で行ける見込み」または「申請 Approved」** のどちらかが必要。本田様の判断項目。

## Phase 5 GO チェック

> **重要**: Phase 4 完了は **Phase 5 (公開実行 = 公開告知 + KPI 追跡開始) の GO ではない**。Phase 4 で文書化 + 起草 + (段階 2 で) PITR/Logging 実機構築が完了しても、それは「公開できる準備が整った」状態であって「公開する」ことではない。一般公開 (Phase 5) には下記すべてが充足され、かつ **decision-maker (本田様) からの明示 GO** が必要である。

### Phase 5 (公開実行) 前に充足すべき項目

| # | 項目 | 担当 | trigger (充足条件) |
|---|------|------|------------------|
| GO-1 | 法務確認 (利用規約 / プライバシーポリシー / 特商法表記) | 本田様 | **2026-06-21 方針変更**: Tier 0/1 無料運用は stub のまま公開可。Tier 2 (有料化) 開始時の前提条件に移行、Phase 5 (Tier 0/1 公開) のブロッカーではない |
| GO-2 | 課金クォータ (default で行ける見込み or 申請 Approved) | 本田様 | 本書 §GO-2 判断完了 (Phase 2 smoke + 想定 DAU で評価) |
| GO-3 | Firestore PITR 有効化 (dev / prod 両方 ✅ 完了 2026-06-20) + 復旧演習 (段階 3 で手動 Console 演習に方針変更) | AI 実行 (本田様番号単位認可後) | 段階 2 PR merge + `prod-pitr.md` に証跡追記 ✅ |
| GO-4 | Cloud Logging dashboard + alerting 構築 (✅ 2026-06-21) + 通知到達確認 (✅ 2026-07-06、A2 実発火 + email 到達確認、A1/A3-A5 は config read-only 確認・Phase 5 実トラフィックで自然検証) | AI 実行 (本田様番号単位認可後) | 段階 2 PR merge + `prod-monitoring.md` に証跡追記 ✅ |
| GO-5 | SLO Accepted (✅ 2026-07-06、initial draft target をそのまま採用、`prod-slo.md` Status を `Accepted` に変更) | 本田様レビュー → AI 更新 PR | 段階 3 PR merge ✅ |
| GO-6 | 本田様からの公開告知 GO + Phase 5 spec 着手指示 | 本田様 | 上記 GO-1〜GO-5 すべて ✅ (GO-2 のみ本田様の最終判断待ち) + 明示指示 |

### Phase 5 着手の trigger 条件

- 上記 GO-1〜GO-6 **すべて** が ✅ になる
- かつ **本田様から「Phase 5 着手 GO」の明示指示** (Phase 4 着手指示と同じパターン)
- AI は自発的に Phase 5 着手を提案しない (AI 駆動開発 4 原則 §1 越権防止)

### Phase 4 完了 ≠ Phase 5 GO

Phase 4 完了 (本 phase4-tasks.md 全 chk + ADR-0003 + 3 runbook merge + 段階 2 実機構築 + GO-5 SLO Accepted) の意味:
- ✅ 公開する準備が整った
- ✅ 公開後に必要な PITR / Logging / SLO 基盤が起動した

Phase 4 完了の意味**ではない**もの:
- ❌ 公開告知してよい
- ❌ Phase 5 を自動的に開始してよい
- ❌ 法務 / 課金 / 公開告知判断を AI が代行してよい

## 参考

- ADR-0001 §Consequences (緊急対応 + max-instances=2 + 月 ¥1,000 予算アラート、Phase 4 でも適用継続)
- ADR-0002 (dev → prod 運用フロー、本 Phase でも authoritative、ADR-0003 は補強)
- [phase3-tasks.md](./phase3-tasks.md) §Phase 4 GO チェック (本 Phase が答える GO-1〜GO-6)
- [runbook prod-deploy-flow.md](../../runbook/prod-deploy-flow.md) (Phase 3 で起草、本 Phase でも適用)
- ADR-0003 / prod-pitr.md / prod-monitoring.md / prod-slo.md (PR β で起票)
- `.claude/memory/feedback_env_var_naming_drift.md` (Phase 2 教訓)
- `.claude/memory/feedback_firebase_auth_setup_gotcha.md` (Phase 1 補完事項)
