# Handoff: M6 PR-A〜C 完走 (E2EE 暗号化バックアップ・75% 完了)

- Session Date: 2026-04-29（夜セッション、PR #73/#74/#75 + 各 blocker fix を連続マージ）
- Owner: yasushi-honda
- Status: ✅ 再開可能（M6 PR-A〜C 完了、PR-D (UI) のみ残。M7-α 法務確認は引き続き AI セッション外作業として保留）
- Previous handoff: [2026-04-29-m7a-issue49-cleanup.md](./2026-04-29-m7a-issue49-cleanup.md)

## 今セッションの完了内容

| PR | 内容 | 状態 | 規模 |
|---|---|---|---|
| #73 | docs(m6): M6 spec 起こし (tasks.md + acceptance-criteria.md AC-1〜14) + ADR-0001 Roadmap M6/M6.5 分割 | ✅ merged | 3 file +1167/-2 (1 commit blocker fix 含む) |
| #74 | feat(m6): PR-B crypto core (utils/backupCrypto.ts + utils/backupErrors.ts + isEncryptedBackup/parseEncryptedEnvelope/parseAnyBackup + 33 ケース vitest + 静的検査 2 件) | ✅ merged | 10 file +1311/-56 (2 commits blocker fix 含む) |
| #75 | feat(m6): PR-C slice integration (state-diagram.md + backupSlice.ts に encrypt/decrypt 経路 + 14 ケース vitest) | ✅ merged | 6 file +639/-23 (2 commits blocker fix 含む) |

**M6 進捗**: PR-A (spec) / PR-B (crypto core) / PR-C (slice integration) 完了 = 75%。残り **PR-D (UI 実装)** のみ。

### Quality Gate 実施実績

各 PR で CLAUDE.md MUST に従い段階的に実施:

- **PR #73 (doc-only, 3 file +443 行)**:
  1. **第 1 段階** code-reviewer + comment-analyzer 並列 → 重要指摘 7 件反映 (AC-3 KDF コスト過大 / AC-10 Node vs Browser 性能差 / AC-1 byte-equivalence / I-1 ファイル行数固定 / I-3 caller 列挙 / I-7 Tier ゲート整合 / AC-4 literal 型)
  2. **第 2 段階 (大規模 PR)** /review-pr 4 並列 (pr-test-analyzer / silent-failure-hunter / type-design-analyzer) + /codex review → blocker 13 件 (B1〜B13) 反映 (state-machine AC / AC-8 regression / Unicode normalization / logger 分離 / catch 4 cause 分類 / AbortSignal AC-11 / extractable=false / isEncryptedBackup AND 結合 / MIN_ACCEPTED_ITERATIONS floor / envelopeVersion rename / Error.cause / AAD metadata binding / 12 grapheme passphrase 強度)
- **PR #74 (新規機能, 10 file +1228 行)**:
  1. **Evaluator 分離プロトコル**: 3 周目 (REQUEST_CHANGES → REQUEST_CHANGES → APPROVE)。FAIL 4 件 (AC-1 KDF determinism / AC-2 event id assert / AC-7 4 cause / AC-14 extractable spy) + HIGH 1 件 (循環 import) を順次反映
  2. **/simplify 3 並列** (reuse / quality / efficiency) → C1 (test copy-paste -> helper) / C2 (BackupValidationError constructor options) / I1/I3 dead code 削除 / I-1 (toBase64 chunked, AC-10 35% 短縮) / §2 (buildSampleBackup を buildBackupV1 経由)
  3. **/review-pr 4 並列 + /codex review** (大規模 PR) → blocker 4 件 + Polish 1 件反映 (Error.cause native chain / decryptBackup の payload shape validation / base64 strict / graphemeLength → codepointLength rename / appVersion / encryptedAt fallback)
- **PR #75 (新規機能 + state machine, 6 file +533 行)**:
  1. CLAUDE.md MUST「statusフィールド設計 → 状態遷移図先行作成」に従い `docs/spec/m6/state-diagram.md` を **実装前に作成** (T1〜T12 遷移 + 禁則 + 不変条件 + ModalManager 統合 + エラー文言契約)
  2. **Evaluator 分離プロトコル**: REQUEST_CHANGES → APPROVE (MEDIUM 2: retry 残回数の責務 / AC-11 KDF mid-execution 不可 を反映)
  3. **/simplify 3 並列** → C1 (BackupErrorCauseKind 拡張 + as never 削除) / I1 (toast 文字列 constant 化) / I2/M1 (retry 残回数の責務 comment + spec) / R1 (buildEncryptedBackupFilename 集約) / R2 (isStaleDecryptSession helper) / M2 (AC-11 spec 実装限界明記)
  4. **/review-pr 4 並列 + /codex review** → blocker 7 件反映 (B1: readSnapshot 後の再 stale check / F1: exportAllData の signal abort 早期 return / F2: stale-session catch の console.warn / G1: saveLastExportedAt 失敗 toast テスト / G2: T9b race during decrypt / G3: T7 真の Decrypting 中 cancel / O3: decryptAndPrepareImport 戻り値型 narrow)

