# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 開発サーバー起動（Express + Vite HMR, port 3000）
npm run build    # FEビルド（dist/）+ サーバーコンパイル（dist-server/）
npm run start    # 本番サーバー起動（dist-server/server/index.js）
npm run lint     # 型チェック（tsc --noEmit）
npm run preview  # Viteビルド後プレビュー
```

自動テストは未導入。`tests/` は手動テスト仕様書のみ。

## Architecture

AI駆動の小説執筆支援アプリ（小説らいたーver16）。React + TypeScript + Vite。

### エントリポイント

- **フロントエンド**: `index.html` → `index.tsx` → `App.tsx`（デスクトップ3パネル）/ `App.mobile.tsx`（モバイル）
- **サーバー**: `server/index.ts` — Express。AI APIプロキシ + Viteミドルウェア（dev）/ 静的配信（prod）

### レイアウト

```
[ActivityBar] | [LeftPanel] | [NovelEditor] | [RightPanel]
```

### API層（サーバーサイド）

```
Browser → fetch(/api/*) → server/routes/ → server/services/ → Vertex AI (gemini-2.5-flash) / Firestore
```

| ルート | サービス / 認証 | 用途 |
|-------|---------|------|
| `/api/ai/novel/generate` | novelService | 小説続き生成 |
| `/api/ai/character/{update,reply,image-prompt}` | characterService | キャラクター作成・更新 |
| `/api/ai/world/{update,reply}` | worldService | 世界観設定 |
| `/api/ai/image/generate` | imageService | Imagen画像生成 |
| `/api/ai/utility/{names,knowledge-name,extract-character}` | utilityService | 名前生成、キャラ抽出等 |
| `/api/ai/analysis/import` | analysisService | テキストインポート分析 |
| `/api/users/init` | verifyIdToken middleware → Firestore `users/{uid}` を transaction で冪等初期化（M2 PR-C） | ログイン直後のユーザーメタ初期化 |

- **AIクライアント**: `server/aiClient.ts` — `USE_VERTEX_AI=true`でVertex AI、それ以外はAPIキーモード
- **プロンプト構築**: `server/services/promptBuilder.ts` — format系ユーティリティ
- **Firebase Admin**: `server/firebaseAdmin.ts` — `getFirebaseAdminApp()` / `getFirebaseAuth()` / `getFirebaseFirestore()`（M2 PR-C で `firestoreClient.ts` から統合）
- **認証ミドルウェア**: `server/middleware/verifyIdToken.ts` — `Authorization: Bearer <ID Token>` 検証、transient（503）/permanent（401）分類（M2 PR-C 導入、M3 で `/api/ai/*` にも適用予定）
- **フロントエンドAPI**: ルート直下の `*Api.ts` はfetchラッパー（`apiClient.ts`経由）。Project の永続化 API（旧 `projectApi.ts`）は M2 PR-A で削除済み

### 状態管理（Zustand slices pattern）

`store/index.ts` で 10 スライス（M2 PR-B で `authSlice` 追加）を結合（`persist` ミドルウェアは未使用、メモリのみ）。永続化は `syncSlice` 経由で IndexedDB（Dexie.js）へ書き込み（2 秒 debounce + `beforeunload`/`visibilitychange` で flush、`hooks/useLocalSync.ts`）。

| スライス | 責務 |
|---------|------|
| projectSlice | プロジェクトCRUD、インポート/エクスポート |
| uiSlice | モーダル、サイドバー、タブ、トースト等のUI状態 |
| dataSlice | 小説本文、設定、ナレッジ、プロット、タイムラインの変更 |
| aiSlice | AI呼び出し、生成モード、複数候補管理 |
| historySlice | ツリー構造の undo/redo（最大10ノード、メモリのみ・IndexedDB にも書かない） |
| syncSlice | IndexedDB 同期（2 秒 debounce → `flushSave` → `putProject` via `db/projectRepository.ts`、M2 PR-A で Firestore から移行） |
| tutorialSlice | 5種チュートリアルの進捗（IndexedDB の `tutorialState` ストア） |
| analysisHistorySlice | テキストインポート分析の履歴（IndexedDB の `analysisHistory` ストア） |
| formSlice | フォーム状態 |
| authSlice | Firebase Auth 状態（`currentUser` / `authStatus: 'initializing' \| 'unauthenticated' \| 'authenticated'` / `authError`、IndexedDB は uid に紐付けない設計、M2 PR-B で導入） |

### 型定義

`types.ts` に全型を集約。主要型: `Project`, `NovelChunk`, `SettingItem`, `KnowledgeItem`, `PlotItem`, `TimelineEvent`, `AiSettings`, `ChatMessage`

### パスエイリアス

`@/` → プロジェクトルート（tsconfig + vite.config.ts）

## GCP / デプロイ

- **開発**: `novel-writer-dev`（課金有効、asia-northeast1）
- **本番**: `novel-writer-prod`（課金クォータ引き上げ待ち）
- **ランタイム**: Cloud Run + Vertex AI（Workload Identity認証）
- **CI/CD**: GitHub Actions → WIF → Cloud Run自動デプロイ（mainブランチ）
- **Docker**: マルチステージビルド（`Dockerfile`）
- **direnv**: `.envrc` で `CLOUDSDK_ACTIVE_CONFIG_NAME=novel-writer-dev` 自動設定

## Claude Code 運用ルール（本プロジェクト固有の規律）

2026-04-26 セッションで規範違反 + 言い訳的対応が発生したため、再発防止として明文化する。グローバル `~/.claude/CLAUDE.md` の規範を本プロジェクトでも厳守すること。

### 1. スコープ厳守（MUST）

- **本プロジェクトの作業中に `~/.claude/`（グローバル設定）を触らない。** 例外なし。
- グローバル memory（`~/.claude/memory/`）・hook・rules への変更が必要と判断した場合は、**まず本プロジェクトの現タスクを区切る（コミット可能な状態にする）→ ユーザーに変更内容と理由を提示して承認を得る → 別 claude セッション（cwd=`~/.claude`）から feature ブランチ + PR で対応**。本プロジェクトのセッションのまま並行作業を始めない。
- 本プロジェクトの memory として残したい知見は `docs/` 配下または本ファイルに記録する（プロジェクトスコープに閉じる）。
- **SHOULD**: グローバル `~/.claude/CLAUDE.md` 改定時は本セクションとの整合性を `/catchup` 時に確認し、ズレていたら別 claude セッションでグローバル側 or 本ファイルの追従 PR を出す。

### 2. main 直 push 禁止（MUST、規範違反を技術問題にすり替えない）

- ドキュメントのみの変更でも feature ブランチ + PR。
- `git push` のみのコマンド（push 先未指定）= main 直 push の経路になりうる。**コマンドを書いた時点で「これは main を更新するか？」を自問する**。
- pre-push hook がブロックしてきた場合、それは「hook のバグ」ではなく「自分が main 上で push しようとしている」サインの可能性が高い。**「hook 回避策」と言い換える前に自分の運用を疑う**。
- 別リポジトリ（`~/.claude` 等）の push が hook で誤検知される場合は、cwd を合わせた別 claude セッションから操作する（本プロジェクトの責務外）。

### 3. 指摘を受けたときの対応（MUST）

- ユーザーから規範違反を指摘されたら、**初回指摘で認める。反論・選択肢提示・条件付き同意は禁止**。「一部その通りだが…」「ただし技術的には…」のような留保も含めない。
- 「ツール改修」「hook 改修」を選択肢として出す前に、**自分の運用ルール側で解決できないかを先に検討**する。技術問題への分岐は、運用側の解決可能性をすべて排除した後にのみ提示する。
- 卑怯な言い回し（「バグ回避」「設計上の限界」「設計上のトレードオフ」など、自分のサボりを技術問題に転嫁する語彙）を避ける。
- ユーザーに **2 度同じ指摘を言わせた時点で運用に組み込まれた問題と扱い、§4 に従って永続化対象**にする。

### 4. 永続化（MUST）

- 同種の規範違反・運用ミスが再発したら、**口頭の謝罪で終わらせず、本セクションへの事例と対策の追記を完了してからセッションを閉じる**。
- 軽微な事例は `docs/adr/` または個別 ADR に追記、重大な再発防止は本ファイルで常時参照可能にする。
- 過去事例は時系列の根拠（特定セッション日付）を残す。理由: 規律の正当性が「過去の具体的失敗」に紐付いていると次セッションの Claude がルールを軽視しにくい。詳細セッション要約は `docs/adr/` に分離し、本ファイルからは相対リンクで辿れる構造を保つ。
