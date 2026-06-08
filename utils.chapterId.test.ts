import { describe, expect, it } from 'vitest';
import {
    UNCATEGORIZED_CHAPTER_ID,
    isChapterTitleChunk,
    extractChapterTitle,
    normalizeChapterIds,
    getChapterGroups,
    getChapterChunksByGroupId,
    getChapterIdForNewChunk,
    validateAndSanitizeProjectData,
} from './utils';
import { NovelChunk } from './types';

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

describe('getChapterGroups (AC-12: continuity-friendly grouping)', () => {
    it('groups chunks by chapterId in first-appearance order', () => {
        const normalized = normalizeChapterIds([
            chunk('A', '本文1'),
            chunk('B', '# 第1章'),
            chunk('C', '本文2'),
        ]);
        const groups = getChapterGroups(normalized);
        expect(groups).toHaveLength(2);
        expect(groups[0].groupId).toBe(UNCATEGORIZED_CHAPTER_ID);
        expect(groups[0].titleChunk).toBeNull();
        expect(groups[0].chunks.map(c => c.id)).toEqual(['A']);
        expect(groups[1].groupId).toBe('B');
        expect(groups[1].titleChunk?.id).toBe('B');
        expect(groups[1].chunks.map(c => c.id)).toEqual(['B', 'C']);
    });

    it('emits no groups for an empty novelContent', () => {
        expect(getChapterGroups([])).toEqual([]);
    });

    it('merges non-contiguous chunks of the same chapterId (invariant violation tolerance)', () => {
        // 本来は invariant 違反だが、merge 自体は機能する (UI 側は順序が壊れて見える)
        const input: NovelChunk[] = [
            { id: 'A', text: '# 第1章', chapterId: 'A' },
            { id: 'B', text: '本文1', chapterId: null }, // uncategorized between
            { id: 'C', text: '本文2', chapterId: 'A' },
        ];
        const groups = getChapterGroups(input);
        expect(groups).toHaveLength(2);
        const ch1 = groups.find(g => g.groupId === 'A')!;
        expect(ch1.chunks.map(c => c.id)).toEqual(['A', 'C']);
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
        // 通常 normalize 後は undefined はないが、未正規化データへの防御
        const input: NovelChunk[] = [{ id: 'A', text: '本文' }];
        expect(getChapterIdForNewChunk(input)).toBeNull();
    });
});

describe('validateAndSanitizeProjectData — migration entry point', () => {
    const makeProject = (novelContent: any) => ({
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

    it('strips non-string non-null chapterId values before normalization', () => {
        const project = makeProject([
            { id: 'A', text: '本文1', chapterId: 12345 }, // invalid type
            { id: 'B', text: '# 第1章', chapterId: { weird: true } }, // invalid type
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
});