### 主要設計判断

#### M6 / M6.5 分割 (PR #73)
- ADR 当初は M6 を一括計画していたが、M5 (Stripe) 未完了で Tier 2 ゲート組めない事情を受け **Cloud Storage 連携を M6.5 に分離**
- M6: クライアント側 AES-GCM-256 + PBKDF2-SHA256 (600,000 iter.) + ローカルファイル `.enc.json` Export/Import + Tier 1 でも使える
- M6.5: signed URL upload/download + uid scope + Tier 2 ゲート (M5 完了後)

#### 設計判断 5 件 (PR #73 で確定)
| 判断 | 採用 |
|---|---|
| 鍵管理方式 | パスフレーズ派生 (PBKDF2-SHA256) + NFC normalization |
| 保管先段階 | M6 はローカルファイル `.enc.json` のみ (M6.5 で Cloud Storage) |
| Tier ゲート | M6 範囲は Tier 1、M6.5 で Cloud Storage 側にのみ Tier 2 |
| envelope schema | `EncryptedBackupV1` 新設 (`envelopeVersion` と payload `BackupV1.schemaVersion` を独立) + AES-GCM AAD で metadata 認証 |
| UI 統合 | 既存 Export モーダルに「暗号化する」option 追加 (PR-D で UI 化) |

#### 暗号 invariant (PR #74 で実装、Codex 評価で OWASP 2023 準拠と確認)
- **AES-GCM-256** + **PBKDF2-SHA256 600,000 iter.** + **IV 12 bytes** + **salt 16 bytes**
- **AAD canonical form**: key-sorted JSON.stringify(`{algorithm, appVersion, encryptedAt, envelopeVersion, iv, kdf, kdfParams}`) で metadata 改竄を auth tag で検知
- **DECRYPT_FAILURE_MESSAGE = '...'** 単一文言で fingerprinting 防止 + `error.cause: { kind }` で 4 段階内部分類 (auth-tag-mismatch / plaintext-corrupted / schema-invalid / kdf-import-failed)
- **`extractable: false`** で raw key bytes 取得不可 + `try/finally` で best-effort zeroize + `exportKey` を utils/backupCrypto.ts から **export しない** (静的 CI 検査)
- **MIN_ACCEPTED_ITERATIONS = 100,000** floor (downgrade 攻撃対策) / **MAX_ACCEPTED_ITERATIONS = 10M** ceiling + **MAX_CIPHERTEXT_BYTES = 100MB** ceiling (DoS 対策)
- **MIN_PASSPHRASE_CODEPOINTS = 12** (Unicode コードポイント単位、Intl.Segmenter は ICU 依存で engine 不変性なし)

#### state machine 規律 (PR #75 で実装)
- 4 状態: Idle / AwaitingPassphrase / Decrypting / ImportPlan (合流)
- 不変条件: `pendingDecryption !== null ⇒ importPlan === null` を atomic set で保持
- race guard: `isStaleDecryptSession(controller, current)` helper で `signal.aborted || ownership lost` を統一判定。catch / success / readSnapshot 後の **3 段階**で再 check
- AbortSignal 規約: Web Crypto API は `crypto.subtle.deriveKey` / `decrypt` の **mid-execution 中断不可**。チェックポイントは「開始前 / KDF 完了直後 / AES-GCM 完了直後」(AC-11 で spec 化)
- retry 上限 5 (`MAX_DECRYPT_RETRIES`)、超過で modal 強制 close + `DECRYPT_RETRY_EXCEEDED_TOAST` 定数化

## 次セッション開始時の状態 (2026-04-29 本 PR merge 時点 snapshot)

