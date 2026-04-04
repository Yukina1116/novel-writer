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

`store/index.ts` で8スライスを結合。`persist` ミドルウェアでlocalStorage永続化。

| スライス | 責務 |
|---------|------|
| projectSlice | プロジェクトCRUD、インポート/エクスポート |
| uiSlice | モーダル、サイドバー、タブ、トースト等のUI状態 |
| dataSlice | 小説本文、設定、ナレッジ、プロット、タイムラインの変更 |
| aiSlice | AI呼び出し、生成モード、複数候補管理 |
| historySlice | ツリー構造の undo/redo（最大10ノード） |
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
