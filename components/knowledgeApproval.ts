// ナレッジ提案の承認ロジック（pure module）。
// store / firebase / React 依存を持たない（component 経由の import だと transitive import で test が壊れるため）。
//
// 解決する問題: 承認中の提案を state 1 つ（string | null）でしか持たないと、複数提案を続けて承認したとき
// 後から押した方がスピナーを上書きし、先に終わった方の finally が null に戻すため、通信中の提案が
// 待機中に見えてボタンが再び有効になり、二重承認（= 重複保存 + API の余分な課金）が起きていた。

export interface KnowledgeSuggestionRef {
    content: string;
    id?: string;
}

type GenerateNameResult = { success: true; data: { name: string } } | { success: false };

export interface KnowledgeApproverDeps {
    generateName: (sentence: string) => Promise<GenerateNameResult>;
    saveKnowledge: (item: { name: string; content: string }) => void;
    removeSuggestion: (suggestion: KnowledgeSuggestionRef) => void;
    /** 通信中の提案（content）の一覧が変わるたびに呼ばれる（UI のスピナー/無効化用） */
    onInFlightChange: (inFlightContents: string[]) => void;
}

export const createKnowledgeApprover = (deps: KnowledgeApproverDeps) => {
    // state ではなく同期的な Set でガードする（React state は非同期更新のため二重クリックを防ぎきれない）
    const inFlight = new Set<string>();
    const notify = () => deps.onInFlightChange([...inFlight]);

    const approve = async (suggestion: KnowledgeSuggestionRef): Promise<void> => {
        if (inFlight.has(suggestion.content)) return;
        inFlight.add(suggestion.content);
        notify();
        try {
            // 名前生成の失敗（success:false / 例外）は本文を名前にするフォールバックで吸収し、保存は常に 1 回だけ行う
            let name = suggestion.content;
            try {
                const result = await deps.generateName(suggestion.content);
                if (result.success) name = result.data.name;
            } catch (error) {
                console.error('Error generating knowledge name:', error);
            }
            deps.saveKnowledge({ name, content: suggestion.content });
            deps.removeSuggestion(suggestion);
        } catch (error) {
            console.error('Error approving knowledge suggestion:', error);
        } finally {
            inFlight.delete(suggestion.content);
            notify();
        }
    };

    return { approve, isInFlight: (content: string) => inFlight.has(content) };
};
