# M6 Acceptance Criteria

- Related: [tasks.md](./tasks.md)
- Status: 🚧 PR-A 着手時点で AC 確定 (実装は PR-B〜D で順次達成)

各基準は第三者が機械的に検証可能であること。曖昧な基準（「正しく動作する」「セキュアに暗号化される」等）は禁止。

## AC 一覧

### AC-1: 暗号化 Export round-trip

**Given**: 非空の平文 `BackupV1`（projects / tutorialState / analysisHistory が全て 1 件以上含まれる）
**When**: `encryptBackup(plaintext, passphrase='test-1234')` の出力を `decryptBackup(envelope, 'test-1234')` で復号
**Then**: 元の `BackupV1` と deep-equal な平文が復元される

**検証方法**: vitest (`utils/backupCrypto.test.ts`)

```typescript
const plaintext: BackupV1 = buildSampleBackup();
const envelope = await encryptBackup(plaintext, 'test-1234', '1.0.0');
const decrypted = await decryptBackup(envelope, 'test-1234');
// JSON 経由で正規化（key ordering / Date 等の差を吸収）して比較
expect(JSON.parse(JSON.stringify(decrypted))).toEqual(JSON.parse(JSON.stringify(plaintext)));
```

---

### AC-2: 誤りパスフレーズ拒否

**Given**: AC-1 で生成した暗号化 envelope
**When**: 異なるパスフレーズ (`'wrong-passphrase'`) で `decryptBackup` を試行
**Then**: `BackupValidationError` が throw され、メッセージは「パスフレーズが正しくないか、ファイルが壊れています」（auth tag 失敗と改竄検知を区別しない）

**検証方法**: vitest

```typescript
await expect(decryptBackup(envelope, 'wrong-passphrase')).rejects.toThrow(BackupValidationError);
await expect(decryptBackup(envelope, 'wrong-passphrase')).rejects.toThrow(
  /パスフレーズが正しくないか/
);
```

---

### AC-3: IV 一意性

**Given**: 暗号化操作で生成される IV (12 byte, AES-GCM 推奨長)
**When**: IV 生成器を 100 回呼ぶ（`crypto.getRandomValues(new Uint8Array(12))` 直接 or KDF をキャッシュした内部 helper）
**Then**: 100 回の IV を base64 化して Set に格納し `Set.size === 100`（全 IV が異なる）

**検証方法**: vitest（`crypto.getRandomValues` 使用、決定性 mock せず実 random）

```typescript
// IV 生成は KDF と独立した経路でテスト（KDF 600,000 it. を 100 回回す
// と CI コストが膨れるため、IV 生成器を export して直接呼ぶ）
import { generateIv } from '../utils/backupCrypto';
const ivs = new Set<string>();
for (let i = 0; i < 100; i++) {
  ivs.add(toBase64(generateIv()));
}
expect(ivs.size).toBe(100);

// + 統合テストとして KDF を経由した encryptBackup を 3 回だけ回し、
//   各 envelope の iv field が異なることも確認（KDF コスト対策で件数を絞る）
```

---

### AC-4: EncryptedBackupV1 envelope schema

**Given**: `encryptBackup(plaintext, passphrase)` の出力
**When**: JSON.stringify → JSON.parse → 型 narrow
**Then**: 以下の field が全て期待型で存在する

```typescript
interface EncryptedBackupV1 {
    schemaVersion: 1;
    encrypted: true;          // discriminator
    algorithm: 'AES-GCM-256';
    kdf: 'PBKDF2-SHA256';
    kdfParams: {
        salt: string;          // base64, 16 bytes
        iterations: number;    // PBKDF2、現状値は constant PBKDF2_ITERATIONS で管理
    };
    iv: string;                // base64, 12 bytes for GCM
    ciphertext: string;        // base64
    appVersion: string;
    encryptedAt: string;       // ISO 8601
}
```

注: `iterations` は `number` 型として定義し、現在値（PBKDF2 600,000）は `utils/backupCrypto.ts` 内の constant `PBKDF2_ITERATIONS` で管理する。将来 OWASP 推奨値が引き上がった際、constant 更新で済み、過去に暗号化した envelope の復号時は envelope に保存された iterations を使用する（後方互換性）。

