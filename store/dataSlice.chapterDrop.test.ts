import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import { normalizeChapterIds, UNCATEGORIZED_CHAPTER_ID, __resetChapterIdWarnState } from '../utils';
import type { Project, NovelChunk } from '../types';

// PR-2 (chapterId 移行): handleChapterDrop / handleSaveChapterSettings / handleDeleteChapter /
// addChapter / handleAddNewChunk / handleNovelTextChange の挙動を pin する。
// AC-1 (バグ修正本丸) / AC-2 (逆方向) / AC-6 (削除範囲) / AC-7 (昇格時 chapterId 一括) /
// AC-8 (末尾 append → 最終章) / AC-9 (R1 sync) を網羅。

beforeEach(() => {
    __resetChapterIdWarnState();
});

const baseProject = (novelContent: NovelChunk[] = []): Project => ({
    id: 'p-1',
    name: 'P',
    lastModified: new Date(0).toISOString(),
    settings: [],
    novelContent,
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
    displaySettings: {} as Project['displaySettings'],
});

interface FakeStore {
    state: Record<string, any>;
    set: (partial: any) => void;
    get: () => Record<string, any>;
}

const createFakeStore = (initial: Record<string, any>): FakeStore => {
    const fake: FakeStore = { state: { ...initial }, set: () => ({}), get: () => fake.state };
    fake.set = (partial: any) => {
        const next = typeof partial === 'function' ? partial(fake.state) : partial;
        fake.state = { ...fake.state, ...next };
    };
    fake.get = () => fake.state;
    return fake;
};

const mountSlice = (project: Project, extraState: Record<string, any> = {}) => {
    const fake = createFakeStore({});
    const slice = createDataSlice(fake.set, fake.get);
    let capturedUpdater: ((d: Project) => Project) | null = null;
    fake.state = {
        ...slice,
        activeProjectId: 'p-1',
        allProjectsData: { 'p-1': project },
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showToast: vi.fn(),
        addHistory: vi.fn(),
        markDirty: vi.fn(),
        setActiveProjectData: (updater: (d: Project) => Project) => {
            capturedUpdater = updater;
        },
        ...extraState,
    };
    return { slice, fake, getUpdated: () => capturedUpdater!(project) };
};

const mkChunk = (id: string, text: string, chapterIdOverride?: string | null): NovelChunk => ({
    id,
    text,
    ...(chapterIdOverride !== undefined ? { chapterId: chapterIdOverride } : {}),
});

