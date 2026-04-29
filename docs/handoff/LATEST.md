# Handoff: 本番運用修正セッション (Firebase env / gh auth hook / Tailwind PostCSS / UI overlap)

- Session Date: 2026-04-29（夜セッション、M6 完走後の本番運用修正 4 件）
- Owner: yasushi-honda
- Status: ✅ 再開可能（無料範囲のアプリ機能完成 + 公開可能 + UI レイアウト健全）
- Previous handoff: [2026-04-29-m6-completion.md](./2026-04-29-m6-completion.md)

## 今セッションのトリガー

M6 完走後、ユーザーが「公開リンクで動作確認したい」と要望。Cloud Run dev URL `https://novel-writer-446321146441.asia-northeast1.run.app` を提示したところ、起動時に Firebase 初期化エラーで画面真っ暗。芋づる式で本番運用に必要な修正 4 件を順次対応。

## 今セッションの完了内容

| PR | 内容 | 状態 | 規模 |
|---|---|---|---|
| #79 | fix(deploy): Vite build-time の `VITE_FIREBASE_*` 注入 (Dockerfile ARG/ENV + GitHub Actions Secrets 経由 `--build-arg`) | ✅ merged (`b21f4cc`) | 2 ファイル +28/-1 |
| #80 | feat(claude): プロジェクトローカル PreToolUse Bash hook で `gh auth` の active account を自動切替 (silent failure 解消版、廃止条件記載済) | ✅ merged (`b8b19f5`) | 4 ファイル +149/-2 |
| #81 | feat(build): Tailwind v3 を CDN 配信から PostCSS plugin 統合へ移行 (`cdn.tailwindcss.com should not be used in production` warning 解消) | ✅ merged (`0bc6c6b`) | 7 ファイル +676/-41 |
| #82 | fix(ui): `ProjectSelectionScreen` の AuthButton 絶対配置を normal flow に変更し `BackupWarningBanner` との重なりを解消 | ✅ merged (`1ad3c28`) | 1 ファイル +4/-4 |

各 PR の Quality Gate 実施実績:

- **#79 (small tier)**: 軽量レビュー (5 観点手動チェック) のみ。インフラ単純修正で issue なし
- **#80 (medium tier)**: 4 並列レビュー (code-reviewer / silent-failure-hunter / comment-analyzer / pr-test-analyzer) → Important 7 件指摘を全反映 (silent failure stderr 復活 / 廃止条件記載 / direnv 仕様の正しい帰属 / git push 説明明確化 / CLAUDE.md 配置位置移動 / vitest static resilience test 追加 / regex 末尾 `\)` 追加)
- **#81 (large tier)**: code-reviewer + evaluator 2 並列 (5+ ファイル発動条件) → MED-1 (`./firebase/**` glob 削除) + S-3 (CSP コメント明確化) を反映。evaluator HIGH-2/3 (typography plugin 由来の prose 系) は CDN 版にも plugin 含まれない事実から誤判定と判定、対応不要
- **#82 (small tier)**: 軽量レビュー、CSS class 変更のみで issue なし

## 主要設計判断 (本セッションで確定)

| 判断 | 採用 | 理由 |
|---|---|---|
| Firebase Web SDK config の Secrets 化 | GitHub Secrets → workflow `env:` → shell 変数 → `--build-arg` の 4 段階受け渡し | command injection 経路を排除 (`${{ secrets.* }}` を `run:` に直接展開しない) |
| Firebase config の機密性扱い | PUBLIC 値 (ADR-0001 §M1)、Secrets 化は git 隔離目的のみ | 取得は `firebase apps:sdkconfig WEB <appId> --json` で AI 側自動化可 |
| gh auth 自動切替の実装層 | プロジェクトローカル PreToolUse Bash hook (`.claude/hooks/ensure-gh-account.sh`) | グローバル `~/.claude/` 改修 (CLAUDE.md §1 スコープ違反) を回避、direnv 不発火問題を吸収 |
| hook の失敗時挙動 | stderr に `[ensure-gh-account] WARN:` 出力 + exit 0 維持 | PreToolUse hook contract: exit 2 のみ block、それ以外許可。診断情報を残しつつ Bash tool を block しない |
| hook の廃止条件 (sunset) 明記 | header + CLAUDE.md §5 に 3 条件記載 | 上流規律強化で寿命を迎える defensive code を後続が「恒久仕組み」と誤解しないため |
| Tailwind バージョン | v3 (`^3.4.19`) + PostCSS plugin | v3 は実績ある統合パターン、`theme.extend.colors` を素直に移植可能。v4 は CSS-first config (`@theme` directive) で API 大幅変更、互換性検証は別 PR |
| Tailwind typography plugin | 導入しない | CDN 版にも含まれず `.prose` 系は `index.css` 内で完全手書きされていた (リグレッションでない) |
| AuthButton の配置方針 | `absolute` から normal flow へ | `BackupWarningBanner` との衝突を最小変更で解消 |

