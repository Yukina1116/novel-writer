# Runbook: novel-writer-prod インフラ整備 (Phase 1)

- Status: ✅ **完了** (2026-06-20)
- Owner: yasushi-honda
- Executor: AI (Claude Opus 4.7)
- Related: [docs/spec/prod-migration/phase1-tasks.md](../spec/prod-migration/phase1-tasks.md) (タスク表 + AC 検証結果)

## 用途

novel-writer-prod 環境のインフラ整備の実行手順 + 証跡記録。再現性と監査証跡のため `gcloud` / `firebase` / `gh` コマンドをそのまま記載する。

## 前提

- 実行ユーザー: 本田様の GCP / Firebase / GitHub アカウント (`hy.unimail.11@gmail.com` / `yasushi-honda`)
- 課金: 請求先アカウント `01EAA2-26BD24-E69348` を novel-writer-prod に紐付け
- 既存 dev 環境 (`novel-writer-dev`) は不変、本 runbook は prod のみ対象

## 危険操作の注意

- **`firebase deploy` は必ず `--project prod` を明示**。引数なしだと `.firebaserc` の `default: novel-writer-dev` が選ばれるため、prod に対する操作時は明示指定必須 (Codex 修正 R6)
- WIF Provider の attribute condition は `refs/heads/main` 制約付き。feature ブランチからの prod デプロイは GitHub Actions レベルで構造的にブロック
- 予算アラート (¥1,000/月) を 100% / 120% 超過した場合は速やかに原因調査 (Cloud Run の `max-instances=2` で上限はあるが Vertex AI 暴走時は別)

## 実行手順 (時系列、2026-06-20)

### T1: 課金有効化

```bash
gcloud billing projects link novel-writer-prod \
  --billing-account=01EAA2-26BD24-E69348
# → billingEnabled: true
```

**注**: Firebase のお支払い (`01817F-AFD15C-E57676`) は 10 project 紐付け済で quota 上限到達のため、請求先アカウント (別 billing) に切替。

### T2: GCP API 9 種有効化

```bash
gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  firebase.googleapis.com \
  firebaserules.googleapis.com \
  identitytoolkit.googleapis.com \
  --project=novel-writer-prod
```

**Codex 修正反映**: 当初計画の 6 種から Firebase 関連 3 種 (firebase / firebaserules / identitytoolkit) を追加。

### T3: Artifact Registry repository

```bash
gcloud artifacts repositories create novel-writer \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Cloud Run container images for novel-writer prod" \
  --project=novel-writer-prod
```

### T4: Service Account 2 種

```bash
gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Actions Deploy SA" \
  --project=novel-writer-prod

gcloud iam service-accounts create novel-writer-run \
  --display-name="Cloud Run Runtime SA" \
  --project=novel-writer-prod
```

### T5: SA 権限付与

#### Build-time SA (`github-deploy`)

```bash
PROJECT_ID=novel-writer-prod
DEPLOY_SA=github-deploy@${PROJECT_ID}.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:${DEPLOY_SA} \
  --role=roles/run.admin --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:${DEPLOY_SA} \
  --role=roles/artifactregistry.writer --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:${DEPLOY_SA} \
  --role=roles/iam.serviceAccountUser --condition=None
```

#### Runtime SA (`novel-writer-run`)

```bash
RUNTIME_SA=novel-writer-run@${PROJECT_ID}.iam.gserviceaccount.com

# Codex 修正反映: Firebase Admin SDK は Security Rules を bypass するため
# Firestore 書込みには IAM 側 datastore.user が必須
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:${RUNTIME_SA} \
  --role=roles/datastore.user --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:${RUNTIME_SA} \
  --role=roles/aiplatform.user --condition=None
```

### T6: WIF Pool + Provider (branch 制約付き)

```bash
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool" \
  --project=novel-writer-prod

# Codex 修正反映: repo + refs/heads/main の双方を attribute condition で縛る
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project=novel-writer-prod \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Actions Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com/" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository=='yasushi-honda/novel-writer' && assertion.ref=='refs/heads/main'"
```