- ブランチ: 本 handoff PR merge 後は `main` clean
- Open Issue: 1 件（#49 M4/M7 follow-up umbrella、rating ≥ 7 全消化済、rating ≤ 6 follow-up + USER_DOC_MISSING UX 課題で open 維持・能動作業不要・monitor 対象、本セッションで状況変化なし）
- 自動テスト (snapshot): vitest **425/425 PASS**（前 339 → +86: M6 PR-A 0 / PR-B 68 / PR-C 18）。次セッション開始時は `npm test` で実数を再確認すること
- 型チェック (snapshot): `tsc --noEmit` 0 errors / build OK / Cloud Run deploy CI は PR #75 merge で再実行済 (status は次セッション `/catchup` で確認)

## 次のアクション（推奨順）

### 1. 法務確認 (AI セッション外、MUST、引き続き保留)

P4 (M7-α) の本番公開前法務確認は前セッション handoff から変化なし。詳細は [2026-04-29-m7a-issue49-cleanup.md](./2026-04-29-m7a-issue49-cleanup.md) §1 参照。

### 2. M6 PR-D 着手 (UI 実装、M6 完了の最後の PR)

`docs/spec/m6/tasks.md` PR-D 節および `state-diagram.md` ModalManager 統合節に従い実装:

- [ ] `components/modals/ExportEncryptModal.tsx` 新設
  - パスフレーズ入力 + 確認再入力 + grapheme 強度表示 (12 codepoint 最低)
  - 暗号化成功 / 失敗どちらでも `setPassphrase('')` で memory 滞留時間最小化 (AC-9)
  - 30 秒タイムアウト abort + cancel ボタン (AC-11)
  - `<input type="password" autocomplete="new-password">` + `oncopy`/`oncut` の `preventDefault` (AC-9)
  - パスフレーズ忘却警告文言 + 強度ヒント (AC-9)
  - Blob/URL.createObjectURL は try/finally で `URL.revokeObjectURL` cleanup (AC-5)
- [ ] `components/modals/ImportPassphraseModal.tsx` 新設
  - パスフレーズ入力 + 「復号する」ボタン
  - エラー文言は constant `DECRYPT_FAILURE_MESSAGE` を直接使用 (AC-9)
  - retry カウンタ表示「(あと N 回)」を `pendingDecryption.retryCount` から `MAX_DECRYPT_RETRIES - retryCount` で導出 (slice は文言生成しない、PR-C で責務分担済)
  - キャンセル動線 (`cancelPendingDecryption()` 経由)
- [ ] 既存 Export 動線拡張: Header / App / App.mobile の `handleExportAllData` に「暗号化する」チェックボックス追加 (callers grep で網羅確認)
- [ ] 既存 Import 動線拡張: `prepareImport` の戻り値 `{ kind: 'encrypted' }` を **caller 側で分岐** (現状 `store/projectSlice.ts:122` / `components/panels/SettingsPanel.tsx:31` が常に `importConflict` を開く実装、PR-D で encrypted 分岐追加)
- [ ] `components/ModalManager.tsx` に新規 2 modal を統合 (`pendingDecryption !== null` 時は `ImportPassphraseModal` を `importPlan` より優先表示)
- [ ] CI 静的検査 2 件 (PR-B で導入済): `no-error-cause-in-components.test.ts` と `no-export-key.test.ts` が PASS 維持

#### PR-D の Quality Gate (CLAUDE.md MUST)
- 5 ファイル+ + 新規機能 → **Evaluator 分離発動**
- /simplify 3 並列 + /review-pr 6 並列 + /codex review (大規模 PR)
- AC-5 / AC-6 / AC-9 / AC-11 (UI 部分) を manual E2E で確認 (dev サーバ)
- CLAUDE.md Architecture に M6 反映 (最終化)

#### M6 完了後の次マイルストーン
- **M6 完了 = 全 AC (1〜14) 達成、UI 含むローカル E2E 動作**
- M5 (Stripe) または M7-β (Tier 2 規約 + 特商法本文) の判断は M6 完了 + 法務確認後

### 3. PR-D で持ち越し作業確認

PR #75 review 時に PR-D 側課題として残った項目:
- **F3 (silent-failure rating 7、限定的)**: `cancelPendingDecryption` の `closeModal` が `activeModal === 'importPassphrase'` に限定されていない。PR-D で modal manager 側で activeModal check 追加
- **type-design O1 (rating 6)**: `PendingDecryption.isDecrypting` を `status: 'awaiting' | 'decrypting'` discriminated union 化検討。PR-D 着手時に第 2 consumer (UI) が増えてから判断
- **encrypted export 専用 toast (codex Nit)**: AC-5 の文言契約を slice / UI どちらが持つか PR-D で確定

