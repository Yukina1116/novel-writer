# 小説らいたー ver16

AI駆動の小説執筆支援アプリケーション。

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite
- **バックエンド**: Express（Cloud Run, asia-northeast1）
- **AI**: Vertex AI（Gemini 2.5 Flash / Imagen 4.0）
- **データ**: Firestore（Native mode）
- **CI/CD**: GitHub Actions → Workload Identity Federation → Cloud Run

## ローカル開発

```bash
npm install
npm run dev    # http://localhost:3000
```

ローカルではAPIキーモードで動作します。`.env` に `GEMINI_API_KEY` を設定してください。

`npm run dev`（Express+Vite）は起動時に `GCLOUD_PROJECT` または `FIREBASE_PROJECT_ID` 環境変数（もしくは `FIREBASE_AUTH_EMULATOR_HOST`/`FIRESTORE_EMULATOR_HOST` によるemulatorモード判定）が無いと fail-fast で起動を停止する意図的な設計（`server/startupProbe.ts`）。これらの環境変数なしにfavicon等 `public/` 配下の静的ファイルだけ手早く確認したい場合は、フルサーバーを起動せず `python3 -m http.server` 等で `public/` を直接配信すれば十分（Vite開発サーバーの `publicDir` 挙動と同じ配信パスになる）。

## デプロイ

`main` ブランチへのマージで Cloud Run に自動デプロイされます。

**本番URL**: https://novel-writer-ramnh3ulya-an.a.run.app

## コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | フロントエンドビルド |
| `npm run start` | 本番サーバー起動 |
| `npm run lint` | 型チェック（tsc --noEmit） |
