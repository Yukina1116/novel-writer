# M6 Acceptance Criteria

- Related: [tasks.md](./tasks.md)
- Status: 🚧 PR-A 着手時点で AC 確定 (実装は PR-B〜D で順次達成)

各基準は第三者が機械的に検証可能であること。曖昧な基準（「正しく動作する」「セキュアに暗号化される」等）は禁止。

## 用語と命名規則

- **envelope**: 暗号化ファイル全体 (`EncryptedBackupV1`)
- **payload**: envelope の中身、復号後に得られる平文 (`BackupV1`)
- **envelopeVersion**: envelope 形状自体のバージョン (crypto metadata layout の version)
- **payload version (= `BackupV1.schemaVersion`)**: payload の version。envelope と payload は **独立した version 軸**で進行する
- 規則: payload を v2 化しても envelope を v2 化する必要はない（envelope shape が変わらなければ envelope は v1 のまま）。詳細は `### envelope / payload version の独立性` 節参照

## AC 一覧

### AC-1: 暗号化 Export round-trip

**Given**: 非空の平文 `BackupV1`（projects / tutorialState / analysisHistory が全て 1 件以上含まれる）
**When**: `encryptBackup(plaintext, passphrase='test-1234')` の出力を `decryptBackup(envelope, 'test-1234')` で復号
**Then**:
- 元の `BackupV1` と deep-equal な payload が復元される
- 直接 field check として `decrypted.exportedAt === plaintext.exportedAt` / `decrypted.projects.length === plaintext.projects.length` / `decrypted.projects[0].id === plaintext.projects[0].id` も成立する（type-loss 検出）
- KDF 決定性: 同じ `(passphrase, salt, iterations)` で `deriveKey` を呼ぶと同じ AES key bytes が得られる（**ただし** `extractable: false` のため key bytes は直接比較できないので、同 salt/iv/passphrase で encrypt 結果の ciphertext が byte-equal を assert）

**検証方法**: vitest (`utils/backupCrypto.test.ts`)

```typescript
const plaintext: BackupV1 = buildSampleBackup();
const envelope = await encryptBackup(plaintext, 'test-1234', '1.0.0');
const decrypted = await decryptBackup(envelope, 'test-1234');
expect(JSON.parse(JSON.stringify(decrypted))).toEqual(JSON.parse(JSON.stringify(plaintext)));
expect(decrypted.exportedAt).toBe(plaintext.exportedAt);
expect(decrypted.projects.length).toBe(plaintext.projects.length);
```

---

### AC-2: 誤りパスフレーズ拒否

**Given**: AC-1 で生成した暗号化 envelope
**When**: 異なるパスフレーズ (`'wrong-passphrase'`) で `decryptBackup` を試行
**Then**:
- `BackupValidationError` が throw される
- UI 向け `error.message` は constant `DECRYPT_FAILURE_MESSAGE` （「パスフレーズが正しくないか、ファイルが壊れています」）と完全一致
- 内部 triage 用に `error.cause === { kind: 'auth-tag-mismatch' }` が設定される（**UI 層は cause を読まない**規律。AC-9 で別途固定）
- `logger.warn('M6_DECRYPT_AUTH_TAG_FAILED', { envelopeVersion, algorithm, kdf, iterations, encryptedAt })` が呼ばれる（**passphrase / plaintext / derived key / salt / ciphertext は絶対に log に含めない**）

**検証方法**: vitest

```typescript
import { DECRYPT_FAILURE_MESSAGE } from '../utils/backupCrypto';
await expect(decryptBackup(envelope, 'wrong-passphrase'))
  .rejects.toMatchObject({
    name: 'BackupValidationError',
    message: DECRYPT_FAILURE_MESSAGE,
    cause: { kind: 'auth-tag-mismatch' },
  });
expect(loggerMock.warn).toHaveBeenCalledWith(
  'M6_DECRYPT_AUTH_TAG_FAILED',
  expect.not.objectContaining({ passphrase: expect.anything() }),
);
```

---

### AC-3: IV 一意性 + KDF salt 一意性 (regression smoke test)

