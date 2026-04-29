# M6: E2EE 暗号化バックアップ タスク表

- Status: ✅ PR-A〜D 完了 (2026-04-29 PR #73/#74/#75/#77)、M6 完走
- Owner: yasushi-honda
- Started: 2026-04-29
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) §Decision (Cloud Storage = opt-in 暗号化バックアップ) / §Consequences (XSS 時 E2EE 限界)

## 背景: M6 と M6.5 の分割

ADR-0001 Roadmap では M6 を「E2EE 暗号化バックアップ（任意機能、後回し可）」として記載していたが、M5 (Stripe) 未完了の状態で着手するため、Tier 2 ゲート不要で完結する範囲を **M6**、Cloud Storage 連携を **M6.5** に分割する。

| マイルストーン | スコープ | M5 (Stripe) 依存 | 推定工数 |
|---|---|---|---|
| **M6 (本ドキュメントの主対象)** | クライアント側 AES-GCM + パスフレーズ派生 + ローカルファイル `.enc.json` の暗号化 Export/Import | なし | 6〜8 時間 |
| M6.5 | Cloud Storage 連携（signed URL upload/download + uid scope + Tier 2 ゲート） | あり (M5 完了後) | 4〜6 時間 |

## M6 ゴール

1. **クライアント側 E2EE 機構を導入**: パスフレーズ派生 (PBKDF2-SHA256, 600,000 iterations) + AES-GCM-256 暗号化
2. **`EncryptedBackupV1` envelope schema を確定**: 平文 `BackupV1` を JSON.stringify → AES-GCM 暗号化 → base64 でラップ
3. **既存 M4 Export/Import 動線に統合**: 「暗号化する」option 追加、`.enc.json` 拡張子で download / 自動検出復号
4. **既存平文 BackupV1 の後方互換維持**: M4 で生成したファイルは引き続き読み込める
5. **改竄検知**: AES-GCM auth tag 検証失敗を「パスフレーズ誤り or ファイル破損」として区別なくエラー表示（fingerprinting 防止）

## マイルストーン外スコープ（M6 ではやらないこと）

- **Cloud Storage 連携**（M6.5、Stripe Tier 2 ゲート前提）
- **鍵 escrow / 鍵 recovery**（パスフレーズ忘却 = データ喪失、ユーザー責任明示）
- **Argon2id 派生**（PR の規模を抑えるため PBKDF2 で fix、将来の KDF 移行 seam は kdf field で残す）
- **パスフレーズ強度の zxcvbn ベース判定**（length-only check で MVP、強度バーは将来 enhancement）
- **`parseBackup` の table-driven parser 化**（Issue #49 「Schema v2 への seam」TODO は本 M6 では対象外、別 PR で実施）
- **複数端末間の鍵共有**（ADR-0001「複数端末同期は実装しない」を踏襲）

## 設計判断

| 判断 | 採用 | 理由 |
|---|---|---|
| 鍵管理方式 | パスフレーズ派生 (PBKDF2-SHA256) | UX 軽量、サーバ側に escrow 残さない、ADR-0001「XSS 時 E2EE 限界」と整合 |
| 保管先段階 | ローカルファイル暗号化のみ (M6)、Cloud Storage は M6.5 | M5 Stripe 未完了で Tier 2 ゲート組めない、独立した設計判断（signed URL / 容量制限 / 競合検知）を分離 |
| Tier ゲート | M6 範囲は Tier 1 でも使える機能として実装。M6.5 の Cloud Storage 連携時点で Tier 2 ゲートを **Cloud Storage 側にのみ適用**、ローカルファイル機能は Tier 1 のまま維持 | M6 ではサーバコスト発生せず、Tier 制限する根拠が無い。M6.5 で初めて発生するクラウド保管コストに対して Tier 2 を適用 |
| envelope schema | `EncryptedBackupV1` を新設（discriminator: `encrypted: true`） | 既存 `BackupV1` を平文 inner として保ち、後方互換性確保 |
| UI 統合 | 既存 Export モーダルに「暗号化する」チェックボックス追加 | 動線統一、ユーザー選択可能 |

## 前提と既存資産の利用

- **`utils/backupSchema.ts` (M4 導入)**: `BackupV1` を平文 envelope として再利用、`parseBackup` の判定 chain に encrypted 分岐を追加
- **`store/backupSlice.ts` (M4 導入)**: `exportAllData` / `prepareImport` / `executeImport` を「暗号化 ON/OFF」分岐
- **`db/backupRepository.ts` (M4 導入)**: 変更なし（IndexedDB は平文しか書かない）
- **`components/modals/ImportConflictModal.tsx` (M4 導入)**: 復号後の conflict 検出は既存フローに合流
- **Web Crypto API (`globalThis.crypto.subtle`)**: ブラウザ標準 + Node 20+ で利用可能、追加依存なし

