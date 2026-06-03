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

/**
 * AI プロンプトから除外された非画像 dataURI (PDF / audio / font 等) の代替マーカー (Issue #137 #1)。
 * 画像系の `IMAGE_OMITTED_MARKER` と対称に「非画像 dataURI が存在する」事実だけ AI に伝える。
 */
export const NON_IMAGE_DATA_URI_MARKER = '[non-image-data-uri: omitted from prompt to fit token budget]';

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
 * dataURI 共通 prefix。`isImageDataUri` / `isNonImageDataUri` の判定で normalize 後の
 * 先頭 prefix 識別に使う (Issue #137 #1)。
 */
const DATA_URI_PREFIX = 'data:';

/**
 * 画像 dataURI と判定する prefix。`data:image/` は MIME type の image/* を全てカバー
 * (png, jpeg, webp, gif, svg+xml, avif, heic 等)。
 */
const IMAGE_DATA_URI_PREFIX = 'data:image/';

/**
 * 非画像 dataURI false positive guard の最小 byte 数 (Issue #137 #1)。
 *
 * image 側の `MIN_IMAGE_DATA_URI_BYTES` (500) と対称に設定し、ナレッジ等に「`data:application/pdf`
 * という形式の文字列」が短文として含まれる可能性に備える。500B 未満の非画像 dataURI は
 * 実プロダクトデータとして登場しない極限値 (実 PDF/audio は数 KB 以上が前提)。
 */
const MIN_NON_IMAGE_DATA_URI_BYTES = 500;

/**
 * false positive 防止: この byte 長未満の `data:image/` 始まり文字列は素通しする。
 *
 * 理由: ナレッジや description に「`data:image/png` という形式の文字列」が短文として
 * 含まれる可能性があるため。実 dataURI は base64 payload で必ず数百〜数千 bytes 以上で、
 * 500B 未満では pixel 数十個レベルの絵にしかならず実用画像にはならない (1×1 transparent
 * GIF が ~78 bytes だが、実プロダクトデータには登場しない極限値)。
 *
 * 100 → 500 への引き上げ (Issue #137 #2): 99B 弱の `data:image/...` を array で多数並べる
 * cumulative token-bomb の bypass 帯域を 99B/個 → 499B/個 に狭め、同じ累積 token 量を
 * 出すために必要な array 要素数を ~5 倍に押し上げる。size guard backstop (MAX_FIELD_BYTES)
 * との 200 倍 gap を維持しつつ false positive ゼロを保つ妥協点。
 */
const MIN_IMAGE_DATA_URI_BYTES = 500;

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
 * array 1 つあたりの累積 byte 上限 (Issue #137 #2 残り collection-level guard)。
 *
 * 背景: PR #138 で `MIN_IMAGE_DATA_URI_BYTES` を 100→500 に引き上げ、99B 弱 dataURI cumulative
 * bypass 帯域を ~5x 縮小したが、≤499B dataURI を多数並べた累積 token-bomb (例 2000 件 × 80B
 * dataURI で ~1MB / ~50K tokens) は leaf-level guard を素通しできる残課題があった。
 *
 * 200KB の根拠:
 * - 通常 character.skills[] / world.lore[] の array は実用 ~50KB 以下、200KB は十分余裕
 *   (false positive 実質ゼロ)
 * - `MAX_FIELD_BYTES=100KB` (単一 leaf 上限) の 2x altitude で「単一 vs 集合」を区別
 * - Gemini 131K context の ~1.5x 相当の ~50K tokens 目安をターゲット
 * - ≥200KB の array は通常データで起きえない (~400 件の 499B dataURI 相当)
 *
 * Issue #134 register-or-forget 解消理念とは直交軸: leaf-level whitelist→content-based は
 * 「leaf 検出の自動カバー」軸、本定数は「累積 byte の構造的制限」軸で、新フィールド追加でも
 * 自動的にカバーされる (whitelist 不要)。
 */
const MAX_COLLECTION_BYTES = 200_000;

/**
 * 累積 byte 閾値到達後の array element 代替マーカー (Issue #137 #2 残り)。
 *
 * 閾値以下の element は image / non-image marker 化 (既存) を経由して保持される。閾値を超えた
 * index 以降を本 marker で置換し「同じ array にまだ要素があった」事実だけ AI に伝える。
 */
export const COLLECTION_OVERFLOW_MARKER =
  '[collection-overflow: subsequent items omitted to fit token budget]';

/**
 * processed element の byte 計測 (Issue #137 #2 残り、codex セカンドオピニオン High 1-2 解消)。
 *
 * JSON-safe ではない element (`undefined` / `function` / `symbol` / `BigInt` / 循環参照) で
 * `Buffer.byteLength` が throw しないよう二重 defensive:
 * - `JSON.stringify(value) ?? 'null'`: undefined / function / symbol で stringify が undefined を
 *   返したら `'null'` 文字列 (4 byte) で代替
 * - try-catch: BigInt や循環参照で stringify が throw する場合は 4 byte fallback で防御
 *
 * `processed element` = recurse 通過後の値 (image / non-image marker 化後の短文を含む) を想定。
 * 「leaf-level marker 化済の element は cumulative 圧迫しない」を保証する。
 */
function estimateElementBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
  } catch {
    return 4; // 'null' 相当
  }
}

