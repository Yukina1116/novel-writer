import { describe, it, expect, vi } from 'vitest';
import { createKnowledgeApprover } from './knowledgeApproval';

type NameResult = { success: true; data: { name: string } } | { success: false; error: Error };

// 解決タイミングを手動制御できる generateName（通信中の状態を再現するため）
const deferredName = () => {
    const pending: Array<{ sentence: string; resolve: (r: NameResult) => void; reject: (e: unknown) => void }> = [];
    const generateName = vi.fn((sentence: string) => new Promise<NameResult>((resolve, reject) => {
        pending.push({ sentence, resolve, reject });
    }));
    return { generateName, pending };
};

const setup = (generateName: (s: string) => Promise<NameResult>) => {
    const saved: Array<{ name: string; content: string }> = [];
    const removed: string[] = [];
    const inFlightLog: string[][] = [];
    const errors: string[] = [];
    const approver = createKnowledgeApprover({
        generateName,
        saveKnowledge: (item) => { saved.push(item); },
        removeSuggestion: (s) => { removed.push(s.content); },
        onInFlightChange: (keys) => { inFlightLog.push([...keys]); },
        notifyError: (message) => { errors.push(message); },
    });
    return { approver, saved, removed, inFlightLog, errors };
};

const flush = () => new Promise(r => setTimeout(r, 0));