## PR 構成

| PR | 内容 | 規模 | 工数 | 状態 |
|---|---|---|---|---|
| **PR-A** | docs(m6) M6 仕様 + AC + ADR-0001 Roadmap 更新（M6 / M6.5 分割反映） | 小〜中 | 1〜1.5 時間 | ✅ #73 merged |
| **PR-B** | feat(m6) `utils/backupCrypto.ts` 新設 (deriveKey/encrypt/decrypt) + `utils/backupSchema.ts` に EncryptedBackupV1 型 + parseBackup 分岐 + vitest 単体テスト | 中 | 2〜3 時間 | ✅ #74 merged |
| **PR-C** | feat(m6) `store/backupSlice.ts` に encrypt/decrypt 経路統合 + 統合テスト | 中 | 1.5〜2 時間 | ✅ #75 merged |
| **PR-D** | feat(m6) UI 実装 (ExportEncryptModal + ImportPassphraseModal + Export/Import 動線統合) | 大 | 2〜3 時間 | ✅ #77 merged |

着手順序: **PR-A → PR-B → PR-C → PR-D**（逐次、各段階で merge 可能な状態を維持）

---

## PR-A: 仕様 + ADR 更新

### タスク

- [x] `docs/spec/m6/tasks.md` 起こし（本ファイル）
- [x] `docs/spec/m6/acceptance-criteria.md` 起こし
- [x] `docs/adr/0001-local-first-architecture.md` Roadmap を M6 / M6.5 分割に更新
- [x] `CLAUDE.md` Architecture に M6 該当時の追記（PR-B 着手前にスケッチ、PR-D 完了時に最終化）

### 完了条件 (DoD)

- [x] tasks.md / acceptance-criteria.md がレビュー可能な完成度
- [x] ADR-0001 Roadmap が M6 / M6.5 分割に整合
- [x] PR description に「設計判断 5 件の確定内容」を再掲
- [x] code-reviewer + comment-analyzer の Quality Gate 通過

---

## PR-B: crypto core + schema 拡張

### タスク

- [x] `utils/backupCrypto.ts` 新設
  - [x] **constant**: `PBKDF2_ITERATIONS = 600_000` / `MIN_ACCEPTED_ITERATIONS = 100_000` / `MAX_ACCEPTED_ITERATIONS = 10_000_000` / `MAX_CIPHERTEXT_BYTES = 100 * 1024 * 1024` / `DECRYPT_FAILURE_MESSAGE = 'パスフレーズが正しくないか、ファイルが壊れています。'` / `MIN_PASSPHRASE_CODEPOINTS = 12` (Unicode コードポイント単位、Intl.Segmenter は ICU バージョン依存で不採用)
  - [x] **API**:
    - [x] `randomBytes(len: number): Uint8Array` (`crypto.getRandomValues` ラッパー、test util から import 可能、`exportKey` 経路は持たない)
    - [x] `deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey>` (PBKDF2-SHA256, **`extractable: false`** + **`usages: ['encrypt', 'decrypt']`**)
    - [x] `encryptBackup(plaintext: BackupV1, passphrase: string, appVersion: string, opts?: { signal?: AbortSignal; now?: Date }): Promise<EncryptedBackupV1>` (AAD で envelope metadata 認証)
    - [x] `decryptBackup(envelope: EncryptedBackupV1, passphrase: string, opts?: { signal?: AbortSignal }): Promise<BackupV1>` (catch を 4 cause に分類、broad catch 禁止)
    - [x] `validatePassphraseLength(p: string): void` (Unicode コードポイント単位で `[...p].length >= MIN_PASSPHRASE_CODEPOINTS`、不足で BackupValidationError)
    - [x] base64 encode/decode helper (test util から import 可能)
  - [x] **regularization**: passphrase は `passphrase.normalize('NFC')` してから `TextEncoder.encode` (AC-12)
  - [x] **AAD**: `buildAad(meta): Uint8Array` (key-sorted JSON.stringify → encode、含む field は AC-13 参照)
  - [x] **try/finally で best-effort zeroize**: encrypt/decrypt 中の `Uint8Array` を `.fill(0)` (AC-14)
  - [x] **`crypto.subtle.exportKey` を export しない** (CI grep で検証、AC-14)
