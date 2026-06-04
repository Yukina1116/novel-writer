# dry-run gcloud paired signal 設計 (Issue #149 残-A)

- **作成日**: 2026-06-04
- **関連 Issue**: [#149](https://github.com/Yukina1116/novel-writer/issues/149) 残-A
- **関連 PR (祖先)**: PR #148 (Issue #137 #7 observability metric counter)、PR #150 (Issue #149 残-C)
- **対象モジュール**: `scripts/setup-safety-event-metrics.sh` + `tests/static/safety-events-bash-syntax.test.ts` + `docs/runbook/cloud-logging-safety-event-metrics.md`
- **ステータス**: Design (Phase 6, brainstorm Skill)
- **緊急性**: LOW (実 silent regression は未観測、本番初回 apply まで顕在化しない構造)

---

## 1. 概要 / 動機

PR #148 の review-pr silent-failure-hunter agent が指摘した HIGH severity 残課題 (Issue #149 残-A)。

`scripts/setup-safety-event-metrics.sh` の `--dry-run` は実 gcloud 呼出を `continue` で skip するため、CI 環境 (`npm run test` 時に gcloud 未 install) では echo 出力 (`would create/update log-based metric:`) のみが検証対象。実際の `gcloud logging metrics create` の引数 (`--log-filter` regex、`--description` 文字列、`--project=...` flag syntax 等) は dry-run 経路では存在せず、以下の regression が **CI を素通りして本番初回 apply で初めて顕在化**する:

- gcloud SDK の flag rename (`--log-filter` → `--query-filter` 等)
- bash 内 quoting bug (`--description='...'` の単一引用符崩れ)
- metric 名規約 `prompt_safety_<event>_count` の typo
- filter regex pattern `^<event>(-batch)?$` の正規表現 syntax 崩壊

**paired signal 規律違反**: silent fail を許容する設計 (`--dry-run` が実 gcloud を skip する) には、別系統の早期検知シグナルを一対で用意する規律 (`feedback_silent_fail_paired_signal.md`)。現状の `--dry-run` 経路には paired signal がない。

### 本タスクの位置付け

- **安定性向上ではなく観測層の保守性向上**: 本番の振る舞いは不変、CI 検知精度のみ向上
- 「多くのユーザー」想定 (2026-06-04 本田様判断) への規模拡大時、本番初回 apply 失敗の事業影響が大きくなる前段で構造的に閉鎖

---

## 2. 要件

### 機能要件

- **FR-1**: `scripts/setup-safety-event-metrics.sh` の `--dry-run` 経路で、metric scaffold loop 内に `command:     gcloud logging metrics create ...` 行を 1 行追加する (各 event ごとに合計 6 件)
- **FR-2**: 表示する gcloud command 文字列は、実 apply 時 (非 dry-run) と引数 (`--project=` / `--description=` / `--log-filter=`) byte-for-byte 一致する
- **FR-3**: command 表示は `create` 固定 (実 apply 時は describe 結果次第で create or update に分岐するが、引数規約は同じ)
- **FR-4**: `tests/static/safety-events-bash-syntax.test.ts` に新 test (`Issue #149 残-A`) を追加し、dry-run output に対して以下を pin:
  - (a) `command:` 行が `ALL_SAFETY_EVENT_NAMES.length` (= 6) 件出力されること
  - (b) metric 名規約 `prompt_safety_<event-with-underscores>_count` が全 event について含まれること
  - (c) filter regex pattern `jsonPayload.safetyEvent=~"^<event>(-batch)?$"` が全 event について含まれること
  - (d) `--project=<value>` 形式で project ID が展開されていること
- **FR-5**: `docs/runbook/cloud-logging-safety-event-metrics.md` §2 setup script 使い方に、paired signal 規律 (dry-run output が本番適用前の最終確認に利用可能 + CI grep test の存在) を 1 段落追加

### 非機能要件

- **NFR-1**: 既存 635 件テスト全 PASS (regression なし)
- **NFR-2**: 既存 `--dry-run` 出力フォーマット (`name:` / `description:` / `filter:`) を変更しない (新規 `command:` 行追加のみ)
- **NFR-3**: 本番 (非 dry-run) 経路の挙動を一切変更しない (gcloud 実呼出、TOCTOU retry、idempotent setup)
- **NFR-4**: 新規依存ライブラリゼロ
- **NFR-5**: alert scaffold loop は現状 scaffold output のみで gcloud command を含まないため、本 PR スコープ外 (将来 alert policy も gcloud で実 create する設計に変更時に再検討)
- **NFR-6**: env var / 新 flag / 新 mode 追加なし (既存 `--dry-run` の自然な拡張のみ)

---

## 3. アーキテクチャ

### 変更位置

```
scripts/setup-safety-event-metrics.sh
  └─ metric scaffold loop (既存 line 128-138 dry-run 分岐)
     既存:  [dry-run] would create/update log-based metric:
              name:        <metric_name>
              description: <description>
              filter:      <filter>
     追加:    command:     gcloud logging metrics create <metric_name> --project=<PROJECT> --description=<...> --log-filter=<...>

tests/static/safety-events-bash-syntax.test.ts
  └─ 新 test (1 件、4 assertion):
     "--dry-run output exposes actual gcloud command line for regression detection (Issue #149 残-A)"

docs/runbook/cloud-logging-safety-event-metrics.md
  └─ §2 setup script 使い方の 2.1 末尾に paired signal 規律段落追加 (1 段落)
```

### 変更しないもの

- alert scaffold loop (line ~167-187): 現状 scaffold output のみで gcloud command を含まない、本 PR スコープ外
- 本番 (非 dry-run) 経路: gcloud 実呼出 + TOCTOU retry + idempotent setup は変更なし
- 既存 5 tests (`bash -n` / `--project` 必須 / dry-run 件数 / flag-like 拒否 / 大文字拒否): assertion 追加なし、新 test として 1 件追加
- 既存 `--dry-run` フォーマットの `name:` / `description:` / `filter:` 行

### 依存関係 (1 方向)

```
script の echo フォーマット (command: 行)
       ↓ stdout で観測
test の grep assertion (`command:\s+gcloud logging metrics create `)
```

script ↔ test は同期だが、flexible (固定 regex pattern で grep)。完全 byte 一致は要求しない (将来 description 文言変更等の小変更で test が落ちないよう)。

---

## 4. データモデル

### dry-run output format

```
[dry-run] would create/update log-based metric:
  name:        prompt_safety_image_omitted_count
  description: promptSafety: image-omitted event count (individual + batch)
  filter:      resource.type="cloud_run_revision" AND jsonPayload.safetyEvent=~"^image-omitted(-batch)?$"
  command:     gcloud logging metrics create prompt_safety_image_omitted_count --project=test-project-id --description='promptSafety: image-omitted event count (individual + batch)' --log-filter='resource.type="cloud_run_revision" AND jsonPayload.safetyEvent=~"^image-omitted(-batch)?$"'

```

- 各 event ごとに 5 行ブロック (既存 4 行 + 新 `command:` 1 行)
- `command:` 行は 1 行で完結 (改行なし、grep 容易)
- `--description=` と `--log-filter=` は単一引用符 (`'...'`) で quote (内部に半角 space / regex メタ文字を含むため)
- `--project=<value>` は実引数値で展開 (本田様運用での確認 + test での project ID 検証)

### 既存 4 行と新 1 行の altitude

| 行 | 内容 | 用途 |
|---|------|------|
| `name:` | metric 名 | 既存 (Cloud Console での grep) |
| `description:` | metric 説明 | 既存 (Console 表示) |
| `filter:` | filter 式 | 既存 (Cloud Logging filter 構文) |
| `command:` (新) | 実 gcloud command 文字列 | **新規 paired signal** (CI で flag rename / quoting bug を検知) |

altitude が揃う (全て metric の dry-run preview)、認知負荷増なし。

---

## 5. インターフェース

### script 側 (擬似コード)

```bash
for event in "${SAFETY_EVENTS[@]}"; do
    metric_name="$(event_to_metric_name "$event")"
    filter="$(event_to_filter "$event")"
    description="promptSafety: ${event} event count (individual + batch)"

    if (( DRY_RUN )); then
        echo "[dry-run] would create/update log-based metric:"
        echo "  name:        ${metric_name}"
        echo "  description: ${description}"
        echo "  filter:      ${filter}"
        # FR-1: command 文字列を 1 行で表示。実 apply 時の gcloud invocation と
        # 引数 byte-for-byte 一致 (FR-2)。dry-run でも CI で flag rename /
        # quoting bug を検知可能 (Issue #149 残-A、paired signal 規律)。
        echo "  command:     gcloud logging metrics create ${metric_name} --project=${PROJECT} --description='${description}' --log-filter='${filter}'"
        echo ""
        continue
    fi
    # ... 既存の create/update ロジック (本 PR で変更なし) ...
done
```

### test 側 (擬似コード)

```typescript
it('--dry-run output exposes actual gcloud command line for regression detection (Issue #149 残-A)', () => {
    const stdout = execFileSync(
        'bash',
        [SH_PATH, '--project', 'test-project-id', '--dry-run'],
        { stdio: 'pipe', encoding: 'utf-8' }
    );

    // (a) command 行が 6 件出力される
    const cmdLines = stdout.match(/command:\s+gcloud logging metrics create /g);
    expect(cmdLines?.length).toBe(ALL_SAFETY_EVENT_NAMES.length);

    // (b) metric 命名規約を全 event 分検証
    for (const event of ALL_SAFETY_EVENT_NAMES) {
        const expectedMetricName = `prompt_safety_${event.replace(/-/g, '_')}_count`;
        expect(stdout).toContain(`gcloud logging metrics create ${expectedMetricName}`);
    }

    // (c) filter regex pattern を全 event 分検証
    for (const event of ALL_SAFETY_EVENT_NAMES) {
        const expectedFilter = `jsonPayload.safetyEvent=~"^${event}(-batch)?$"`;
        expect(stdout).toContain(expectedFilter);
    }

    // (d) --project=<value> として展開
    expect(stdout).toContain('--project=test-project-id');
});
```

### runbook §2.1 末尾追加 (1 段落)

```markdown
> **paired signal 規律 (Issue #149 残-A)**: `--dry-run` 出力には実 gcloud command 文字列 (`command:` 行) が含まれるため、本番適用前の最終確認 (`--log-filter` / `--description` / metric 名規約の syntax 検証) に利用できる。CI でも grep test (`tests/static/safety-events-bash-syntax.test.ts`) で実 command の regression (flag rename / quoting bug / filter syntax) を機械検知する (silent fail 防止)。
```

---

## 6. エラー処理

### script 側

- `command:` 行追加は echo のみで失敗経路なし
- 既存 `--project` 値検証 (flag-like 値 / GCP project ID 形式) は不変
- 既存 gcloud 不在チェック (`--dry-run` 時 skip) も不変

### test 側

- `execFileSync` の error capture は既存 helper `runScriptExpectingExit` を流用しない (PASS path のため `stdout` を直接受け取る)
- assertion 失敗時の diagnostic: 既存 stdout を test failure メッセージに含めるため、Vitest の `expect` がそのまま機能

---

## 7. テスト戦略

### Acceptance Criteria

```
AC-1: scripts/setup-safety-event-metrics.sh の dry-run 経路で
      "command:     gcloud logging metrics create <name> --project=<value>
      --description='<desc>' --log-filter='<filter>'" 行が各 event ごとに
      1 行 (合計 6 行) 追加されること

AC-2: 表示される gcloud command 文字列の引数 (--project / --description /
      --log-filter) が、実 apply 時 (非 dry-run) に呼ばれる gcloud 引数と
      byte-for-byte 一致すること (FR-2)

AC-3: tests/static/safety-events-bash-syntax.test.ts に新 test 1 件追加
      (4 assertion: command 行件数 / metric 命名規約 / filter regex / project 展開)

AC-4: docs/runbook/cloud-logging-safety-event-metrics.md §2.1 末尾に
      paired signal 規律段落 (Issue #149 残-A) が追加されていること

AC-5: 既存 635 tests PASS (+1 件追加で 636 件) + tsc --noEmit エラーゼロ
      (NFR-1, NFR-3)

AC-6: 本番 (非 dry-run) 経路の挙動が変化しないこと
      (gcloud 実呼出 / TOCTOU retry / idempotent setup の logic 不変)

AC-7: AC-3 test の failing path 手動確認
      (script の `command:     ` 行を削除 → test 4 assertion 全 fail → 復元)
```

### スコープ外

- alert policy scaffold (現状 scaffold output のみ、gcloud command なし)
- env var / 新 flag / 新 mode (DEBUG_PRINT_GCLOUD 等は採用しない、案 D の自然な拡張のみ)
- description / filter 文言の変更 (既存 byte-for-byte 維持)
- Issue #149 残-B (estimateElementBytes silent fallback)、Issue #137 #6 (logger.warnSampled altitude)

---

## 8. Open Questions

本 PR 後の運用判断項目:

- **OQ-1**: 将来 alert policy も script で実 gcloud create する設計に変更する場合、alert scaffold loop にも同様の `command:` echo を追加する必要あり (本 PR ではスコープ外)
- **OQ-2**: gcloud SDK の major version up (`logging metrics` → `monitoring metrics` 等の rename) 時、test が fail することで早期検知される設計 (期待動作)。検知後の対応手順は別途 runbook 化検討

---

## 9. 参照

- Issue #149 ([https://github.com/Yukina1116/novel-writer/issues/149](https://github.com/Yukina1116/novel-writer/issues/149)) 残-A
- PR #148 (Issue #137 #7 observability metric counter、本 Issue #149 起票元)
- PR #150 (Issue #149 残-C、histogram-overflow firstOverflowPath)
- `feedback_silent_fail_paired_signal.md` (グローバル memory、paired signal 規律の根拠)
- 既存 spec [`2026-06-04-observability-metric-counter-design.md`](./2026-06-04-observability-metric-counter-design.md) (祖先 spec、本設計の上位設計)