**Given**: 暗号化操作で生成される IV (12 byte, AES-GCM 標準) と salt (16 byte, PBKDF2)
**When**: 内部 helper `randomBytes(len)` を介して IV / salt を 100 回生成
**Then**:
- 100 回の IV を base64 化して Set に格納し `Set.size === 100`（衝突なし）
- 100 回の salt も同様に `Set.size === 100`
- 注: 本 AC は「実装が定数 IV / 単調 counter ではないこと」の sanity check (regression smoke test)。暗号学的な一意性保証は `crypto.getRandomValues` の CSPRNG 性質に委譲する

**検証方法**: vitest（`crypto.getRandomValues` 使用、決定性 mock せず実 random）

```typescript
import { randomBytes } from '../utils/backupCrypto';
const ivs = new Set<string>();
const salts = new Set<string>();
for (let i = 0; i < 100; i++) {
  ivs.add(toBase64(randomBytes(12)));
  salts.add(toBase64(randomBytes(16)));
}
expect(ivs.size).toBe(100);
expect(salts.size).toBe(100);

// 統合テスト: KDF を経由した encryptBackup を 3 回回し iv / kdfParams.salt が異なることを確認
//（KDF コスト対策で件数を絞る）
const envelopes = await Promise.all([
  encryptBackup(plaintext, 'pwd', '1.0.0'),
  encryptBackup(plaintext, 'pwd', '1.0.0'),
  encryptBackup(plaintext, 'pwd', '1.0.0'),
]);
expect(new Set(envelopes.map(e => e.iv)).size).toBe(3);
expect(new Set(envelopes.map(e => e.kdfParams.salt)).size).toBe(3);
```

注: `randomBytes` は PR-B で internal helper として実装するが、test util から import 可能な公開ポジションに置く（`__testOnly__` namespace ではなく通常 export、ただし production caller も使う前提の単純 wrapper）。

---

### AC-4: EncryptedBackupV1 envelope schema + parse-time validation

**Given**: `encryptBackup(plaintext, passphrase, appVersion)` の出力
**When**: JSON.stringify → JSON.parse → `parseEncryptedEnvelope` 通過
**Then**: 以下の field が全て期待型で存在し、parse-time の境界条件を満たす

```typescript
interface EncryptedBackupV1 {
    envelopeVersion: 1;       // envelope shape のバージョン (payload version と独立)
    encrypted: true;          // discriminator (AND 結合の一要素、AC-8 参照)
    algorithm: 'AES-GCM-256'; // literal、parse 時に !== 'AES-GCM-256' なら reject
    kdf: 'PBKDF2-SHA256';     // literal、parse 時に !== 'PBKDF2-SHA256' なら reject
    kdfParams: {
        salt: string;          // base64、decode 後に **正確に 16 bytes**、外れたら reject
        iterations: number;    // PBKDF2、現状値は constant `PBKDF2_ITERATIONS = 600_000`
    };
    iv: string;                // base64、decode 後に **正確に 12 bytes** (AES-GCM)、外れたら reject
    ciphertext: string;        // base64、非空、AES-GCM 出力形式 (auth tag は ciphertext 末尾 16 bytes に concat、別 field にしない)
    appVersion: string;
    encryptedAt: string;       // ISO 8601、parse 失敗時は `new Date().toISOString()` で fallback (既存 parseBackup の exportedAt と同じパターン)
}
```

注:
- `iterations` は `number` 型として定義し、現在値（`PBKDF2_ITERATIONS = 600_000`）は `utils/backupCrypto.ts` 内の constant で管理。将来 OWASP 推奨値が引き上がった際、constant 更新で済み、過去に暗号化した envelope の復号時は envelope に保存された iterations を使用する（後方互換性）
- `MIN_ACCEPTED_ITERATIONS = 100_000` (parse 時の floor、これ未満は reject、downgrade 攻撃対策)
- `MAX_ACCEPTED_ITERATIONS = 10_000_000` (parse 時の ceiling、これ超は reject、import DoS 対策)
- `MAX_CIPHERTEXT_BYTES = 100 * 1024 * 1024` (decode 後 100 MB ceiling、import DoS 対策、現実的なバックアップサイズの 10 倍程度)
- `MAX_ENVELOPE_FILE_BYTES = 150 * 1024 * 1024` (生 JSON 文字列の上限、base64 inflate 込み)
- AES-GCM ciphertext は Web Crypto 仕様で auth tag (16 bytes) を末尾に concat 形式で出力する。本 envelope は **別 `tag` field を持たず**、`ciphertext` 末尾 16 bytes が auth tag

