---
name: feedback-firebase-auth-setup-gotcha
description: Firebase Web App 登録 (apps:create WEB) だけでは Auth は動かない。Google sign-in provider enable + authorizedDomains 追加 + signIn config の 3 件が別途必要。Phase 1 で完全に漏れた設定。
metadata:
  type: feedback
---

`firebase apps:create WEB` で Firebase Web App を登録しただけでは Firebase Authentication は動作しない。次の 3 件が **別途必要** で、Firebase Console UI または REST API で個別に設定する。

**Why:**
2026-06-20 Phase 2 prod 初回 deploy 直後の AC-P2-7 (smoke test) で本田様が「Google でログイン」を試みた際、`auth/configuration-not-found` (`identitytoolkit.googleapis.com/v1/projects?key=... 400`) で完全に失敗。Phase 1 で `apps:create WEB` を実行して App ID を取得 + Firebase Web SDK config (6 件 secrets) を登録していたが、Authentication 側の設定が完全に空 (`null` / `[]`) だった。dev (`novel-writer-dev`) では正常動作していたため、Phase 1 設定の比較で漏れに気付かなかった。

dev (working) vs prod (broken) 差分:

| 項目 | dev | prod (Phase 1 直後) |
|---|---|---|
| Google sign-in provider | enabled + OAuth clientId あり | 空 (defaultSupportedIdpConfigs に entry なし) |
| authorizedDomains | 5 ドメイン | null |
| signIn config | hashConfig 含む完全 | null |

**How to apply:**

novel-writer に限らず、Firebase Authentication を使う任意の Web App では、初期設定で以下 3 件を **必ず** 確認する:

1. **Google sign-in provider を有効化** (Firebase Console UI で OAuth Web client を自動作成):
   - `https://console.firebase.google.com/project/<PROJECT>/authentication/providers`
   - Sign-in method → Google → Enable → Public-facing name + Support email 入力 → Save
   - これで OAuth Web client (`<project-number>-<random>.apps.googleusercontent.com`) が自動作成される

2. **authorizedDomains に Cloud Run URL を追加** (REST API か Console UI):
   ```bash
   TOKEN=$(gcloud auth print-access-token)
   curl -X PATCH \
     "https://identitytoolkit.googleapis.com/admin/v2/projects/<PROJECT>/config?updateMask=authorizedDomains" \
     -H "Authorization: Bearer $TOKEN" \
     -H "X-Goog-User-Project: <PROJECT>" \
     -H "Content-Type: application/json" \
     -d '{"authorizedDomains":["localhost","<PROJECT>.firebaseapp.com","<PROJECT>.web.app","<cloud-run-default-url>","<cloud-run-project-number-url>"]}'
   ```

3. **確認方法 (REST API で dev/prod 比較)**:
   ```bash
   # Google provider 有効化状態
   curl -s "https://identitytoolkit.googleapis.com/admin/v2/projects/<PROJECT>/defaultSupportedIdpConfigs" \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "X-Goog-User-Project: <PROJECT>" | jq '.defaultSupportedIdpConfigs[]? | {name, enabled, clientId}'

   # authorizedDomains
   curl -s "https://identitytoolkit.googleapis.com/admin/v2/projects/<PROJECT>/config" \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     -H "X-Goog-User-Project: <PROJECT>" | jq '.authorizedDomains'
   ```

**Phase 1 設定の checklist 漏れ防止:**

新規 prod project (novel-writer-prod 以外でも) を立ち上げる際の Firebase 設定 checklist は最低限以下を機械的検証:

- [ ] `firebase apps:create WEB` で App 作成済 (App ID 取得)
- [ ] Web SDK config (apiKey / authDomain / projectId / storageBucket / messagingSenderId / appId) の 6 件を GitHub Secrets に登録
- [ ] **Authentication > Sign-in method > Google を Enable** (UI 操作必須、OAuth client 自動作成のため)
- [ ] **authorizedDomains に Cloud Run URL を追加** (deploy 後、URL 確定後に CLI で追加)
- [ ] dev/prod で `defaultSupportedIdpConfigs` と `config.authorizedDomains` を REST API で比較確認

**関連:**
- [project_novel_writer_m1](./project_novel_writer_m1.md) - M1 振り返り (Phase 1 設定値の真値ソース、本件で追加された Firebase Auth 設定が漏れていた)
- [feedback_user_account_distinction](./feedback_user_account_distinction.md) - 本田様の業務アカウント (`hy.unimail.11@gmail.com`) と Claude session userEmail の取り違えで誤記した事例 (同日発生)
- グローバル `feedback_iam_state_check_before_declare.md` - IAM 状態を gcloud get で確認する規律 (本件は REST API での状態確認に拡張適用)
