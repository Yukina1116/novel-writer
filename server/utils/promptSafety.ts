import { logger } from './logger';

/**
 * AI プロンプトに埋め込むユーザー入力データの token-bomb 対策ヘルパー。
 *
 * 背景: 2026-06-01 本番障害 (`character/update` が 917,455 tokens で 400 INVALID_ARGUMENT、
 * Gemini 2.5 Flash の入力上限 131,072 を超過)。原因は PR #125 の `<RUNTIME_CONTEXT>` 設計で
 * `currentCharacterData` 全体を JSON.stringify したことで、`appearance.imageUrl` に保存された
 * Imagen 生成画像 (`data:image/png;base64,...` 約 1MB) がプロンプトに丸ごと埋まったため。
 *
 * 同種パターンが world (`mapImageUrl` 経由) にも存在し、character/reply にも未対策の経路が
 * 残っていた (Codex セカンドオピニオン指摘)。本モジュールで一元化する。
 *
 * 防御戦略 (Issue #134 で content-based 検出に進化):
 *   1. 任意 path の **`data:image/` prefix 検出** (whitelist 不要、新フィールド自動カバー)
 *   2. 任意 leaf string の **size guard** (非画像 dataURI・将来の他種 token-bomb の backstop)
 *
 * 旧設計 (PR #132/#133) は `IMAGE_FIELD_PATHS` whitelist だったが、新フィールド追加時の
 * register-or-forget リスクが残った (Issue #134)。content-based に切替で構造的に解消。
 *
 * 引数は mutate しない (pure helpers)。
 */

/** AI プロンプトから除外された生成画像の代替マーカー。AI に「画像が存在する」事実だけ伝える。 */
export const IMAGE_OMITTED_MARKER = '[generated-image: omitted from prompt to fit token budget]';

/** size guard で truncate した文字列の代替マーカー。 */
export const OVERSIZED_STRING_MARKER = '[oversized-string: truncated to fit token budget]';

/**
 * 単一 leaf string の最大バイト数 (UTF-8)。これを超えると `OVERSIZED_STRING_MARKER` に置換。
 *
 * 100KB は通常の小説 1 章分 (約 30,000 漢字) に相当。AI コンテキストとして 1 フィールドが
 * これを超えるのは画像 dataURI 等の異常入力のみで、通常テキスト (longDescription / personality
 * 等) には十分余裕がある (false positive 実質ゼロ)。
 *
 * 計測は `Buffer.byteLength(s, 'utf8')` で UTF-8 実バイト数を見る。`String.length` だと
 * UTF-16 code unit ベースになり、日本語 (CJK BMP) は 3 倍緩く / 絵文字 (surrogate pair) は
 * 2 倍厳しく評価される (code-review #133 指摘)。本プロジェクトは日本語アプリのため、
 * 真の token-bomb 防御として UTF-8 byte で評価する必要がある。
 */
export const MAX_FIELD_BYTES = 100_000;

/**
 * 画像 dataURI と判定する prefix。`data:image/` は MIME type の image/* を全てカバー
 * (png, jpeg, webp, gif, svg+xml, avif, heic 等)。
 */
const IMAGE_DATA_URI_PREFIX = 'data:image/';

/**
 * false positive 防止: この byte 長未満の `data:image/` 始まり文字列は素通しする。
 * 理由: ナレッジや description に「`data:image/png` という形式の文字列」が短文として
 * 含まれる可能性があるため。実 dataURI は base64 payload で必ず数百〜数千 bytes 以上。
 */
const MIN_IMAGE_DATA_URI_BYTES = 100;

/**
 * 再帰の深さ上限。これを超えるネストは `OVERSIZED_STRING_MARKER` 相当に置換して終端する。
 *
 * 理由 (Issue #134 part 1 code-review CONFIRMED): Express body limit 10MB 内では理論上
 * 100 万段超のネスト JSON が乗りうるが、Node.js V8 default stack で素直な再帰は約 2-3k 段で
 * `RangeError: Maximum call stack size exceeded` になる。攻撃者が深いネスト payload を送ると
 * sanitize 完遂前に throw → 500 INTERNAL 量産の DoS 経路が出来てしまう。
 *
 * 1000 は通常の character / world / chunk データ (実用上 10 段以下) に十分余裕、かつ V8 stack
 * の約 1/3 で安全マージンを持つ値。閾値到達時は `[recursion-depth-exceeded]` marker に切替。
 */
const MAX_RECURSION_DEPTH = 1000;

/** 再帰深度超過時に leaf に置く marker。AI / observability に「ここから先は省略された」事実だけ伝える。 */
export const RECURSION_DEPTH_EXCEEDED_MARKER = '[recursion-depth-exceeded: nested data truncated to fit safety limit]';

/**
 * Object.prototype 汚染になりうる特殊 key (`__proto__` / `constructor` / `prototype`)。
 *
 * 理由 (Issue #134 part 1 code-review PLAUSIBLE): JSON.parse は `__proto__` を own enumerable
 * property として残すため、`Object.entries(obj)` で `['__proto__', value]` が返り、
 * 新規 object への `next['__proto__'] = value` 代入が setter を triggers し、返却 object の
 * `[[Prototype]]` が attacker-controlled subtree に置換される。現状 caller は `JSON.stringify` /
 * `Object.keys` 経由でしか sanitized 値を触らないため AI prompt 流入は無いが、将来 caller が
 * `safeXxx.someField` のような直接 property access に変わると inheritance 経由で attacker
 * payload を拾う latent sink。再帰トラバース時に key 自体をスキップして根治する。
 */
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 任意 leaf string が「画像 dataURI と判定すべきか」を返す。
 * - `data:image/` で始まる
 * - UTF-8 byte 長が `MIN_IMAGE_DATA_URI_BYTES` 以上 (false positive 防止)
 */