**検証方法**: vitest + `ts-expect-error` pin

```typescript
import {
    PBKDF2_ITERATIONS,
    MIN_ACCEPTED_ITERATIONS,
    MAX_ACCEPTED_ITERATIONS,
    MAX_CIPHERTEXT_BYTES,
    MAX_ENVELOPE_FILE_BYTES,
} from '../utils/backupCrypto';

const env = await encryptBackup(plaintext, 'pwd', '1.0.0');
expect(env.envelopeVersion).toBe(1);
expect(env.encrypted).toBe(true);
expect(env.algorithm).toBe('AES-GCM-256');
expect(env.kdf).toBe('PBKDF2-SHA256');
expect(env.kdfParams.iterations).toBe(PBKDF2_ITERATIONS);
expect(base64Decode(env.kdfParams.salt).length).toBe(16);
expect(base64Decode(env.iv).length).toBe(12);
expect(env.iv).toMatch(/^[A-Za-z0-9+/=]+$/);

// parse-time reject の境界
await expect(parseEncryptedEnvelope({ ...env, algorithm: 'AES-GCM-256-FUTURE' }))
  .rejects.toThrow(BackupValidationError);
await expect(parseEncryptedEnvelope({ ...env, kdf: 'Argon2id' }))
  .rejects.toThrow(BackupValidationError);
await expect(parseEncryptedEnvelope({ ...env, kdfParams: { ...env.kdfParams, iterations: MIN_ACCEPTED_ITERATIONS - 1 } }))
  .rejects.toThrow(/iterations/);
await expect(parseEncryptedEnvelope({ ...env, kdfParams: { ...env.kdfParams, iterations: MAX_ACCEPTED_ITERATIONS + 1 } }))
  .rejects.toThrow(/iterations/);
```

---

### AC-5: Export 動線統合（UI 含む）

**Given**: Header から「全データバックアップ」を開く
**When**:
1. 「暗号化する」チェックボックス ON
2. ExportEncryptModal でパスフレーズ 2 回入力（一致、最低 12 文字）
3. 「暗号化してダウンロード」押下

**Then**:
- 拡張子 `.enc.json` のファイルが download される
- ファイル内容を JSON.parse すると `{ encrypted: true, envelopeVersion: 1, algorithm: 'AES-GCM-256', ... }` を満たす
- トースト「暗号化バックアップを作成しました」が表示
- パスフレーズ不一致 / 12 文字未満で「暗号化してダウンロード」ボタンが disabled
- **暗号化失敗時の cleanup invariant**: `encryptBackup` throw 時は Blob 未生成 → ダウンロード対話ダイアログ発生せず、トースト「暗号化に失敗しました」表示。Blob 生成後 `anchor.click` 前 throw の場合は finally で `URL.revokeObjectURL` 実行
- **暗号化成功後**: ExportEncryptModal の React state `setPassphrase('')` で memory 滞留時間最小化

**検証方法**:
- slice 層: vitest (`store/backupSlice.test.ts`)
- UI 層: manual E2E（dev サーバ、download ファイルの先頭バイトを確認）

注: パスフレーズ最低長を **12 文字**に引き上げ（M6 のローカルだけなら 8 でも実用的だが、M6.5 で Cloud Storage に保管された envelope は offline 攻撃対象になる。spec 段階で 12 文字に固定し M6.5 で再緩和しない方針を pin）。

---

### AC-6: Import 動線統合（UI 含む） + state-machine 規律

**Given**: AC-5 で download した `.enc.json` ファイル
**When**:
1. 「データ復元」で同ファイル選択
2. ImportPassphraseModal でパスフレーズ入力
3. 「復号する」押下