describe('handleChapterDrop (AC-1, AC-2: uncategorized chunks are not absorbed by named chapter on drag)', () => {
    it('AC-1: drag 名前付き章 ONTO uncategorized → uncategorized chunks の chapterId は null のまま', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文A'),         // uncategorized
            mkChunk('B', '# 第1章'),       // title
            mkChunk('C', '第1章本文'),    // body of 第1章
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project, { draggedChapterId: 'B' });

        // drop 第1章 onto uncategorized group
        slice.handleChapterDrop(UNCATEGORIZED_CHAPTER_ID);

        const updated = getUpdated();
        // 配列順は変わったが chunk A の chapterId は null のまま (バグ修正本丸)
        expect(updated.novelContent.map(c => ({ id: c.id, chapterId: c.chapterId }))).toEqual([
            { id: 'B', chapterId: 'B' },
            { id: 'C', chapterId: 'B' },
            { id: 'A', chapterId: null },
        ]);
    });

    it('AC-2: drag uncategorized ONTO 第2章 → uncategorized chunks の chapterId は null のまま', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文A'),
            mkChunk('B', '# 第1章'),
            mkChunk('C', '第1章本文'),
            mkChunk('D', '# 第2章'),
            mkChunk('E', '第2章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project, { draggedChapterId: UNCATEGORIZED_CHAPTER_ID });

        slice.handleChapterDrop('D');

        const updated = getUpdated();
        // A は配列上 D の前に入っているが chapterId は null 維持
        expect(updated.novelContent.map(c => ({ id: c.id, chapterId: c.chapterId }))).toEqual([
            { id: 'B', chapterId: 'B' },
            { id: 'C', chapterId: 'B' },
            { id: 'A', chapterId: null },
            { id: 'D', chapterId: 'D' },
            { id: 'E', chapterId: 'D' },
        ]);
    });

    it('drag 第2章 ONTO 第1章 → 第2章 chunks が第1章の前に移動、chapterId は維持', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '# 第1章'),
            mkChunk('B', '第1章本文'),
            mkChunk('C', '# 第2章'),
            mkChunk('D', '第2章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project, { draggedChapterId: 'C' });

        slice.handleChapterDrop('A');

        const updated = getUpdated();
        expect(updated.novelContent.map(c => c.id)).toEqual(['C', 'D', 'A', 'B']);
        expect(updated.novelContent.find(c => c.id === 'D')?.chapterId).toBe('C');
        expect(updated.novelContent.find(c => c.id === 'B')?.chapterId).toBe('A');
    });

    it('drag same group on itself → no-op', () => {
        const content = normalizeChapterIds([mkChunk('A', '# 第1章'), mkChunk('B', '本文')]);
        const project = baseProject(content);
        const { slice, fake } = mountSlice(project, { draggedChapterId: 'A' });
        const before = JSON.stringify(fake.state.allProjectsData['p-1'].novelContent);
        slice.handleChapterDrop('A');
        const after = JSON.stringify(fake.state.allProjectsData['p-1'].novelContent);
        expect(after).toBe(before);
    });
});

describe('handleDeleteChapter (AC-6: deletion limited to chapterId range)', () => {
    it('deletes only chunks belonging to the target chapterId group', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文A'),
            mkChunk('B', '# 第1章'),
            mkChunk('C', '第1章本文'),
            mkChunk('D', '# 第2章'),
            mkChunk('E', '第2章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleDeleteChapter('B'); // delete 第1章 group

        const updated = getUpdated();
        expect(updated.novelContent.map(c => c.id)).toEqual(['A', 'D', 'E']);
        expect(updated.novelContent.find(c => c.id === 'A')?.chapterId).toBe(null);
        expect(updated.novelContent.find(c => c.id === 'D')?.chapterId).toBe('D');
    });

    it('handler accepts UNCATEGORIZED_CHAPTER_ID even though UI hides the delete button for it', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文A'),
            mkChunk('B', '# 第1章'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleDeleteChapter(UNCATEGORIZED_CHAPTER_ID);

        const updated = getUpdated();
        expect(updated.novelContent.map(c => c.id)).toEqual(['B']);
    });

    it('no-op when groupId is unknown', () => {
        const content = normalizeChapterIds([mkChunk('A', '# 第1章')]);
        const project = baseProject(content);
        const { slice, fake } = mountSlice(project);

        slice.handleDeleteChapter('GHOST');

        // setActiveProjectData が呼ばれないので fake.state は不変
        expect(fake.state.allProjectsData['p-1'].novelContent).toHaveLength(1);
    });
});