**検証方法**: vitest + `ts-expect-error` pin

```typescript
import { PBKDF2_ITERATIONS } from '../utils/backupCrypto';
const env = await encryptBackup(plaintext, 'pwd', '1.0.0');
expect(env.schemaVersion).toBe(1);
expect(env.encrypted).toBe(true);
expect(env.algorithm).toBe('AES-GCM-256');
expect(env.kdf).toBe('PBKDF2-SHA256');
expect(env.kdfParams.iterations).toBe(PBKDF2_ITERATIONS);
expect(env.iv).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
```

---

### AC-5: Export 動線統合（UI 含む）

**Given**: Header から「全データバックアップ」を開く
**When**:
1. 「暗号化する」チェックボックス ON
2. ExportEncryptModal でパスフレーズ 2 回入力（一致、最低 8 文字）
3. 「暗号化してダウンロード」押下

**Then**:
- 拡張子 `.enc.json` のファイルが download される
- ファイル内容を JSON.parse すると `{ encrypted: true, schemaVersion: 1, algorithm: 'AES-GCM-256', ... }` を満たす
- トースト「暗号化バックアップを作成しました」が表示
- パスフレーズ不一致 / 8 文字未満で「暗号化してダウンロード」ボタンが disabled

**検証方法**:
- slice 層: vitest (`store/backupSlice.test.ts`)
- UI 層: manual E2E（dev サーバ、download ファイルの先頭バイトを確認）

---

### AC-6: Import 動線統合（UI 含む）

**Given**: AC-5 で download した `.enc.json` ファイル
**When**:
1. 「データ復元」で同ファイル選択
2. ImportPassphraseModal でパスフレーズ入力
3. 「復号する」押下

**Then**:
- 既存 ImportConflictModal が開く（既存 project と衝突する場合）、または直接 import 成功トースト
- 誤りパスフレーズ入力時はエラー文言が ImportPassphraseModal 内に表示され、再入力可能
- キャンセル動線で modal を閉じられる

**検証方法**:
- slice 層: vitest (`store/backupSlice.test.ts`)
- UI 層: manual E2E

---

### AC-7: 改竄検知

**Given**: 暗号化 envelope の `ciphertext` を base64 decode → 末尾 1 byte を XOR 0xFF で改竄 → 再 base64 encode
**When**: 正しいパスフレーズで `decryptBackup` を試行
**Then**: AES-GCM auth tag 検証失敗で `BackupValidationError` が throw される。メッセージは AC-2 と同一（「パスフレーズが正しくないか、ファイルが壊れています」）

**検証方法**: vitest

```typescript
// テスト helper の sketch（PR-B 実装側で同等の関数を test util に置く）
const tamperLastByte = (b64: string): string => {
    const bytes = base64Decode(b64);
    bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0xff;
    return base64Encode(bytes);
};

const env = await encryptBackup(plaintext, 'pwd', '1.0.0');
const tampered = {
    ...env,
    ciphertext: tamperLastByte(env.ciphertext),
};
await expect(decryptBackup(tampered, 'pwd')).rejects.toThrow(BackupValidationError);
```

---

### AC-8: 既存平文 BackupV1 後方互換

**Given**: M4 で生成した平文 BackupV1 ファイル（`encrypted` field なし、`schemaVersion: 1`）
**When**: `parseBackup` (またはラッパー) に渡す
**Then**:
- 既存挙動と完全同一: passphrase modal が出ない、conflict 検出フローに直接合流
- 既存 vitest (`utils/backupSchema.test.ts`) が全 PASS（regression なし）
- legacy bare-project / `{project: {...}}` envelope も従前通り読み込める

**検証方法**: vitest（既存 backupSchema test に regression assertion 追加）

```typescript
const v1: BackupV1 = { /* M4 形式 */ };
const raw = JSON.stringify(v1);
const result = parseBackup(raw); // 既存関数、encrypted 分岐なし
expect(result).toEqual(v1);
```

---

### AC-9: a11y / セキュリティ UI 文言

