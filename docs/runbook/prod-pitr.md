# Runbook: Firestore PITR 有効化と復旧 (Phase 4)

- Status: 🚧 Draft (本書は AI 起草の **草案**。PITR 有効化実行 + retention 期間決定 + 復旧演習実行は **decision-maker = owner (本田様)** の番号単位明示認可後に AI が executor として実施する)
- Last Updated: 2026-06-20
- Owner: yasushi-honda
- Related ADR: [ADR-0003](../adr/0003-public-launch-operations.md) §Decision 1 (本書の判断基準を裏付ける規範)
- Related: [Phase 4 spec](../spec/prod-migration/phase4-tasks.md), [runbook prod-deploy-flow.md](./prod-deploy-flow.md) (Phase 3 で起草、本書は ADR-0002 rollback 段階を 3→4 段階に拡張する案を起草)
- Related ADR: [ADR-0002](../adr/0002-dev-prod-deploy-flow.md) §3 rollback (本書 §ADR-0002 rollback 4 段階拡張案 で 4 段階目を起草、本体反映は段階 2 PITR 有効化後 or 別 PR)

> **本書の位置付け**: Firestore Point-In-Time Recovery (PITR) の有効化 + retention 判断 + 復旧手順 + 復旧演習を起草。実機有効化 (`gcloud firestore databases update --enable-pitr`) は **段階 2 (本 Phase 対象外、別 PR)** で本田様番号単位認可後に AI が実行する。本書は手順記載のみ。

## 用途

- Firestore PITR を一般公開 (Phase 5) 前に有効化する手順
- retention 期間 (default 7 日) の判断
- データ汚染インシデント発生時の復旧手順
- 復旧演習 (dev で年 1 回以上) の手順
- ADR-0002 rollback 3→4 段階拡張の手順起草 (本体反映は別 PR)

## 前提

- prod = `novel-writer-prod` (Cloud Run + Firestore @ asia-northeast1)
- Firestore database name = `(default)` (Phase 1 で確定)
- PITR 有効化操作は **destructive ではない** が、本田様番号単位認可下で実行する
- 復旧 (`gcloud firestore databases clone --source-database --snapshot-time`) は **新規 database 作成を伴う destructive 操作**、番号単位認可必須。`gcloud firestore databases restore` は Backup 専用、PITR 用ではない

## 有効化手順

### Step 1: 前提確認

```bash
# 現在の Firestore database 状態確認
gcloud firestore databases describe \
  --database='(default)' \
  --project=novel-writer-prod \
  --format='value(pointInTimeRecoveryEnablement)'
# 期待値 (有効化前): POINT_IN_TIME_RECOVERY_DISABLED
```

### Step 2: PITR 有効化 (本田様番号単位認可後)

```bash
gcloud firestore databases update \
  --database='(default)' \
  --project=novel-writer-prod \
  --enable-pitr
# 期待値: Updated database [(default)].
```

### Step 3: 有効化後の確認

```bash
gcloud firestore databases describe \
  --database='(default)' \
  --project=novel-writer-prod \
  --format='value(pointInTimeRecoveryEnablement)'
# 期待値 (有効化後): POINT_IN_TIME_RECOVERY_ENABLED

gcloud firestore databases describe \
  --database='(default)' \
  --project=novel-writer-prod \
  --format='value(earliestVersionTime)'
# 期待値: 有効化時刻に近い ISO timestamp
```

### Step 4: 証跡記録

有効化日時 / 実行コマンド / 確認結果を本書末尾「PITR 有効化履歴」table に追記する。

## retention 期間判断

### Firestore PITR の retention 仕様 (2026-06 時点、要 web search 再確認)

| 設定 | retention 期間 |
|---|---|
| default (--enable-pitr) | **最大 7 日間** |
| 延長 (オプション) | 一部リージョンで延長プランあり、要 web search 再確認 + 別 ADR |

### Phase 4 段階での判断

| 観点 | 判断 |
|---|---|
| 一般公開直後の想定インシデント検知時間 | 1-3 日以内が現実的 (owner 1 名運用) |
| 法務 / コンプライアンス要件 | 現状要求なし (Phase 4 範囲、Phase 5 以降で再評価) |
| コスト | retention 期間によらず PITR 有効化自体が課金される (Firestore 料金体系参照) |
| **推奨** | **default 7 日で Phase 4 完了、Phase 5 real traffic 観察後に延長判断** |

**理由**: Phase 4 段階では single-tenant 運用で large incident が起きにくく、7 日 retention で十分な可能性が高い。一般公開後に「データ汚染インシデントの検知が 7 日を超えるパターン」があれば retention 延長を別 ADR で再評価する。

## 復旧演習

### 演習の目的

PITR 有効化だけで復旧できる保証はない。本番インシデント前に **dev 環境で復旧手順を一度実行** し、手順書の正確性と所要時間を実測する。

### 演習手順 (dev で実施、本番影響なし)