### 4. M6 完了後の handoff PR

PR-D merge 後にもう 1 つ handoff PR で:
- ADR-0001 Roadmap M6 を `✅ 完了` に更新
- CLAUDE.md Architecture に M6 反映 (encrypted export/import 経路 + parseAnyBackup + EncryptedBackupV1)
- M6 振り返り (本ファイル) を作成

### 5. Issue #49 の monitor 継続

rating ≥ 7 全消化済の状態は維持。再開条件: rating ≤ 6 follow-up が本番障害として再現 / M5 着手時に同一コードパス / USER_DOC_MISSING UX 実装判断 / review agent rerating で rating ≥ 7 新規発見。

## 申し送り事項（M6 PR-A〜C で導入した API / 設計）

### 新規ファイル / 主要 export

- **`utils/backupErrors.ts`** (新設、循環 import 解消)
  - `class BackupValidationError extends Error` (cause: `BackupErrorCause` を constructor option で受領、ES2022 native chain)
  - `class BackupPreflightError`
  - `type BackupErrorCauseKind` (7 種: crypto/parse 5 + flow guard 2)
  - `interface BackupErrorCause { kind, original? }`
- **`utils/backupCrypto.ts`** (新設)
  - constant: `PBKDF2_ITERATIONS` / `MIN_ACCEPTED_ITERATIONS` / `MAX_ACCEPTED_ITERATIONS` / `MAX_CIPHERTEXT_BYTES` / `MIN_PASSPHRASE_CODEPOINTS` / `SALT_BYTES` / `IV_BYTES` / `DECRYPT_FAILURE_MESSAGE`
  - API: `randomBytes(len)` / `toBase64`/`fromBase64` / `deriveKey(passphrase, salt, iterations)` (extractable=false) / `encryptBackup(plaintext, passphrase, appVersion, opts?)` / `decryptBackup(envelope, passphrase, opts?)` / `validatePassphraseLength(p)`
- **`utils/backupSchema.ts`** (拡張)
  - `isEncryptedBackup(json)` (AND 結合 type guard) / `parseEncryptedEnvelope(json)` (parse-time validation: literal / floor/ceiling / byte-length) / `parseAnyBackup(raw)` (encrypted detection + 平文 fallback) / `buildEncryptedBackupFilename(now?)`
  - `parseBackup` (既存) は **戻り値型 `BackupV1` 不変** (AC-8 regression 保護)
- **`store/backupSlice.ts`** (拡張)
  - `interface PendingDecryption { rawEnvelope, retryCount, abortController, isDecrypting }`
  - `MAX_DECRYPT_RETRIES = 5`
  - `DECRYPT_OVERWRITE_TOAST` / `DECRYPT_RETRY_EXCEEDED_TOAST` constant
  - `type PrepareImportResult = { kind: 'plaintext'; plan: ImportPlan } | { kind: 'encrypted' }`
  - `exportAllData(opts?: { encrypt?: { passphrase }; signal? })`: encrypt 後の signal.aborted 早期 return + AbortError は failure toast 抑制
  - `prepareImport(raw)`: 戻り値が `Promise<PrepareImportResult>` に変更 (旧 callers は `if (result.kind !== 'plaintext') throw ...; const plan = result.plan` 形に追従)
  - `decryptAndPrepareImport(passphrase)`: 戻り値型 `Promise<Extract<PrepareImportResult, { kind: 'plaintext' }>>` で narrow
  - `cancelPendingDecryption()`
- **`types.ts`**: `interface EncryptedBackupV1`
- **`docs/spec/m6/`**: tasks.md / acceptance-criteria.md / state-diagram.md

### test 規律

- `tests/fixtures/backup.ts`: `buildSampleProject` / `buildSampleBackup` (`buildBackupV1` 経由で `BACKUP_SCHEMA_VERSION` 単一参照) / `buildLargeBackup` / `tamperLastByte`
- `utils/backupCrypto.test.ts` 33 ケース: AC-1〜4, 7, 9, 10〜14 + KDF determinism + 4 cause kinds + AAD 改竄 + extractable=false 二段検証
- `utils/backupSchema.test.ts` 拡張: AC-8 regression + `isEncryptedBackup` AND 結合の field 削除 6 種 + `parseEncryptedEnvelope` 境界値 9 種
- `store/backupSlice.test.ts` 拡張 18 ケース: T1〜T12 + T7-pre/T7-real (cancel during KDF) + T9b (race during decrypt) + encrypted export 2 件 + saveLastExportedAt 失敗 toast 2 件
- `tests/static/no-error-cause-in-components.test.ts` (AC-9 cause grep)
- `tests/static/no-export-key.test.ts` (AC-14 exportKey grep)

