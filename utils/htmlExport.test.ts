import { describe, it, expect } from 'vitest';
import type { SettingItem } from '../types';
import { buildCharacterAppendixHtml, escapeHtmlForExport } from './htmlExport';

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

    it('should NOT fallback to personality when exportDescription is empty (regression: bug fix for character export)', () => {
        const characters = [
            characterFixture({
                exportDescription: '',
                personality: '冷静沈着で寡黙な性格',
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('冷静沈着で寡黙な性格');
    });

    it('should NOT fallback to personality when exportDescription is undefined (regression: bug fix for character export)', () => {
        const characters = [
            characterFixture({
                personality: '冷静沈着で寡黙な性格',
            }),
        ];
        const html = buildCharacterAppendixHtml(characters, { addCharacterImages: false });
        expect(html).not.toContain('冷静沈着で寡黙な性格');
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
