import { SettingItem, KnowledgeItem, Project, NovelChunk, AiSettings } from './types';
import { defaultAiSettings, defaultDisplaySettings } from './constants';

export const getContrastingTextColor = (hex) => {
    if (!hex) return '#FFFFFF';
    let hexValue = hex.startsWith('#') ? hex.substring(1) : hex;
    
    if (hexValue.length === 3) {
        hexValue = hexValue.split('').map(char => char + char).join('');
    }

    if (hexValue.length !== 6) {
        return '#FFFFFF';
    }

    const r = parseInt(hexValue.substring(0, 2), 16);
    const g = parseInt(hexValue.substring(2, 4), 16);
    const b = parseInt(hexValue.substring(4, 6), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

export interface ParseMarkdownOptions {
    applySpeakerColor?: boolean;
    applyKnowledgeLinks?: boolean;
    applyCustomColors?: boolean;
}

const createAnchorId = (text: string) => {
    try {
        // Use encodeURIComponent which is safe for creating valid id attributes and href values.
        return encodeURIComponent(text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[?]/g, ''));
    } catch (e) {
        return 'invalid-id';
    }
};


export const parseMarkdown = (
    text: string, 
    characters: SettingItem[] = [], 
    knowledgeBase: KnowledgeItem[] = [], 
    aiSettings?: AiSettings,
    options?: ParseMarkdownOptions
) => {
    if (!text) return '';

    const defaultOptions: ParseMarkdownOptions = {
        applySpeakerColor: true,
        applyKnowledgeLinks: true,
        applyCustomColors: true,
    };
    const { applySpeakerColor, applyKnowledgeLinks, applyCustomColors } = { ...defaultOptions, ...options };

    // 1. Escape HTML special characters first to prevent rendering of arbitrary HTML.
    let processedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // Pre-process to avoid parsing inside code blocks
    const codeBlocks: string[] = [];
    processedText = processedText.replace(/```([\s\S]*?)```/gs, (match, code) => {
        const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
        const escapedCode = code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(`<pre><code class="language-plaintext">${escapedCode}</code></pre>`);
        return placeholder;
    });
     processedText = processedText.replace(/`([^`]+?)`/g, '<code>$1</code>');

    // 2. Process our special tags.

    // Handle <speaker> tags for dialogue color. This is the primary, most reliable method.
    if (applySpeakerColor && aiSettings?.applySpeakerColorToDialogue) {
        const characterColorMap = new Map(characters.filter(c => c.themeColor).map(c => [c.name, c.themeColor]));

        processedText = processedText.replace(/&lt;speaker\s+name\s*=\s*(["'])([\s\S]*?)\1\s*&gt;([\s\S]*?)&lt;\/speaker&gt;/gi, (match, quote, name, content) => {
            const color = characterColorMap.get(name.trim());
            if (!color) return content; // No color found, just strip the tag.

            // The user wants to color only the dialogue part, regardless of whether the speaker name is shown.
            // This applies the color only to text within `「...」` or `『...』`.
            return content.replace(/(「[\s\S]*?」|『[\s\S]*?』)/g, (dialogueMatch) => {
                return `<span style="color:${color}">${dialogueMatch}</span>`;
            });
        });
    }
    // Safety net: Strip any remaining speaker tags that were not processed.
    processedText = processedText.replace(/&lt;speaker.*?&gt;([\s\S]*?)&lt;\/speaker&gt;/gi, '$1');

    // Fallback for older content that doesn't use <speaker> tags.
    // This logic specifically targets the "Name ON / Color ON" case.
    if (applySpeakerColor && aiSettings?.applySpeakerColorToDialogue && aiSettings.showSpeakerInDialogue) {
        const characterColorMap = new Map(characters.filter(c => c.themeColor).map(c => [c.name, c.themeColor]));
        processedText = processedText.split('\n').map(line => {
            // Don't re-process lines that were already colored by the speaker tag logic above.
            if (line.includes('<span style="color:')) return line;

            // Match `Name「...」` at the start of the line.
            const match = line.match(/^([^「」『』\s&<]+)\s*(「[\s\S]*?」|『[\s\S]*?』)/);
            if (match) {
                const name = match[1].trim();
                const color = characterColorMap.get(name);
                if (color) {
                    const dialogue = match[2];
                    return line.replace(dialogue, `<span style="color:${color}">${dialogue}</span>`);
                }
            }
            return line;
        }).join('\n');
    }
    
    // Handle custom <c:color> tags
    if (applyCustomColors) {
        processedText = processedText.replace(/&lt;c:([a-zA-Z0-9#]+?)&gt;(.*?)&lt;\/c&gt;/gs, (match, color, content) => {
            const sanitizedColor = color.match(/^[a-zA-Z0-9#]+$/) ? color : 'inherit';
            return `<span style="color:${sanitizedColor}">${content}</span>`;
        });
    }

    // 3. Process standard markdown.
    processedText = processedText.replace(/{([^|]+?)\|(.+?)}/g, '<ruby>$1<rt>$2</rt></ruby>');
    processedText = processedText.replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>');
    processedText = processedText.replace(/__(.*?)__/gs, '<u>$1</u>');
    processedText = processedText.replace(/\*(.*?)\*/gs, '<em>$1</em>');
    processedText = processedText.replace(/~~(.*?)~~/gs, '<s>$1</s>');
    
    // Links: allow only http(s)://, internal docs (./), and anchors (#).
    // Anything else (javascript:, data:, vbscript:, etc.) is rendered as plain
    // text. Defense in depth: callers should still wrap the result in
    // sanitizeHtml() (typically via renderMarkdown), but stripping unsafe
    // hrefs here means a malicious href never reaches DOMPurify even if a
    // future caller forgets to sanitize.
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        if (url.startsWith('./')) {
            const docKey = url.substring(2);
            return `<a href="#" data-doc-key="${docKey}" class="internal-link">${text}</a>`;
        }
        if (url.startsWith('#')) {
            const anchorId = createAnchorId(url.substring(1));
            return `<a href="#${anchorId}" class="anchor-link">${text}</a>`;
        }
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        return text;
    });

    processedText = processedText.replace(/^### (.*$)/gm, (_, title) => `<h3 id="${createAnchorId(title)}">${title}</h3>`);
    processedText = processedText.replace(/^## (.*$)/gm, (_, title) => `<h2 id="${createAnchorId(title)}">${title}</h2>`);
    processedText = processedText.replace(/^# (?!#)(.*$)/gm, (_, title) => `<h1 class="chapter-title" id="${createAnchorId(title)}">${title}</h1>`);

    processedText = processedText.replace(/&lt;br\s*\/?&gt;/gi, '<br />');

    // Table: just remove pipes for better readability as plain text
    processedText = processedText.replace(/^ *\|(.+)\| *$/gm, (line) => {
        if (line.match(/^ *\|[-:| ]+\| *$/)) return ''; // Remove separator line
        return line.replace(/\|/g, '  ').trim();
    });

    // Lists
    processedText = processedText.replace(/^\s*[-*+] (.*$)/gm, '<li>$1</li>');
    processedText = processedText.replace(/^\s*\d+\. (.*$)/gm, '<li>$1</li>'); // Treat ordered as unordered for simplicity
    processedText = processedText.replace(/(<\/li>\n<li>)/g, '</li><li>'); // Join list items
    processedText = processedText.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    processedText = processedText.replace(/<\/ul>\s*<ul>/g, '');


    // 4. Process knowledge links
    if (applyKnowledgeLinks) {
        const linkableNames = new Set([
            ...(knowledgeBase || []).map(k => k.name),
            ...(characters || []).map(c => c.name)
        ]);
        const knowledgeNameMap = new Map((knowledgeBase || []).map(k => [k.name, k]));
        const seenLinks = new Set<string>();

        processedText = processedText.replace(/\[\[(.*?)\]\]/g, (match, linkName) => {
            const trimmedName = linkName.trim();

            if (!linkableNames.has(trimmedName)) {
                // If the item doesn't exist in either characters or knowledge, just strip the brackets.
                return trimmedName;
            }

            // It exists. If it's a knowledge item, create a link.
            const knowledgeItem = knowledgeNameMap.get(trimmedName);
            if (knowledgeItem) {
                if (seenLinks.has(trimmedName)) {
                    return trimmedName; // Don't link subsequent appearances
                }
                seenLinks.add(trimmedName);
                const title = (knowledgeItem.category && knowledgeItem.category !== '未分類') 
                    ? `${knowledgeItem.category}: ${knowledgeItem.name}` 
                    : knowledgeItem.name;
                return `<a href="#" class="knowledge-link" data-knowledge-id="${knowledgeItem.id}" title="${title}">${trimmedName}</a>`;
            }
            
            // It must be a character name. Just strip the brackets as there's no linking feature.
            return trimmedName;
        });
    }

    // 5. Clean up any remaining special syntax if their features were disabled
    if (!applySpeakerColor) {
        processedText = processedText.replace(/&lt;speaker.*?&gt;([\s\S]*?)&lt;\/speaker&gt;/gi, '$1');
    }
    if (!applyCustomColors) {
        processedText = processedText.replace(/&lt;c:([a-zA-Z0-9#]+?)&gt;(.*?)&lt;\/c&gt;/gs, '$2');
    }
    if (!applyKnowledgeLinks) {
        processedText = processedText.replace(/\[\[(.*?)\]\]/g, '$1');
    }
    
    // Restore code blocks
    codeBlocks.forEach((block, index) => {
        processedText = processedText.replace(`__CODEBLOCK_${index}__`, block);
    });

    // Add paragraph tags
    // FIX: Preserve empty lines by returning <br /> instead of an empty string
    processedText = processedText.split('\n').map(p => {
        if (p.trim() === '') return '<br />'; 
        if (p.trim().startsWith('<h') || p.trim().startsWith('<ul') || p.trim().startsWith('<ol') || p.trim().startsWith('<pre')) {
            return p;
        }
        return `<p>${p}</p>`;
    }).join('');


    return processedText;
};


/**
 * UI / group lookup 用の仮想 id。`chapterId === null` の chunks (= 章に属さない文章) を
 * 1 つのグループとして扱う際の groupId として使用する。chunk id と衝突しないよう接頭辞付き。
 */
export const UNCATEGORIZED_CHAPTER_ID = '__uncategorized__';

export const isChapterTitleChunk = (chunk: NovelChunk): boolean =>
    chunk.text.startsWith('# ');

/**
 * 章タイトル chunk の text の先頭行から `# ` を除いたタイトル文字列を返す。
 * `# ` で始まらない chunk を渡した場合は空文字。
 */
export const extractChapterTitle = (chunk: NovelChunk): string => {
    if (!isChapterTitleChunk(chunk)) return '';
    return chunk.text.split('\n')[0].substring(2).trim();
};

/**
 * `normalizeChapterIds` が異常入力を黙って修復しないように、dev 環境では原因別に 1 度だけ warn を出す。
 * グローバル MEMORY `feedback_silent_fail_paired_signal.md` の paired signal 規律に従う。
 * production では noop (側面コスト 0)。
 */
const warnedKeys = new Set<string>();

/**
 * dev 環境で paired signal を 1 度だけ出力する。grow-MEMORY `feedback_silent_fail_paired_signal.md`
 * の規律に従い、normalize / store write path の silent fail を可視化する。production では noop。
 * 呼び出し側で異なる category (`key`) を渡すこと。`__resetChapterIdWarnState` で test 時にリセット可能。
 */
export const warnOnceInDev = (
    key: string,
    message: string,
    detail: Record<string, unknown>,
    scope = 'normalizeChapterIds',
): void => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return;
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[${scope}] ${message}`, detail);
};

/** test-only: warnOnceInDev の dedup state をクリアする (vitest beforeEach 用)。 */
export const __resetChapterIdWarnState = (): void => {
    warnedKeys.clear();
};

/**
 * `novelContent` の chunks に対し chapterId を推論・修復した新しい配列を返す (入力は変更しない)。
 *
 * 規則:
 *   - title chunk (text が `# ` で始まる) → `chapterId === self.id`
 *   - body chunk で `chapterId === null` → そのまま (意図的な「章に属さない文章」)
 *   - body chunk で `chapterId` が文字列で、それ以前に出現した title chunk の id を指す → そのまま
 *   - 上記以外 (undefined / 非 string / 存在しない or 前方参照 id / 非 title への参照) →
 *     直前の chunk の正規化済 chapterId を継承 (最初の chunk なら null)
 *
 * 旧データ (`chapterId === undefined`) の推論は migration 想定のため warn しない。
 * dangling / 非 string / 非 title 参照 / title 自己参照 mismatch は dev 環境で console.warn を 1 度だけ出す。
 *
 * 冪等。`validateAndSanitizeProjectData` から load 時 1 回適用される。
 */
export const normalizeChapterIds = (chunks: NovelChunk[]): NovelChunk[] => {
    const knownTitleIds = new Set<string>();
    const result: NovelChunk[] = [];
    let lastChapterId: string | null = null;

    for (const chunk of chunks) {
        if (isChapterTitleChunk(chunk)) {
            knownTitleIds.add(chunk.id);
            if (chunk.chapterId !== undefined && chunk.chapterId !== chunk.id) {
                warnOnceInDev('title-self-mismatch',
                    'title chunk が self.id を指していなかったため矯正しました',
                    { chunkId: chunk.id, hadChapterId: chunk.chapterId });
            }
            result.push({ ...chunk, chapterId: chunk.id });
            lastChapterId = chunk.id;
            continue;
        }
        const raw = chunk.chapterId;
        let resolved: string | null;
        if (raw === null || raw === undefined) {
            // null = 意図的 uncategorized / undefined = migration 未適用、いずれも警告対象外
            resolved = raw === null ? null : lastChapterId;
        } else if (typeof raw !== 'string') {
            warnOnceInDev('non-string-chapter-id',
                'chapterId が string でも null でもないため直前 chunk から継承しました',
                { chunkId: chunk.id, rawType: typeof raw });
            resolved = lastChapterId;
        } else if (knownTitleIds.has(raw)) {
            resolved = raw;
        } else {
            // string だが既知 title id ではない → dangling / forward / 非 title への参照
            warnOnceInDev('invalid-chapter-id-reference',
                'chapterId が存在しない title chunk を参照しているため直前 chunk から継承しました',
                { chunkId: chunk.id, hadChapterId: raw });
            resolved = lastChapterId;
        }
        result.push({ ...chunk, chapterId: resolved });
        lastChapterId = resolved;
    }
    return result;
};

/**
 * 章グループ。`kind === 'uncategorized'` のとき必ず `titleChunk === null` かつ
 * `groupId === UNCATEGORIZED_CHAPTER_ID`。`kind === 'titled'` のとき必ず `titleChunk !== null`。
 * 不可能な組合せ (例: 'titled' + titleChunk=null) は型レベルで構築不能。
 */
export type ChapterGroup =
    | {
        kind: 'titled';
        /** title chunk の id (= title chunk の chapterId) */
        groupId: string;
        titleChunk: NovelChunk;
        /** group に属する chunks (配列上の出現順) */
        chunks: NovelChunk[];
    }
    | {
        kind: 'uncategorized';
        groupId: typeof UNCATEGORIZED_CHAPTER_ID;
        titleChunk: null;
        chunks: NovelChunk[];
    };

/**
 * 正規化済み chunks から章グループ配列を生成する。
 *
 * 前提条件: 入力は `normalizeChapterIds` 経由で正規化されていること。
 * 出力グループの順序は各 groupId が配列上で**最初に出現した順**。
 *
 * group 連続性 invariant (同一 chapterId は連続、初出は title chunk) が崩れている場合:
 * - body chunk が title 未出現の chapterId を参照していた → dev 環境で warn し uncategorized に demote
 * - 同一 group 内に複数 title chunk が混在 → 最初に出現した title chunk を採用 (前勝ち)
 */
export const getChapterGroups = (chunks: NovelChunk[]): ChapterGroup[] => {
    const groups: ChapterGroup[] = [];
    const indexByGroupId = new Map<string, number>();

    for (const chunk of chunks) {
        const isTitle = isChapterTitleChunk(chunk);
        const declaredGroupId = chunk.chapterId == null ? UNCATEGORIZED_CHAPTER_ID : chunk.chapterId;

        // 初出が body chunk のまま title 未到来 = invariant 違反。uncategorized に demote。
        let effectiveGroupId = declaredGroupId;
        if (declaredGroupId !== UNCATEGORIZED_CHAPTER_ID && !isTitle && !indexByGroupId.has(declaredGroupId)) {
            warnOnceInDev('group-continuity-violation',
                'title 出現前の body chunk を検出、uncategorized 扱いします (group 連続性 invariant 違反)',
                { chunkId: chunk.id, declaredGroupId });
            effectiveGroupId = UNCATEGORIZED_CHAPTER_ID;
        }

        const existingIdx = indexByGroupId.get(effectiveGroupId);
        if (existingIdx === undefined) {
            indexByGroupId.set(effectiveGroupId, groups.length);
            if (effectiveGroupId === UNCATEGORIZED_CHAPTER_ID) {
                groups.push({
                    kind: 'uncategorized',
                    groupId: UNCATEGORIZED_CHAPTER_ID,
                    titleChunk: null,
                    chunks: [chunk],
                });
            } else {
                // 正規化済みで demote されなかった ⇒ 初出は title chunk であることが保証される。
                groups.push({
                    kind: 'titled',
                    groupId: effectiveGroupId,
                    titleChunk: chunk,
                    chunks: [chunk],
                });
            }
        } else {
            groups[existingIdx].chunks.push(chunk);
        }
    }
    return groups;
};

/** 指定 groupId に属する chunks のみを配列順で返す。 */
export const getChapterChunksByGroupId = (chunks: NovelChunk[], groupId: string): NovelChunk[] => {
    return chunks.filter(c => {
        const id = c.chapterId == null ? UNCATEGORIZED_CHAPTER_ID : c.chapterId;
        return id === groupId;
    });
};

/**
 * 新規に末尾追加される chunk が継承すべき chapterId を返す (R2: 最終章配下に append)。
 * - chunks が空 → null (uncategorized)
 * - 末尾 chunk の chapterId をそのまま継承 (string = 最終章配下、null = uncategorized)
 */
export const getChapterIdForNewChunk = (chunks: NovelChunk[]): string | null => {
    if (chunks.length === 0) return null;
    const last = chunks[chunks.length - 1];
    return last.chapterId ?? null;
};

/**
 * 末尾追加する chunk の chapterId を決定する。title chunk (`# ` 始まり) なら self.id、
 * それ以外は `getChapterIdForNewChunk` の末尾継承 (R2)。
 *
 * `handleAddNewChunk` (直接入力) / aiSlice continuation 等の末尾 append 経路で利用し、
 * title chunk invariant (`chapterId === self.id`) を必ず満たすようにする。
 */
export const assignChapterIdForAppend = (
    existingChunks: NovelChunk[],
    newChunk: NovelChunk,
): string | null => {
    if (isChapterTitleChunk(newChunk)) return newChunk.id;
    return getChapterIdForNewChunk(existingChunks);
};

/**
 * export HTML 出力で title chunk の anchor id を生成する単一の formula。
 * TOC リンクと本文 div の id を必ず一致させるため、必ずこの関数経由で id を生成する。
 */
export const exportChapterAnchorId = (chunk: NovelChunk): string => `ch-${chunk.id}`;

/**
 * export HTML の TOC に出力する章エントリを生成する (title chunks のみ、配列順)。
 * 各 entry の `id` は `exportChapterAnchorId` 経由で生成され、本文 anchor と同形式。
 */
export const buildExportChapterEntries = (
    novelContent: NovelChunk[],
): { id: string; title: string }[] =>
    novelContent
        .filter(isChapterTitleChunk)
        .map(chunk => ({
            id: exportChapterAnchorId(chunk),
            title: extractChapterTitle(chunk) || '無題の章',
        }));

// --- Project Data Validation ---
const isObject = (value: any): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: any): value is string => typeof value === 'string';
const isArray = (value: any): value is any[] => Array.isArray(value);