**Then**:
- 既存 ImportConflictModal が開く（既存 project と衝突する場合）、または直接 import 成功トースト
- 誤りパスフレーズ入力時はエラー文言が ImportPassphraseModal 内に表示され、再入力可能（最大 5 回まで、超過時は modal 強制 close + トースト「再試行回数の上限に達しました」）
- キャンセル動線で modal を閉じられる、`AbortController.abort()` を呼んで in-flight な KDF を中断、state を初期化
- **state-machine 規律**:
  - `decryptAndPrepareImport(passphrase)` が `pendingDecryption === null` 状態で呼ばれた場合、`BackupValidationError ({ cause: { kind: 'no-pending-decryption' } })` を throw、state は変更しない
  - `prepareImport(secondEncryptedFile)` が `pendingDecryption` 既存時に呼ばれた場合、最初の `pendingDecryption` を `cancelPendingDecryption` で確定的にクリアしてから second を set する（**race-free 上書き禁止**、cancel→set の順序を pin）
  - `cancelPendingDecryption` は abort signal 発火後に state 初期化、後追いで完了する KDF promise は signal.aborted check で state 更新を skip
- **復号成功・失敗どちらの場合も**: ImportPassphraseModal の React state `setPassphrase('')` で memory 滞留時間最小化

**検証方法**:
- slice 層: vitest (`store/backupSlice.test.ts`、state machine transition test 含む)
- UI 層: manual E2E

---

### AC-7: 改竄検知 + catch 範囲分類

**Given**: 暗号化 envelope の `ciphertext` を base64 decode → 末尾 1 byte を XOR 0xFF で改竄 → 再 base64 encode
**When**: 正しいパスフレーズで `decryptBackup` を試行
**Then**:
- `BackupValidationError` が throw される
- UI 向け `error.message` は AC-2 と同一の constant `DECRYPT_FAILURE_MESSAGE` (fingerprinting 防止)
- 内部 `error.cause.kind` は **catch 範囲に応じて 4 分類**:
  1. `'auth-tag-mismatch'`: AES-GCM `OperationError` (パスフレーズ違い + 改竄の両方を含む)
  2. `'plaintext-corrupted'`: base64 decode 後の `JSON.parse` 失敗 (auth tag は通ったが内部構造異常 = 攻撃痕跡候補)
  3. `'schema-invalid'`: 復号後 BackupV1 schema validation 失敗
  4. `'kdf-import-failed'`: `crypto.subtle.importKey` / `deriveKey` 失敗 (KDF パラメータ不正、`NotSupportedError` 等)
- 上記いずれにも該当しない catch-all は **禁止** (再 throw、CLAUDE.md「empty catch / 広い catch 禁止」準拠)
- 各 cause に対応する `logger.warn` が呼ばれる: `M6_DECRYPT_AUTH_TAG_FAILED` / `M6_DECRYPT_PLAINTEXT_CORRUPTED` / `M6_DECRYPT_SCHEMA_INVALID` / `M6_DECRYPT_KDF_FAILED`

**検証方法**: vitest

```typescript
const tamperLastByte = (b64: string): string => {
    const bytes = base64Decode(b64);
    bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0xff;
    return base64Encode(bytes);
};
const env = await encryptBackup(plaintext, 'pwd-12-chars-ok', '1.0.0');
const tampered = { ...env, ciphertext: tamperLastByte(env.ciphertext) };
await expect(decryptBackup(tampered, 'pwd-12-chars-ok'))
  .rejects.toMatchObject({
    message: DECRYPT_FAILURE_MESSAGE,
    cause: { kind: 'auth-tag-mismatch' },
  });
```

---

### AC-8: 既存平文 BackupV1 後方互換 + isEncryptedBackup AND 結合判定

**Given**: M4 で生成した平文 BackupV1 ファイル（`encrypted` field なし、`schemaVersion: 1`）
**When**: `parseAnyBackup` (新設、`BackupV1 | EncryptedBackupV1` を返す) または既存 `parseBackup` (`BackupV1` のみ) に渡す
**Then**:
- `parseBackup` (既存、`BackupV1` を返す) は M4 と完全互換: legacy bare-project / `{project: {...}}` envelope unwrap も従前通り
- `parseAnyBackup` (新設、union 戻り値) は encrypted detection を行い、平文の場合は `BackupV1` を返す
- **`isEncryptedBackup(json)` の AND 結合判定** (どれか欠けたら `false` を返し平文扱い):
  - `typeof json.encrypted === 'boolean' && json.encrypted === true`
  - `typeof json.algorithm === 'string'`
  - `typeof json.kdf === 'string'`
  - `typeof json.iv === 'string'`
  - `typeof json.ciphertext === 'string'`
  - `json.kdfParams && typeof json.kdfParams.salt === 'string'`