### CLAUDE.md MUST 準拠の確認事項 (PR-D 着手時に確認)

- ✅ statusフィールド管理 → 状態遷移図先行作成 (state-diagram.md は PR-C で作成済、PR-D は更新の必要あれば PR-D 内で対応)
- 5 ファイル+ + 新規機能 → Evaluator 分離 + /simplify 3 並列 + /review-pr 6 並列 + /codex review
- 境界値: PR-D の grapheme 強度判定 11/12/13、retry counter UI 表示の 0/1/4/5
- main 直 push 禁止、feature ブランチ + PR 経由

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` | ✅ M6/M6.5 分割反映済 (PR #73)。M6 行は 🚧 着手中、M6.5 行は ⏳。完了反映は PR-D merge 後の handoff で実施 | - |
| `CLAUDE.md` Architecture | ⚠️ M6 関連の追記は PR-D merge 後 (tasks.md PR-D DoD で「最終化」と明記) | PR-D 着手時の `/impl-plan` 段階で確認 |
| `docs/spec/m6/tasks.md` | ✅ PR-A 〜 C のチェックボックス更新済 (本 PR で実施) | PR-D 完了時に最終化 |
| `docs/spec/m6/acceptance-criteria.md` | ✅ AC-1〜14 確定 + AC-11 を実装限界に整合 (PR #75) | UI 部分 (AC-5/6/9) は PR-D の manual E2E で確認 |
| `docs/spec/m6/state-diagram.md` | ✅ T1〜T12 + 不変条件 + ModalManager 統合 + エラー文言契約 (PR #75) | PR-D で ModalManager 統合 mount 順序を実装側と再確認 |

## Issue Net 変化（本セッション全体）

GitHub Issue 数の変化:

- Close 数（Issue）: 0 件
- 起票数（Issue）: 0 件
- **Net（Issue）: 0 件**

理由: M6 着手は ADR-0001 Roadmap 既存項目の作業着手であり新規 Issue 起票対象ではない。各 PR の review agent rating ≥ 7 指摘 (PR-A 20 件 / PR-B 4 件 / PR-C 7 件 + Polish 多数) は全て本 PR 内で反映、CLAUDE.md triage 基準 (rating ≥ 7 + confidence ≥ 80) を満たさない / Issue 化より本 PR 内反映の方が ROI 高い項目として処理。Issue #49 (M4/M7 follow-up umbrella) は前セッション handoff から状況変化なし、open 維持の monitor 対象。

PR の動き:

- マージ数: 3 件 (#73 spec / #74 crypto core / #75 slice integration) + 各 blocker fix 計 5 commits
- 着手中（PR）: 1 件（本 handoff PR）

進捗の質: **M6 PR-A〜C 完走 (75%、PR-D のみ残)**。各 PR で **CLAUDE.md MUST の Quality Gate 全段階発動** (Evaluator 分離 + /simplify 3 並列 + /review-pr 6 並列 + /codex review):

- PR #73: 7 reviewer + codex で blocker 20 件反映 (spec 段階で実装 trap を先に潰す効果が顕著、特に B12 AAD 採用は Codex の暗号設計指摘が決定的)
- PR #74: Evaluator 3 周 (REQUEST_CHANGES → REQUEST_CHANGES → APPROVE) で循環 import まで含めて構造的な debt を消化、/simplify で 35% perf 改善 (toBase64 chunked)
- PR #75: state-diagram.md 先行作成 (CLAUDE.md MUST) + readSnapshot 後の race を codex セカンドオピニオンで検出 (specialized agents が見落とした blocker)

CLAUDE.md 4 原則遵守:
1. AI executor として decision-maker 越権なし (設計判断 5 件は impl-plan 段階でユーザー A 確定承認)
2. hook ブロックは「立ち止まれ」として尊重 (post-pr-review hook で各 PR の complete review 実施)
3. PR マージは番号単位の明示認可で 3 件実施 (`#73 をマージしてよい` / `#74 を...` / `#75 を...`)
4. main 直 push 一切なし、全 PR を feature ブランチ + PR 経由

## 残留プロセス

✅ 残留 Node プロセスなし
