import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    UNCATEGORIZED_CHAPTER_ID,
    isChapterTitleChunk,
    extractChapterTitle,
    normalizeChapterIds,
    getChapterGroups,
    getChapterChunksByGroupId,
    getChapterIdForNewChunk,
    getChapterChunks,
    validateAndSanitizeProjectData,
    __resetChapterIdWarnState,
} from './utils';
import { NovelChunk } from './types';

// dev-only warn は module-level Set で 1 度だけ発火するため、warn 検証テストの前に clear する。
beforeEach(() => {
    __resetChapterIdWarnState();
});

// PR-1 (chapterId 導入): AC-3 (migration 推論) / AC-4 (冪等性) / AC-5 (sanitizer) /
// AC-8 (末尾 append → 最終章) / AC-12 (group 連続性 invariant) を pin する。
// 既存の位置依存ロジックと等価な migration 結果を保証することが目的。

const chunk = (id: string, text: string, extra: Partial<NovelChunk> = {}): NovelChunk => ({
    id,
    text,
    ...extra,
});

describe('isChapterTitleChunk', () => {
    it('returns true for chunks whose text starts with "# "', () => {
        expect(isChapterTitleChunk(chunk('A', '# 第1章'))).toBe(true);
        expect(isChapterTitleChunk(chunk('A', '# 第1章\n本文'))).toBe(true);
    });

    it('returns false for body chunks, empty headings, and double-hash headings', () => {
        expect(isChapterTitleChunk(chunk('A', '本文'))).toBe(false);
        expect(isChapterTitleChunk(chunk('A', ''))).toBe(false);
        expect(isChapterTitleChunk(chunk('A', '## 第1節'))).toBe(false);
        expect(isChapterTitleChunk(chunk('A', '#第1章'))).toBe(false); // no space
    });
});

describe('extractChapterTitle', () => {
    it('returns the title text after "# " on the first line', () => {
        expect(extractChapterTitle(chunk('A', '# 第1章'))).toBe('第1章');
        expect(extractChapterTitle(chunk('A', '# 第1章\n本文行'))).toBe('第1章');
        expect(extractChapterTitle(chunk('A', '#   余白多め  '))).toBe('余白多め');
    });

    it('returns empty string for non-title chunks', () => {
        expect(extractChapterTitle(chunk('A', '本文'))).toBe('');
        expect(extractChapterTitle(chunk('A', ''))).toBe('');
    });
});

describe('normalizeChapterIds — migration (AC-3)', () => {
    it('infers chapterIds for old data where chapterId is undefined', () => {
        const input: NovelChunk[] = [
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
            chunk('D', '# 第2章'),
            chunk('E', '本文3'),
        ];
        const out = normalizeChapterIds(input);
        expect(out.map(c => ({ id: c.id, chapterId: c.chapterId }))).toEqual([
            { id: 'A', chapterId: null },
            { id: 'B', chapterId: 'B' },
            { id: 'C', chapterId: 'B' },
            { id: 'D', chapterId: 'D' },
            { id: 'E', chapterId: 'D' },
        ]);
    });

    it('handles novelContent with only uncategorized chunks', () => {
        const input = [chunk('A', '本文1'), chunk('B', '本文2')];
        const out = normalizeChapterIds(input);
        expect(out.every(c => c.chapterId === null)).toBe(true);
    });

    it('handles novelContent that starts with a title chunk', () => {
        const input = [chunk('A', '# 第1章'), chunk('B', '本文')];
        const out = normalizeChapterIds(input);
        expect(out[0].chapterId).toBe('A');
        expect(out[1].chapterId).toBe('A');
    });

    it('returns an empty array unchanged', () => {
        expect(normalizeChapterIds([])).toEqual([]);
    });

    it('does not mutate the input array', () => {
        const input = [chunk('A', '本文'), chunk('B', '# 第1章')];
        const snapshot = JSON.parse(JSON.stringify(input));
        normalizeChapterIds(input);
        expect(input).toEqual(snapshot);
    });
});

describe('normalizeChapterIds — idempotency (AC-4)', () => {
    it('returns identical chapterId values when re-applied', () => {
        const input: NovelChunk[] = [
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
            chunk('D', '# 第2章'),
            chunk('E', '本文3'),
        ];
        const once = normalizeChapterIds(input);
        const twice = normalizeChapterIds(once);
        expect(twice.map(c => c.chapterId)).toEqual(once.map(c => c.chapterId));
    });
});

