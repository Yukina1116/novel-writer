import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { KnowledgeItem, Project, SettingItem } from '../types';

const baseProject = (overrides: Partial<Project> = {}): Project => ({
    id: 'p-1',
    name: 'テストプロジェクト',
    lastModified: new Date(0).toISOString(),
    settings: [],
    novelContent: [],
    chatHistory: [],
    knowledgeBase: [],
    plotBoard: [],
    plotTypeColors: {},
    plotRelations: [],
    plotNodePositions: [],
    timeline: [],
    timelineLanes: [],
    characterRelations: [],
    nodePositions: [],
    aiSettings: {} as Project['aiSettings'],
    displaySettings: { theme: 'dark', fontFamily: 'sans', fontSize: 16 } as Project['displaySettings'],
    ...overrides,
});

const characterFixture = (overrides: Partial<SettingItem> = {}): SettingItem => ({
    id: 'c-1',
    type: 'character',
    name: '太郎',
    exportDescription: '太郎の紹介文',
    ...overrides,
});

const worldFixture = (overrides: Partial<SettingItem> = {}): SettingItem => ({
    id: 'w-1',
    type: 'world',
    name: '魔法王国',
    longDescription: '魔法に満ちた世界',
    ...overrides,
});

const knowledgeFixture = (overrides: Partial<KnowledgeItem> = {}): KnowledgeItem => ({
    id: 'k-1',
    name: '霊脈',
    content: '大地に流れる魔力の通り道。',
    ...overrides,
});

const captureExportedHtml = (project: Project, options: Record<string, unknown>): string => {
    let captured = '';
    class FakeBlob {
        constructor(parts: BlobPart[]) {
            captured = parts.map(p => String(p)).join('');
        }
    }
    vi.stubGlobal('Blob', FakeBlob);

    const fakeAnchor = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', {
        createElement: vi.fn(() => fakeAnchor),
    });
    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:fake'),
        revokeObjectURL: vi.fn(),
    });

    const state = {
        activeProjectId: project.id,
        allProjectsData: { [project.id]: project },
    };
    const get = () => state as unknown as ReturnType<typeof createDataSlice>;
    const set = vi.fn();
    const slice = createDataSlice(set, get);

    slice.exportHtml(options);

    return captured;
};

const fullOptions = {
    useCurrentStyle: true,
    theme: 'dark',
    fontFamily: 'sans',
    fontSize: 16,
    coverType: 'text_only',
    coverImageSrc: '',
    authorName: '著者名',
    addToc: true,
    selectedCharacterIds: ['c-1'],
    selectedWorldIds: ['w-1'],
    addCharacterImages: false,
    afterword: 'これはあとがきです。',
};