const validateArrayItems = <T>(arr: any, validator: (item: any) => item is T): T[] => {
    if (!isArray(arr)) return [];
    return arr.filter(validator);
};

// 型述語は副作用なし。非 string / 非 null の chapterId は normalizeChapterIds 側で吸収する
// (else 節が「直前 chunk から継承 / 先頭なら null」で全異常値を統一処理)。
const isValidNovelChunk = (item: any): item is NovelChunk =>
    isObject(item) && isString(item.id) && isString(item.text);
const isValidSettingItem = (item: any): item is SettingItem => isObject(item) && isString(item.id) && isString(item.name) && isString(item.type);
const isValidKnowledgeItem = (item: any): item is KnowledgeItem => {
    if (!isObject(item) || !isString(item.id) || !isString(item.name)) return false;
    
    // Sanitize tags: ensure it's an array of strings.
    if ('tags' in item && !isArray(item.tags)) {
        // If tags exist but aren't an array (e.g., a string from an old version), try to convert.
        if (isString(item.tags)) {
            item.tags = item.tags.split(',').map(t => t.trim()).filter(Boolean);
        } else {
            // If it's something else, just reset it.
            item.tags = [];
        }
    } else if ('tags' in item && isArray(item.tags)) {
        // Ensure all items in the array are strings
        item.tags = item.tags.filter(isString);
    } else if (!('tags' in item)) {
        item.tags = [];
    }
    
    return true;
};
// Add more specific validators for other types as needed...