describe('normalizeChapterIds — sanitizer (AC-5)', () => {
    it('forces title chunk chapterId to self.id even if it mismatches', () => {
        const input = [chunk('A', '# 第1章', { chapterId: 'WRONG' })];
        expect(normalizeChapterIds(input)[0].chapterId).toBe('A');
    });

    it('repairs dangling chapterId references (points to non-existent title) by inheriting from previous', () => {
        const input: NovelChunk[] = [
            chunk('A', '# 第1章'),
            chunk('B', '本文', { chapterId: 'GHOST' }),
        ];
        const out = normalizeChapterIds(input);
        expect(out[1].chapterId).toBe('A');
    });

    it('repairs chapterId pointing to a non-title chunk by inheriting from previous', () => {
        const input: NovelChunk[] = [
            chunk('A', '# 第1章'),
            chunk('B', '本文1'),
            chunk('C', '本文2', { chapterId: 'B' }), // B is not a title chunk
        ];
        const out = normalizeChapterIds(input);
        expect(out[2].chapterId).toBe('A');
    });

    it('treats forward references (chapterId pointing to a title that appears later) as invalid', () => {
        const input: NovelChunk[] = [
            chunk('A', '本文', { chapterId: 'C' }), // C comes later
            chunk('B', '本文2'),
            chunk('C', '# 第1章'),
        ];
        const out = normalizeChapterIds(input);
        expect(out[0].chapterId).toBe(null); // no previous chapter to inherit from
        expect(out[1].chapterId).toBe(null);
        expect(out[2].chapterId).toBe('C');
    });

    it('preserves an explicit null chapterId on body chunks (intentional uncategorized)', () => {
        const input: NovelChunk[] = [
            chunk('A', '# 第1章'),
            chunk('B', '本文', { chapterId: null }),
        ];
        const out = normalizeChapterIds(input);
        expect(out[1].chapterId).toBe(null);
    });
});

describe('getChapterGroups (AC-12: continuity-friendly grouping, discriminated union)', () => {
    it('emits discriminated union: uncategorized group has kind=uncategorized + titleChunk=null', () => {
        const normalized = normalizeChapterIds([
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
        ]);
        const groups = getChapterGroups(normalized);
        expect(groups).toHaveLength(2);

        const uncat = groups[0];
        expect(uncat.kind).toBe('uncategorized');
        expect(uncat.groupId).toBe(UNCATEGORIZED_CHAPTER_ID);
        expect(uncat.titleChunk).toBeNull();
        expect(uncat.chunks.map(c => c.id)).toEqual(['A']);

        const ch1 = groups[1];
        expect(ch1.kind).toBe('titled');
        expect(ch1.groupId).toBe('B');
        if (ch1.kind === 'titled') {
            expect(ch1.titleChunk.id).toBe('B');
        }
        expect(ch1.chunks.map(c => c.id)).toEqual(['B', 'C']);
    });

    it('emits no groups for an empty novelContent', () => {
        expect(getChapterGroups([])).toEqual([]);
    });

    it('merges non-contiguous chunks of the same chapterId (invariant violation tolerance)', () => {
        const input: NovelChunk[] = [
            { id: 'A', text: '# 第1章', chapterId: 'A' },
            { id: 'B', text: '本文1', chapterId: null },
            { id: 'C', text: '本文2', chapterId: 'A' },
        ];
        const groups = getChapterGroups(input);
        expect(groups).toHaveLength(2);
        const ch1 = groups.find(g => g.groupId === 'A')!;
        expect(ch1.chunks.map(c => c.id)).toEqual(['A', 'C']);
    });

    it('demotes orphan body chunks (chapterId points to title not yet seen) to uncategorized (I-3 補強)', () => {
        // 連続性違反: title 出現前の body chunk → 警告 + uncategorized 扱い
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const input: NovelChunk[] = [
            { id: 'orphan', text: '本文', chapterId: 'LATER' },
            { id: 'LATER', text: '# 第1章', chapterId: 'LATER' },
        ];
        const groups = getChapterGroups(input);
        expect(groups[0].kind).toBe('uncategorized');
        expect(groups[0].chunks.map(c => c.id)).toEqual(['orphan']);
        expect(groups[1].kind).toBe('titled');
        expect(groups[1].chunks.map(c => c.id)).toEqual(['LATER']);
        warn.mockRestore();
    });

    it('keeps the first title chunk as canonical when multiple titles share the same chapterId (I-3 前勝ち)', () => {
        const input: NovelChunk[] = [
            { id: 'T1', text: '# Title-1', chapterId: 'T1' },
            { id: 'T2', text: '# Title-2', chapterId: 'T1' }, // 後から来た title を同 group に混入させた異常データ
            { id: 'B', text: '本文', chapterId: 'T1' },
        ];
        const groups = getChapterGroups(input);
        expect(groups).toHaveLength(1);
        expect(groups[0].kind).toBe('titled');
        if (groups[0].kind === 'titled') {
            expect(groups[0].titleChunk.id).toBe('T1'); // 前勝ち
        }
    });
});

