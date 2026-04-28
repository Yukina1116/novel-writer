# M6: E2EE 暗号化バックアップ タスク表

- Status: 🚧 着手中（spec 起こし PR-A、2026-04-29）
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
| **PR-A** | docs(m6) M6 仕様 + AC + ADR-0001 Roadmap 更新（M6 / M6.5 分割反映） | 小〜中 | 1〜1.5 時間 | 🚧 着手中 |
| **PR-B** | feat(m6) `utils/backupCrypto.ts` 新設 (deriveKey/encrypt/decrypt) + `utils/backupSchema.ts` に EncryptedBackupV1 型 + parseBackup 分岐 + vitest 単体テスト | 中 | 2〜3 時間 | ⏳ |
| **PR-C** | feat(m6) `store/backupSlice.ts` に encrypt/decrypt 経路統合 + 統合テスト | 中 | 1.5〜2 時間 | ⏳ |
| **PR-D** | feat(m6) UI 実装 (ExportEncryptModal + ImportPassphraseModal + Export/Import 動線統合) | 大 | 2〜3 時間 | ⏳ |

着手順序: **PR-A → PR-B → PR-C → PR-D**（逐次、各段階で merge 可能な状態を維持）

---

## PR-A: 仕様 + ADR 更新

### タスク

- [x] `docs/spec/m6/tasks.md` 起こし（本ファイル）
- [x] `docs/spec/m6/acceptance-criteria.md` 起こし
- [ ] `docs/adr/0001-local-first-architecture.md` Roadmap を M6 / M6.5 分割に更新
- [ ] `CLAUDE.md` Architecture に M6 該当時の追記（PR-B 着手前にスケッチ、PR-D 完了時に最終化）

### 完了条件 (DoD)

- [x] tasks.md / acceptance-criteria.md がレビュー可能な完成度
- [ ] ADR-0001 Roadmap が M6 / M6.5 分割に整合
- [ ] PR description に「設計判断 5 件の確定内容」を再掲
- [ ] code-reviewer + comment-analyzer の Quality Gate 通過

---

## PR-B: crypto core + schema 拡張

### タスク

- [ ] `utils/backupCrypto.ts` 新設
  - [ ] `deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey>` (PBKDF2-SHA256)
  - [ ] `encryptBackup(plaintext: BackupV1, passphrase: string, appVersion: string, now?: Date): Promise<EncryptedBackupV1>`
  - [ ] `decryptBackup(envelope: EncryptedBackupV1, passphrase: string): Promise<BackupV1>`
  - [ ] 内部 helper: `randomBytes(len: number): Uint8Array` (`crypto.getRandomValues` ラッパー)
  - [ ] base64 encode/decode helper
- [ ] `utils/backupSchema.ts` 拡張
  - [ ] `EncryptedBackupV1` 型定義（types.ts に export）
  - [ ] `isEncryptedBackup(json: Record<string, unknown>): boolean` (discriminator chk)
  - [ ] `parseEncryptedEnvelope(json: Record<string, unknown>): EncryptedBackupV1` (validation + sanitize)
  - [ ] `parseBackup` chain に encrypted 分岐追加（復号は backupSlice 側で実施するため、parseBackup 自体は envelope を返す型へ拡張 or 別関数 `parseBackupOrEnvelope` を追加）
- [ ] `types.ts` に `EncryptedBackupV1` interface 追加
- [ ] vitest 追加
  - [ ] `utils/backupCrypto.test.ts`: encrypt/decrypt round-trip / 誤りパスフレーズ拒否 / IV 一意性 (100 回) / KDF 決定性 / 改竄検知
  - [ ] `utils/backupSchema.test.ts` 拡張: encrypted envelope parse / 既存平文 BackupV1 後方互換 regression
- [ ] CLAUDE.md MUST: 境界値テスト (パスフレーズ 0/1/最大長 / iterations 境界)

### 完了条件 (DoD)