function isImageDataUri(value: string): boolean {
  return value.startsWith(IMAGE_DATA_URI_PREFIX) && Buffer.byteLength(value, 'utf8') >= MIN_IMAGE_DATA_URI_BYTES;
}

/**
 * 再帰スキャン中の現在 path を log 用に組み立てる。
 * object key は dot 区切り、array index は `[i]` で表現する (例: `appearance.gallery[0].url`)。
 */
function joinPath(parent: string, segment: string | number): string {
  if (typeof segment === 'number') return `${parent}[${segment}]`;
  if (parent === '') return segment;
  return `${parent}.${segment}`;
}

/**
 * 任意 path の `data:image/` 始まり文字列 (一定 byte 数以上) を omission marker に置換する
 * content-based scanner (Issue #134)。
 *
 * - whitelist 不要 → 新フィールド追加時の register-or-forget リスクを構造的に解消
 * - object / array を再帰、非画像 dataURI (application/pdf 等) と短文 `data:image/...`
 *   (例: ナレッジに記述された MIME 形式の説明文) は対象外
 * - 観測可能性: 発火ごとに `safetyEvent: 'image-omitted'` + path (dot-path + array index) を warn ログ
 * - 不変性: 入力を mutate せず、変更がなければ same reference を返す (perf hint)
 */
export function stripPromptHeavyFields(data: unknown): unknown {
  function recurse(value: unknown, path: string, depth: number): unknown {
    if (depth > MAX_RECURSION_DEPTH) {
      logger.warn({
        message: 'promptSafety: recursion depth exceeded',
        safetyEvent: 'recursion-depth-exceeded',
        path,
        depth,
      });
      return RECURSION_DEPTH_EXCEEDED_MARKER;
    }
    if (typeof value === 'string') {
      if (!isImageDataUri(value)) return value;
      logger.warn({
        message: 'promptSafety: image dataURI stripped',
        safetyEvent: 'image-omitted',
        path,
        bytes: Buffer.byteLength(value, 'utf8'),
      });
      return IMAGE_OMITTED_MARKER;
    }
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item, idx) => {
        const replaced = recurse(item, joinPath(path, idx), depth + 1);
        if (replaced !== item) changed = true;
        return replaced;
      });
      return changed ? next : value;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      let changed = false;
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (PROTOTYPE_POLLUTION_KEYS.has(k)) {
          changed = true; // key を drop することは「変更あり」と扱い、汚染源 subtree を sanitized 結果に持ち込まない
          continue;
        }
        const replaced = recurse(v, joinPath(path, k), depth + 1);
        if (replaced !== v) changed = true;
        next[k] = replaced;
      }
      return changed ? next : value;
    }
    return value;
  }
  return recurse(data, '', 0);
}

/**
 * 任意 leaf string の size guard。再帰的に object / array を辿り、UTF-8 byte 長が maxBytes を
 * 超える string を `OVERSIZED_STRING_MARKER` に置換する。
 *
 * content-based scanner (`stripPromptHeavyFields`) で取り切れない非画像 oversized 文字列
 * (将来追加フィールド・application/pdf 等の非画像 dataURI) のセーフティネット。サイズ判定は
 * `Buffer.byteLength(s, 'utf8')` で行う (`String.length` は UTF-16 code unit ベースで、
 * 日本語/絵文字混在下で評価がブレる)。
 *
 * 深さガード (`MAX_RECURSION_DEPTH`) と prototype pollution skip (`PROTOTYPE_POLLUTION_KEYS`)
 * は stripPromptHeavyFields と同じ理由で適用 (詳細は同関数 JSDoc 参照)。
 *
 * 不変性: 入力を mutate しない。
 */
export function truncateOversizedStrings(data: unknown, maxBytes: number = MAX_FIELD_BYTES): unknown {
  function recurse(value: unknown, depth: number): unknown {
    if (depth > MAX_RECURSION_DEPTH) {
      logger.warn({
        message: 'promptSafety: recursion depth exceeded',
        safetyEvent: 'recursion-depth-exceeded',
        depth,
      });
      return RECURSION_DEPTH_EXCEEDED_MARKER;
    }
    if (typeof value === 'string') {
      const utf8Bytes = Buffer.byteLength(value, 'utf8');
      if (utf8Bytes > maxBytes) {
        logger.warn({
          message: 'promptSafety: oversized string truncated',
          safetyEvent: 'oversized-truncated',
          bytes: utf8Bytes,
          maxBytes,
        });
        return OVERSIZED_STRING_MARKER;
      }
      return value;
    }
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const replaced = recurse(item, depth + 1);
        if (replaced !== item) changed = true;
        return replaced;
      });
      return changed ? next : value;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      let changed = false;
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (PROTOTYPE_POLLUTION_KEYS.has(k)) {
          changed = true;
          continue;
        }
        const replaced = recurse(v, depth + 1);
        if (replaced !== v) changed = true;
        next[k] = replaced;
      }
      return changed ? next : value;
    }
    return value;
  }
  return recurse(data, 0);
}

/**
 * AI プロンプトに埋め込む直前にユーザー入力データを sanitize するメイン関数。
 * content-based 除去 → size guard の順で適用する (content-based 適用後の画像 dataURI は
 * 既にマーカー化されており、size guard が同じ場所を二重処理することはない)。
 */
export function sanitizeForPrompt(data: unknown, maxBytes: number = MAX_FIELD_BYTES): unknown {
  return truncateOversizedStrings(stripPromptHeavyFields(data), maxBytes);
}