/**
 * 単一 sanitize 関数呼出あたりの個別 warn ログ発火上限。これを超えると個別 warn を抑制し、
 * 関数末尾で集約 log 1 件 (`*-batch`) に切替える。
 *
 * 理由 (Issue #137 #3): 旧 PR #136 の content-based 再帰スキャンは O(N leaves) で全 leaf に
 * 対し warn を emit する設計のため、攻撃者が array に多数の `data:image/...` を詰めると
 * Cloud Logging に同名 warn が 1 リクエストで数千〜数万件発火する amplification 経路がある。
 * 旧 whitelist 設計 (PR #132/#133) は path 2 件で暗黙の O(1) 契約だった。
 *
 * 50 は通常の character / world データで発火する image-omitted 件数 (実用 0〜2 件) に十分
 * 余裕があり、攻撃 amplification 上限としても観測上の代表性 (最初の 50 件で path 分布が
 * 十分わかる) を保つ妥協点。
 *
 * ## 量的上限 (1 sanitize 関数呼出 vs 1 sanitizeForPrompt 呼出 vs 1 HTTP request)
 *
 * - **1 関数呼出 (stripPromptHeavyFields or truncateOversizedStrings)**:
 *   - image-omitted 個別 ≤ 50 件 + image-omitted-batch 1 件
 *   - recursion-depth-exceeded 個別 ≤ 50 件 + recursion-depth-exceeded-batch 1 件
 *   - 合計 ≤ 102 件
 * - **1 `sanitizeForPrompt` 呼出**: 2 関数を直列に走らせるため最大 ≤ 204 件
 *   - (stripPromptHeavyFields の depth-exceeded marker は短文なので truncate 側の oversized
 *     経路は通常発火せず、実測上は ~100 件帯)
 * - **1 HTTP request**: `character/reply` は `sanitizeForPrompt` を 2 回呼ぶため最大 ≤ 408 件
 *
 * いずれも旧 amplification 経路の数千〜数万件と比べ 1-2 桁削減。本上限は per-function-call
 * での design であり per-request の構造的 cap ではない (per-request cap を求める場合は
 * logger 側の rate-limited wrapper が altitude を上げる方向、Issue #137 で別途検討)。
 */
const MAX_WARN_PER_CALL = 50;

/**
 * batch log の `pathPrefixes` histogram の top-N (Issue #137 #5)。
 *
 * 旧設計: `image-omitted-batch` 等の集約 log は `totalCount` / `loggedCount` / `omittedCount` のみ
 * 持ち、51 件目以降の field path 情報が完全喪失していた。Cloud Logging で path 別ダッシュボードを
 * 組んだ場合、batch 経由の発火はどのバケットにも入らない構造的弱点があった。
 *
 * 本定数で「集約時の path 分布」上位 N を batch payload に残す。5 は Cloud Logging payload size と
 * observability の妥協点で、top-5 で path 分布の大勢が掴める想定。低頻度 path は drop されるが、
 * 個別 warn (先頭 50 件) には path が残るため forensic 価値は二重に担保される。
 */