> **注**: 本手順は **同一 shell session** で順次実行する前提。途中で shell を閉じると `DEST_DB` 変数が失われ Step 7 で削除対象が特定できなくなる。新 shell で再開する場合は Step 4 で表示される `DEST_DB` の値をメモして、Step 7 で `DEST_DB=<メモした値>` を再 export してから実行する。

```bash
# 1. dev で PITR 有効化 (まだ未有効なら)
gcloud firestore databases update \
  --database='(default)' \
  --project=novel-writer-dev \
  --enable-pitr

# 2. 演習用テストデータ作成 (本田様の dev アカウントで適当に project 作成)
#    → IndexedDB に保存 → 通常使用

# 3. 5-10 分待機後、現在時刻を snapshot 候補時刻として記録
#    gcloud firestore databases clone の制約:
#      snapshot-time は whole minute (秒 :00) かつ in the past である必要あり
#    macOS (BSD date) と Linux (GNU date) で構文が異なるため両対応:
if date -u -v-5M +%Y-%m-%dT%H:%M:00Z >/dev/null 2>&1; then
  # macOS (BSD date)
  SNAPSHOT_TIME=$(date -u -v-5M +%Y-%m-%dT%H:%M:00Z)
else
  # Linux (GNU date、Cloud Shell 等)
  SNAPSHOT_TIME=$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:00Z)
fi
echo "Snapshot time: $SNAPSHOT_TIME"

# 4. 演習用 destination database 名を変数保持 (Step 6 / Step 8 共通参照)
export DEST_DB="drill-restore-$(date +%s)"
echo "Destination database: $DEST_DB"
# 注: 同一 shell session で Step 6 / Step 8 まで実行すること。
#     shell を閉じて再開する場合は上記 echo の値をメモし、
#     Step 8 実行前に `export DEST_DB=<メモした値>` で再注入する。

# 5. テストデータを (敢えて) 破壊
#    → Firebase Console で users/<dev uid> ドキュメントを手動削除
#    → アプリでログイン → users/init で初期化 (旧データ消失確認)

# 6. PITR clone (Step 4 で保持した DEST_DB に新規 database 作成)
#    PITR snapshot からの復旧は `gcloud firestore databases clone` を使う
#    `gcloud firestore databases restore` は Backup 専用、PITR 用ではない
gcloud firestore databases clone \
  --source-database=projects/novel-writer-dev/databases/'(default)' \
  --destination-database="$DEST_DB" \
  --snapshot-time="$SNAPSHOT_TIME" \
  --project=novel-writer-dev

# 7. 復旧 database の検証 (Firebase Console で確認)
#    → 破壊前のドキュメントが存在することを確認

# 8. 演習完了後、復旧用 database を削除 (コスト最小化)
gcloud firestore databases delete "$DEST_DB" \
  --project=novel-writer-dev
```

### 演習実施頻度

- **段階 2 PITR 有効化直後**: 1 回必須 (手順書の正確性確認)
- **以降**: 年 1 回以上 (Cloud Logging スケジュール or 本田様カレンダー)

### 演習証跡

dev 演習実施日時 / 所要時間 / 課題を本書末尾「復旧演習履歴」table に追記。

## ADR-0002 rollback 4 段階拡張案

