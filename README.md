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