const PATH_PREFIX_TOP_N = 5;

/**
 * path histogram で array index `[0]` / `[1]` / `[2]` ... を `[*]` に正規化する正規表現
 * (Issue #137 #5)。同 subtree で `gallery[0].url` / `gallery[1].url` / `gallery[2].url` ... が
 * 並ぶと bucket が cardinality 爆発するため、array index は集約 prefix にまとめる。末尾の
 * property 名 (`url` / `caption` 等) は意味的に異なるため normalize 対象外で残す。
 *
 * 例: `gallery[0].url` → `gallery[*].url` / `gallery[1].caption` → `gallery[*].caption`
 * 例: array index を含まない dot-path (`users.profile.avatar`) はそのまま `users.profile.avatar` で残る
 *     (dot-path 構造は意味情報として保持し、prefix 集約は array index 専用)。
 */
const ARRAY_INDEX_PATTERN = /\[\d+\]/g;

/**
 * path histogram で path に渡されなかった集約 bucket (Issue #137 #5)。
 *
 * 現状の path 未追跡 caller は `truncateOversizedStrings` の 2 callsite のみだが、将来 sanitize
 * 関数が増えた際にも path 引数を渡さない caller があれば本 bucket に集約される。これにより
 * 「path 追跡未実装の経路がどの程度発火しているか」が Cloud Logging で観測可能になる (将来 path
 * 追跡を入れるべき経路の優先度判定材料)。
 */
const NO_PATH_BUCKET = '(no-path)';

/**
 * path histogram の cardinality 爆発防御の最大 bucket 数 (Issue #137 #5 / PR #144 review-pr High 指摘の解消)。
 *
 * 旧設計: `pathHistogram = new Map<string, number>()` に上限なし。攻撃ペイロード (1500 段 ×
 * 1000 sibling 等で unique path を爆発させる) で aggregator 自身の Map size が暴走し
 * RSS 上昇するが silent に許容される構造的弱点があった (silent-failure-hunter High)。
 *
 * 256 は通常の character / world データの per-call unique path 数 (実用 ~50 未満) に十分余裕、
 * かつ Cloud Logging 1 row payload size の制約 (top-5 抽出後 + truncatedBucketCount field 等) と
 * 整合する妥協点。超過時は新規 bucket を `(overflow)` bucket に集約し、本 sanitize call 内で
 * `histogram-overflow` warn を 1 度だけ emit (paired signal 規律、`feedback_silent_fail_paired_signal`)。
 */
const MAX_HISTOGRAM_BUCKETS = 256;

/**
 * histogram cardinality 上限超過時の集約 bucket (Issue #137 #5 / PR #144 review-pr High)。
 *
 * `MAX_HISTOGRAM_BUCKETS` 到達後の新規 path は本 bucket に inc される。Cloud Logging で
 * `(overflow)` bucket に大量 count が並んでいたら「histogram が飽和した = path 追跡しきれない
 * トラフィックがあった」を示す early-detection シグナル。
 */
const OVERFLOW_BUCKET = '(overflow)';

/**
 * path を histogram bucket key に正規化する (Issue #137 #5)。
 * - undefined は `NO_PATH_BUCKET` ('(no-path)') に集約
 * - array index `[N]` は `[*]` に置換し cardinality 爆発を防ぐ
 */