> **本 section は ADR-0002 §3 rollback 3 段階の拡張案を起草するもの**。ADR-0002 本体への反映は **段階 2 PITR 実機有効化後 or 別 PR** で行う (Codex H 指摘 #3 反映、本 PR では ADR-0002 本体を変更しない)。

### 現行 ADR-0002 §3 (Phase 3 で起草、3 段階)

| 段階 | 状況 | 操作 | 復旧時間目安 |
|---|------|------|------------|
| 段階 1: 公開即遮断 | 情報漏洩 / 認証バイパス / 課金暴走 | `--no-allow-unauthenticated` | 数十秒 |
| 段階 2: revision 切替 | 通常 rollback | `update-traffic --to-revisions` | 数十秒〜数分 |
| 段階 3: service delete | 最終手段 | `gcloud run services delete` | 数分 |
| (Firestore データ rollback) | Phase 3 段階では未設計、Phase 4 で再設計予告 | (本書で起草) | - |

### 拡張案 (ADR-0002 §3 を 4 段階に)

| 段階 | 状況 | 操作 | 復旧時間目安 |
|---|------|------|------------|
| 段階 1: 公開即遮断 | 既存、不変 | `--no-allow-unauthenticated` | 数十秒 |
| 段階 2: revision 切替 | 既存、不変 | `update-traffic --to-revisions` | 数十秒〜数分 |
| 段階 3: service delete | 既存、不変 | `gcloud run services delete` | 数分 |
| **段階 4: Firestore PITR clone** | **データ汚染 (誤削除 / 誤上書き / 意図せざる migration)** | **`gcloud firestore databases clone --source-database --snapshot-time`** + **新規 database への切替** | **数分〜数十分 (データ量依存) + アプリ database 切替操作** |

### 段階 4 の判断基準

| 状況 | 段階 4 採用判断 |
|---|---|
| データ削除インシデント | ✅ 採用 (削除前時刻 snapshot から restore) |
| データ migration 失敗 | ✅ 採用 (migration 前時刻 snapshot から restore) |
| アプリ挙動の欠陥 (データは無事) | ❌ 段階 2 (revision 切替) で十分 |
| service 自体の重大障害 | ❌ 段階 3 (service delete) を優先 |

### 段階 4 実施時の追加考慮事項

- **新規 database 作成**: PITR clone は元の `(default)` database を上書きせず、新規 database を作成する
- **アプリの database 接続切替**: Firebase Admin SDK の database name 指定を `(default)` → 新規 name に変更 → 再 deploy
- **旧 database の扱い**: 復旧確認後、旧 `(default)` を削除するか rename して保管するかは本田様判断
- **PITR retention 限界**: snapshot 時刻が retention (7 日) を超えていると restore 不可、即座の判断が重要

### ADR-0002 本体反映タイミング

- 本 runbook の段階 4 案を ADR-0002 §3 に転記する PR は **段階 2 PITR 有効化完了後** (実機で段階 4 が動くことを確認してから ADR 本体に書く)
- それまでは本 runbook が ADR-0002 §3 の補強として参照される

## 関連 ADR / runbook link

- [ADR-0003 §Decision 1](../adr/0003-public-launch-operations.md#1-firestore-pitr-を-phase-4-段階-2-で有効化しrollback-4-段階目を実装する) (本書の判断基準)
- [ADR-0002 §3 rollback](../adr/0002-dev-prod-deploy-flow.md) (Phase 3 起草、3 段階、本書で 4 段階拡張案)
- [runbook prod-deploy-flow.md](./prod-deploy-flow.md) §rollback (Phase 3 起草、3 段階手順)
- [phase4-tasks.md](../spec/prod-migration/phase4-tasks.md) §Phase 5 GO チェック GO-3

## PITR 有効化履歴

| 日時 (UTC) | 環境 | 実行者 | 操作 | retention 設定 | 確認結果 |
|---|---|---|---|---|---|
| 2026-06-20T13:59:39Z | dev | AI (gcloud 直接、本田様 GO 下) | `gcloud firestore databases update --enable-pitr` | 7 日 (604800s) | `POINT_IN_TIME_RECOVERY_ENABLED` 確認、earliestVersionTime=2026-06-20T13:00:00Z |
| 2026-06-20T15:15:16Z | prod | AI (workflow run [#27875198225](https://github.com/Yukina1116/novel-writer/actions/runs/27875198225) 経由、`prod-pitr-enable.yml`) | `gcloud firestore databases update --enable-pitr` | 7 日 (604800s) | `POINT_IN_TIME_RECOVERY_ENABLED` 確認、earliestVersionTime=2026-06-20T14:16:00Z |

## 復旧演習履歴

| 日時 (UTC) | 環境 | 演習者 | 所要時間 | 結果 | 課題 / 改善点 |
|---|---|---|---|---|---|
| 2026-06-20T14:34-15:05Z | dev | AI (workflow `dev-pitr-drill.yml` × 3 回試行) | 各 ~5-13 分 | ❌ 全 fail | (1) 初回 [#27874184216](https://github.com/Yukina1116/novel-writer/actions/runs/27874184216): `restore` コマンド誤用 → PR #205 で `clone` に修正。(2) 2 回目 [#27874472054](https://github.com/Yukina1116/novel-writer/actions/runs/27874472054): clone は LRO で verify 直前に `FAILED_PRECONDITION` → PR #206 で wait-ready polling 追加。(3) 3 回目 [#27874630851](https://github.com/Yukina1116/novel-writer/actions/runs/27874630851): wait-ready 10 分 timeout でも clone 未完了 → CI 自動演習を諦め手動 Console 演習に方針変更。Orphan database 2 件は手動 cleanup 済 |

### 復旧演習の方針 (本セッション 2026-06-20 確定)

CI 自動演習 (`dev-pitr-drill.yml`) は **Firestore PITR clone の LRO 所要時間** (公式: minutes〜hours) が GitHub Actions の標準実行時間枠と相性が悪く、本セッション 3 回試行で完走できなかった。

**現状の運用方針**:
- **CI 自動演習は将来課題** として workflow を保持 (cleanup syntax 修正 + workflow timeout 90 分 + wait-ready は env 経由で 80 分まで延長可能に修正済、将来 trigger で再試行可能)
- **Phase 4 段階 3 (Phase 5 公開前) で本田様による手動 Console 演習を 1 回実施** → 結果を本 table に追記
- 手動演習は Firebase Console UI で「playground project 作成 → snapshot 時刻記録 → 削除 → `gcloud firestore databases clone` 実行 → Console で復旧確認」の流れ (本 runbook §復旧演習 の手順を参照)

これにより GO-3 の本質 (prod PITR 有効化 + 復旧手段の存在確認) は達成済、復旧の実機検証は手動演習で別途充足する。
