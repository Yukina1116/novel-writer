# Runbook: dev → prod 運用フロー (Phase 3)

- Status: 🚧 Draft (本書は AI 起草の **草案**。deploy 可否・rollback 実施・tag 付与の最終判断は **decision-maker = owner (本田様)** に委ねる)
- Last Updated: 2026-06-20
- Owner: yasushi-honda
- Related ADR: [ADR-0002](../adr/0002-dev-prod-deploy-flow.md) (本書の判断基準を裏付ける規範)
- Related: [Phase 3 spec](../spec/prod-migration/phase3-tasks.md)
- Related runbook: [prod-infrastructure-setup.md](./prod-infrastructure-setup.md) (Phase 1 インフラ整備), [prod-phase2-deploy.md](./prod-phase2-deploy.md) (Phase 2 初回 deploy 証跡)

> **本書の位置付け**: dev → prod の通常運用 (Phase 4 一般公開後も適用する手順) を文書化した実務マニュアル。判断の規範は ADR-0002、本書は手順。本書中の「判断」が出てくる箇所はすべて decision-maker (本田様) の最終判断を要する。

## 用途

- dev で merge した変更を prod に上げる際の判断 + 実行手順
- prod 問題発生時の rollback 判断 + 実行手順
- dev / prod 間のデータ同期に関する規範
- Phase 2 で発覚した 2 件の bug (Firebase Auth / env_var_drift) の再発防止チェック

## 前提

- prod = `novel-writer-prod` Cloud Run service @ asia-northeast1
- dev = `novel-writer-dev` Cloud Run service @ asia-northeast1
- prod deploy は `.github/workflows/deploy-prod.yml` (`workflow_dispatch` only)
- dev deploy は `.github/workflows/deploy.yml` (`main` push で自動)
- prod 利用者は現状 owner (本田様) 1 名 (一般公開は Phase 4 trigger)

## deploy 判断チェックリスト

**用途**: dev → prod に変更を上げる前、本 checklist を上から順に確認する。1 つでも ❌ があれば deploy しない / 解消してから再評価。

### Step 1: 変更種別の特定

| 変更種別 | 待機時間 | 必要な前提 |
|---|---|---|
| 緊急 bug fix (prod 障害修正) | なし (即時可) | revert 元 PR 番号を deploy 説明に記載、本田様明示 GO |
| 通常 bug fix | dev merge 後 **24 時間以上** | dev で再現テスト PASS、Issue 番号 (あれば) |
| 機能追加 / リファクタ | dev merge 後 **24 時間以上** | spec / impl-plan へのリンク、本田様明示 GO |
| doc only / config only | - | prod 影響なしの判断ができれば deploy 不要 |

### Step 2: Phase 2 教訓 再発防止チェック

| # | チェック | 検証コマンド / 確認方法 | NG の場合 |
|---|------|----|------|
| C-1 | `GCLOUD_PROJECT` env が deploy-prod.yml で `novel-writer-prod` に設定されている | `grep -A2 'GCLOUD_PROJECT' .github/workflows/deploy-prod.yml` | deploy-prod.yml を修正してから再 deploy |
| C-2 | `server/firebaseAdmin.ts` の hardcoded fallback が削除されている (`'novel-writer-dev'` を含まない) | `grep -c "'novel-writer-dev'" server/firebaseAdmin.ts` = 0 | Phase 2 PR-D の修正を再適用 |
| C-3 | `server/aiClient.ts` も同様 (fail-fast 化済) | `grep -c "'novel-writer-dev'" server/aiClient.ts` = 0 | 同上 |
| C-4 | Firebase Auth Google provider が enabled | Firebase Console → Authentication → Sign-in method | UI で enable + authorizedDomains 確認 |
| C-5 | authorizedDomains に prod Cloud Run URL が含まれている | Firebase Console → Authentication → Settings → Authorized domains | UI または REST API で追加 |

### Step 3: 動作確認 chk (dev で行う最低限)

| # | チェック | 方法 |
|---|------|----|
| V-1 | `npm run lint` PASS | `npm run lint` |
| V-2 | `npm run test` PASS | `npm run test` |
| V-3 | dev でログイン + 主機能 1 つを手動確認 | https://novel-writer-dev... にアクセスして本田様自身で確認 |

### Step 4: 本田様の deploy GO

上記 Step 1〜3 がすべて ✅ になった上で、AI は本田様に「PR #X を prod に deploy してよろしいですか」と **番号単位明示で確認**する。本田様の明示 GO がない限り `gh workflow run deploy-prod.yml` を実行しない (AI 駆動開発 4 原則 §1, §3)。

### Step 5: deploy 実行

