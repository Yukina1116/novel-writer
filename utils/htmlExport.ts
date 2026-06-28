import type { SettingItem } from '../types';

export const escapeHtmlForExport = (unsafe: string): string =>
    unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

export interface CharacterAppendixOptions {
    addCharacterImages: boolean;
}

export function buildCharacterAppendixHtml(
    characters: SettingItem[],
    options: CharacterAppendixOptions,
): string {
    if (characters.length === 0) return '';
    const cards = characters
        .map(char => {
            const image =
                options.addCharacterImages && char.appearance?.imageUrl
                    ? `<img src="${escapeHtmlForExport(char.appearance.imageUrl)}" alt="${escapeHtmlForExport(char.name)}">`
                    : '';
            const furigana = char.furigana ? ` (${escapeHtmlForExport(char.furigana)})` : '';
            const description = char.exportDescription
                ? `<p>${escapeHtmlForExport(char.exportDescription)}</p>`
                : '';
            return `
                            <div class="char-card">
                                ${image}
                                <h3>${escapeHtmlForExport(char.name)}${furigana}</h3>
                                ${description}
                            </div>
                        `;
        })
        .join('');
    return `
                    <div class="appendix">
                        <h2>登場人物</h2>
                        ${cards}
                    </div>
                `;
}
