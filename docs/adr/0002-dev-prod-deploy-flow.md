# ADR-0002: dev → prod 運用フロー判断基準

- Status: Draft (本書は AI 起草の **草案**。最終的な運用判断は **decision-maker = owner (本田様)** に委ねる)
- Date: 2026-06-20
- Decision Drivers: prod 環境の安全性、Phase 2 で発覚した bug 教訓の体系化、Phase 4 一般公開前の運用フロー整備
- Related: [Phase 3 spec](../spec/prod-migration/phase3-tasks.md), [runbook prod-deploy-flow.md](../runbook/prod-deploy-flow.md)
- Related: [ADR-0001](./0001-local-first-architecture.md) §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST)
- Supersedes: なし
- Superseded by: なし

> **本書の位置付け**: 本 ADR は Phase 3 (prod migration の運用フロー確立フェーズ) において、AI (Claude Code) が起草した **運用判断基準の草案** である。最終的な運用判断 (deploy 可否、rollback 実施、prod データ扱い、Phase 4 着手) は **decision-maker (owner = 本田様)** に委ねる。AI は executor として手順実行と起草を担当する (AI 駆動開発 4 原則 §1)。

## Context

### Phase 2 完了時点の状況 (2026-06-20)

- `novel-writer-prod` Cloud Run service が稼働中 (revision `novel-writer-00002-jv2`)
- 一般公開はまだ。現状は本田様 (owner) 自身の dev test 用
- `.github/workflows/deploy-prod.yml` は `workflow_dispatch` only (誤 deploy 防止)
- dev 環境 (`novel-writer-dev`) は `main` push で自動 deploy

### Phase 2 で発覚した bug 2 件 (本 ADR の起草理由)

| # | Bug | 教訓 |
|---|------|------|
| 1 | Firebase Auth 設定漏れ (Google sign-in provider + authorizedDomains) | infra 整備 PR と動作確認 PR の間に「Firebase Console UI 設定」がブラックボックス化していた。runbook で明示チェック必須 |
| 2 | env_var_drift bug (`GCLOUD_PROJECT` 不在 + hardcoded fallback `'novel-writer-dev'` で prod token 全 401 reject) | dev / prod 共通の env var 命名規約を runbook 化、deploy 後の env vars 実機検証 (`gcloud run services describe`) を deploy 判断チェックリスト必須項目に |

### 解決すべき問い (Phase 3 で答える)

1. **deploy 判断**: dev で merge した変更を、いつ prod に上げるか。bug fix と機能追加で扱いを変えるか
2. **tag**: prod に上げた revision をどう識別するか (rollback 時に「直前 revision」を特定するため)
3. **rollback**: 問題発生時、どの段階で rollback を発火するか、どこまで戻すか
4. **データ同期**: dev / prod の Firestore データを行き来させるか

### 制約

- prod は decision-maker 1 名 (本田様) のみが利用
- Phase 4 (一般公開) は別 ADR / 別 runbook で再設計予定
- 法務確認 / 課金クォータ / Firestore PITR / 監視 dashboard は Phase 4 の前提条件で本 ADR では扱わない (decision-maker 領分)

## Decision

以下 4 つの判断基準を採用する。各基準は ADR (規範: なぜ) と runbook (手順: どう) で対になる。runbook の手順を本 ADR が裏付ける構造。

### 1. dev → prod 手動 deploy の判断基準

**規範**: dev で **最低 24 時間** 安定動作確認した変更のみを prod に上げる。bug fix と機能追加で異なる経路を取る。

| 変更種別 | 判断基準 | 必要な前提 |
|---|---|---|
| **緊急 bug fix** (prod で発生中の障害修正) | dev で動作確認 + 本田様明示 GO | revert PR の場合は revert 元 PR の番号を deploy log に記録 |
| **通常 bug fix** | dev に merge 後 24 時間以上経過 + dev で再現テスト PASS | 関連 Issue (もしあれば) を deploy 説明に記載 |
| **機能追加 / リファクタ** | dev に merge 後 24 時間以上 + 本田様明示 GO + Phase 2 教訓 chk PASS (env_var_drift / Firebase Auth 設定) | 機能 spec への link を deploy 説明に記載 |
| **doc only / config only** | prod 影響なしの判断ができれば deploy 不要 (deploy するなら通常 fix 扱い) | - |