## 次セッション開始時の状態

- ブランチ: 本 handoff PR merge 後は `main` clean
- Open Issue: 1 件 (#49 M4/M7 follow-up umbrella、rating ≥ 7 全消化済の monitor 対象、本セッションで状況変化なし)
- 自動テスト: vitest **435/435 PASS** (前セッション 428 → 本セッション +7、PR #80 で `tests/static/ensure-gh-account-hook-resilience.test.ts` 追加)
- 型チェック: `tsc --noEmit` 0 errors / build OK / Cloud Run deploy CI は PR #82 merge で **success (3m23s)**
- Cloud Run revision: `novel-writer-00067-qfb` 以降 (PR #82 反映後の新 revision)
- 公開 URL 動作確認: ✅ Firebase エラー / Tailwind warning / UI 重なり 全解消

## 公開可能性の到達

| 項目 | 状態 |
|---|---|
| 無料範囲のアプリ機能 (M0〜M4 / M6 / M7-α) | ✅ 完成 |
| Firebase Web SDK 初期化 | ✅ 動作確認済 |
| Tailwind バンドル | ✅ self-host (`dist/assets/index-*.css` 58.97KB) |
| UI レイアウト | ✅ `BackupWarningBanner` と `AuthButton` 衝突解消 |
| 有料機能 (M5 Stripe Tier 2) | 🚧 当面実装しない方針、UI 露出ゼロ |
| M7-β 公開最終チェック | ⏸ 法務本文確定待ち (外部依存) |

無料範囲のみで「機能完成 + 公開可能 + 動作確認済」状態に到達。残るのは法務同期作業のみ。

## 次のアクション（推奨順）

### 1. 法務確認 (AI セッション外、MUST、引き続き保留)

M7-α 本番公開前法務確認は M6 完了セッションから継続して保留中。M5 / M7-β / 本番公開判断はすべて本確認の完了が前提。

### 2. M5 着手判断 (法務確認状況に依存、ユーザー判断)

選択肢:
- **M5 着手**: Stripe Subscription + Webhook + Tier 2 法務節 (M7-β 法務本文確定が前提)
- **M7-β 着手**: 公開最終チェック (Tier 2 規約節 + 特商法本文確定)
- **小規模技術改善**: Issue #49 monitor 対象の rating 5-6 follow-up を本番障害として再現したものから着手

### 3. 既知の既存問題 (PR #81 evaluator が指摘、本セッションスコープ外)

別 Issue 化候補:
- `index.html` の `<link rel="stylesheet">` / `<script type="module">` 二重記述 (PR 編集前から存在、React 二重マウントの可能性)
- `<body class="bg-gray-900">` と `--color-bg-app` の背景色二重指定 (PostCSS 移行後の視覚差異要実機確認、現状画面では問題なし)
- `.sr-only` の二重定義 (Tailwind utility と index.css の手書き)
- `@layer` directive 不在による特異性問題

triage 基準: いずれも実害再現未確認のため、本番障害として再現した時点で起票。

### 4. AC-11 後半「mobile Safari background throttle 後の再試行」を実機確認 (ユーザー判断)

iOS Safari 実機 (iOS ネイティブアプリ開発ではなく Web アプリの mobile Safari) での UX 確認。本セッションで「iOS Safari サポートは best-effort」方針確定。動作確認は受動的サポート扱い。

### 5. Issue #49 の monitor 継続

rating ≥ 7 全消化済の状態維持。再開条件は前 handoff と同じ。

## 主要参照

- 関連 PR: #79 (Firebase env) / #80 (gh auth hook) / #81 (Tailwind PostCSS) / #82 (AuthButton overlap)
- 主要新規ファイル:
  - `.claude/hooks/ensure-gh-account.sh` (PR #80)
  - `.claude/settings.json` (PR #80)
  - `tests/static/ensure-gh-account-hook-resilience.test.ts` (PR #80)
  - `tailwind.config.js` (PR #81)
  - `postcss.config.js` (PR #81)
- 主要編集ファイル:
  - `Dockerfile` (PR #79: ARG/ENV)
  - `.github/workflows/deploy.yml` (PR #79: --build-arg)
  - `index.html` (PR #81: CDN script 削除)
  - `index.css` (PR #81: `@tailwind` directive)
  - `server/index.ts` (PR #81: CSP scriptSrc 修正)
  - `components/ProjectSelectionScreen.tsx` (PR #82: AuthButton 配置変更)
  - `CLAUDE.md` (PR #79/#80/#81 で運用ルール追記)

## 振り返り

### Quality Gate の有効性

- **PR #80 (medium tier 4 並列レビュー)**: silent-failure-hunter が「`gh auth switch` 失敗時の stderr 完全抑制で診断不能」を Important として検出。元の実装は「fallback したことすら気づけない」silent failure であり、PR description の「false negative があれば手動 switch にフォールバック」方針と矛盾していた。並列レビューでこの設計欠陥を merge 前に検出できた価値は大きい。
- **PR #81 (large tier 2 並列レビュー)**: evaluator が「`prose` クラスが typography plugin なしで動作不能」と HIGH 指摘したが、code-reviewer は同 PR を Approve。事実検証で「CDN 版 Tailwind にも typography plugin は元々含まれず、`.prose` 系は `index.css` 内手書き」と判明、evaluator HIGH-2/3 は誤判定と判定。Generator-Evaluator 分離の「誤検知も発生する」事例として、AI に対しても**事実検証を経てから採用判断する**規律の重要性を再確認。

### CLAUDE.md 4 原則遵守

1. **AI executor として decision-maker 越権なし**: 各 PR の修正範囲は impl-plan で明示承認後に着手、evaluator 誤判定時もユーザーに事実提示して判断を仰いだ
2. **hook ブロックは「立ち止まれ」として尊重**: PR #80 で security_reminder_hook 発火時に secrets を `run:` に直接展開する実装を env: 経由に変更
3. **PR マージは番号単位の明示認可**: 4 件すべて `#N をマージしてよい` 単位で実施
4. **main 直 push 一切なし**: 全 PR を feature ブランチ + PR 経由

### gh auth multi-account 運用の発見

`gh auth switch` がマシン全体で `~/.config/gh/hosts.yml` を共有することを今セッションで実体験。複数アカウント運用 (catchup memory `project_multi_device.md` 参照) で本プロジェクトの GitHub identity (`yasushi-honda`) が他セッション操作で他ユーザーに切り替わるケースを実際に踏み、PR #80 で hook 化。本来は global `~/.claude/` 側で「session 終了時に元アカウント復帰」規律を入れるのが本筋だが、それまでの defensive code として project ローカル hook を採用。

## Issue Net 変化（本セッション全体）

GitHub Issue 数の変化:

- Close 数（Issue）: 0 件
- 起票数（Issue）: 0 件
- **Net（Issue）: 0 件**

理由: 本セッションの 4 PR はすべてユーザー実機確認発の本番運用修正であり、すべて当該 PR 内で解消した。triage 基準 (実害 / 再現バグ / CI 破壊 / rating ≥ 7 / ユーザー明示指示) は満たすが、Issue 化せず PR 直行で完結 (実害が PR 着手 → 修正 → merge → 動作確認の流れで解消するため、Issue ライフサイクルを通す価値が薄い)。Issue #49 は前セッションから状況変化なし、open 維持の monitor 対象。

PR の動き:

- マージ数: 4 件 (#79, #80, #81, #82)
- 着手中（PR）: 1 件（本 handoff PR）

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` | ✅ 変更不要 | 本セッションは ADR 範囲の設計判断なし (本番運用修正のみ) |
| `CLAUDE.md` | ✅ PR #79/#80/#81 で随時追記済 | GCP / デプロイ節に Vite build-time 注入経路、Claude Code 運用ルール §5 に gh auth hook 廃止条件 |
| `docs/handoff/LATEST.md` | ✅ 本 PR で更新 | 前 LATEST は `docs/handoff/2026-04-29-m6-completion.md` として保存 |
| `docs/spec/m6/*` | ✅ 変更不要 | M6 完走済、本セッションは M6 範囲外 |

## 残留プロセス

✅ 残留 Node プロセスなし