- [x] `utils/backupSchema.ts` 拡張
  - [x] `EncryptedBackupV1` 型定義（types.ts に export、`envelopeVersion: 1` field を `schemaVersion` の代わりに採用）
  - [x] `isEncryptedBackup(json: Record<string, unknown>): json is { encrypted: true; ... }` (AC-8 の AND 結合判定、type guard として宣言)
  - [x] `parseEncryptedEnvelope(json: Record<string, unknown>): EncryptedBackupV1` (parse-time validation: literal check / iterations floor & ceiling / salt 16 bytes / iv 12 bytes / ciphertext size limit、半壊 envelope は `BackupValidationError ({ cause: { kind: 'envelope-incomplete' } })` で reject)
  - [x] `parseAnyBackup(raw: string): BackupV1 | EncryptedBackupV1` 新設 (encrypted detection + 既存 parseBackup の平文 path に dispatch)
  - [x] `parseBackup` (既存関数) は **戻り値型 `BackupV1` 不変**、分岐は `parseAnyBackup` に分離 (AC-8 regression 保護)
- [x] `types.ts` に `EncryptedBackupV1` interface 追加
- [x] **`BackupValidationError` 拡張**: `cause: { kind: 'auth-tag-mismatch' | 'plaintext-corrupted' | 'schema-invalid' | 'kdf-import-failed' | 'envelope-incomplete' | 'no-pending-decryption' | ... }` を保持できる constructor (Error.cause native 使用)
- [x] **logger 経路**: `errorIds.ts` (or 新設 `loggerIds.ts`) に `M6_DECRYPT_AUTH_TAG_FAILED` / `M6_DECRYPT_PLAINTEXT_CORRUPTED` / `M6_DECRYPT_SCHEMA_INVALID` / `M6_DECRYPT_KDF_FAILED` を追加。`logger.warn(id, safe_metadata)` 呼出 (passphrase / plaintext / derived key / salt / ciphertext は絶対に含めない)
- [x] vitest 追加
  - [x] `utils/backupCrypto.test.ts`: AC-1〜4, AC-7, AC-10, AC-11, AC-12, AC-13, AC-14 (合計 ~30 ケース)
  - [x] `utils/backupSchema.test.ts` 拡張: AC-8 (encrypted envelope parse / 既存平文 BackupV1 後方互換 regression / 半壊 envelope reject / 6 ケース fixture pin)
  - [x] `tests/static/no-error-cause-in-components.test.ts`: components 配下の `error.cause` 参照ゼロ assert (AC-9)
  - [x] `tests/static/no-export-key.test.ts`: backupCrypto から `exportKey` の export ゼロ assert (AC-14)
- [x] **test fixtures**: `buildSampleBackup()` / `buildLargeBackup(numProjects, perProjectBytes)` / `tamperLastByte(b64)` を `tests/fixtures/backup.ts` に集約 (AC-1, AC-7, AC-10 で再利用)
- [x] CLAUDE.md MUST: 境界値テスト (パスフレーズ 0/1/11/12/13/最大長 / iterations 境界 MIN-1, MIN, MAX, MAX+1)

### 完了条件 (DoD)

- [x] AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14 が vitest で PASS
- [x] `npm run lint` 0 errors
- [x] `npm test` 全 PASS
- [x] `/simplify` 3 並列 + `/safe-refactor` 通過
- [x] **Evaluator 分離プロトコル発動** (新規機能のため、`rules/quality-gate.md` 準拠)
- [x] PR description にパスフレーズ忘却＝データ喪失 + Unicode NFC normalization の forward-locking を明示

---

## PR-C: backupSlice 統合

### タスク

- [x] **PR-C 着手前 MUST**: `pendingDecryption` state 遷移図を `docs/spec/m6/state-diagram.md` に作成（CLAUDE.md MUST「statusフィールドで処理状態を管理する設計 → 状態遷移図を先に作成」準拠、`design-diagram` skill 利用）。状態: `idle` / `pendingDecryption` / `decrypting` / `decrypted-conflict-resolution` / `error` / `cancelled` + 遷移条件と禁則
- [x] `store/backupSlice.ts` 拡張
  - [x] `exportAllData(opts?: { encrypt?: { passphrase: string }; signal?: AbortSignal })` に encrypt option + AbortSignal 追加（or 別 action `exportAllDataEncrypted`）
  - [x] `prepareImport` で `EncryptedBackupV1` 検出時に新規 state `pendingDecryption: { rawEnvelope: EncryptedBackupV1; retryCount: number; abortController: AbortController }` を設定
  - [x] 新 action `decryptAndPrepareImport(passphrase: string)` 追加:
    - [x] 復号成功時に既存 conflict 検出フローへ合流
    - [x] 復号失敗時は `retryCount` を increment、5 回超で modal 強制 close + トースト (AC-6)
    - [x] `pendingDecryption === null` で呼ばれたら throw (`cause: { kind: 'no-pending-decryption' }`、AC-6)
    - [x] `signal.aborted` の場合は state 更新を skip (race-free)
  - [x] 新 action `cancelPendingDecryption()` 追加: `abortController.abort()` を呼んでから state 初期化
  - [x] `prepareImport` の二重呼び出し対策: 既存 `pendingDecryption` あり時は **先に `cancelPendingDecryption` を呼んでから** new state を set (AC-6 race-free 上書き禁止)
