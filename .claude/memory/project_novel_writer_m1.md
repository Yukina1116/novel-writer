---
name: novel-writer M1 進捗（Local-first + 認証 + 課金移行）
description: 小説らいたー ver16 の M1 マイルストーン進捗。PR-A/B 完了、次回 PR-C で M1 完了予定
type: project
originSessionId: 85b19f10-24fe-42fb-9c03-89dd02b443b6
---
## プロジェクト概要

`~/Projects/学校/yamashita/novel-writer` (Yukina1116/novel-writer)。AI 駆動の小説執筆 Web アプリ。React + TypeScript + Vite (FE) / Express on Cloud Run (BE) / Vertex AI gemini-2.5-flash + Imagen / Firestore。

**Why:** 開発段階（ユーザーゼロ）。Codex の plan + security レビューを経て、Local-first（コンテンツは IndexedDB、メタのみ Firestore）+ Firebase Auth Google ログイン + Stripe 課金 + opt-in E2EE バックアップへ全面再構築。

**How to apply:** 着手は ADR-0001（`docs/adr/0001-local-first-architecture.md`）と tasks.md（`docs/spec/m1/tasks.md`）を最初に読む。意思決定根拠と PR-A/B/C の AC が記録されている。

## M0 で完了済みの環境ガード（手動 gcloud 操作）

- Cloud Run service `novel-writer` (asia-northeast1, project `novel-writer-dev`) を非公開化（`allUsers` の `roles/run.invoker` 削除）
- `--max-instances=2` 制限
- 月 1,000 円の billing budget 設定（Firebase 請求アカウント `01817F-AFD15C-E57676`、project number `446321146441`）
- `novel-writer-dev` は GCP プロジェクト、ローカル gcloud config で account=`hy.unimail.11@gmail.com` (roles/owner) が必要。yasushi.honda@aozora-cg.com には権限なし

## 完了 PR

| PR | 内容 | コミット |
|---|---|---|
| **#17** PR-A | Cloud Run IaC 化（`--allow-unauthenticated` 削除、`--max-instances=2` 追加）+ ADR-0001 + tasks.md | `81a5d62` |
| **#18** PR-B | helmet/CORS/rate-limit 導入、DOMPurify ベースの `renderMarkdown` 7 箇所統一、parseMarkdown URL allowlist、errorHandler の prod 機微情報マスキング、`.dockerignore` 強化 | `8166cd7` |

両 PR とも production deploy 確認済み、AC 全 PASS。

## 残作業（次セッション着手）

### PR-C: Firebase 初期化準備（M1 完了の最終 PR）

ブランチ: `feature/m1-firebase-init`

**最初のコミット**で次の修正も含める（tasks.md 更新漏れ）:

- `docs/spec/m1/tasks.md` 168 行目あたり「`M1 完了の定義`」の `[ ] PR-B merged & local検証完了 & AC B1〜B7 全 PASS` を `[x]` に（PR #18 で完了済みだが更新漏れ）

PR-C 本体の作業:

1. **Firebase Console** で `novel-writer-dev` プロジェクトの Authentication 有効化、Sign-in method の Google プロバイダ ON（**ユーザー手動操作必須**）
2. `package.json` に `firebase`（FE）、`firebase-admin`（BE）、`firebase-tools`（devDep）追加
3. `firebase.json` 新規（emulators: auth のみ、port 9099）
4. `.firebaserc` 新規（projectId: novel-writer-dev）
5. `.gitignore` に `firebase-debug.log`, `firestore-debug.log`, `ui-debug.log` 追加
6. `server/firebaseAdmin.ts` 新規（admin SDK 初期化スタブ、ルートではまだ使わない）
7. `package.json` scripts に `dev:emu`（concurrently で auth emulator + Vite 並列起動）と `test:firebase-admin` 追加
8. `scripts/test-firebase-admin.ts` 新規（emulator 経由で取得した idToken を `verifyIdToken` で検証）

AC（PR description に Test plan として転記）:

- C1: Firebase Console で Google プロバイダ「有効」（スクショ添付）
- C2: `npm run dev:emu` で `localhost:9099` が 200
- C3: `npm run test:firebase-admin` で uid 取得成功

**本物の認証ゲート実装は M3**。PR-C は「準備のみ」、ルートでは admin SDK を使わない。

## 復帰手順（次セッション）

```bash
cd ~/Projects/学校/yamashita/novel-writer && claude
# /catchup で本メモリが自動表示される
```

復帰時に確認すべき項目:

1. `git log --oneline -3` で `8166cd7` (PR #18) が main にあることを確認
2. `gcloud config configurations describe novel-writer-dev` で account=`hy.unimail.11@gmail.com`, project=`novel-writer-dev` を確認（`yasushi.honda@aozora-cg.com` に戻っていたら catchup の `/project-setup` 経路で再設定）
3. `gh auth status` で active=`yasushi-honda`（push 権限あり）を確認、違えば `gh auth switch -u yasushi-honda`

## ~/.claude/hooks/pre-push-quality-check.sh のバグ（次セッション要対応）

2026-04-25 セッション終了時に発覚。`cd ~/.claude && git push -u origin feature/...` のような複合コマンドを実行すると、hook が **発火時点の cwd（Claude セッション開始ディレクトリ = novel-writer）** で `git branch --show-current` を評価し、novel-writer の main を見て「main 直 push 禁止」と誤検知してブロックする。結果、~/.claude/memory への push が他プロジェクトのセッションから不可能。

修正方針:
1. hook に `command` 文字列を解析させ、`cd <path>` または `git -C <path>` を検出して push 対象リポジトリで `git branch --show-current` を実行
2. または `git push` の現在ブランチ判定を、push される refspec から取得（`git push -u origin feature/x` なら `feature/x` を取り出す）

回避策: 別ターミナルから `cd ~/.claude && git checkout -b feature/... && git commit && git push` を手動実行。

## M1 後フォローアップ（M1 完了後に Issue 化せず対応）

GitHub Actions のアクション群が Node.js 20 ベース。日付（2026-06-02 から強制 Node 24、2026-09-16 廃止）は暫定値、出典 https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/。`actions/checkout@v4`、`google-github-actions/auth@v2`、`setup-gcloud@v2`、`deploy-cloudrun@v2` の major 更新を待って一括追従。

## Issue Net 変化（M1 PR-A + PR-B 期間）

- Close: 0 件（M1 全体は Issue ベースでなく ADR-0001 + tasks.md で管理しているため、各 PR の `Closes #` は使っていない）
- 起票: 0 件
- Net: **0**

triage 基準（実害/再現バグ/CI破壊/rating ≥ 7/明示指示）に該当する事象なし。`/review-pr` で出た rating 5-6 提案はすべて PR コメント or 同 PR 内修正 or M1 後フォローアップ枠で処理済み。
