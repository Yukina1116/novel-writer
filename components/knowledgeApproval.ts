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
    /** 保存などに失敗したとき、ユーザーに見える形で通知する（console のみの握りつぶしにしない） */
    notifyError?: (message: string) => void;
    /** 名前生成の期限(ms)。既定 30 秒。超えたら本文を名前にして保存し、ロックを解く */
    nameTimeoutMs?: number;
    /** 失敗ではないがユーザーに知らせたいこと（期限切れで本文を名前にした、など）を通知する */
    notifyInfo?: (message: string) => void;
}

const DEFAULT_NAME_TIMEOUT_MS = 30_000;

class NameGenerationTimeoutError extends Error {}

// apiCall / fetch にはタイムアウトがないため、サーバーが応答しないと承認が永久に終わらず、
// 通信中の状態(= 承認・却下ボタンの無効化)が残り続ける。承認処理の内側だけで期限を設ける。
const withDeadline = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new NameGenerationTimeoutError()), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });

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
                const result = await withDeadline(
                    deps.generateName(suggestion.content),
                    deps.nameTimeoutMs ?? DEFAULT_NAME_TIMEOUT_MS,
                );
                if (result.success) name = result.data.name;
            } catch (error) {
                if (error instanceof NameGenerationTimeoutError) {
                    // 期限切れも他の失敗と同じく本文を名前にして保存する。打ち切って再試行させると、サーバー側で
                    // 元のリクエストが成功していた場合に別 requestId で二重課金になり得るため、再試行は求めない
                    console.error('Knowledge name generation timed out; using the body as the name');
                    deps.notifyInfo?.('名前の自動生成に時間がかかったため、本文を名前にして追加しました。');
                } else {
                    console.error('Error generating knowledge name:', error);
                }
            }
            deps.saveKnowledge({ name, content: suggestion.content });
            deps.removeSuggestion(suggestion);
        } catch (error) {
            console.error('Error approving knowledge suggestion:', error);
            deps.notifyError?.('ナレッジの追加に失敗しました。もう一度お試しください。');
        } finally {
            inFlight.delete(suggestion.content);
            notify();
        }
    };

    return { approve, isInFlight: (content: string) => inFlight.has(content) };
};
