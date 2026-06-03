# 非画像 dataURI 検出層追加設計 (Issue #137 #1)

- **作成日**: 2026-06-03
- **関連 Issue**: [#137](https://github.com/Yukina1116/novel-writer/issues/137) #1 (non-image dataURI gap)
- **関連 PR (祖先)**: #136 (Issue #134 part 1), #138 (Issue #137 #2), #139 (Issue #137 #3), #140 / #141 (Issue #137 #4)
- **対象モジュール**: `server/utils/promptSafety.ts`
- **ステータス**: Design (Phase 6, brainstorm Skill)
- **緊急性**: LOW (size guard backstop が機能中で実害発生中ではない)

---

## 1. 概要 / 動機

`stripPromptHeavyFields` は Issue #134 で content-based 検出に進化したが、画像専用 prefix `data:image/` に narrow したため、非画像 dataURI (`data:application/pdf;base64,...`, `data:audio/mp3;base64,...`, `data:font/woff2;base64,...` 等) が `MIN_IMAGE_DATA_URI_BYTES=500` と `MAX_FIELD_BYTES=100_000` の gap 帯 (500B〜100KB) で**両 guard を素通し**する設計上の gap が新設された。

実用上の到達経路は `longDescription` / `memo` / `world fields[].value` 等の text-area への直接ペースト。80KB の base64 ≈ 20K tokens (Gemini 131K context の 20%) を消費し、他フィールド合算で token budget を圧迫する。

本設計は、Issue #134 が掲げた**「content-based で register-or-forget リスクを構造的に解消」**理念を非画像 dataURI にも拡張し、image 系と対称な検出層を追加することで gap を構造的に閉じる。

## 2. 要件

### 機能要件

- **FR-1**: 非画像 dataURI (`data:` で始まり `data:image/` で始まらない) で UTF-8 byte 長が 500 以上の string を AI プロンプトから omission marker に置換する
- **FR-2**: 画像 dataURI 判定 (`isImageDataUri`) を case-insensitive 化し、`DATA:IMAGE/PNG;base64,...` も既存と同じ `IMAGE_OMITTED_MARKER` に置換する (codex セカンドオピニオン Medium 指摘の解消)
- **FR-3**: 短文 MIME 説明 (`data:image/png は base64 形式`, `data:text/plain;base64,SGVsbG8=` 等) は引き続き素通し (false positive ゼロ維持)
- **FR-4**: 集約 log は per-call 50 件上限 + `non-image-data-uri-omitted-batch` event で amplification 抑制 (image 系と独立した batch event)

### 非機能要件

- **NFR-1**: `stripPromptHeavyFields(data: unknown): unknown` の signature 不変、既存呼出側 (`worldService`, `characterService`, `characterPrompt`) は無変更
- **NFR-2**: `truncateOversizedStrings` (size guard backstop) には触れず、`MAX_FIELD_BYTES=100_000` の altitude を維持
- **NFR-3**: 既存テスト 569 件全 PASS (regression なし)
- **NFR-4**: 入力 mutate なし (pure helpers の規律維持)

## 3. アーキテクチャ

### 追加位置

`server/utils/promptSafety.ts` 内の `stripPromptHeavyFields` の string 判定経路に**並列追加** (`isImageDataUri` の sibling)。新規ファイルなし、新規モジュール作成なし。

```
stripPromptHeavyFields(data)
  └─ recurse(value, path, depth)
       └─ if typeof value === 'string':
            ├─ isImageDataUri(value)?       → imageAggregator.tick + IMAGE_OMITTED_MARKER
            ├─ isNonImageDataUri(value)?    → nonImageAggregator.tick + NON_IMAGE_DATA_URI_MARKER  ← 新規
            └─ else                          → 素通し
```

### 判定順 (重要)

`isImageDataUri` を**先**に評価し、image でなければ `isNonImageDataUri` を評価する。逆順にすると `data:image/png;base64,...` が `NON_IMAGE` 側で誤判定される。AC-7 / AC-15 で regression pin する。

## 4. データモデル

### 新規定数 / helper

| 名前 | 種別 | 値 | 役割 |
|---|---|---|---|
| `DATA_URI_PREFIX` | private const | `'data:'` | normalize 後の prefix 判定 |
| `MIN_NON_IMAGE_DATA_URI_BYTES` | private const | `500` | false-positive guard (image 側 `MIN_IMAGE_DATA_URI_BYTES` と対称) |
| `NON_IMAGE_DATA_URI_MARKER` | **export** const | `'[non-image-data-uri: omitted from prompt to fit token budget]'` | AI 向け代替マーカー |
| `normalizeForDataUriDetection(s: string): string` | private fn | `s.trimStart().toLowerCase()` | case-insensitive + 先頭空白吸収 |
| `isNonImageDataUri(value: string): boolean` | private fn (新規) | normalize 後 `startsWith('data:') && !startsWith('data:image/')` && byte ≥ `MIN_NON_IMAGE_DATA_URI_BYTES` | 非画像 dataURI 判定 |

### 既存改修

| 名前 | 改修内容 |
|---|---|
| `isImageDataUri(value: string): boolean` | normalize 後 string を判定し case-insensitive 化。signature 不変、byte 計測も normalize 後 string に統一 |

### byte 計測の規律

`Buffer.byteLength(normalized, 'utf8')` で **normalize 後 string** を計測する。理由:

1. trimStart で削った先頭空白を payload byte 数に含めるのは「実 payload 評価」として不適切
2. image / non-image 側で計測対象を揃えることで判定の一貫性を保つ
3. trimStart で減る byte は数文字 (現実的に < 10B) であり、500B 閾値に対する影響は無視可能

## 5. インターフェース

### 公開 API (export)

- 既存: `IMAGE_OMITTED_MARKER`, `OVERSIZED_STRING_MARKER`, `MAX_FIELD_BYTES`, `RECURSION_DEPTH_EXCEEDED_MARKER`, `WarnAggregatorPayload`, `WarnAggregator`, `createWarnAggregator`, `stripPromptHeavyFields`, `truncateOversizedStrings`, `sanitizeForPrompt`
- **新規追加**: `NON_IMAGE_DATA_URI_MARKER`

### 関数 signature

| 関数 | signature |
|---|---|
| `stripPromptHeavyFields(data: unknown): unknown` | **不変** |
| `truncateOversizedStrings(data: unknown, maxBytes?: number): unknown` | **不変** |
| `sanitizeForPrompt(data: unknown, maxBytes?: number): unknown` | **不変** |

### 呼出側影響

`worldService` / `characterService` / `characterPrompt` は全て不変。

## 6. エラー処理 / 観測性

### per-call warn aggregator

既存 `createWarnAggregator(individualEvent, individualMessage)` factory を再利用:

```ts
const nonImageAggregator = createWarnAggregator(
  'non-image-data-uri-omitted',
  'promptSafety: non-image dataURI stripped'
);
```

- 個別 warn payload: `{ path: string, bytes: number }`
- batch event: factory が `'non-image-data-uri-omitted-batch'` を機械派生 (#137 #4 残り b の規律)
- batch message: `'promptSafety: non-image-data-uri-omitted warn amplification suppressed'`
- MAX_WARN_PER_CALL=50 上限を自動継承
- imageAggregator と独立 counter (cross-event independence、PR #140 の方針と整合)

### lazy payload builder

`tick(() => ({ path, bytes: Buffer.byteLength(value, 'utf8') }))` 形式で payload を closure 化し、threshold 超後は Buffer.byteLength 計算を skip (PR #140 で確立した altitude を継承)。

### mimeType observability (本 PR スコープ外)

codex 指摘 Low-Medium。個別 warn payload に MIME 種別 (`,` までの media type、lower-case + 長さ cap) を追加する案は運用ニーズが明確になった時点で**別 Issue として起票**する。本 PR では `{ path, bytes }` のみ。

## 7. テスト戦略 (Acceptance Criteria)

`server/utils/promptSafety.test.ts` に以下 15 件を追加 (既存 569 件は不変):

| # | テスト | 期待 |
|---|---|---|
| AC-1 | `{ pdf: 'data:application/pdf;base64,' + 'A'.repeat(800) }` | pdf フィールドが `NON_IMAGE_DATA_URI_MARKER` に置換 |
| AC-2 | `{ audio: 'data:audio/mp3;base64,' + 'B'.repeat(800) }` | audio フィールドが marker 置換 |
| AC-3 | `{ font: 'data:font/woff2;base64,' + 'C'.repeat(800) }` | font フィールドが marker 置換 |
| AC-4 | 既存 fixture 維持: `{ pdf: 'data:application/pdf;base64,' + 'A'.repeat(200) }` (~228B) | 素通し (< 500B 未満) |
| AC-5 | 既存 fixture 維持: `{ text: 'data:text/plain;base64,SGVsbG8=' }` (~30B) | 素通し |
| AC-6 | 境界値 499B / 500B / 501B (非画像) | 499→素通し、500→marker、501→marker |
| AC-7 | `{ image: 'data:image/png;base64,' + 'X'.repeat(800) }` (image 既存 path) | `IMAGE_OMITTED_MARKER` (NON_IMAGE 側でない、判定順 regression pin) |
| AC-8 | image array 100 件 + non-image array 100 件 | `image-omitted-batch` と `non-image-data-uri-omitted-batch` が**別 event** で集約 emit (cross-event independence) |
| AC-9 | `{ appearance: { imageUrl: '<image 800B>' }, memo: '<non-image 800B>' }` | path log: 個別 warn (先頭 50 件) に `appearance.imageUrl` と `memo` が含まれる |
| AC-10 | 既存 569 件全 PASS (regression なし) | `npm test` で確認 |
| AC-11 | `{ pdf: 'DATA:application/pdf;base64,' + 'A'.repeat(800) }` (大文字 prefix) | `NON_IMAGE_DATA_URI_MARKER` (case insensitive 化の検証) |
| AC-12 | `{ pdf: '\n data:application/pdf;base64,' + 'A'.repeat(800) }` (先頭空白) | `NON_IMAGE_DATA_URI_MARKER` (空白吸収) |
| AC-13 | `{ empty: 'data:;base64,' + 'A'.repeat(800) }` (空 MIME) | `NON_IMAGE_DATA_URI_MARKER` (非画像扱い) |
| AC-14 | `{ no_b64: 'data:,' + 'A'.repeat(800) }` (no base64 / mediatype) | `NON_IMAGE_DATA_URI_MARKER` (非画像扱い、byte ≥ 500) |
| AC-15 | `{ image: 'DATA:IMAGE/PNG;base64,' + 'X'.repeat(800) }` (image 大文字) | `IMAGE_OMITTED_MARKER` (image 側 case insensitive 化の regression pin) |

### テストの位置付け

- **AC-1〜3**: 主要 MIME 種別での marker 置換 (基本動作)
- **AC-4〜5**: 既存 fixture 維持 (false positive guard 確認)
- **AC-6**: 境界値 (image 側の `MIN_IMAGE_DATA_URI_BYTES` テストパターンと対称)
- **AC-7**: 判定順 pin (image 先評価)
- **AC-8**: cross-event independence (factory 再利用が破綻していないこと)
- **AC-9**: path 観測性 (Cloud Logging の forensics 価値担保)
- **AC-10**: regression suite
- **AC-11〜14**: codex セカンドオピニオン Medium 指摘の test 化 (case variant / 空白 / 空 MIME / no base64)
- **AC-15**: image 側 case insensitive 化の regression pin

## 8. スコープ外 / 将来課題

| 項目 | 理由 |
|---|---|
| **mimeType observability** (個別 warn payload に MIME 種別追加) | 運用ニーズが明確になった時点で別 Issue 起票。現状の `{ path, bytes }` で基本観測性は十分 |
| **FE 側 text-area サニタイズ** (元の案 C) | 別 Issue。BE 側 (本 PR) で構造的閉鎖が完了するため、FE は UX フィードバック (ペースト時警告) 目的で別途検討 |
| **MAX_FIELD_BYTES 引き下げ** (元の案 A) | false positive 観測ベースで別途検討。現状は justification (100KB ≈ 小説 1 章) を覆す根拠なし |
| **logger.warnSampled altitude** (#137 #6) | 別 milestone での検討案件 (blast radius 大) |
| **collection-level guard** (#137 #2 残り) | 本 PR スコープ外。array 合計 byte 閾値は別途検討 |
| **batch log の pathPrefixes histogram** (#137 #5) | observability enhancement、別 PR で対応 |

## 9. Open Questions

なし (codex セカンドオピニオン後の Phase 4 への部分回帰で全論点が解消済み)。

## 10. リスクと緩和

| リスク | 影響 | 緩和策 |
|---|---|---|
| `MIN_NON_IMAGE_DATA_URI_BYTES=500` が実プロダクトデータで false positive を引き起こす | 通常テキストが marker 置換される | AC-4/5 で既存 fixture 素通しを pin、Cloud Logging で `safetyEvent: 'non-image-data-uri-omitted'` の発火頻度を本番デプロイ後に観測 |
| `normalizeForDataUriDetection` の trim 範囲 (先頭のみ) が攻撃面を残す | 末尾空白付き dataURI が素通し | data URI 仕様上、scheme 識別は先頭のみで成立。末尾空白は base64 payload に含めても valid decoding になるため、防御対象外で OK |
| image 側 case insensitive 化が既存 fixture を変質させる | 既存テストが想定外挙動になる | 既存 fixture は全て小文字 `data:image/` で記述されており影響なし。AC-15 で大文字パターンの新規挙動を pin |
| `'data:,' + 'A'.repeat(800)` のような degenerate input が `NON_IMAGE` 側に流れる | spec 上 valid だが picture-less dataURI が marker 化される | spec 通りの仕様化 (AC-14 で意図確認)。prompt token を食う以上 marker 化は妥当判断 |

## 11. 実装手順 (Phase 9 で `/impl-plan` に渡す要約)

1. `promptSafety.ts` に `DATA_URI_PREFIX`, `MIN_NON_IMAGE_DATA_URI_BYTES`, `NON_IMAGE_DATA_URI_MARKER`, `normalizeForDataUriDetection`, `isNonImageDataUri` を追加
2. 既存 `isImageDataUri` を normalize 後 string ベースの判定に改修 (case insensitive 化)
3. `stripPromptHeavyFields` 内に `nonImageAggregator` を追加し、recurse の string 経路に判定追加 (image 先評価)
4. `promptSafety.test.ts` に AC-1〜15 を TDD で追加 (AC-7 / AC-15 を先に書き判定順の regression pin)
5. `npm test` / `npm run lint` 全 PASS 確認
6. handoff 文書を `docs/handoff/` に追加 (実装完了後)

## 12. 参考資料

- Issue #134 (whitelist → content-based 移行提案、本設計の祖)
- PR #136 (Issue #134 part 1)
- Issue #137 #1 (本設計の対象)
- PR #138 (Issue #137 #2、MIN_IMAGE_DATA_URI_BYTES 100→500)
- PR #139 (Issue #137 #3、per-call warn aggregation)
- PR #140 / #141 (Issue #137 #4、createWarnAggregator factory 抽出)
- RFC 2397 (The "data" URL scheme): media type は case-insensitive
- RFC 3986 (URI Generic Syntax): scheme 部 (`data:` 等) は case-insensitive
- codex セカンドオピニオン (2026-06-03、Phase 5 で実施)