describe('handleSaveChapterSettings (AC-7: uncategorized → named promotion sets chapterId on all uncategorized chunks)', () => {
    it('inserts a new title chunk and re-tags all chapterId=null chunks with the new title chunk id', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文A'),
            mkChunk('B', '本文B'),
            mkChunk('C', '# 既存章'),
            mkChunk('D', '既存章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleSaveChapterSettings({ id: UNCATEGORIZED_CHAPTER_ID, newTitle: '新章', newMemo: 'メモ', isUncategorized: true });

        const updated = getUpdated();
        // 新 title chunk が最初の uncategorized chunk の位置に挿入される
        expect(updated.novelContent[0].text).toBe('# 新章');
        expect(updated.novelContent[0].chapterId).toBe(updated.novelContent[0].id);
        // 元 uncategorized chunks (A, B) は新 title chunk の id を継承
        const newId = updated.novelContent[0].id;
        expect(updated.novelContent[1].id).toBe('A');
        expect(updated.novelContent[1].chapterId).toBe(newId);
        expect(updated.novelContent[2].id).toBe('B');
        expect(updated.novelContent[2].chapterId).toBe(newId);
        // 既存章は不変
        expect(updated.novelContent.find(c => c.id === 'C')?.chapterId).toBe('C');
        expect(updated.novelContent.find(c => c.id === 'D')?.chapterId).toBe('C');
    });

    it('renaming an existing named chapter does NOT change chapterId', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '# 旧名'),
            mkChunk('B', '本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleSaveChapterSettings({ id: 'A', newTitle: '新名', newMemo: 'メモ', isUncategorized: false });

        const updated = getUpdated();
        expect(updated.novelContent[0].text).toBe('# 新名');
        expect(updated.novelContent[0].chapterId).toBe('A');
        expect(updated.novelContent[1].chapterId).toBe('A');
    });
});

describe('addChapter / handleAddNewChunk (AC-8: chapterId assignment on new chunks)', () => {
    it('addChapter assigns chapterId === self.id on the new title chunk', () => {
        const project = baseProject([]);
        const { slice, getUpdated } = mountSlice(project);

        slice.addChapter();

        const updated = getUpdated();
        expect(updated.novelContent).toHaveLength(1);
        const created = updated.novelContent[0];
        expect(created.text).toBe('# 無題の章');
        expect(created.chapterId).toBe(created.id);
    });

    it('handleAddNewChunk inherits chapterId from the last chunk (R2: last-chapter append)', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '# 第1章'),
            mkChunk('B', '本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project, { newChunkText: '新しい段落' });

        slice.handleAddNewChunk();

        const updated = getUpdated();
        expect(updated.novelContent).toHaveLength(3);
        // 末尾 chunk が 'A' の chapterId を継承
        expect(updated.novelContent[2].chapterId).toBe('A');
    });

    it('handleAddNewChunk on an empty novel assigns chapterId=null', () => {
        const project = baseProject([]);
        const { slice, getUpdated } = mountSlice(project, { newChunkText: '初めての段落' });

        slice.handleAddNewChunk();

        const updated = getUpdated();
        expect(updated.novelContent[0].chapterId).toBe(null);
    });
});