- **半壊 envelope** (`encrypted: true` だが他 field 欠落) は `parseAnyBackup` 内で `parseEncryptedEnvelope` を呼んで `BackupValidationError ({ cause: { kind: 'envelope-incomplete' } })` を throw（**silent fallback to plaintext path 禁止**）
- **既存 vitest regression assertion**: `utils/backupSchema.test.ts` の以下のケースは PR-B 後も全て同じエラーメッセージで throw する:
  - schemaVersion 999 reject
  - project index error
  - malformed JSON
  - empty file
  - legacy bare-project unwrap
  - `{project: {...}}` envelope unwrap
  - tutorialState 非 boolean drop
  - analysisHistory filter
- `parseBackup` (既存関数) の戻り値型は **不変** (`BackupV1` のまま、union 化しない)。新規分岐は `parseAnyBackup` に分離

**検証方法**: vitest（既存 backupSchema test に regression assertion 追加）

```typescript
// 後方互換
const v1: BackupV1 = buildSampleBackup();
const raw = JSON.stringify(v1);
expect(parseBackup(raw)).toEqual(v1); // 既存関数、戻り値型 BackupV1 不変
expect(parseAnyBackup(raw)).toEqual(v1); // 新設、平文の場合は BackupV1

// 半壊 envelope reject
const halfEnvelope = JSON.stringify({ encrypted: true, schemaVersion: 1 });
expect(() => parseAnyBackup(halfEnvelope))
  .toThrow(/envelope/);
```

---

### AC-9: a11y / セキュリティ UI 文言 + cause 利用規律

**Given**: ExportEncryptModal / ImportPassphraseModal が表示された状態
**When**: キーボード操作 / 画面読み上げ / セキュリティ文言の確認 / コード grep
**Then**:
- `role="dialog"` または `role="alertdialog"` 属性が付与
- Tab キーで modal 内 focus 移動可能、modal 外への漏れなし
- ExportEncryptModal にパスフレーズ忘却警告文言が含まれる (例: 「パスフレーズを忘れるとデータを復元できません」)
- ExportEncryptModal にパスフレーズ強度説明文言が含まれる (例: 「12 文字以上、英数字記号を組み合わせると強度が上がります。生成されたバックアップファイルがクラウドに保管された場合のオフライン攻撃に備えてください」)
- ImportPassphraseModal の誤りパスフレーズエラー文言は constant `DECRYPT_FAILURE_MESSAGE` と完全一致 (fingerprinting 防止)
- `<input type="password">` でパスフレーズが画面に表示されない
- `autocomplete="new-password"` 指定 (パスフレーズマネージャ連携の hint)
- パスフレーズ入力フィールドに `oncopy` / `oncut` handler を仕掛けて `preventDefault` (フィールドからのコピーを阻止、貼り付けはそのまま許可)
- **cause 利用規律**: `components/` 配下のソースコードを grep して `error.cause` への参照がゼロであること (UI 層は cause を読まず、`error.message` のみを表示。fingerprinting 防止の機械的 enforcement)

**検証方法**:
- a11y: manual E2E（dev サーバ + VoiceOver / NVDA）
- cause grep: vitest (`tests/static/no-error-cause-in-components.test.ts`、`grep -r "error.cause" components/` の戻り値を空 assert)

---

### AC-10: 大容量データの round-trip 性能（Node 環境、CI 緩和）

**Given**: 10 MB 相当の平文 BackupV1（projects 50 件、各 200 KB の novelChunks）
**When**: `encryptBackup` → `decryptBackup` を Node 20+ の `globalThis.crypto.subtle` で実行
**Then**:
- ローカル開発環境で encrypt + decrypt 合計 < 10 秒 (PBKDF2 600k iter. を 2 回含む)
- CI (GitHub Actions ubuntu-latest) 環境では < 15 秒に閾値緩和（環境変数 `CI=true` で判定）
- メモリ使用量基準は AC として設定しない（vitest = Node では信頼性ある計測手段なし、ブラウザでの過大メモリ消費は manual E2E で別途観察）