describe('getChapterChunksByGroupId', () => {
    it('returns chunks matching the given groupId in array order', () => {
        const normalized = normalizeChapterIds([
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
            chunk('D', '本文3'),
        ]);
        expect(getChapterChunksByGroupId(normalized, UNCATEGORIZED_CHAPTER_ID).map(c => c.id)).toEqual(['A']);
        expect(getChapterChunksByGroupId(normalized, 'B').map(c => c.id)).toEqual(['B', 'C', 'D']);
    });

    it('returns empty array for unknown groupId', () => {
        expect(getChapterChunksByGroupId([], 'X')).toEqual([]);
    });
});

describe('getChapterIdForNewChunk (AC-8: R2 last-chapter inheritance)', () => {
    it('returns null when novelContent is empty', () => {
        expect(getChapterIdForNewChunk([])).toBeNull();
    });

    it('returns the chapterId of the last chunk (named chapter case)', () => {
        const normalized = normalizeChapterIds([
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
        ]);
        expect(getChapterIdForNewChunk(normalized)).toBe('B');
    });

    it('returns null when last chunk is uncategorized', () => {
        const normalized = normalizeChapterIds([chunk('A', '本文1')]);
        expect(getChapterIdForNewChunk(normalized)).toBeNull();
    });

    it('treats undefined as null defensively', () => {
        const input: NovelChunk[] = [{ id: 'A', text: '本文' }];
        expect(getChapterIdForNewChunk(input)).toBeNull();
    });

    it('returns the title chunk id when novelContent ends with a title chunk (I-6: 新規 chunk は新章配下)', () => {
        const normalized = normalizeChapterIds([
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
            chunk('D', '# 第2章'), // title chunk が末尾
        ]);
        expect(getChapterIdForNewChunk(normalized)).toBe('D');
    });
});

describe('validateAndSanitizeProjectData — migration entry point', () => {
    const makeProject = (novelContent: unknown) => ({
        id: 'p1',
        name: 'test',
        lastModified: '2026-01-01T00:00:00Z',
        novelContent,
    });

    it('applies normalizeChapterIds to novelContent on load', () => {
        const project = makeProject([
            { id: 'A', text: '本文1' },
            { id: 'B', text: '# 第1章' },
            { id: 'C', text: '本文2' },
        ]);
        const out = validateAndSanitizeProjectData(project);
        expect(out.novelContent.map(c => c.chapterId)).toEqual([null, 'B', 'B']);
    });

    it('absorbs non-string non-null chapterId via normalizeChapterIds (no field deletion)', () => {
        const project = makeProject([
            { id: 'A', text: '本文1', chapterId: 12345 },
            { id: 'B', text: '# 第1章', chapterId: { weird: true } },
        ]);
        const out = validateAndSanitizeProjectData(project);
        expect(out.novelContent[0].chapterId).toBe(null);
        expect(out.novelContent[1].chapterId).toBe('B');
    });

    it('legacy bare-string novelContent is wrapped and assigned chapterId=null', () => {
        const project = makeProject('かつて文字列で保存された本文');
        const out = validateAndSanitizeProjectData(project);
        expect(out.novelContent).toHaveLength(1);
        expect(out.novelContent[0].chapterId).toBe(null);
    });

    it('does not mutate the input chunk objects (C-2: pure validator)', () => {
        const inputChunk: NovelChunk & { chapterId: unknown } = {
            id: 'A',
            text: '本文',
            chapterId: 12345 as unknown as string,
        };
        const project = makeProject([inputChunk]);
        validateAndSanitizeProjectData(project);
        // 入力 chunk の chapterId は元のまま (delete されない)
        expect(inputChunk.chapterId).toBe(12345);
        expect('chapterId' in inputChunk).toBe(true);
    });
});

