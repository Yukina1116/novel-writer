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
 * 防御戦略 (Codex 推奨の案 C):
 *   1. 既知フィールド名 + `data:` prefix の **whitelist** 除去 (確実な既知パスを断つ)
 *   2. 任意 leaf string の **size guard** (将来の未知フィールド・SVG dataURI 等のセーフティネット)
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
 * 「ここに画像 dataURI が入りうる」既知フィールドの dot-path。
 * 新規フィールド追加時はここに足すだけで character / world / 他 service 全てに適用される。
 */
const IMAGE_FIELD_PATHS: readonly string[] = [
  'appearance.imageUrl', // character: Imagen 生成
  'mapImageUrl', // world: ユーザーアップロード or 生成
];

/**
 * dot-path で指定されたフィールドに `data:` で始まる文字列があれば omission marker に置換。
 * 引数 mutate なし。path 途中が object でない場合は no-op (型不一致 safe)。
 */
function replaceDataUriAtPath(input: Record<string, unknown>, path: string): Record<string, unknown> {
  const segments = path.split('.');
  let cursor: unknown = input;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!cursor || typeof cursor !== 'object') return input;
    cursor = (cursor as Record<string, unknown>)[segments[i]];
  }
  if (!cursor || typeof cursor !== 'object') return input;
  const leafKey = segments[segments.length - 1];
  const leafValue = (cursor as Record<string, unknown>)[leafKey];
  if (typeof leafValue !== 'string' || !leafValue.startsWith('data:')) return input;

  // 観測可能性 (silent fail paired signal): 本番障害再発の早期検知のため、
  // sanitize 発火を必ず構造化ログに残す。message body は marker 自身を含めず
  // metric 集計に必要な path / bytes (UTF-8 実バイト数) のみ。
  logger.warn({
    message: 'promptSafety: image dataURI stripped',
    safetyEvent: 'image-omitted',
    path,
    bytes: Buffer.byteLength(leafValue, 'utf8'),
  });

  // 不変性のため path に沿って必要な階層だけ新しいオブジェクトに置換する。
  function setAtPath(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
    const key = segments[depth];
    if (depth === segments.length - 1) {
      return { ...obj, [key]: IMAGE_OMITTED_MARKER };
    }
    const child = obj[key];
    if (!child || typeof child !== 'object') return obj;
    return { ...obj, [key]: setAtPath(child as Record<string, unknown>, depth + 1) };
  }
  return setAtPath(input, 0);
}

/**
 * 既知の画像 dataURI フィールド (whitelist) を omission marker に置換する。
 * character の `appearance.imageUrl` と world の `mapImageUrl` を一度に処理。
 * 不変性: 入力を mutate せず、影響パスのみ新オブジェクトに差し替える。
 */
export function stripPromptHeavyFields(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  let result = data as Record<string, unknown>;
  let changed = false;
  for (const path of IMAGE_FIELD_PATHS) {
    const replaced = replaceDataUriAtPath(result, path);
    if (replaced !== result) {
      changed = true;
      result = replaced;
    }
  }
  return changed ? result : data;
}

/**
 * 任意 leaf string の size guard。再帰的に object / array を辿り、UTF-8 byte 長が maxBytes を
 * 超える string を `OVERSIZED_STRING_MARKER` に置換する。
 *
 * whitelist (stripPromptHeavyFields) で取り切れない未知フィールド・将来追加フィールド・
 * SVG dataURI 等のセーフティネット。サイズ判定は `Buffer.byteLength(s, 'utf8')` で行う
 * (`String.length` は UTF-16 code unit ベースで、日本語/絵文字混在下で評価がブレる)。
 *
 * 不変性: 入力を mutate しない。
 */
export function truncateOversizedStrings(data: unknown, maxBytes: number = MAX_FIELD_BYTES): unknown {
  if (typeof data === 'string') {
    const utf8Bytes = Buffer.byteLength(data, 'utf8');
    if (utf8Bytes > maxBytes) {
      logger.warn({
        message: 'promptSafety: oversized string truncated',
        safetyEvent: 'oversized-truncated',
        bytes: utf8Bytes,
        maxBytes,
      });
      return OVERSIZED_STRING_MARKER;
    }
    return data;
  }
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      const replaced = truncateOversizedStrings(item, maxBytes);
      if (replaced !== item) changed = true;
      return replaced;
    });
    return changed ? next : data;
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const replaced = truncateOversizedStrings(v, maxBytes);
      if (replaced !== v) changed = true;
      next[k] = replaced;
    }
    return changed ? next : data;
  }
  return data;
}

/**
 * AI プロンプトに埋め込む直前にユーザー入力データを sanitize するメイン関数。
 * whitelist 除去 → size guard の順で適用する (whitelist 適用後の dataURI は既にマーカー化されており、
 * size guard が同じ場所を二重処理することはない)。
 */
export function sanitizeForPrompt(data: unknown, maxBytes: number = MAX_FIELD_BYTES): unknown {
  return truncateOversizedStrings(stripPromptHeavyFields(data), maxBytes);
}
