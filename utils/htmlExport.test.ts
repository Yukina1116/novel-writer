import { describe, it, expect } from 'vitest';
import type { SettingItem } from '../types';
import { buildCharacterAppendixHtml, composeExportSections, escapeHtmlForExport } from './htmlExport';

const characterFixture = (overrides: Partial<SettingItem> = {}): SettingItem => ({
    id: 'c-1',
    type: 'character',
    name: '太郎',
    ...overrides,
});

describe('buildCharacterAppendixHtml', () => {
    it('should return empty string when no characters are provided', () => {
        const html = buildCharacterAppendixHtml([], { addCharacterImages: false });
        expect(html).toBe('');
    });

    it('should output exportDescription as character description when provided', () => {
        const characters = [
            characterFixture({ exportDescription: '主人公の紹介文' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).toContain('<p>主人公の紹介文</p>');
    });

    it('regression: must not leak personality into description when exportDescription is empty string', () => {
        const characters = [
            characterFixture({
                exportDescription: '',
                personality: '冷静沈着で寡黙な性格',
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('冷静沈着で寡黙な性格');
    });

    it('regression: must not leak personality into description when exportDescription is undefined', () => {
        const characters = [
            characterFixture({
                personality: '冷静沈着で寡黙な性格',
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('冷静沈着で寡黙な性格');
    });

    it('should handle per-character independence: mix of characters with and without exportDescription', () => {
        const characters = [
            characterFixture({ id: 'c-1', name: 'A', exportDescription: 'A の紹介', personality: 'A の性格' }),
            characterFixture({ id: 'c-2', name: 'B', exportDescription: '', personality: 'B の性格' }),
            characterFixture({ id: 'c-3', name: 'C', exportDescription: 'C の紹介', personality: 'C の性格' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).toContain('<p>A の紹介</p>');
        expect(html).toContain('<p>C の紹介</p>');
        expect(html).not.toContain('A の性格');
        expect(html).not.toContain('B の性格');
        expect(html).not.toContain('C の性格');
    });

    it('should omit <p> tag entirely when exportDescription is empty', () => {
        const characters = [
            characterFixture({ exportDescription: '' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toMatch(/<p>\s*<\/p>/);
    });

    it('should output character name with furigana when furigana is provided', () => {
        const characters = [
            characterFixture({ name: '太郎', furigana: 'たろう' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).toContain('<h3>太郎 (たろう)</h3>');
    });

    it('should output image tag when addCharacterImages is true and imageUrl exists', () => {
        const characters = [
            characterFixture({
                appearance: { imageUrl: 'https://example.com/img.png', traits: [] },
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: true });
        expect(html).toContain('<img src="https://example.com/img.png"');
    });

    it('should NOT output image tag when addCharacterImages is false even if imageUrl exists', () => {
        const characters = [
            characterFixture({
                appearance: { imageUrl: 'https://example.com/img.png', traits: [] },
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('<img');
    });

    it('should escape HTML special characters in exportDescription', () => {
        const characters = [
            characterFixture({ exportDescription: '<script>alert("xss")</script>' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('should escape HTML special characters in character name', () => {
        const characters = [
            characterFixture({ name: '<img src=x onerror=alert(1)>' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('<img src=x onerror=alert(1)>');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should escape HTML special characters in furigana', () => {
        const characters = [
            characterFixture({ furigana: '"><script>alert(1)</script>' }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('"><script>');
        expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });

    it('should escape HTML special characters in imageUrl when image rendering is enabled', () => {
        const characters = [
            characterFixture({
                appearance: { imageUrl: 'x" onerror="alert(1)', traits: [] },
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: true });
        expect(html).not.toContain('onerror="alert(1)');
        expect(html).toContain('&quot; onerror=&quot;alert(1)');
    });
});

describe('composeExportSections (section ordering)', () => {
    const sections = {
        cover: '<div class="cover">COVER_MARKER</div>',
        characters: '<div class="appendix">CHARACTERS_MARKER</div>',
        worlds: '<div class="appendix">WORLDS_MARKER</div>',
        toc: '<div class="toc">TOC_MARKER</div>',
        content: '<div class="content">CONTENT_MARKER</div>',
        afterword: '<div class="appendix">AFTERWORD_MARKER</div>',
    };

    it('regression: must place characters and worlds BEFORE content (bug fix for HTML export ordering)', () => {
        const html = composeExportSections(sections);
        expect(html.indexOf('CHARACTERS_MARKER')).toBeLessThan(html.indexOf('CONTENT_MARKER'));
        expect(html.indexOf('WORLDS_MARKER')).toBeLessThan(html.indexOf('CONTENT_MARKER'));
    });

    it('should emit sections in order: cover → characters → worlds → toc → content → afterword', () => {
        const html = composeExportSections(sections);
        const order = [
            html.indexOf('COVER_MARKER'),
            html.indexOf('CHARACTERS_MARKER'),
            html.indexOf('WORLDS_MARKER'),
            html.indexOf('TOC_MARKER'),
            html.indexOf('CONTENT_MARKER'),
            html.indexOf('AFTERWORD_MARKER'),
        ];
        const sorted = [...order].sort((a, b) => a - b);
        expect(order).toEqual(sorted);
    });

    it('should place characters BEFORE worlds (登場人物 → 用語説明)', () => {
        const html = composeExportSections(sections);
        expect(html.indexOf('CHARACTERS_MARKER')).toBeLessThan(html.indexOf('WORLDS_MARKER'));
    });

    it('should place toc BEFORE content (目次 → 本文)', () => {
        const html = composeExportSections(sections);
        expect(html.indexOf('TOC_MARKER')).toBeLessThan(html.indexOf('CONTENT_MARKER'));
    });

    it('should place afterword LAST', () => {
        const html = composeExportSections(sections);
        const afterwordIdx = html.indexOf('AFTERWORD_MARKER');
        ['COVER_MARKER', 'CHARACTERS_MARKER', 'WORLDS_MARKER', 'TOC_MARKER', 'CONTENT_MARKER'].forEach(marker => {
            expect(html.indexOf(marker)).toBeLessThan(afterwordIdx);
        });
    });

    it('should emit empty sections unchanged (no marker injection for empty strings)', () => {
        const html = composeExportSections({
            cover: '',
            characters: '<div>CHARACTERS_MARKER</div>',
            worlds: '',
            toc: '',
            content: '<div>CONTENT_MARKER</div>',
            afterword: '',
        });
        expect(html).toContain('CHARACTERS_MARKER');
        expect(html).toContain('CONTENT_MARKER');
        expect(html.indexOf('CHARACTERS_MARKER')).toBeLessThan(html.indexOf('CONTENT_MARKER'));
    });
});

describe('escapeHtmlForExport', () => {
    it('should escape ampersand', () => {
        expect(escapeHtmlForExport('A & B')).toBe('A &amp; B');
    });

    it('should escape less-than and greater-than', () => {
        expect(escapeHtmlForExport('<div>')).toBe('&lt;div&gt;');
    });

    it('should escape double quote and single quote', () => {
        expect(escapeHtmlForExport(`"'`)).toBe('&quot;&#039;');
    });
});