- [ ] AC-1, AC-2, AC-3, AC-4, AC-7, AC-8 が vitest で PASS
- [ ] `npm run lint` 0 errors
- [ ] `npm test` 全 PASS
- [ ] `/simplify` 3 並列 + `/safe-refactor` 通過
- [ ] PR description にパスフレーズ忘却＝データ喪失の明示

---

## PR-C: backupSlice 統合

### タスク

- [ ] **PR-C 着手前 MUST**: `pendingDecryption` state 遷移図を `docs/spec/m6/state-diagram.md` に作成（CLAUDE.md MUST「statusフィールドで処理状態を管理する設計 → 状態遷移図を先に作成」準拠、`design-diagram` skill 利用）
- [ ] `store/backupSlice.ts` 拡張
  - [ ] `exportAllData(opts?: { encrypt?: { passphrase: string } })` に encrypt option 追加（or 別 action `exportAllDataEncrypted`）
  - [ ] `prepareImport` で `EncryptedBackupV1` 検出時に新規 state `pendingDecryption: { rawEnvelope: EncryptedBackupV1 }` を設定
  - [ ] 新 action `decryptAndPrepareImport(passphrase: string)` 追加: 復号成功時に既存 conflict 検出フローへ合流
  - [ ] 新 action `cancelPendingDecryption()` 追加
- [ ] vitest 拡張
  - [ ] `store/backupSlice.test.ts` 拡張: encrypted export round-trip / pendingDecryption state transition / decryptAndPrepareImport 成功・失敗 path / cancelPendingDecryption

### 完了条件 (DoD)

- [ ] AC-5 (export 動線統合の slice 層) が vitest で PASS（UI 部分は PR-D）
- [ ] AC-6 (import 動線統合の slice 層) が vitest で PASS
- [ ] `npm run lint` 0 errors / `npm test` 全 PASS
- [ ] `/simplify` 3 並列通過

---

## PR-D: UI 実装

### タスク

- [ ] `components/modals/ExportEncryptModal.tsx` 新設
  - [ ] パスフレーズ入力 + 確認再入力 + length-only 強度表示
  - [ ] 「暗号化してダウンロード」ボタン（最低 8 文字 + 一致時のみ enable）
  - [ ] パスフレーズ忘却警告文言
  - [ ] `role="dialog"` + a11y 属性
- [ ] `components/modals/ImportPassphraseModal.tsx` 新設
  - [ ] パスフレーズ入力 + 「復号する」ボタン
  - [ ] エラー文言「パスフレーズが正しくないかファイルが壊れています」（auth tag 失敗を fingerprinting しない）
  - [ ] キャンセル動線
- [ ] 既存 Export 動線拡張
  - [ ] 既存 Export 動線エントリポイント全箇所（`handleExportAllData` を呼ぶ全コンポーネント。grep で網羅確認）に「暗号化する」チェックボックスを追加
  - [ ] チェック ON で ExportEncryptModal を mount
- [ ] 既存 Import 動線拡張
  - [ ] `prepareImport` で encrypted envelope 検出時に ImportPassphraseModal を mount
  - [ ] 復号成功時に既存 ImportConflictModal にバトンタッチ
- [ ] `components/ModalManager.tsx` に新規 2 modal を統合（mount 順序: ExportEncryptModal / ImportPassphraseModal）

### 完了条件 (DoD)

- [ ] AC-5, AC-6 (UI 部分) が manual E2E で確認済（dev サーバ）
- [ ] AC-9 (a11y / 改竄検知 UI 文言) が manual で確認済
- [ ] `npm run lint` 0 errors / `npm test` 全 PASS
- [ ] **Evaluator 分離プロトコル発動** (5 ファイル以上 **または** 新規機能、`rules/quality-gate.md` 準拠)
- [ ] `/simplify` 3 並列 + `/review-pr` 6 並列 + 大規模なら `/codex review` セカンドオピニオン
- [ ] CLAUDE.md Architecture に M6 反映（最終化）

---

## M6 振り返り（PR-D merge 後に追記）

（PR-D 完了時に handoff PR で追記）