**検証方法**: vitest (`environment: 'node'`, `performance.now` で計測)

```typescript
const plaintext: BackupV1 = buildLargeBackup(50, 200_000);
const t0 = performance.now();
const env = await encryptBackup(plaintext, 'pwd-12-chars-ok', '1.0.0');
const dec = await decryptBackup(env, 'pwd-12-chars-ok');
const elapsed = performance.now() - t0;
const limit = process.env.CI === 'true' ? 15_000 : 10_000;
expect(elapsed).toBeLessThan(limit);
```

注:
- PBKDF2 はキー派生 1 回 (encrypt) + 1 回 (decrypt) で計 2 回回るため、600,000 iterations × 2 で実時間が増える。600,000 は OWASP 推奨値（2023）に準拠
- Node 環境とブラウザ環境で `crypto.subtle` の性能特性が異なるため、本 AC は **Node 環境のみ**を保証対象とする。ブラウザ実機での体感性能は manual E2E (AC-5/6) で確認

---

### AC-11: AbortSignal 対応 + UI timeout

**Given**: `encryptBackup` / `decryptBackup` の long-running 操作（PBKDF2 + AES-GCM）
**When**: `AbortSignal` を option として渡し、KDF 中に `controller.abort()` を呼ぶ
**Then**:
- `encryptBackup({ signal })` / `decryptBackup({ signal })` が `'AbortError'` DOMException で reject
- abort 時に Blob 未生成 (export) / pendingDecryption state 未更新 (import) の invariant 維持
- UI 層は **30 秒経過時に強制 abort** + トースト「暗号化に時間がかかっています。デバイス性能を確認するか、データ量を減らしてください」+ cancel ボタン
- mobile Safari の background throttle (15 秒以上) に対しては、abort 後の再試行を許可（state を「再試行可能」に戻す）

**検証方法**: vitest

```typescript
const controller = new AbortController();
const promise = encryptBackup(plaintext, 'pwd-12-chars-ok', '1.0.0', { signal: controller.signal });
controller.abort();
await expect(promise).rejects.toThrow(/AbortError|aborted/);
```

---

### AC-12: Unicode passphrase normalization policy

**Given**: 同じユーザーが NFC 形式 `'é'` (é precomposed) と NFD 形式 `'é'` (e + combining acute) を別端末でタイプ
**When**: 一方で encrypt、もう一方で decrypt
**Then**:
- **採用 policy**: パスフレーズは `passphrase.normalize('NFC')` で正規化してから `TextEncoder.encode('utf-8')` する。これにより端末依存の合成形式差を吸収
- 上記 policy の **forward-locking** : 一度 shipped したら変更不可（既存 envelope 全 invalidate のため）。本 AC で固定し ADR-0001 にも記録
- 非 ASCII passphrase の round-trip テスト (絵文字 / CJK / accented Latin) が PASS
- パスフレーズ最低長判定は **コードポイント単位ではなく `[...passphrase].length`** で行う（surrogate pair 対応、`'🔑🔑🔑🔑'.length === 8` ではなく `[...'🔑🔑🔑🔑'].length === 4` を採用）

**検証方法**: vitest

```typescript
const nfc = 'é' + 'rest12chars';      // é precomposed (12 chars)
const nfd = 'é' + 'rest12chars'; // é decomposed (13 code units, 12 graphemes 相当)
const env = await encryptBackup(plain, nfc, '1.0.0');
// NFC 正規化により nfd でも decrypt 成功する
expect(await decryptBackup(env, nfd)).toEqual(plain);

// 絵文字 4 つ = grapheme 単位 4 → 12 文字未満で reject
expect([...'🔑🔑🔑🔑'].length).toBe(4);
await expect(validatePassphraseLength('🔑🔑🔑🔑'))
  .toThrow(/12 文字/);

// CJK round-trip
const cjk = '日本語パスワード長め文字列';
const env2 = await encryptBackup(plain, cjk, '1.0.0');
expect(await decryptBackup(env2, cjk)).toEqual(plain);

// 空 / トリム
await expect(encryptBackup(plain, '', '1.0.0')).rejects.toThrow(/パスフレーズ/);
```