### T7: github-deploy SA に WIF impersonation 権限

```bash
PROJECT_NUMBER=1026420855688

gcloud iam service-accounts add-iam-policy-binding \
  github-deploy@novel-writer-prod.iam.gserviceaccount.com \
  --project=novel-writer-prod \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/yasushi-honda/novel-writer"
```

### T8: Firestore Native 初期化

```bash
gcloud firestore databases create \
  --database='(default)' \
  --location=asia-northeast1 \
  --type=firestore-native \
  --project=novel-writer-prod
# → type: FIRESTORE_NATIVE, locationId: asia-northeast1
```

### T9: .firebaserc prod alias 追加 + rules deploy

#### Step 1: PR-A (`.firebaserc` 変更)

```bash
# feature branch + PR (PR #192)
git checkout -b feat/prod-migration-phase1-firebaserc
# .firebaserc 編集 (prod alias 追加)
git commit -m "chore(prod): .firebaserc に prod alias 追加 (Phase 1 PR-A)"
git push -u origin feat/prod-migration-phase1-firebaserc
gh pr create ...
# PR #192 として番号単位認可後にマージ
gh pr merge 192 --squash --delete-branch
```

#### Step 2: main 同期 + rules deploy (本 runbook で実施)

```bash
git checkout main && git reset --hard origin/main
firebase deploy --only firestore:rules --project prod
# → released rules firestore.rules to cloud.firestore
# → Project Console: https://console.firebase.google.com/project/novel-writer-prod/overview
```

### T10: Firebase Web App 登録

```bash
firebase projects:addfirebase novel-writer-prod
# → GCP project に Firebase resources を追加

firebase apps:create WEB novel-writer --project novel-writer-prod
# → App ID: 1:1026420855688:web:4afee11ab993a15e2ae03d

firebase apps:sdkconfig WEB 1:1026420855688:web:4afee11ab993a15e2ae03d \
  --project novel-writer-prod
```

取得した 6 値 (apiKey / authDomain / projectId / storageBucket / messagingSenderId / appId) を T11 で Secrets 登録。

### T11: GitHub Secrets 登録

```bash
REPO=Yukina1116/novel-writer

gh secret set PROD_VITE_FIREBASE_API_KEY --body "<apiKey>" --repo $REPO
gh secret set PROD_VITE_FIREBASE_AUTH_DOMAIN --body "novel-writer-prod.firebaseapp.com" --repo $REPO
gh secret set PROD_VITE_FIREBASE_PROJECT_ID --body "novel-writer-prod" --repo $REPO
gh secret set PROD_VITE_FIREBASE_STORAGE_BUCKET --body "novel-writer-prod.firebasestorage.app" --repo $REPO
gh secret set PROD_VITE_FIREBASE_MESSAGING_SENDER_ID --body "1026420855688" --repo $REPO
gh secret set PROD_VITE_FIREBASE_APP_ID --body "1:1026420855688:web:4afee11ab993a15e2ae03d" --repo $REPO

# 確認
gh api repos/$REPO/actions/secrets --jq '.secrets[].name' | grep "^PROD_VITE_FIREBASE"
# → 6 件確認
```

**注**: `<apiKey>` は機密扱い。本 runbook には記載せず、Firebase Console (`https://console.firebase.google.com/project/novel-writer-prod/settings/general`) で確認可能。

### T12: 予算アラート

```bash
gcloud billing budgets create \
  --billing-account=01EAA2-26BD24-E69348 \
  --display-name="novel-writer-prod monthly budget" \
  --budget-amount=1000JPY \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0 \
  --threshold-rule=percent=1.2 \
  --filter-projects=projects/1026420855688
# → Budget ID: 1f17fe3e-13d2-46f3-b906-2942a984ec6d
```

通知先: billing account 管理者 (`hy.unimail.11@gmail.com`) に自動通知。

### T13: Vertex AI quota / region 確認