function normalizePathForHistogram(path: string | undefined): string {
  if (path === undefined) return NO_PATH_BUCKET;
  return path.replace(ARRAY_INDEX_PATTERN, '[*]');
}

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
 * dataURI 判定のための文字列 normalize (Issue #137 #1 / codex セカンドオピニオン Medium 指摘):
 *
 * - `trimStart()` で先頭空白吸収 (`\n data:...` 等を素通しさせない)
 * - `toLowerCase()` で case insensitive 化 (`DATA:application/pdf` / `DATA:IMAGE/PNG` 等を捕捉)
 *
 * 根拠: RFC 2397 で data URI の media type は case-insensitive、RFC 3986 で scheme 部 (`data:`) も
 * case-insensitive と規定されている。byte 計測も normalize 後 string で行うことで image / non-image
 * 側の判定基準を揃え、先頭空白が payload byte 数に混入することを防ぐ。
 */
function normalizeForDataUriDetection(value: string): string {
  return value.trimStart().toLowerCase();
}

/**
 * 任意 leaf string が「画像 dataURI と判定すべきか」を返す (Issue #137 #1 で case insensitive 化)。
 * - normalize 後 `data:image/` で始まる
 * - normalize 後 UTF-8 byte 長が `MIN_IMAGE_DATA_URI_BYTES` 以上 (false positive 防止)
 */
function isImageDataUri(value: string): boolean {
  const normalized = normalizeForDataUriDetection(value);
  return (
    normalized.startsWith(IMAGE_DATA_URI_PREFIX) &&
    Buffer.byteLength(normalized, 'utf8') >= MIN_IMAGE_DATA_URI_BYTES
  );
}

/**
 * 任意 leaf string が「非画像 dataURI と判定すべきか」を返す (Issue #137 #1)。
 * - normalize 後 `data:` で始まり `data:image/` で始まらない
 * - normalize 後 UTF-8 byte 長が `MIN_NON_IMAGE_DATA_URI_BYTES` 以上
 *
 * 判定順は呼出側で image → non-image の順に評価することを前提とする (recurse 経路で先評価)。
 * 本関数単独では「画像でない dataURI」かどうかしか判定せず、空 MIME (`data:;base64,...`) や
 * no-mediatype (`data:,...`) も「非画像」として扱う (prompt token を食う以上 marker 化が妥当)。
 */
function isNonImageDataUri(value: string): boolean {
  const normalized = normalizeForDataUriDetection(value);
  return (
    normalized.startsWith(DATA_URI_PREFIX) &&
    !normalized.startsWith(IMAGE_DATA_URI_PREFIX) &&
    Buffer.byteLength(normalized, 'utf8') >= MIN_NON_IMAGE_DATA_URI_BYTES
  );
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
 * tick payload で渡せないキー (factory が固定する予約 key)。
 *
 * (a) payload spread shadowing 防御 (Issue #137 #4 残り a):
 * tick の logger.warn では `{ ...buildPayload(), message: individualMessage, safetyEvent: individualEvent }` の
 * 順で spread し、callsite からの payload が固定 key を上書きできない構造にしている。型レベルでも
 * `message` / `safetyEvent` を `never` 制約することで compile-time 防御し、server/utils/logger.ts の
 * 確立規律 (`{ ...payload, severity, timestamp, service }` で予約キー保護) と同じ altitude を保つ。
 */
export type WarnAggregatorPayload = Record<string, unknown> & {
  message?: never;
  safetyEvent?: never;
};

/**
 * per-call warn 集約を行う aggregator (Issue #137 #4 / code-review PR #139 / #140 CONFIRMED 対応)。
 *
 * 旧設計 (PR #139 直後): stripPromptHeavyFields と truncateOversizedStrings の各 recurse closure
 * 内に `totalCount` / `loggedCount` を持ち、3 種類の safetyEvent (image-omitted /
 * oversized-truncated / recursion-depth-exceeded) ごとに counter scaffolding を手書きしていた。
 * これは Issue #134 で whitelist 廃止して構造的に閉じたはずの register-or-forget pattern が
 * log aggregation 層で再発する原因だった。
 *
 * 本 factory に括り出すことで:
 * - callsite は `aggregator.tick(buildPayload)` 1 行で個別 warn (上限超は自動 skip)
 * - 関数末尾で `aggregator.flush()` 1 行で集約 log emit
 * - 新規 sanitize 関数 / 新規 safetyEvent 追加時に counter scaffolding をコピペする必要なし
 *
 * 不変条件:
 * - `tick()` 呼出は totalCount を必ず inc、loggedCount は MAX_WARN_PER_CALL 超で打ち止め
 * - `flush()` は totalCount > MAX_WARN_PER_CALL の時のみ 1 件 emit (totalCount=0 や ≤MAX では何もしない)
 * - callsite payload で `message` / `safetyEvent` を上書き不可 (型 + 実行時 spread 順)
 *
 * @param individualEvent 個別 warn の safetyEvent (例: 'image-omitted')。集約 warn の safetyEvent は
 *   `${individualEvent}-batch` で派生 (Issue #137 #4 残り b)
 * @param individualMessage 個別 warn の message (例: 'promptSafety: image dataURI stripped')。集約 warn の
 *   message は `promptSafety: ${individualEvent} warn amplification suppressed` で派生
 *
 * ## individualEvent の制約 (派生衝突回避)
 *
 * factory が batchEvent / batchMessage を機械生成する性質上、以下の値を渡すと degenerate な
 * 集約 log になる:
 * - **空文字 `''`**: `batchEvent = '-batch'` / `batchMessage = 'promptSafety:  warn amplification suppressed'` (double space)
 * - **`-batch` suffix 付き** (例 `'image-omitted-batch'`): `batchEvent = 'image-omitted-batch-batch'` で個別と batch の区別が曖昧化、
 *   かつ別 aggregator (例 `image-omitted`) の batchEvent と衝突する
 *
 * 現状 callsite はすべて hardcoded literal で degenerate input を渡していないが、factory が
 * `export` されているため外部 caller では渡さないこと。defensive runtime guard は overkill のため
 * 入れていない (内部 only かつ 3 callsite で抑止)。
 */
export interface WarnAggregator {
  /**
   * 1 件検出時に呼ぶ。totalCount は必ず inc、loggedCount は MAX_WARN_PER_CALL 超で打ち止め。
   *
   * payload は **lazy builder closure** で受け取る (code-review PR #140 CONFIRMED 対応):
   * 旧 `tick(payload)` 設計だと callsite で毎 leaf object literal + 重い計算
   * (Buffer.byteLength(50KB)) を eager 評価してしまい、threshold 超後も無駄な work が走る
   * regression があった。`tick(() => ({ ... }))` に変えることで threshold 内のみ closure を
   * 呼び出し、上限超後は closure 自体を skip (Buffer.byteLength も走らない)。
   *
   * `path` 引数 (Issue #137 #5): 軽量な path 文字列を別経路で受け取り、batch log の `pathPrefixes`
   * histogram に常時蓄積する。lazy builder の利点 (Buffer.byteLength skip) を保ちつつ、path 集計の
   * ために重い `buildPayload()` を毎 leaf で呼ばずに済む altitude を維持する。`path` 未渡しは
   * `(no-path)` bucket に集約。
   */
  tick: (buildPayload: () => WarnAggregatorPayload, path?: string) => void;
  /** 関数末尾で 1 回呼ぶ。totalCount > MAX_WARN_PER_CALL の時のみ 1 件集約 log を emit。 */
  flush: () => void;
}

export function createWarnAggregator(individualEvent: string, individualMessage: string): WarnAggregator {
  // (b) batchEvent / batchMessage は individualEvent から機械生成 (Issue #137 #4 残り b)。
  // 旧設計の 4 引数 positional 渡しは batch 名 typo の register-or-forget リスクが残っていた。
  const batchEvent = `${individualEvent}-batch`;
  const batchMessage = `promptSafety: ${individualEvent} warn amplification suppressed`;

  let totalCount = 0;
  let loggedCount = 0;
  // Issue #137 #5: per-call の path 分布を蓄積し、batch log に top-N histogram を残す。
  const pathHistogram = new Map<string, number>();
  // PR #144 review-pr High: cardinality 爆発で aggregator が OOM しないよう bucket 数を cap し、
  // 超過時は (overflow) に集約 + 1 度だけ histogram-overflow warn (paired signal)。
  let overflowEmitted = false;
  return {
    tick(buildPayload: () => WarnAggregatorPayload, path?: string) {
      totalCount++;
      // Issue #137 #5: lazy builder の altitude を破壊せず軽量 path のみ常時集計。
      const desired = normalizePathForHistogram(path);
      // PR #144 review-pr High: 新規 bucket 作成は MAX_HISTOGRAM_BUCKETS で cap、超過は (overflow)。
      // 既存 bucket への inc は cap 対象外 (同じ bucket は cardinality を増やさない)。
      const isNewBucket = !pathHistogram.has(desired);
      const bucket =
        isNewBucket && pathHistogram.size >= MAX_HISTOGRAM_BUCKETS ? OVERFLOW_BUCKET : desired;
      pathHistogram.set(bucket, (pathHistogram.get(bucket) ?? 0) + 1);
      if (bucket === OVERFLOW_BUCKET && !overflowEmitted) {
        // paired early-detection signal (silent_fail_paired_signal): 飽和を 1 度だけ通知。
        overflowEmitted = true;
        logger.warn({
          message: 'promptSafety: path histogram saturation — new buckets aggregated into (overflow)',
          safetyEvent: 'histogram-overflow',
          parentEvent: individualEvent,
          maxBuckets: MAX_HISTOGRAM_BUCKETS,
        });
      }
      if (loggedCount < MAX_WARN_PER_CALL) {
        // (a) spread 順反転で固定 message / safetyEvent が payload から上書きされない構造を保証。
        logger.warn({
          ...buildPayload(),
          message: individualMessage,
          safetyEvent: individualEvent,
        });
        loggedCount++;
      }
    },
    flush() {
      if (totalCount > MAX_WARN_PER_CALL) {
        // Issue #137 #5: top-N path prefix を count 降順で抽出。
        // PR #144 review-pr Important: payload は {path, count} object 配列で Cloud Logging クエリ容易化。
        const sorted = Array.from(pathHistogram.entries()).sort(([, a], [, b]) => b - a);
        const pathPrefixes = sorted.slice(0, PATH_PREFIX_TOP_N).map(([path, count]) => ({ path, count }));
        // PR #144 review-pr Medium: top-N に入りきらなかった distinct bucket 数を observability 用に併記。
        const truncatedBucketCount = Math.max(0, pathHistogram.size - PATH_PREFIX_TOP_N);
        logger.warn({
          message: batchMessage,
          safetyEvent: batchEvent,
          totalCount,
          loggedCount,
          omittedCount: totalCount - loggedCount,
          pathPrefixes,
          truncatedBucketCount,
        });
      }
    },
  };
}

/**
 * (c) recursion-depth-exceeded aggregator の helper (Issue #137 #4 残り c)。
 *
 * stripPromptHeavyFields / truncateOversizedStrings の両方で同じ event + message の aggregator が
 * 必要なため、helper 経由で literal の重複を避ける。新規 sanitize 関数が増えても 1 行で同じ
 * depth-exceeded 集約を継承できる。
 */
function createDepthExceededAggregator(): WarnAggregator {
  return createWarnAggregator('recursion-depth-exceeded', 'promptSafety: recursion depth exceeded');
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
  const imageAggregator = createWarnAggregator('image-omitted', 'promptSafety: image dataURI stripped');
  const nonImageAggregator = createWarnAggregator(
    'non-image-data-uri-omitted',
    'promptSafety: non-image dataURI stripped'
  );
  const depthAggregator = createDepthExceededAggregator();
  // Issue #137 #2 残り: array 単位の累積 byte threshold 超過を集約。aggregator instance は
  // stripPromptHeavyFields 呼出全体で 1 つ共有 (cumulative byte counter は array ごとに別
  // closure 変数で管理するので干渉しない)。image / non-image / depth と並列 flush。
  const collectionAggregator = createWarnAggregator(
    'collection-overflow',
    'promptSafety: collection-level cumulative byte threshold exceeded'
  );

  function recurse(value: unknown, path: string, depth: number): unknown {
    if (depth > MAX_RECURSION_DEPTH) {
      // path 引数で histogram 集計 (WarnAggregator.tick JSDoc 参照)。
      depthAggregator.tick(() => ({ path, depth }), path);
      return RECURSION_DEPTH_EXCEEDED_MARKER;
    }
    if (typeof value === 'string') {
      // 判定順は image → non-image (image 側を先評価する規律、AC-7 / AC-15 で pin)。
      if (isImageDataUri(value)) {
        // lazy builder: threshold 超後は Buffer.byteLength(50KB級) 再計算が skip される
        imageAggregator.tick(() => ({ path, bytes: Buffer.byteLength(value, 'utf8') }), path);
        return IMAGE_OMITTED_MARKER;
      }
      if (isNonImageDataUri(value)) {
        // Issue #137 #1: 非画像 dataURI (PDF / audio / font 等) を marker 化。
        // bytes は元 string で計測 (既存 image 側の payload 規律と揃える、normalize の trim 差は無視可能)。
        nonImageAggregator.tick(
          () => ({ path, bytes: Buffer.byteLength(value, 'utf8') }),
          path,
        );
        return NON_IMAGE_DATA_URI_MARKER;
      }
      return value;
    }
    if (Array.isArray(value)) {
      // Issue #137 #2 残り collection-level guard: 各 array で independent な cumulative byte
      // counter を回し、`MAX_COLLECTION_BYTES` 超過後の index は recurse skip + marker 置換。
      // sibling array は parent ループ側で別 closure 経由で独立に評価され、nested array (array
      // of array) も内側 array が recurse 内でこのブロックに入り直すので cumulative は独立。
      let cumulativeBytes = 0;
      let keptCount = 0;
      let changed = false;
      const next: unknown[] = [];
      for (let idx = 0; idx < value.length; idx++) {
        if (cumulativeBytes > MAX_COLLECTION_BYTES) {
          // 閾値超: 当該 index 以降を marker 置換。recurse skip で perf も改善 (攻撃 payload 時こそ
          // stringify 呼出が頭打ちになる)。lazy builder で payload 計算を threshold 内のみ実行。
          const overflowIdx = idx;
          const overflowPath = joinPath(path, overflowIdx);
          const arrayLength = value.length;
          const observedKeptCount = keptCount;
          const observedCumulativeBytes = cumulativeBytes;
          collectionAggregator.tick(
            () => ({
              path: overflowPath,
              arrayLength,
              cumulativeBytes: observedCumulativeBytes,
              droppedIndex: overflowIdx,
              maxCollectionBytes: MAX_COLLECTION_BYTES,
              keptCount: observedKeptCount,
            }),
            overflowPath
          );
          next.push(COLLECTION_OVERFLOW_MARKER);
          changed = true;
          continue;
        }
        const replaced = recurse(value[idx], joinPath(path, idx), depth + 1);
        next.push(replaced);
        if (replaced !== value[idx]) changed = true;
        // processed element の byte を加算 (marker 化された短文も計上、二重防御の補完)。
        cumulativeBytes += estimateElementBytes(replaced);
        keptCount++;
      }
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
  const result = recurse(data, '', 0);
  imageAggregator.flush();
  nonImageAggregator.flush();
  depthAggregator.flush();
  collectionAggregator.flush();
  return result;
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
  const oversizedAggregator = createWarnAggregator('oversized-truncated', 'promptSafety: oversized string truncated');
  const depthAggregator = createDepthExceededAggregator();

  function recurse(value: unknown, depth: number): unknown {
    if (depth > MAX_RECURSION_DEPTH) {
      depthAggregator.tick(() => ({ depth }));
      return RECURSION_DEPTH_EXCEEDED_MARKER;
    }
    if (typeof value === 'string') {
      const utf8Bytes = Buffer.byteLength(value, 'utf8');
      if (utf8Bytes > maxBytes) {
        // utf8Bytes は threshold 判定で既に必須計算済なので lazy 化しても eager 化しても同コスト
        oversizedAggregator.tick(() => ({ bytes: utf8Bytes, maxBytes }));
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
  const result = recurse(data, 0);
  oversizedAggregator.flush();
  depthAggregator.flush();
  return result;
}

/**
 * AI プロンプトに埋め込む直前にユーザー入力データを sanitize するメイン関数。
 * content-based 除去 → size guard の順で適用する (content-based 適用後の画像 dataURI は
 * 既にマーカー化されており、size guard が同じ場所を二重処理することはない)。
 */
export function sanitizeForPrompt(data: unknown, maxBytes: number = MAX_FIELD_BYTES): unknown {
  return truncateOversizedStrings(stripPromptHeavyFields(data), maxBytes);
}