---

### AC-13: AES-GCM AAD で envelope metadata 認証

**Given**: `encryptBackup` 実行時に envelope metadata（algorithm / kdf / kdfParams / iv / appVersion / encryptedAt / envelopeVersion）が確定
**When**: `crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes }, key, plaintextBytes)` を呼ぶ
**Then**:
- `aadBytes` は metadata の **canonical 形式**（key sorted JSON.stringify → TextEncoder.encode）
- AAD に含む field: `envelopeVersion`, `algorithm`, `kdf`, `kdfParams`, `iv`, `appVersion`, `encryptedAt`
- AAD に含まない field: `ciphertext` (それ自体が encrypt 出力), `encrypted: true` discriminator (judgmental)
- `decryptBackup` 時に同じ canonical 形式で AAD を再構築し、`crypto.subtle.decrypt` の `additionalData` に渡す
- 改竄テスト: envelope metadata の任意 1 byte を改竄したら auth tag 失敗で reject (現状の AC-7 が ciphertext 末尾 byte 改竄のみ対象だったのを metadata にも拡張)

**検証方法**: vitest

```typescript
const env = await encryptBackup(plain, 'pwd-12-chars-ok', '1.0.0');
const tamperedMeta = { ...env, appVersion: 'malicious-1.0.0' }; // ciphertext は変えない
await expect(decryptBackup(tamperedMeta, 'pwd-12-chars-ok'))
  .rejects.toMatchObject({ cause: { kind: 'auth-tag-mismatch' } });

// algorithm 改竄 (まずは isEncryptedBackup で reject されるが、AAD でも保護される二重防御)
const tamperedAlg = { ...env, algorithm: 'AES-GCM-256' as const, kdf: 'PBKDF2-SHA256' as const };
// 同じ literal なら通るが、別 literal だと parseEncryptedEnvelope で先に reject される
```

注: AAD 採用により将来 algorithm agility (M7+ で ChaCha20-Poly1305 等を追加) する際、algorithm 偽装 (downgrade attack) を auth tag で機械的に防げる。

---

### AC-14: deriveKey の extractable=false + memory 滞留最小化

**Given**: `deriveKey(passphrase, salt, iterations)` の実装
**When**: `crypto.subtle.deriveKey` を呼ぶ
**Then**:
- `extractable: false` で固定（`crypto.subtle.exportKey` で raw key bytes を取り出せない）
- `usages: ['encrypt', 'decrypt']` に限定（`['wrapKey', 'unwrapKey']` 等は付けない）
- `utils/backupCrypto.ts` から `crypto.subtle.exportKey` を export しない（grep で確認、export 経路を機械的に閉じる）
- `encryptBackup` / `decryptBackup` の implementation:
  - 平文 plaintext を保持する `Uint8Array` は関数 scope を最小化、`try/finally` で encrypt/decrypt 結果の Uint8Array に `.fill(0)` 実施（best-effort zeroize、JS では完全 wipe 不可）
  - `passphrase: string` は immutable で wipe 不可 → UI 層側で AC-9 の規律に従い React state を即クリア

**検証方法**: vitest + grep

```typescript
const env = await encryptBackup(plain, 'pwd-12-chars-ok', '1.0.0');
// internal CryptoKey は test では直接観察不能だが、deriveKey の呼び出し引数を mock spy
expect(deriveKeyMock).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ extractable: false, usages: ['encrypt', 'decrypt'] }),
);
```

```bash
# CI script
! grep -r "exportKey" utils/backupCrypto.ts
```

---

## envelope / payload version の独立性

| 軸 | 現状 | 将来の bump 規則 |
|---|---|---|
| envelope version (`EncryptedBackupV1.envelopeVersion`) | 1 | envelope 自体の shape が変わったとき (新 field 追加 / 既存 field 削除 / AAD 形式変更) |
| payload version (`BackupV1.schemaVersion`) | 1 | payload (BackupV1) の shape が変わったとき (新 project field 追加等) |