- `aiplatform.googleapis.com` 有効化済 (T2)
- region: asia-northeast1 (dev と同 region で稼働実績あり)
- default quota: gemini-2.5-flash / Imagen の通常利用範囲では十分
- ¥1,000/月 cap の範囲内では default quota が制約にならない (Imagen 10 回 = ¥100 でも quota は余裕)

実 quota 数値の正確な確認は Phase 2 の smoke test に持ち越し:
- https://console.cloud.google.com/iam-admin/quotas?project=novel-writer-prod&service=aiplatform.googleapis.com

## 検証コマンド集 (再現性のため)

```bash
# AC-1 課金
gcloud billing projects describe novel-writer-prod --format="value(billingEnabled)"

# AC-2 API
gcloud services list --enabled --project novel-writer-prod --format="value(config.name)" \
  | grep -E "^(run|aiplatform|artifactregistry|firestore|cloudbuild|iamcredentials|firebase|firebaserules|identitytoolkit)\."

# AC-3 Artifact Registry
gcloud artifacts repositories describe novel-writer \
  --location=asia-northeast1 --project=novel-writer-prod

# AC-4 SA
gcloud iam service-accounts list --project novel-writer-prod

# AC-5 WIF condition
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global --workload-identity-pool=github-pool \
  --project=novel-writer-prod --format="value(attributeCondition)"

# AC-6 WIF impersonation
gcloud iam service-accounts get-iam-policy \
  github-deploy@novel-writer-prod.iam.gserviceaccount.com \
  --project=novel-writer-prod

# AC-7 Firestore
gcloud firestore databases describe --database='(default)' \
  --project=novel-writer-prod --format="value(type,locationId)"

# AC-9 Secrets
gh api repos/Yukina1116/novel-writer/actions/secrets \
  --jq '.secrets[].name' | grep "^PROD_VITE_FIREBASE" | wc -l

# AC-10 Budget
gcloud billing budgets list --billing-account=01EAA2-26BD24-E69348 \
  --format="table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode)"
```

## ロールバック手順 (もし Phase 1 で問題発覚した場合)

Phase 1 はインフラ整備のみで本番ユーザーへの影響はゼロ。問題発覚時は以下を逆順に実行:

1. `gh secret delete PROD_VITE_FIREBASE_*` 6 件
2. `firebase apps:delete WEB <appId> --project novel-writer-prod`
3. `gcloud billing budgets delete 1f17fe3e-13d2-46f3-b906-2942a984ec6d --billing-account=01EAA2-26BD24-E69348`
4. `gcloud iam workload-identity-pools providers delete github-provider --location=global --workload-identity-pool=github-pool --project=novel-writer-prod`
5. `gcloud iam workload-identity-pools delete github-pool --location=global --project=novel-writer-prod`
6. `gcloud iam service-accounts delete <SA email> --project=novel-writer-prod` × 2
7. `gcloud artifacts repositories delete novel-writer --location=asia-northeast1 --project=novel-writer-prod`
8. `gcloud firestore databases delete '(default)' --project=novel-writer-prod` (削除可能だが慎重に)
9. `gcloud billing projects unlink novel-writer-prod`

Firestore は once-only 設定が多いため、再構築時は新規 project 作成も検討。

## Phase 2 への引き継ぎ事項

- すべての値・SA email・WIF provider ID は `docs/spec/prod-migration/phase1-tasks.md` 「Phase 2 への引き継ぎ事項」セクション参照
- Phase 2 では `.github/workflows/deploy-prod.yml` を新規作成 (workflow_dispatch trigger)
- 初回デプロイ後に AC-13 (未認証 401) / AC-14 (静的 UI 到達) を Playwright MCP で実機検証
- Vertex AI 実呼び出し smoke test で actual quota 確認

## Phase 2 runbook へ

Phase 2 (初回デプロイ + AC-13/14 + Vertex AI smoke test) の手順 / 証跡 / rollback 手順は別 runbook に分離:

- [docs/runbook/prod-phase2-deploy.md](./prod-phase2-deploy.md)