**Given**: ExportEncryptModal / ImportPassphraseModal が表示された状態
**When**: キーボード操作 / 画面読み上げ / セキュリティ文言の確認
**Then**:
- `role="dialog"` または `role="alertdialog"` 属性が付与
- Tab キーで modal 内 focus 移動可能、modal 外への漏れなし
- ExportEncryptModal にパスフレーズ忘却警告文言が含まれる（例: 「パスフレーズを忘れるとデータを復元できません」）
- ImportPassphraseModal の誤りパスフレーズエラー文言は AC-2/AC-7 と同一文面（fingerprinting 防止）
- `<input type="password">` でパスフレーズが画面に表示されない

**検証方法**: manual E2E（dev サーバ + VoiceOver / NVDA）

---

### AC-10: 大容量データの round-trip 性能（Node 環境）

**Given**: 10 MB 相当の平文 BackupV1（projects 50 件、各 200 KB の novelChunks）
**When**: `encryptBackup` → `decryptBackup` を Node 20+ の `globalThis.crypto.subtle` で実行
**Then**: encrypt + decrypt 合計 < 10 秒（PBKDF2 600k it. を 2 回含む、Node 環境基準）

**検証方法**: vitest (`environment: 'node'`, `performance.now` で計測)

```typescript
const plaintext: BackupV1 = buildLargeBackup(50, 200_000);
const t0 = performance.now();
const env = await encryptBackup(plaintext, 'pwd', '1.0.0');
const dec = await decryptBackup(env, 'pwd');
const elapsed = performance.now() - t0;
expect(elapsed).toBeLessThan(10_000);
```

注:
- PBKDF2 はキー派生 1 回 (encrypt) + 1 回 (decrypt) で計 2 回回るため、600,000 iterations × 2 で実時間が増える。600,000 は OWASP 推奨値（2023）に準拠
- Node 環境とブラウザ環境で `crypto.subtle` の性能特性が異なるため、本 AC は **Node 環境のみ**を保証対象とする。ブラウザ実機での体感性能は manual E2E (AC-5/6) で確認
- メモリ使用量上限は AC として設定しない（vitest = Node では信頼性ある計測手段がなく、`performance.memory` は Chrome 限定の非標準 API。ブラウザでの過大メモリ消費は manual E2E で別途観察）

---

## AC 達成マッピング

| AC | PR で達成 | 検証層 |
|---|---|---|
| AC-1 | PR-B | vitest |
| AC-2 | PR-B | vitest |
| AC-3 | PR-B | vitest |
| AC-4 | PR-B | vitest + ts-expect-error |
| AC-5 | PR-C (slice) + PR-D (UI) | vitest + manual E2E |
| AC-6 | PR-C (slice) + PR-D (UI) | vitest + manual E2E |
| AC-7 | PR-B | vitest |
| AC-8 | PR-B | vitest (regression) |
| AC-9 | PR-D | manual E2E |
| AC-10 | PR-B | vitest (performance) |

---

## 非対象（M6 では検証しない）

- **Cloud Storage upload/download** → M6.5 で別 AC
- **Tier 2 ゲート** → M6.5 で別 AC
- **複数端末間の鍵共有** → ADR-0001「複数端末同期は実装しない」を踏襲、永久に非対象
- **パスフレーズ recovery / escrow** → 設計判断 1 で「忘却即データ喪失」を採用、永久に非対象
- **zxcvbn ベースのパスフレーズ強度判定** → MVP では length-only、将来 enhancement

---

## ADR-0001 との整合性

| ADR-0001 §Decision 記述 | M6 での実装 | 整合 |
|---|---|---|
| 「Cloud Storage = opt-in 暗号化バックアップ」 | M6 ではローカルファイルのみ、Cloud Storage は M6.5 | ⚠️ Roadmap で M6/M6.5 分割を反映 |
| 「クライアント側 AES-GCM、E2EE」 | AES-GCM-256 + PBKDF2-SHA256 600k it. | ✅ |
| 「XSS 時に鍵・平文ともに流出（設計上の限界）」 | spec で明示再掲、UI の警告文言にも反映 | ✅ |
| 「複数端末同期は実装しない」 | 鍵共有なし、ファイル持ち歩き前提 | ✅ |