describe('createKnowledgeApprover', () => {
    it('REGRESSION: 同じ提案を通信中に 2 回承認しても、保存は 1 件で generateName も 1 回だけ', async () => {
        const { generateName, pending } = deferredName();
        const { approver, saved } = setup(generateName);

        const first = approver.approve({ content: '提案A' });
        const second = approver.approve({ content: '提案A' }); // スピナーが消えて有効に見えたボタンの再押下
        pending[0].resolve({ success: true, data: { name: '名前A' } });
        await Promise.all([first, second]);

        expect(generateName).toHaveBeenCalledTimes(1);
        expect(saved).toEqual([{ name: '名前A', content: '提案A' }]);
    });

    it('REGRESSION: 異なる 2 件を並行承認すると、両方保存され、一方の完了で他方の「通信中」が消えない', async () => {
        const { generateName, pending } = deferredName();
        const { approver, saved, inFlightLog } = setup(generateName);

        const a = approver.approve({ content: '提案A' });
        const b = approver.approve({ content: '提案B' });
        expect(approver.isInFlight('提案A')).toBe(true);
        expect(approver.isInFlight('提案B')).toBe(true);

        pending[0].resolve({ success: true, data: { name: '名前A' } });
        await a;
        // A 完了後も B は通信中のまま（旧実装は finally の null 上書きで B が待機中に見えた）
        expect(approver.isInFlight('提案A')).toBe(false);
        expect(approver.isInFlight('提案B')).toBe(true);
        expect(inFlightLog[inFlightLog.length - 1]).toEqual(['提案B']);

        pending[1].resolve({ success: true, data: { name: '名前B' } });
        await b;
        expect(saved.map(s => s.content).sort()).toEqual(['提案A', '提案B']);
        expect(approver.isInFlight('提案B')).toBe(false);
    });

    it('完了後は同じ提案を再度承認できる（in-flight が解放される）', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => ({ success: true, data: { name: 'N' } }));
        const { approver, saved } = setup(generateName);

        await approver.approve({ content: '提案A' });
        await approver.approve({ content: '提案A' });

        expect(saved).toHaveLength(2);
    });

    it('名前生成が success:false でも、本文を名前にして 1 件だけ保存する', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => ({ success: false, error: new Error('AUTH_REQUIRED') }));
        const { approver, saved, removed } = setup(generateName);

        await approver.approve({ content: '提案A' });

        expect(saved).toEqual([{ name: '提案A', content: '提案A' }]);
        expect(removed).toEqual(['提案A']); // フォールバック保存後も提案は一覧から除去される
    });

    it('名前生成が例外を投げても、本文を名前にして 1 件だけ保存し、in-flight を解放する', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => { throw new Error('network down'); });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { approver, saved, removed } = setup(generateName);

        await approver.approve({ content: '提案A' });

        expect(saved).toEqual([{ name: '提案A', content: '提案A' }]);
        expect(removed).toEqual(['提案A']);
        expect(approver.isInFlight('提案A')).toBe(false);
        errorSpy.mockRestore();
    });

    it('保存後に提案を一覧から除去する。履歴由来（id あり）は id も渡す', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => ({ success: true, data: { name: 'N' } }));
        const removed: Array<{ content: string; id?: string }> = [];
        const approver = createKnowledgeApprover({
            generateName,
            saveKnowledge: () => {},
            removeSuggestion: (s) => { removed.push(s); },
            onInFlightChange: () => {},
        });

        await approver.approve({ content: '提案A', id: 'h1' });

        expect(removed).toEqual([{ content: '提案A', id: 'h1' }]);
    });

    it('境界: 空文字の提案も二重承認されない', async () => {
        const { generateName, pending } = deferredName();
        const { approver, saved } = setup(generateName);

        const p1 = approver.approve({ content: '' });
        const p2 = approver.approve({ content: '' });
        pending[0].resolve({ success: true, data: { name: 'N' } });
        await Promise.all([p1, p2]);

        expect(generateName).toHaveBeenCalledTimes(1);
        expect(saved).toHaveLength(1);
    });

    it('保存が例外を投げても in-flight は解放され、保存を二重に試みない', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => ({ success: true, data: { name: 'N' } }));
        const saveKnowledge = vi.fn(() => { throw new Error('save failed'); });
        const removeSuggestion = vi.fn();
        const errors: string[] = [];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const approver = createKnowledgeApprover({
            generateName,
            saveKnowledge,
            removeSuggestion,
            onInFlightChange: () => {},
            notifyError: (m) => { errors.push(m); },
        });

        await approver.approve({ content: '提案A' });
        await flush();

        expect(saveKnowledge).toHaveBeenCalledTimes(1); // 旧実装は catch で再度 save していた
        expect(removeSuggestion).not.toHaveBeenCalled(); // 保存失敗で提案が消えると承認内容が失われる
        expect(errors).toHaveLength(1); // ユーザーに失敗を通知する（console のみの握りつぶしにしない）
        expect(approver.isInFlight('提案A')).toBe(false);
        errorSpy.mockRestore();
    });

    it('通知列: 並行 A/B は [[A],[A,B],[B],[]]、重複呼び出しは通知を増やさない', async () => {
        const { generateName, pending } = deferredName();
        const { approver, inFlightLog } = setup(generateName);

        const a = approver.approve({ content: '提案A' });
        const b = approver.approve({ content: '提案B' });
        void approver.approve({ content: '提案A' }); // 無視される重複呼び出し
        pending[0].resolve({ success: true, data: { name: 'NA' } });
        await a;
        pending[1].resolve({ success: true, data: { name: 'NB' } });
        await b;

        expect(inFlightLog).toEqual([['提案A'], ['提案A', '提案B'], ['提案B'], []]);
    });

    it('通知列: 単独呼び出しは [[A],[]]（最後の提案の通信中表示が必ず消える）', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => ({ success: true, data: { name: 'N' } }));
        const { approver, inFlightLog } = setup(generateName);

        await approver.approve({ content: '提案A' });

        expect(inFlightLog).toEqual([['提案A'], []]);
    });

    it('失敗後も同じ提案を再承認できる（generateName・save が再度実行される）', async () => {
        const generateName = vi.fn(async (): Promise<NameResult> => { throw new Error('network down'); });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { approver, saved } = setup(generateName);

        await approver.approve({ content: '提案A' });
        await approver.approve({ content: '提案A' });

        expect(generateName).toHaveBeenCalledTimes(2);
        expect(saved).toHaveLength(2);
        errorSpy.mockRestore();
    });

    it('generateName が同期的に throw しても、本文を名前にして 1 件保存する', async () => {
        const generateName = vi.fn((): Promise<NameResult> => { throw new Error('sync throw'); });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { approver, saved } = setup(generateName);

        await approver.approve({ content: '提案A' });

        expect(saved).toEqual([{ name: '提案A', content: '提案A' }]);
        errorSpy.mockRestore();
    });

    it('同一 content で id だけ違う提案（一覧側と履歴側）は同一視され、通信中は二重承認されない', async () => {
        const { generateName, pending } = deferredName();
        const { approver, saved } = setup(generateName);

        const first = approver.approve({ content: '提案A' });
        const second = approver.approve({ content: '提案A', id: 'history-1' });
        pending[0].resolve({ success: true, data: { name: 'NA' } });
        await Promise.all([first, second]);

        expect(generateName).toHaveBeenCalledTimes(1);
        expect(saved).toHaveLength(1);
    });
});
