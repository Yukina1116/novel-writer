# Handoff: /dev/ 開発者ポータル Mermaid 描画タイミング修正セッション

- Session Date: 2026-05-01
- Owner: yasushi-honda
- Status: ✅ 再開可能（dev-portal 全 9 Mermaid 図が正常描画）
- Previous handoff: [2026-04-30-dev-portal.md](./2026-04-30-dev-portal.md)

## 今セッションのトリガー

ユーザーから「マーメイド図のsyntax errorが各所にある。段階的にチェックしてそれぞれ直して」と指示。Fig. II-1 / II-3 / III-3 が「Syntax error in text」表示になっていた。

## 今セッションの完了内容

| PR | 内容 | 状態 | 規模 |
|---|---|---|---|
| #86 | fix(dev-portal): mermaid 図がタブ非表示時に「Syntax error」表示される問題を修正 | ✅ merged (`538b14c`) | 1 ファイル +35/-2 |

## 真因

**Mermaid 構文自体は 9 図すべて正しい**。原因は描画タイミング:

`section.panel { display: none }` の状態で `mermaid.run()` が走ると DOM 寸法測定が `NaN`/負値となり、mermaid 10.9.5 がフォールバック SVG（"Syntax error in text" を描画する）を出していた。`startOnLoad: true` により全 9 図が初期描画時にこのパスに乗っていた。

### 失敗していた 3 図
- **Fig. II-1**: flowchart 大型（System Map、subgraph 多段ネスト）
- **Fig. II-3**: classDiagram（Type Map）
- **Fig. III-3**: stateDiagram-v2（M6 State Machine）

これらは DOM 測定要件が厳しい diagram type のため失敗。他の 6 図（小型 flowchart / sequenceDiagram / gantt）は測定要件が緩く偶然成立していた。

## 修正

`public/dev/index.html` (+35 / -2):

- `mermaid.initialize({ startOnLoad: true })` → `false`
- `window.__renderMermaidIn(panel)` ヘルパー追加: `data-processed` を持たない `.mermaid` ノードを `mermaid.run({ nodes })` で順次描画
- 初期アクティブパネル → DOMContentLoaded で描画
- タブ切替（`activate` 関数内） → `requestAnimationFrame` で `display:block` 反映後に対象パネルを描画
- 印刷ボタン（`cl-print`）→ 全パネル描画完了を `Promise.all` で待ってから `window.print()`

## 検証

| 検証 | 結果 |
|---|---|
| 9 図の Mermaid 構文を mermaid@10 で `parse` / `render` 単体実行 | 全 PASS（構文に誤りなしの確証） |
| 実ページを Puppeteer で開く（修正前） | Fig. II-1 / II-3 / III-3 のみ `Syntax error in text` |
| 全 panel に `display: block !important` を注入して再現 | 全 9 図エラー消失（display:none が真因の確証） |
| 修正後の全タブ巡回 (Puppeteer) | 全 9 図 `aria-roledescription` 取得、`Syntax error in text` 不在 |
| `npm run lint` | PASS（0 errors） |
| `npm run test` | 435/435 PASS（前セッションと同数、HTML 修正で test 影響なし） |

## 残作業（マージ後の目視確認）

PR #86 Test plan 未チェック項目（CLAUDE.md「Definition of Done」より、deploy 完了後にユーザー判断で実施）:

- [ ] Cloud Run デプロイ完了後、本番 `/dev/` で 4 タブ（アーキテクチャ / フロー図 / マイルストーン / 開発者情報）を巡回し 9 図がすべて正常描画されることを目視確認
- [ ] 印刷プレビュー（チェックリストの「印刷用に展開」ボタン）でも全図が描画されることを確認

## 次セッション開始時の状態

- ブランチ: `main` clean (`538b14c`)
- Open Issue: 1 件（#49 M4/M7 follow-up monitor、変化なし）
- 自動テスト: vitest **435 / 435 PASS**
- 型チェック: `tsc --noEmit` 0 errors
- CI/CD: PR #86 反映の Cloud Run デプロイ進行中（ハンドオフ時点 `in_progress`）

## 次のアクション（推奨順）

1. **法務確認（AI セッション外、MUST、保留継続）**: M7-α 本番公開前法務確認。M5 / M7-β / 本番公開判断はすべて本確認の完了が前提
2. **M5 着手判断（法務状況に依存、ユーザー判断）**: Stripe Subscription + Webhook + Tier 2 法務節
3. **M7-β 着手**: 公開最終チェック（Tier 2 規約節 + 特商法本文確定）
4. **小規模技術改善**: Issue #49 monitor 対象の rating 5-6 follow-up を本番障害として再現したものから着手
5. **本番 `/dev/` 目視確認**: 上記「残作業」セクション参照

## 知見メモ（Mermaid + 表示制御 UI）

- mermaid 10 系で `startOnLoad: true` + 隠蔽コンテナ（`display:none` のタブ/モーダル）の組み合わせは要注意。`mermaid.run({ nodes })` で可視化後に明示描画する設計が安全
- 失敗時は構文エラー風のフォールバック SVG が出るため「構文エラー」と誤診しやすい。Puppeteer で `parse` / `render` を分離検証すると真因が分かる
- 検証手順: ① mmdc で構文確認 → ② 実ページの textContent を抽出して mermaid@10 単独で render → ③ 全 panel `display:block` で再現 → ④ 修正後 Puppeteer 全タブ巡回

## 主要参照

- 関連 PR: **#86**（dev-portal mermaid render-timing fix）
- 関連前 PR: #84（dev-portal 追加）/ #85（前セッション handoff）
- 主要修正ファイル: `public/dev/index.html`（+35/-2）
- 既存設計参照: CLAUDE.md「開発者ポータル `/dev/` (PR #84)」セクション

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0 件
- 備考: 前セッション (#84) で追加したコードのリグレッション修正であり、新規 Issue 化は triage 基準に該当せず（PR 直接修正で完結）。Net 進捗ゼロだが、本セッション目的（ユーザー要求の Mermaid 図表示問題解消）は完了