**理由**:
- 24 時間の待機は、dev で気付かない breaking change を運用テストで発見する時間バッファ
- Phase 2 で発覚した env_var_drift / Firebase Auth 設定漏れの再発防止チェックを明文化することで、checklist として欠落しないようにする
- 「本田様明示 GO」要件で AI が独断 deploy できない構造にする (4 原則 §1 越権防止)

### 2. prod tag 戦略

**規範**: deploy ごとに **`prod-YYYYMMDD-HHMM-<shortsha>` 形式の Git tag** を merge commit に付与し、Cloud Run revision name (`novel-writer-NNNNN-xxx`) と対応付ける。

```
例: prod-20260620-1830-ef5a40a → Cloud Run revision novel-writer-00002-jv2
```

| 項目 | 採用 | 理由 |
|---|---|---|
| **日付+short SHA (採用)** | ✅ | rollback 時に「直前 prod tag」を `git tag --list 'prod-*' --sort=-creatordate` で即特定可能。time-anchored で人間にも読みやすい |
| semver (`v1.2.3`) | ❌ Phase 3 では不採用 | single-tenant 段階では版管理粒度が過剰。breaking change の概念が薄い。Phase 4 一般公開後に併用検討 (future work) |
| commit SHA のみ (`ef5a40a`) | ❌ | 日時が読めず、Cloud Run revision との対応が直感的でない |

**理由**:
- 日付+short SHA は rollback 判断時の「直前 prod は何時の何だったか」を 1 行で表現できる
- semver は API バージョニング / breaking change 概念が前提だが、single-tenant prod では適用機会が薄い
- 将来 Phase 4 で一般公開後、外向き API バージョンが意味を持つようになったら semver 併用を再考

### 3. rollback 判断基準

**規範**: prod 問題発生時、影響度に応じて **3 段階** で rollback を選択する。Firestore データ rollback は **Phase 3 のスコープ外** で、**Phase 4 で PITR と一体再設計** する。

| 段階 | 状況 | 操作 | 復旧時間目安 |
|---|------|------|------------|
| **段階 1: 公開即遮断** (最優先、誤公開・情報漏洩・課金暴走) | 影響拡大の止血を最速で行う | `gcloud run services update novel-writer --no-allow-unauthenticated --region=asia-northeast1 --project=novel-writer-prod` | 数十秒 |
| **段階 2: 直前 revision 切替** (通常 rollback、新 revision に欠陥) | アプリの挙動を 1 段戻す | `gcloud run services update-traffic novel-writer --to-revisions=<前revision>=100 --region=asia-northeast1 --project=novel-writer-prod` | 数十秒〜数分 |
| **段階 3: service delete** (最終手段、service 自体が壊れた / 重大インシデント) | prod service ごと削除 | `gcloud run services delete novel-writer --region=asia-northeast1 --project=novel-writer-prod` | 数分 |

**スコープ外 (Phase 4 で再設計)**: Firestore データの時点復元 (PITR)。Phase 3 段階では PITR 未設定のため、データ汚染が起きた場合の恒久 rollback 手段が存在しない。Phase 4 着手前に PITR 有効化と一体で再設計する (phase3-tasks.md §Phase 4 GO チェック GO-3 参照)。

**理由**:
- 段階 1 は影響拡大を最速で止める止血手段。allow-unauthenticated を OFF にすれば外部から API にアクセスできない
- 段階 2 は通常運用の rollback。前 revision がある限り即実行可
- 段階 3 は段階 1/2 で対処不可能な重大事態の最終手段
- Firestore データ rollback を Phase 3 に書かないのは、PITR 未設定下で「データ削除」を rollback として位置付けると irreversible 操作を肯定する誤解を生むため (Codex セカンドオピニオン High 指摘)

### 4. prod ↔ dev データ同期方針

