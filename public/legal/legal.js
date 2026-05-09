// 法務文書 self-host 配信ロジック (M7-α 後)。
// /legal/*.html から ESM module として読み込まれ、同一ディレクトリの md ファイルを
// fetch → marked で HTML 化 → DOMPurify で sanitize (DocumentFragment 化) →
// appendChild で描画する。innerHTML は経由しない (XSS 経路を物理的に排除)。
//
// CDN 依存:
// - marked: cdn.jsdelivr.net (CSP scriptSrc 既に許可済)
// - DOMPurify: cdn.jsdelivr.net (同上)
//
// 規律:
// - **trusted source**: md は本リポジトリ (docs/legal を public/legal にコピー) 由来。
//   それでも DOMPurify を経由させ、将来の編集事故 (script タグ混入等) を多層防御で塞ぐ。
// - **innerHTML 不使用**: DOMPurify の RETURN_DOM_FRAGMENT で DocumentFragment を取得し、
//   appendChild で描画する (security_reminder hook の趣旨に沿う)。
// - **fail-closed**: fetch / parse / sanitize いずれかが失敗したら "読み込みに失敗しました"
//   を表示し、生 markdown を素のまま見せない (LEGAL_REVIEW_REQUIRED コメント等が
//   壊れた状態で見えるのを防ぐ)。

import { marked } from 'https://cdn.jsdelivr.net/npm/marked@13.0.3/lib/marked.esm.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.es.mjs';

const main = document.getElementById('legal-content');

function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function renderError(node) {
    clearChildren(node);
    const errorEl = document.createElement('p');
    errorEl.className = 'legal-error';
    errorEl.textContent = '読み込みに失敗しました。時間をおいて再度お試しください。';
    node.appendChild(errorEl);
}

if (main) {
    const mdName = main.dataset.md;
    if (typeof mdName === 'string' && mdName.length > 0) {
        // 同一ディレクトリ相対 fetch。絶対パスでなく相対なので他 subpath で同居しても
        // 破綻しない (現状は /legal/ 直下のみ)。
        fetch(`./${mdName}`)
            .then((res) => {
                if (!res.ok) throw new Error(`fetch ${mdName} → HTTP ${res.status}`);
                return res.text();
            })
            .then((markdown) => {
                const rawHtml = marked.parse(markdown, { gfm: true });
                // RETURN_DOM_FRAGMENT で DocumentFragment を取得し appendChild する。
                // これにより innerHTML を経由せず XSS 経路を物理的に排除。
                // USE_PROFILES.html は marked 出力に必要な標準 HTML タグ群。
                // script/iframe/object 等は DOMPurify default で deny される。
                const cleanFragment = DOMPurify.sanitize(rawHtml, {
                    USE_PROFILES: { html: true },
                    RETURN_DOM_FRAGMENT: true,
                });
                clearChildren(main);
                main.appendChild(cleanFragment);
                const h1 = main.querySelector('h1');
                if (h1 && h1.textContent) {
                    document.title = `${h1.textContent} - 小説らいたー`;
                }
            })
            .catch((err) => {
                console.error('legal page render failed:', err);
                renderError(main);
            });
    }
}