describe('legacy getChapterChunks ↔ getChapterChunksByGroupId migration equivalence (C-1)', () => {
    // PR-2 で `handleChapterDrop` の呼び出しを旧 API → 新 API に切替える際の regression を防ぐ
    // 正規化後のデータでは「旧 API の chunkId 渡し」と「新 API の groupId 渡し」が同じ chunks 配列を返すこと。
    it.each([
        {
            label: 'all uncategorized',
            content: [chunk('A', '本文1'), chunk('B', '本文2')],
            uncatLegacyId: 'A',
        },
        {
            label: 'starts with title',
            content: [chunk('A', '# 第1章'), chunk('B', '本文1')],
            uncatLegacyId: null,
        },
        {
            label: 'uncategorized then two chapters',
            content: [
                chunk('U1', '本文先頭1'),
                chunk('U2', '本文先頭2'),
                chunk('C1', '# 第1章'),
                chunk('C1B', '第1章本文'),
                chunk('C2', '# 第2章'),
                chunk('C2B', '第2章本文'),
            ],
            uncatLegacyId: 'U1',
        },
        {
            label: 'titles only (no body)',
            content: [chunk('C1', '# 第1章'), chunk('C2', '# 第2章')],
            uncatLegacyId: null,
        },
    ])('case: $label', ({ content, uncatLegacyId }) => {
        const normalized = normalizeChapterIds(content);
        const groups = getChapterGroups(normalized);

        for (const grp of groups) {
            const newApiResult = getChapterChunksByGroupId(normalized, grp.groupId).map(c => c.id);
            const legacyKey = grp.kind === 'uncategorized' ? uncatLegacyId : grp.groupId;
            if (legacyKey == null) continue; // uncategorized が空 group のケース
            const legacyResult = getChapterChunks(content, legacyKey).map(c => c.id);
            expect(newApiResult).toEqual(legacyResult);
        }
    });

    it('returns empty array on unknown groupId / chunkId in both APIs', () => {
        const normalized = normalizeChapterIds([chunk('A', '# 第1章'), chunk('B', '本文')]);
        expect(getChapterChunksByGroupId(normalized, 'GHOST')).toEqual([]);
        expect(getChapterChunks([chunk('A', '# 第1章')], 'GHOST')).toEqual([]);
    });
});

describe('normalizeChapterIds — duplicate title id handling (C-3)', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('keeps both title chunks self-referenced when duplicate ids exist (defensive)', () => {
        // データ破損想定: 同 id の title chunk が 2 つ存在する。Set.add は冪等なので
        // 2 つめの title も chapterId === self.id に矯正される。後続 body chunk は
        // 直近 title の id (= 同じ文字列) を継承する。
        const input: NovelChunk[] = [
            { id: 'X', text: '# Title-A' },
            { id: 'Y', text: '本文1' },
            { id: 'X', text: '# Title-B (dup)' },
            { id: 'Z', text: '本文2' },
        ];
        const out = normalizeChapterIds(input);
        expect(out.map(c => c.chapterId)).toEqual(['X', 'X', 'X', 'X']);
    });
});

describe('normalizeChapterIds — dev warn for invariant violations (F4 paired signal)', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('warns when a non-string chapterId is found on a body chunk', () => {
        normalizeChapterIds([{ id: 'A', text: '本文', chapterId: 42 as unknown as string }]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('string でも null でもない'),
            expect.objectContaining({ rawType: 'number' }),
        );
    });

    it('warns when chapterId references a non-existent title chunk', () => {
        normalizeChapterIds([
            { id: 'A', text: '# Real' },
            { id: 'B', text: '本文', chapterId: 'GHOST' },
        ]);
        const messages = warn.mock.calls.map(c => c[0] as string);
        expect(messages.some(m => m.includes('存在しない title chunk'))).toBe(true);
    });

    it('does NOT warn for migration of undefined (旧データ正常系)', () => {
        normalizeChapterIds([
            { id: 'A', text: '本文1' },
            { id: 'B', text: '# 第1章' },
            { id: 'C', text: '本文2' },
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('does NOT warn for explicit null chapterId on body chunks', () => {
        normalizeChapterIds([{ id: 'A', text: '本文', chapterId: null }]);
        expect(warn).not.toHaveBeenCalled();
    });
});