- [x] vitest 拡張
  - [x] `store/backupSlice.test.ts` 拡張: encrypted export round-trip / pendingDecryption state transition (illegal transition reject / 二重 import / cancel race) / decryptAndPrepareImport 成功・失敗・retry / cancelPendingDecryption + AbortSignal 連動 / 5 回 retry 超過

### 完了条件 (DoD)

- [x] AC-5 (export 動線統合の slice 層、AbortSignal 含む) が vitest で PASS（UI 部分は PR-D）
- [x] AC-6 (import 動線統合 + state machine 規律) が vitest で PASS
- [x] AC-11 (AbortSignal 経路) の slice 層が vitest で PASS
- [x] state-diagram.md と AC-6 の transition table が一致
- [x] `npm run lint` 0 errors / `npm test` 全 PASS
- [x] `/simplify` 3 並列通過

---

## PR-D: UI 実装

### タスク

- [x] `components/modals/ExportEncryptModal.tsx` 新設
  - [x] パスフレーズ入力 + 確認再入力 + grapheme count 強度表示
  - [x] 「暗号化してダウンロード」ボタン（**最低 12 grapheme** + 一致時のみ enable、AC-5）
  - [x] パスフレーズ忘却警告文言 + 強度ヒント文言（AC-9 参照）
  - [x] `<input type="password" autocomplete="new-password">` + `oncopy` / `oncut` の `preventDefault` (AC-9)
  - [x] 暗号化成功 / 失敗どちらでも passphrase state を `setPassphrase('')` クリア (AC-5, AC-14)
  - [x] 30 秒タイムアウト時の abort + トースト + cancel ボタン (AC-11)
  - [x] `role="dialog"` + Tab 内ループ + a11y 属性 (AC-9)
  - [x] Blob/URL.createObjectURL は try/finally で `URL.revokeObjectURL` cleanup (AC-5)
- [x] `components/modals/ImportPassphraseModal.tsx` 新設
  - [x] パスフレーズ入力 + 「復号する」ボタン
  - [x] エラー文言は constant `DECRYPT_FAILURE_MESSAGE` を直接使用 (auth tag 失敗を fingerprinting しない、AC-9)
  - [x] retry カウンタ表示 (現在 N/5 回)、5 回到達で強制 close + トースト (AC-6)
  - [x] キャンセル動線 (`cancelPendingDecryption` 経由、AC-6)
  - [x] 復号成功 / 失敗どちらでも passphrase state を即クリア (AC-9)
  - [x] 30 秒タイムアウト abort (AC-11)
  - [x] `<input type="password" autocomplete="new-password">` + `oncopy` / `oncut` の `preventDefault` (AC-9 と整合、PR-D evaluator FAIL-2 で確定)
- [x] 既存 Export 動線拡張
  - [x] 既存 Export 動線エントリポイント全箇所（`handleExportAllData` を呼ぶ全コンポーネント。grep で網羅確認）に「暗号化する」チェックボックスを追加
  - [x] チェック ON で ExportEncryptModal を mount
- [x] 既存 Import 動線拡張
  - [x] `prepareImport` で encrypted envelope 検出時に ImportPassphraseModal を mount
  - [x] 復号成功時に既存 ImportConflictModal にバトンタッチ
- [x] `components/ModalManager.tsx` に新規 2 modal を統合（mount 順序 + 競合時の優先順位を state-diagram.md に記載済の通り）
- [x] **CI 静的検査 (AC-9, AC-14)**:
  - [x] `tests/static/no-error-cause-in-components.test.ts` (components 配下の `error.cause` 参照ゼロ)
  - [x] `tests/static/no-export-key.test.ts` (utils/backupCrypto から exportKey export ゼロ)

### 完了条件 (DoD)

- [x] AC-5, AC-6, AC-9, AC-11 (UI 部分) が manual E2E で確認済（dev サーバ）
- [x] CI 静的検査 (AC-9 cause grep + AC-14 exportKey grep) が PASS
- [x] `npm run lint` 0 errors / `npm test` 全 PASS
- [x] **Evaluator 分離プロトコル発動** (5 ファイル以上 **または** 新規機能、`rules/quality-gate.md` 準拠)
- [x] `/simplify` 3 並列 + `/review-pr` 6 並列 + 大規模なら `/codex review` セカンドオピニオン
- [x] CLAUDE.md Architecture に M6 反映（最終化）

---

## M6 振り返り（PR-D merge 後に追記）

（PR-D 完了時に handoff PR で追記）
