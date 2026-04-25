import DOMPurify from 'isomorphic-dompurify';
import { parseMarkdown, ParseMarkdownOptions } from '../utils';
import type { SettingItem, KnowledgeItem, AiSettings } from '../types';

const ALLOWED_TAGS = [
    'p', 'br', 'h1', 'h2', 'h3',
    'strong', 'em', 'u', 's', 'code', 'pre',
    'ul', 'ol', 'li',
    'a', 'span', 'div',
    'ruby', 'rt',
];

const ALLOWED_ATTR = [
    'href', 'target', 'rel',
    'class', 'id', 'style', 'title',
    'data-doc-key', 'data-knowledge-id',
];

export function sanitizeHtml(dirty: string): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: true,
    });
}

export function renderMarkdown(
    text: string,
    characters: SettingItem[] = [],
    knowledgeBase: KnowledgeItem[] = [],
    aiSettings?: AiSettings,
    options?: ParseMarkdownOptions,
): string {
    return sanitizeHtml(parseMarkdown(text, characters, knowledgeBase, aiSettings, options));
}
