---
name: feedback-env-var-naming-drift
description: 環境変数の命名 drift (GCP_PROJECT vs GCLOUD_PROJECT) が hardcoded fallback と結合すると、dev 環境で偶然動いて prod 環境で全滅する fail-open silent bug を生む。env 未設定で fail-fast すること + deploy*.yml と server コードを paired signal として一致確認。
metadata:
  type: feedback
---

deploy workflow の `--set-env-vars` 名と server コードの `process.env.X` 名が drift した状態で、コードに hardcoded fallback (`'novel-writer-dev'` 等) があると、**dev 環境では偶然動き、prod 環境で全 API 401 になる fail-open silent bug** を生む。

**Why:**

2026-06-20 Phase 2 prod migration の AC-P2-7 (Vertex AI smoke test) で発覚した本番 incident。

- `server/firebaseAdmin.ts` のコードは `process.env.GCLOUD_PROJECT` を読む (Firebase Admin SDK 慣行)
- `.github/workflows/deploy.yml` (dev) と `.github/workflows/deploy-prod.yml` (prod) は両方とも `GCP_PROJECT=...` を設定 (`GCLOUD_PROJECT` 不在)
- どちらの env も undefined → hardcoded fallback `'novel-writer-dev'` が使われる
- **dev**: 偶然 `'novel-writer-dev'` と project ID が一致 → token verify 成功 → 動作
- **prod**: `'novel-writer-dev'` で初期化されるため、prod project の FE が発行した token を `aud: novel-writer-prod` と読む → server は `expected: novel-writer-dev` で 401 reject → 全 API 401

dev で長期稼働して気付かない構造的 fail-open。Phase 1 補完 (Firebase Auth Google provider + authorizedDomains) を全部終えても、deploy / smoke test まで一切兆候なし。AC-P2-7 (実 token を server に投げる E2E) で初めて顕在化。

同種の bug が `server/aiClient.ts:11` にも存在 (`process.env.GCP_PROJECT || 'novel-writer-dev'`)。こちらは aiClient.ts の env 名が `GCP_PROJECT` で deploy*.yml と一致していたため、本番でも正しい project に Vertex AI 呼出が向いていた (発症せず)。ただし fallback hardcoded 自体が antipattern。

**How to apply:**

env var を読むコードを書く時、以下を機械的に検査する規律:

1. **deploy workflow と server コードの env var 名を grep で一致確認**
   ```bash
   # コード側で読んでる env var を抽出
   grep -rEh 'process\.env\.[A-Z_]+' server/ --include="*.ts" \
     | grep -oE 'process\.env\.[A-Z_]+' | sort -u

   # deploy workflow の --set-env-vars を抽出
   grep -oE '[A-Z_]+=[a-z0-9-]+' .github/workflows/deploy*.yml | cut -d= -f1 | sort -u

   # diff で drift 検出
   ```

2. **hardcoded fallback は env 未設定で「動かないと困る」場合のみ許可**
   - emulator mode / local default だけ
   - 本番運用に進む経路 (`NODE_ENV=production`) では fail-fast すべき
   - 「dev で偶然動いている fallback」は最も悪質 (発覚が prod migration まで遅延)

3. **paired signal で機械的に検証**
   - deploy*.yml の `--set-env-vars` と server コードの `process.env.X` を一対の paired signal として扱う
   - drift 検出を CI test (static grep test) で固定化することを検討

4. **fail-fast 化のコード規律**
   ```typescript
   // ❌ Bad: dev で偶然動く silent fallback
   const projectId = process.env.GCLOUD_PROJECT ?? 'novel-writer-dev';

   // ✅ Good: env 未設定で startup error
   const projectId = process.env.GCLOUD_PROJECT;
   if (!projectId && !isEmulatorMode()) {
     throw new Error('GCLOUD_PROJECT env var must be set. Check deploy*.yml configuration.');
   }
   ```

**関連:**

- [project_novel_writer_m1](./project_novel_writer_m1.md) - M1 振り返り (Firebase Admin SDK 初期化規律)
- [feedback_firebase_auth_setup_gotcha](./feedback_firebase_auth_setup_gotcha.md) - 同セッション (2026-06-20 Phase 2) で発覚した Firebase Auth 設定漏れ事例
- グローバル `feedback_silent_fail_paired_signal.md` - silent fail に一対の早期検知シグナルを用意する規律 (本件は server コードと deploy*.yml の paired signal として適用)
- グローバル `feedback_verify_fact_before_declaring.md` - 「dev で動いてるから prod でも動く」は思い込みで、env / config の地続き性を ground truth 確認すべき