describe('dataSlice.exportHtml — integration: section ordering & wiring', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('regression: exported HTML must place 登場人物 and 用語説明 sections BEFORE 本文', () => {
        const project = baseProject({
            settings: [characterFixture(), worldFixture()],
            novelContent: [{ id: 'n-1', text: '本文のテキストです。', chapterId: null }],
        });
        const html = captureExportedHtml(project, fullOptions);

        const charsIdx = html.indexOf('<h2>登場人物</h2>');
        const worldsIdx = html.indexOf('<h2>用語説明</h2>');
        const contentIdx = html.indexOf('<div class="content">');

        expect(charsIdx).toBeGreaterThan(-1);
        expect(worldsIdx).toBeGreaterThan(-1);
        expect(contentIdx).toBeGreaterThan(-1);
        expect(charsIdx).toBeLessThan(contentIdx);
        expect(worldsIdx).toBeLessThan(contentIdx);
    });

    it('should emit sections in order: cover → 登場人物 → 用語説明 → 目次 → 本文 → あとがき', () => {
        const project = baseProject({
            settings: [characterFixture(), worldFixture()],
            novelContent: [
                { id: 'ch-1', text: '# 第一章', chapterId: 'ch-1' },
                { id: 'n-1', text: '本文', chapterId: 'ch-1' },
            ],
        });
        const html = captureExportedHtml(project, fullOptions);

        const positions = [
            { name: 'cover', idx: html.indexOf('<div class="cover">') },
            { name: 'characters', idx: html.indexOf('<h2>登場人物</h2>') },
            { name: 'worlds', idx: html.indexOf('<h2>用語説明</h2>') },
            { name: 'toc', idx: html.indexOf('<h2>目次</h2>') },
            { name: 'content', idx: html.indexOf('<div class="content">') },
            { name: 'afterword', idx: html.indexOf('<h2>あとがき</h2>') },
        ];
        positions.forEach(p => expect(p.idx, `${p.name} section missing`).toBeGreaterThan(-1));

        const indices = positions.map(p => p.idx);
        const sorted = [...indices].sort((a, b) => a - b);
        expect(indices).toEqual(sorted);
    });

    it('wiring check: 登場人物 section must contain character names (not worlds)', () => {
        const project = baseProject({
            settings: [
                characterFixture({ id: 'c-1', name: 'キャラ名前', exportDescription: '' }),
                worldFixture({ id: 'w-1', name: '世界名前', longDescription: '' }),
            ],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, fullOptions);

        const charsSection = html.substring(
            html.indexOf('<h2>登場人物</h2>'),
            html.indexOf('<h2>用語説明</h2>'),
        );
        expect(charsSection).toContain('キャラ名前');
        expect(charsSection).not.toContain('世界名前');
    });

    it('regression: characters なしで世界観あり → 登場人物 section が出ず、世界観 → 本文 順は維持', () => {
        const project = baseProject({
            settings: [worldFixture()],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, selectedCharacterIds: [] });

        expect(html).not.toContain('<h2>登場人物</h2>');
        const worldsIdx = html.indexOf('<h2>用語説明</h2>');
        const contentIdx = html.indexOf('<div class="content">');
        expect(worldsIdx).toBeGreaterThan(-1);
        expect(worldsIdx).toBeLessThan(contentIdx);
    });

    it('regression: 世界観なしで characters あり → 世界観 section が出ず、登場人物 → 本文 順は維持', () => {
        const project = baseProject({
            settings: [characterFixture()],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, selectedWorldIds: [] });

        expect(html).not.toContain('<h2>用語説明</h2>');
        const charsIdx = html.indexOf('<h2>登場人物</h2>');
        const contentIdx = html.indexOf('<div class="content">');
        expect(charsIdx).toBeGreaterThan(-1);
        expect(charsIdx).toBeLessThan(contentIdx);
    });

    it('regression: あとがきなしで書き出し → あとがき section が出ず本文の後ろに余分なものがない', () => {
        const project = baseProject({
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, afterword: '' });

        expect(html).not.toContain('<h2>あとがき</h2>');
    });

    it('regression: 目次なし(addToc: false) → 用語説明の直後に本文が続く区切り線CSSが出力される', () => {
        const project = baseProject({
            settings: [worldFixture()],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, addToc: false, selectedCharacterIds: [] });

        expect(html).not.toContain('<h2>目次</h2>');
        expect(html).toContain('<h2>用語説明</h2>');
        expect(html).toContain('.appendix + .content');
    });

    it('用語説明 section に world と knowledge が world → knowledge の順で並ぶ', () => {
        const project = baseProject({
            settings: [worldFixture({ id: 'w-1', name: '魔法王国', longDescription: '魔法の国' })],
            knowledgeBase: [knowledgeFixture({ id: 'k-1', name: '霊脈', content: '魔力の通り道' })],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, selectedKnowledgeIds: ['k-1'] });

        expect(html).toContain('<h2>用語説明</h2>');
        const worldIdx = html.indexOf('魔法王国');
        const knowledgeIdx = html.indexOf('霊脈');
        expect(worldIdx).toBeGreaterThan(-1);
        expect(knowledgeIdx).toBeGreaterThan(-1);
        expect(worldIdx).toBeLessThan(knowledgeIdx);
        expect(html).toContain('魔力の通り道');
    });

    it('世界観なし + knowledge あり → 用語説明 section が knowledge だけで出る', () => {
        const project = baseProject({
            settings: [characterFixture()],
            knowledgeBase: [knowledgeFixture({ id: 'k-2', name: '魔導士団', content: '王国に仕える組織' })],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, selectedWorldIds: [], selectedKnowledgeIds: ['k-2'] });

        expect(html).toContain('<h2>用語説明</h2>');
        expect(html).toContain('魔導士団');
        expect(html).toContain('王国に仕える組織');
    });

    it('selectedKnowledgeIds 未指定 (後方互換) でも従来どおり world のみ出力される', () => {
        const project = baseProject({
            settings: [worldFixture()],
            knowledgeBase: [knowledgeFixture({ id: 'k-x', name: '出ないナレッジ', content: 'これは出ない' })],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, fullOptions);

        expect(html).toContain('<h2>用語説明</h2>');
        expect(html).toContain('魔法王国');
        expect(html).not.toContain('出ないナレッジ');
        expect(html).not.toContain('これは出ない');
    });

    it('全選択解除 (selectedWorldIds=[] + selectedKnowledgeIds=[]) → 用語説明 section が出ない', () => {
        const project = baseProject({
            settings: [worldFixture(), characterFixture()],
            knowledgeBase: [knowledgeFixture()],
            novelContent: [{ id: 'n-1', text: '本文', chapterId: null }],
        });
        const html = captureExportedHtml(project, { ...fullOptions, selectedWorldIds: [], selectedKnowledgeIds: [] });

        expect(html).not.toContain('<h2>用語説明</h2>');
    });
});