// Distinguishable from runtime/IO errors so callers can tell schema-corrupted
// records apart from transient infrastructure failures (e.g. IDB transaction
// abort) and message the user accordingly.
export class ProjectValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProjectValidationError';
    }
}

export const validateAndSanitizeProjectData = (data: any): Project => {
    if (!isObject(data)) {
        throw new ProjectValidationError('プロジェクトファイルが有効なオブジェクトではありません。');
    }

    const sanitized: Partial<Project> = { ...data };

    // --- Validate mandatory fields ---
    if (!isString(sanitized.id) || !sanitized.id) {
        throw new ProjectValidationError('プロジェクトIDが無効または存在しません。');
    }
    if (!isString(sanitized.name) || !sanitized.name) {
        throw new ProjectValidationError('プロジェクト名が無効または存在しません。');
    }
    if (!isString(sanitized.lastModified) || isNaN(new Date(sanitized.lastModified).getTime())) {
        sanitized.lastModified = new Date().toISOString();
    }

    // --- Validate and sanitize object properties ---
    sanitized.aiSettings = { ...defaultAiSettings, ...(isObject(sanitized.aiSettings) ? sanitized.aiSettings : {}) };
    sanitized.displaySettings = { ...defaultDisplaySettings, ...(isObject(sanitized.displaySettings) ? sanitized.displaySettings : {}) };

    // --- Validate and sanitize array properties ---
    sanitized.settings = validateArrayItems(sanitized.settings, isValidSettingItem);
    sanitized.knowledgeBase = validateArrayItems(sanitized.knowledgeBase, isValidKnowledgeItem);
    
    // For novelContent, also handle the old string format
    if (isString(sanitized.novelContent)) {
        sanitized.novelContent = [{ id: crypto.randomUUID(), text: sanitized.novelContent }];
    } else {
        sanitized.novelContent = validateArrayItems(sanitized.novelContent, isValidNovelChunk);
    }
    // chapterId の推論・修復 migration (旧データは undefined、不正参照は前 chunk から継承)
    sanitized.novelContent = normalizeChapterIds(sanitized.novelContent);
    
    // For other arrays, ensure they are arrays and default to empty if not
    const arrayKeys: (keyof Project)[] = [
        'chatHistory', 'plotBoard', 'plotRelations', 'plotNodePositions', 'timeline',
        'timelineLanes', 'characterRelations', 'nodePositions'
    ];
    arrayKeys.forEach(key => {
        if (!isArray((sanitized as any)[key])) {
            (sanitized as any)[key] = [];
        }
    });

    // Ensure plotTypeColors is an object
    if (!isObject(sanitized.plotTypeColors)) {
        sanitized.plotTypeColors = {};
    }

    return sanitized as Project;
};

// --- Image Compression Utility ---
export const compressImage = (base64Str: string, maxWidth = 600, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Export as JPEG to ensure good compression (strips alpha channel, but fine for photos/avatars)
                resolve(canvas.toDataURL('image/jpeg', quality));
            } else {
                resolve(base64Str); // Fallback if context fails
            }
        };
        img.onerror = () => {
            console.warn("Image compression failed, using original.");
            resolve(base64Str); // Fallback
        };
    });
};