**規範**: **prod → dev / dev → prod の双方向データ同期は原則禁止**。bug 再現は **synthetic data** または **手動最小再現** で行う。anonymize copy も Phase 3 段階では許容しない。

| 操作 | 可否 | 理由 |
|---|------|------|
| dev → prod データコピー | ❌ 禁止 | dev のテストデータが prod に混入するリスク。dev は壊して良い前提で運用 |
| prod → dev データコピー (anonymize copy 含む) | ❌ 禁止 | anonymize 漏れ / 範囲外 PII の混入リスク。bug 再現は synthetic data で代替可能 |
| prod → dev スキーマ確認 (Firestore Console での目視) | ✅ 許容 | データ自体の export ではないため |
| dev で synthetic data 作成 → bug 再現 | ✅ 推奨 | 個人情報を含まないため安全 |
| 手動最小再現 (本田様 dev アカウントで手動入力) | ✅ 推奨 | 範囲を自分の入力に限定 |

**理由**:
- prod が現状本田様 1 名のみで PII 範囲が狭いとはいえ、anonymize 手順を起草すると「許容運用」化して将来 (一般公開後) のリスクになる
- bug 再現は synthetic data / 最小再現で十分実行可能 (Phase 2 で発覚した 2 件の bug も synthetic 入力で再現できた)
- Phase 4 一般公開後に「prod データを debug に使う」場面が出てきたら、anonymization spec を別 ADR で起こす

## Consequences

### 良い影響

- Phase 2 で発覚した 2 件の bug (Firebase Auth / env_var_drift) の再発防止を deploy 判断チェックリストで明文化、構造的に再発リスクを下げる
- rollback 操作の選択を 3 段階に縮約することで、判断時の認知負荷を下げる
- データ同期を原則禁止にすることで、PII 混入リスクを構造的に排除
- Phase 4 一般公開前に「何が決まっていて何が未決か」を明示することで、暗黙的な Phase 4 連動を防ぐ (4 原則 §1 越権防止)

### 受け入れる制約

- deploy 待機 24 時間ルールにより、緊急でない fix の prod 反映が遅くなる (current owner = 本田様のみ利用なので影響は限定的)
- prod データ rollback 手段が Phase 3 段階で存在しない (Phase 4 PITR 設定までは段階 1/2/3 のみ)
- anonymize copy 禁止により、本物データでしか再現しない bug があれば dev で再現不可 (synthetic data で代替を試みる)

### Phase 4 公開前に再設計する項目 (本 ADR では扱わない)

| 項目 | 再設計時の論点 |
|---|---|
| Firestore PITR + データ rollback | enable-pitr → 何日 retain → 復旧時の operation 手順 |
| Cloud Logging 監視 dashboard | ERROR rate / auth fail rate / Vertex AI quota / Cloud Run 5xx |
| SLO / incident policy | 可用性目標 / incident response / 通知 channel |
| secret rotation | Firebase project key / WIF Service Account / GitHub Secrets |
| 一般公開時 deploy 判断 | 複数ユーザー影響時の判断者・連絡フロー |

これら未決項目は [phase3-tasks.md §Phase 4 GO チェック](../spec/prod-migration/phase3-tasks.md#phase-4-go-チェック) で追跡する。

## 参考

- [phase3-tasks.md](../spec/prod-migration/phase3-tasks.md) (本 ADR と対の Phase 3 タスク表)
- [runbook prod-deploy-flow.md](../runbook/prod-deploy-flow.md) (本 ADR の手順実装)
- [phase2-tasks.md](../spec/prod-migration/phase2-tasks.md) §Phase 3 引き継ぎ事項 (本 ADR が答えるべき問い)
- [prod-phase2-deploy.md](../runbook/prod-phase2-deploy.md) §Rollback 手順 (Phase 2 で実装した 3+1 段階 rollback、本 ADR で 3 段階に縮約)
- ADR-0001 §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST、本 ADR でも継承)
- `.claude/memory/feedback_env_var_naming_drift.md` (Phase 2 で発覚した env_var_drift bug の教訓 memory)
- `.claude/memory/feedback_firebase_auth_setup_gotcha.md` (Phase 1 補完事項の教訓 memory)