**規則**:
- `EncryptedBackupV1` (envelope v1) の中身は将来 `BackupV2` (payload v2) でも構わない（envelope 解読 → payload を `parseBackup` の table-driven parser に渡す seam）
- 逆に、envelope 自体の shape が変わったら `EncryptedBackupV2` を新設し、`isEncryptedBackup` の AND 結合に `envelopeVersion` 判定を追加して dispatch
- payload v2 化のタイミングで envelope を bump する必要は **無い**

---

## AC 達成マッピング

| AC | PR で達成 | 検証層 |
|---|---|---|
| AC-1 | PR-B | vitest |
| AC-2 | PR-B | vitest + logger mock |
| AC-3 | PR-B | vitest |
| AC-4 | PR-B | vitest + ts-expect-error |
| AC-5 | PR-C (slice) + PR-D (UI) | vitest + manual E2E |
| AC-6 | PR-C (slice) + PR-D (UI) | vitest (state machine) + manual E2E |
| AC-7 | PR-B | vitest |
| AC-8 | PR-B | vitest (regression) |
| AC-9 | PR-D | manual E2E + grep test |
| AC-10 | PR-B | vitest (performance) |
| AC-11 | PR-B (signature) + PR-C/D (UI 統合) | vitest |
| AC-12 | PR-B | vitest |
| AC-13 | PR-B | vitest |
| AC-14 | PR-B | vitest + grep |

---

## 非対象（M6 では検証しない）

- **Cloud Storage upload/download** → M6.5 で別 AC
- **Cloud rollback/replay protection** → M6.5 で freshness mechanism (server-side timestamp / generation number) を別 AC 化
- **Tier 2 ゲート** → M6.5 で Cloud Storage 側にのみ Tier 2 適用、ローカルファイル機能は M6.5 後も Tier 1 のまま
- **複数端末間の鍵共有** → ADR-0001「複数端末同期は実装しない」を踏襲、永久に非対象
- **パスフレーズ recovery / escrow** → 設計判断 1 で「忘却即データ喪失」を採用、永久に非対象
- **zxcvbn ベースのパスフレーズ強度判定** → MVP では length-only (12 文字) + grapheme count、将来 enhancement
- **paste 禁止 (clipboard 経由パスフレーズ流出対策)** → UX 重視で許可、`oncopy`/`oncut` の preventDefault のみ実施 (AC-9)
- **完全 memory wipe** → JavaScript で実現不能、best-effort zeroize のみ (AC-14)
- **副チャネル攻撃 (timing / cache) 対策** → Web Crypto に委譲、ユーザーランドで防御不能
- **量子計算機耐性 (post-quantum)** → AES-GCM-256 は量子計算機に対して鍵長半分の影響を受ける (Grover) が、本 M6 範囲では非対象。将来の post-quantum 対応は別 ADR
- **IndexedDB の at-rest 暗号化** → IndexedDB は引き続き平文。M6 は「Export ファイル」「(M6.5 で) Cloud Storage 上の blob」のみ暗号化。UI 文言で誤読を避ける (AC-9)
- **共有 PC での cold-boot / browser cache / IndexedDB residue 経由の漏洩** → 攻撃者が OS / browser profile にアクセス可能な場合の対策は spec 範囲外。ADR-0001 §Consequences の XSS 限界の延長線上で「OS-level threat は対象外」と明示

---

## ADR-0001 との整合性

| ADR-0001 §Decision 記述 | M6 での実装 | 整合 |
|---|---|---|
| 「Cloud Storage = opt-in 暗号化バックアップ」 | M6 ではローカルファイルのみ、Cloud Storage は M6.5 | ⚠️ Roadmap で M6/M6.5 分割を反映 |
| 「クライアント側 AES-GCM、E2EE」 | AES-GCM-256 + PBKDF2-SHA256 600k it. + AAD で metadata 認証 | ✅ |
| 「XSS 時に鍵・平文ともに流出（設計上の限界）」 | spec で明示再掲、UI の警告文言にも反映、`extractable=false` で機械的に取れる範囲は閉じる | ✅ |
| 「複数端末同期は実装しない」 | 鍵共有なし、ファイル持ち歩き前提 | ✅ |
