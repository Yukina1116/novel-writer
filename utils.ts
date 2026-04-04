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
    
    // Links (internal for docs, anchors for page jumps, and external)
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        if (url.startsWith('./')) {
            // Use a data attribute to prevent navigation and handle via JS
            const docKey = url.substring(2);
            return `<a href="#" data-doc-key="${docKey}" class="internal-link">${text}</a>`;
        }
        if (url.startsWith('#')) {
            // Create a valid href for the anchor link
            const anchorId = createAnchorId(url.substring(1));
            return `<a href="#${anchorId}" class="anchor-link">${text}</a>`;
        }
        if (url.startsWith('http')) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        return `<a href="${url}">${text}</a>`;
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


export const getChapterChunks = (novelContent: NovelChunk[], chapterId: string): NovelChunk[] => {
    const isUncategorizedChapter = novelContent.find(c => c.id === chapterId && !c.text.startsWith('# '));

    if (isUncategorizedChapter) {
        const firstTitleIndex = novelContent.findIndex(c => c.text.startsWith('# '));
        if (firstTitleIndex === -1) {
            return [...novelContent];
        }
        return novelContent.slice(0, firstTitleIndex);
    }
    
    const chapterStartIndex = novelContent.findIndex(c => c.id === chapterId);
    if (chapterStartIndex === -1) return [];

    let chapterEndIndex = novelContent.findIndex((c, i) => i > chapterStartIndex && c.text.startsWith('# '));
    if (chapterEndIndex === -1) {
        chapterEndIndex = novelContent.length;
    }

    return novelContent.slice(chapterStartIndex, chapterEndIndex);
};


// --- Project Data Validation ---
const isObject = (value: any): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: any): value is string => typeof value === 'string';
const isArray = (value: any): value is any[] => Array.isArray(value);

const validateArrayItems = <T>(arr: any, validator: (item: any) => item is T): T[] => {
    if (!isArray(arr)) return [];
    return arr.filter(validator);
};

const isValidNovelChunk = (item: any): item is NovelChunk => isObject(item) && isString(item.id) && isString(item.text);
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

export const validateAndSanitizeProjectData = (data: any): Project => {
    if (!isObject(data)) {
        throw new Error('プロジェクトファイルが有効なオブジェクトではありません。');
    }

    const sanitized: Partial<Project> = { ...data };

    // --- Validate mandatory fields ---
    if (!isString(sanitized.id) || !sanitized.id) {
        throw new Error('プロジェクトIDが無効または存在しません。');
    }
    if (!isString(sanitized.name) || !sanitized.name) {
        throw new Error('プロジェクト名が無効または存在しません。');
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