```bash
gh workflow run deploy-prod.yml --ref main
```

実行後、GitHub Actions UI で完了を確認:

```bash
gh run list --workflow=deploy-prod.yml --limit=1
gh run view <run-id> --log
```

### Step 6: deploy 後の検証 (env_var_drift 再発防止)

```bash
# Cloud Run revision 取得
gcloud run services describe novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod \
  --format='value(status.latestReadyRevisionName)'

# env vars actual 確認 (GCLOUD_PROJECT が novel-writer-prod になっていること)
gcloud run services describe novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod \
  --format='value(spec.template.spec.containers[0].env)'

# 未認証 curl で 401 確認 (AC-13 retest)
curl -i https://<prod-url>/api/users/init
# → HTTP/2 401 が期待値
```

deploy 後検証結果は deploy 説明 PR にコメント追記する (Phase 2 では runbook 証跡セクション、Phase 3 以降は deploy ごとに PR or Issue で証跡管理)。

## tag 付与コマンド例

**規範** (ADR-0002 §2): deploy ごとに `prod-YYYYMMDD-HHMM-<shortsha>` 形式の Git tag を merge commit に付与する。

### tag 付与手順

```bash
# 1. main の最新コミットを取得
git fetch origin main
git checkout main
git pull --ff-only origin main

# 2. short SHA 取得
SHORT_SHA=$(git rev-parse --short=7 HEAD)

# 3. 現在時刻で tag 名生成 (UTC ではなく JST で本田様視点)
TAG_NAME="prod-$(date +%Y%m%d-%H%M)-${SHORT_SHA}"
echo "$TAG_NAME"
# 例: prod-20260620-1830-ef5a40a

# 4. tag 作成 + push (annotated tag、deploy 内容を message に)
git tag -a "$TAG_NAME" -m "prod deploy: <PR 番号 / 変更内容要約>"
git push origin "$TAG_NAME"

# 5. 直近 prod tag を一覧確認 (rollback 時に利用)
git tag --list 'prod-*' --sort=-creatordate | head -5
```

### Cloud Run revision との対応記録

tag と revision の対応を runbook 末尾の「prod deploy 履歴」テーブル (本書末尾) に追記する。これにより rollback 時に「直前 prod tag = revision X」を即特定できる。

## rollback 判断と 3 段階手順

**規範** (ADR-0002 §3): prod 問題発生時、影響度に応じて 3 段階で rollback を選択する。Firestore データ rollback は Phase 4 で PITR と一体再設計する (本書スコープ外)。

### rollback flowchart (text)

```
prod で問題発生
    │
    ▼
影響度の判定 (本田様判断)
    │
    ├─ 情報漏洩 / 課金暴走 / 誤公開 ─→ 段階 1: 公開即遮断
    │                                       │
    │                                       ▼
    │                                  原因調査 → 修正 → 再 deploy
    │
    ├─ アプリ挙動の欠陥 (前 revision で正常) ─→ 段階 2: 直前 revision 切替
    │                                              │
    │                                              ▼
    │                                         dev で fix → 再 deploy → tag 付与
    │
    └─ service 自体が壊れた / 重大インシデント ─→ 段階 3: service delete
                                                        │
                                                        ▼
                                                   Phase 2 から再構築
```

### 段階 1: 公開即遮断 (最優先、止血)

**いつ使うか**: 情報漏洩 / 認証バイパス / 課金暴走 / 誤公開 など、影響拡大の阻止が最優先な場合。

```bash
gcloud run services update novel-writer \
  --no-allow-unauthenticated \
  --region=asia-northeast1 \
  --project=novel-writer-prod
```

実行後、`/` 含む全 endpoint が IAM 認証必須になり、外部からアクセス不能。次に原因調査 → 修正 → 再 deploy → `--allow-unauthenticated` 復元。

### 段階 2: 直前 revision 切替 (通常 rollback)

**いつ使うか**: 新 revision の挙動に欠陥があり、直前 revision に戻せば運用継続可能な場合。

```bash
# 1. revision 一覧確認
gcloud run revisions list \
  --service=novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod

# 2. 直前 prod tag に対応する revision に 100% トラフィック切替
gcloud run services update-traffic novel-writer \
  --to-revisions=<前revision名>=100 \
  --region=asia-northeast1 \
  --project=novel-writer-prod

# 3. 切替後の動作確認 (curl + ブラウザ)
curl -i https://<prod-url>/api/users/init  # 401 確認
```

直前 revision 名は本書末尾の「prod deploy 履歴」テーブルから tag 経由で特定する。

### 段階 3: service delete (最終手段)

