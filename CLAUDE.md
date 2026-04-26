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

### AI API層（サーバーサイド）

```
Browser → fetch(/api/ai/*) → server/routes/ → server/services/ → Vertex AI (gemini-2.5-flash)
```

| ルート | サービス | 用途 |
|-------|---------|------|
| `/api/ai/novel/generate` | novelService | 小説続き生成 |
| `/api/ai/character/{update,reply,image-prompt}` | characterService | キャラクター作成・更新 |
| `/api/ai/world/{update,reply}` | worldService | 世界観設定 |
| `/api/ai/image/generate` | imageService | Imagen画像生成 |
| `/api/ai/utility/{names,knowledge-name,extract-character}` | utilityService | 名前生成、キャラ抽出等 |
| `/api/ai/analysis/import` | analysisService | テキストインポート分析 |

- **AIクライアント**: `server/aiClient.ts` — `USE_VERTEX_AI=true`でVertex AI、それ以外はAPIキーモード
- **プロンプト構築**: `server/services/promptBuilder.ts` — format系ユーティリティ
- **フロントエンドAPI**: ルート直下の `*Api.ts` はfetchラッパー（`apiClient.ts`経由）

### 状態管理（Zustand slices pattern）

`store/index.ts` で9スライスを結合（`persist` ミドルウェアは未使用、メモリのみ）。永続化は `syncSlice` 経由で Firestore へ書き込み（2秒 debounce + `beforeunload`/`visibilitychange` で flush、`hooks/useFirestoreSync.ts`）。

| スライス | 責務 |
|---------|------|
| projectSlice | プロジェクトCRUD、インポート/エクスポート |
| uiSlice | モーダル、サイドバー、タブ、トースト等のUI状態 |
| dataSlice | 小説本文、設定、ナレッジ、プロット、タイムラインの変更 |
| aiSlice | AI呼び出し、生成モード、複数候補管理 |
| historySlice | ツリー構造の undo/redo（最大10ノード、メモリのみ・Firestore に書かない） |
| syncSlice | Firestore 同期（2秒 debounce → `flushSave` → `PUT /api/projects/:id`） |
| tutorialSlice | 5種チュートリアルの進捗 |
| analysisHistorySlice | テキストインポート分析の履歴 |
| formSlice | フォーム状態 |

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
- グローバル memory（`~/.claude/memory/`）・hook・rules への変更が必要と判断した場合は、ユーザーに確認 → **別 claude セッション（cwd=`~/.claude`）から feature ブランチ + PR で対応**。
- 本プロジェクトの memory として残したい知見は `docs/` 配下または本ファイルに記録する（プロジェクトスコープに閉じる）。

### 2. main 直 push 禁止（MUST、規範違反を技術問題にすり替えない）

- ドキュメントのみの変更でも feature ブランチ + PR。
- `git push` のみのコマンド（push 先未指定）= main 直 push の経路になりうる。**コマンドを書いた時点で「これは main を更新するか？」を自問する**。
- pre-push hook がブロックしてきた場合、それは「hook のバグ」ではなく「自分が main 上で push しようとしている」サインの可能性が高い。**「hook 回避策」と言い換える前に自分の運用を疑う**。
- 別リポジトリ（`~/.claude` 等）の push が hook で誤検知される場合は、cwd を合わせた別 claude セッションから操作する（本プロジェクトの責務外）。

### 3. 指摘を受けたときの対応（MUST）

- ユーザーから規範違反を指摘されたら、**選択肢を提示して責任を分散させない**。一度で認める。
- 「ツール改修」「hook 改修」を選択肢として出す前に、**自分の運用ルール側で解決できないかを先に検討**する。
- 卑怯な言い回し（「バグ回避」「設計上の限界」など、自分のサボりを技術問題に転嫁する語彙）を避ける。

### 4. 永続化（SHOULD）

- 同種の規範違反・運用ミスが起きたら、口頭の謝罪で終わらせず、本セクションに事例と対策を追記する。
- 軽微な事例は `docs/adr/` または個別 ADR に追記、重大な再発防止は本ファイルで常時参照可能にする。