describe('handleNovelTextChange (AC-9: R1 sync — # add/remove updates chapterId)', () => {
    it('adding "# " to a body chunk promotes it AND re-tags following same-chapter chunks (F-B)', () => {
        // F-B: body→title 昇格時、編集 chunk 以降、次の title 直前までの同 chapterId chunks を
        // 新 title 配下に取り込む (group 連続性 invariant 維持)
        const content = normalizeChapterIds([
            mkChunk('A', '本文1'),         // chapterId=null
            mkChunk('B', '本文2'),         // chapterId=null、これを title 化
            mkChunk('C', '本文3'),         // chapterId=null (B と同じ章だったので B に取り込まれる)
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleNovelTextChange('B', '# 第1章');

        const updated = getUpdated();
        const b = updated.novelContent.find(c => c.id === 'B')!;
        expect(b.text).toBe('# 第1章');
        expect(b.chapterId).toBe('B');
        expect(updated.novelContent.find(c => c.id === 'A')?.chapterId).toBe(null); // 前は touch しない
        expect(updated.novelContent.find(c => c.id === 'C')?.chapterId).toBe('B'); // F-B: 後続が新章に取り込まれる
    });

    it('body→title 昇格は次の title chunk 直前で停止し、それ以降の章は触らない (F-B 境界)', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文1'),         // null、編集対象に取り込まれる
            mkChunk('B', '本文2'),         // null、これを title 化
            mkChunk('C', '本文3'),         // null → B 配下
            mkChunk('D', '# 既存章'),       // 境界、ここで stop
            mkChunk('E', '既存章本文'),   // 元から D 配下、触らない
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleNovelTextChange('B', '# 新章');

        const updated = getUpdated();
        expect(updated.novelContent.find(c => c.id === 'A')?.chapterId).toBe(null); // 前 chunk
        expect(updated.novelContent.find(c => c.id === 'B')?.chapterId).toBe('B'); // self
        expect(updated.novelContent.find(c => c.id === 'C')?.chapterId).toBe('B'); // F-B: 取り込み
        expect(updated.novelContent.find(c => c.id === 'D')?.chapterId).toBe('D'); // 境界、不変
        expect(updated.novelContent.find(c => c.id === 'E')?.chapterId).toBe('D'); // 触らない
    });

    it('removing "# " from a title chunk demotes it (chapterId inherited from previous chunk)', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文'),
            mkChunk('B', '# 第1章'),
            mkChunk('C', '第1章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleNovelTextChange('B', 'もう章じゃない');

        const updated = getUpdated();
        const b = updated.novelContent.find(c => c.id === 'B')!;
        expect(b.text).toBe('もう章じゃない');
        expect(b.chapterId).toBe(null);
        expect(updated.novelContent.find(c => c.id === 'C')?.chapterId).toBe(null);
    });

    it('body→body edits do NOT trigger normalize (perf optimization)', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '本文1'),
            mkChunk('B', '本文2'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleNovelTextChange('A', '本文1 編集後');

        const updated = getUpdated();
        expect(updated.novelContent.find(c => c.id === 'A')?.text).toBe('本文1 編集後');
        expect(updated.novelContent.find(c => c.id === 'A')?.chapterId).toBe(null);
        expect(updated.novelContent.find(c => c.id === 'B')?.chapterId).toBe(null);
    });

    it('!oldChunk 経路: 存在しない chunkId への onChange は state を変えず dev warn を出す (F-C: data loss 防止)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const content = normalizeChapterIds([mkChunk('A', '本文')]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleNovelTextChange('GHOST', 'lost text');
        const updated = getUpdated(); // updater を起動して warn 経路を実行 + 戻り値を確認

        // updater は d をそのまま返す = state 不変
        expect(updated.novelContent).toHaveLength(1);
        expect(updated.novelContent[0].text).toBe('本文');
        // paired signal: dev warn が text 喪失を可視化
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('text 喪失リスク'),
            expect.objectContaining({ chunkId: 'GHOST' }),
        );
        warn.mockRestore();
    });
});

describe('handleAddNewChunk title invariant (F-A: # 始まりは self.id)', () => {
    it('直接入力で `# 第2章\\n\\n本文` を一度に追加すると title chunk は self.id、後続 body は新章配下に入る', () => {
        const content = normalizeChapterIds([mkChunk('A', '# 第1章'), mkChunk('B', '本文')]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project, { newChunkText: '# 第2章\n\n第2章の本文' });

        slice.handleAddNewChunk();

        const updated = getUpdated();
        expect(updated.novelContent).toHaveLength(4);
        const newTitle = updated.novelContent[2];
        const newBody = updated.novelContent[3];
        expect(newTitle.text).toBe('# 第2章');
        expect(newTitle.chapterId).toBe(newTitle.id); // F-A: title chunk は self.id
        expect(newBody.text).toBe('第2章の本文');
        expect(newBody.chapterId).toBe(newTitle.id); // 直前 chunk (= 新 title) を継承
    });

    it('直接入力が title 単独 (`# 第2章` のみ) でも self.id', () => {
        const content = normalizeChapterIds([mkChunk('A', '# 第1章'), mkChunk('B', '本文')]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project, { newChunkText: '# 第2章' });

        slice.handleAddNewChunk();

        const updated = getUpdated();
        const last = updated.novelContent[updated.novelContent.length - 1];
        expect(last.chapterId).toBe(last.id);
    });
});