**いつ使うか**: 段階 1/2 で対処不可能な重大インシデント (service 全体が壊れた、revision 切替も効かない等)。

```bash
gcloud run services delete novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod
```

Service 削除後、再構築するには `deploy-prod.yml` を再実行 (Artifact Registry image は残るので image rebuild は GitHub Actions が再 push する)。

### スコープ外: Firestore データ rollback

Phase 3 段階では Firestore PITR が **未有効**。データ汚染が起きた場合、Phase 3 が提供できる手段は以下のみ:

- Firebase Console から該当 doc を**手動削除** (irreversible、復元不可)
- 本田様自身の uid のみ書き込まれている前提のため、影響範囲は限定的

**恒久対応 (Phase 4 で再設計)**: `phase3-tasks.md §Phase 4 GO チェック GO-3` で PITR 有効化を着手条件にしている。PITR 有効後は `gcloud firestore databases restore` でデータ rollback 可能になる。

## データ同期 NG ポリシー

**規範** (ADR-0002 §4): prod ↔ dev の双方向データ同期は **原則禁止**。anonymize copy も Phase 3 段階では許容しない。

### 禁止する運用

| 操作 | 可否 | 理由 |
|---|------|------|
| `gcloud firestore export` で prod → dev コピー | ❌ 禁止 | anonymize 漏れリスク、本物データの拡散 |
| dev → prod コピー | ❌ 禁止 | dev テストデータの prod 混入リスク |
| anonymize script を組んで prod → dev コピー | ❌ 禁止 | anonymize 漏れ判定が困難。範囲外 PII 混入リスク |

### 許容する運用

| 操作 | 可否 | 補足 |
|---|------|------|
| prod Firebase Console での doc 目視 (スキーマ確認) | ✅ | データ export ではない |
| dev で synthetic data を手動入力して bug 再現 | ✅ 推奨 | PII を含まない |
| 本田様自身が dev に手動で最小入力 → bug 再現 | ✅ 推奨 | 範囲を自分の操作に限定 |

### Phase 4 一般公開後の再評価

一般公開後に「prod データを debug に使う必要がある」場面が出てきたら、anonymization spec を別 ADR で起こす (Phase 3 では起草しない)。理由: Phase 3 段階で anonymize 手順を起草すると、PII 規模が狭い間に「許容運用」化して将来のリスクを膨張させるため。

## prod deploy 履歴

| tag | Cloud Run revision | deploy 日時 | 内容 | 状態 |
|---|---|---|---|---|
| (Phase 3 PR 以降この表に追記) | - | - | - | - |
| 参考: 暫定 revision (Phase 2 完了時) | `novel-writer-00002-jv2` | 2026-06-20 | Phase 2 初回 deploy + env_var_drift hotfix | ✅ 現行 |

> 注: Phase 2 までは tag 運用未開始のため履歴は Phase 2 runbook の §証跡セクション参照。本書 Phase 3 merge 以降の deploy は本表に追記する。

## Phase 4 一般公開時の追加項目 (本書では扱わない)

| 項目 | 担当 ADR / runbook |
|---|---|
| Firestore PITR + データ rollback 手順 | Phase 4 で別 ADR / runbook 起草 |
| Cloud Logging 監視 dashboard | Phase 4 で別 runbook 起草 |
| SLO / incident policy | Phase 4 で別 ADR 起草 |
| secret rotation 方針 | Phase 4 で別 runbook 起草 |
| 複数ユーザー影響時の判断者・連絡フロー | Phase 4 で本 ADR-0002 を supersede する形で再設計 |

## 参考

- [ADR-0002](../adr/0002-dev-prod-deploy-flow.md) (本書の判断基準を裏付ける規範)
- [phase3-tasks.md](../spec/prod-migration/phase3-tasks.md) (Phase 3 タスク + AC + Phase 4 GO チェック)
- [phase2-tasks.md](../spec/prod-migration/phase2-tasks.md) §Phase 3 引き継ぎ事項 (本書が答える問い)
- [prod-phase2-deploy.md](./prod-phase2-deploy.md) §Rollback 手順 (Phase 2 で実装した 3+1 段階、本書で 3 段階に縮約)
- [prod-infrastructure-setup.md](./prod-infrastructure-setup.md) (Phase 1 インフラ整備手順 + T11.5 Firebase Auth 設定)
- `.github/workflows/deploy-prod.yml` (`workflow_dispatch` only)
- `.github/workflows/deploy.yml` (dev, `main` push 自動)
- `.claude/memory/feedback_env_var_naming_drift.md` (Phase 2 教訓 memory)
- `.claude/memory/feedback_firebase_auth_setup_gotcha.md` (Phase 1 補完事項 memory)
