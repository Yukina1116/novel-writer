import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// PR #233 (quota バグ修正・段階呼び出し化) で /code-review CONFIRMED の2件を static pin する。
// レンダリングテスト (RTL) はこのプロジェクトでは未導入のため、TimelineModal.handlers.test.ts と
// 同じ readFileSync + regex パターンで handleGenerate の実装を直接検証する。

describe('ImageGenerationModal.handleGenerate (PR #233 static pin)', () => {
    const source = readFileSync(resolve(__dirname, 'ImageGenerationModal.tsx'), 'utf-8');
    const handlerMatch = source.match(/const handleGenerate = async[\s\S]*?\n {4}\};/);

    it('handleGenerate 定義が抽出できる', () => {
        expect(handlerMatch).toBeTruthy();
    });

    it('回帰防止: setSelectedImage(null) を append の値に関わらず無条件に実行する', () => {
        // 追加生成時に旧選択画像がハイライトされたまま残る不整合バグ (code-review CONFIRMED) の
        // 修正を pin する。将来 setGeneratedImages([]) と対称にする「整理」で
        // if (!append) ブロック内に戻されると、この bug が再発する。
        const handler = handlerMatch![0];
        expect(handler).toMatch(/setSelectedImage\(null\);/);
        expect(handler).not.toMatch(/if \(!append\)\s*\{\s*setSelectedImage\(null\)/);
    });

    it('setGeneratedImages のリセットは !append の場合のみ実行する', () => {
        const handler = handlerMatch![0];
        expect(handler).toMatch(/if \(!append\)\s*\{\s*setGeneratedImages\(\[\]\);/);
    });

    it('PR #233 の目的機能: append=true の場合は既存配列に結果を追記し、false の場合は置換する', () => {
        // 三項演算子が逆転すると「追加生成」を押しても既存画像が消えて置換されるだけになり、
        // 段階呼び出し化 (quota バグ修正) の目的そのものが壊れる。
        const handler = handlerMatch![0];
        expect(handler).toMatch(/setGeneratedImages\(prev => append \? \[\.\.\.prev, \.\.\.result\] : result\);/);
    });

    it('Issue #232 計測: onGenerate に append (isAdditionalGeneration) を伝搬する', () => {
        // append を渡し忘れると、BE 側の recordImageGenerationKind が常に
        // isAdditionalGeneration=false として記録され、追加生成利用率が計測できなくなる。
        const handler = handlerMatch![0];
        expect(handler).toMatch(/onGenerate\(promptToUse, append\)/);
    });

    it('2026-07-12: isCoolingDown 中は generateContent を呼ばず早期 return する（Vertex AI quota 429 連発の予防）', () => {
        const handler = handlerMatch![0];
        expect(handler).toMatch(/if \(isCoolingDown\) return;/);
    });

    it('2026-07-12 (Codex review P1指摘対応): クールダウンは onGenerate の await 前に開始する（in-flight リクエスト中に閉じるボタンでモーダルを閉じてすぐ開き直すと、handleCloseRequest が isGeneratingImages を見ずに即 onClose するため、in-flight リクエストと新規リクエストが重複発行され quota を倍消費する回帰を防ぐ）', () => {
        const handler = handlerMatch![0];
        expect(handler).toMatch(/setCooldownUntil\(Date\.now\(\) \+ IMAGE_GENERATION_COOLDOWN_MS\);/);
        // setCooldownUntil が await onGenerate(...) より前に呼ばれる並び順であることを確認する。
        expect(handler).toMatch(/setCooldownUntil\(Date\.now\(\) \+ IMAGE_GENERATION_COOLDOWN_MS\);\s*\n\s*const result = await onGenerate/);
    });
});

describe('ImageGenerationModal クールダウンとバジー状態の分離 (2026-07-12 static pin)', () => {
    const source = readFileSync(resolve(__dirname, 'ImageGenerationModal.tsx'), 'utf-8');

    it('isBusy はクールダウンを含まない（「この画像で決定する」等の非API操作をクールダウン中もブロックしないため）', () => {
        // isBusy に isCoolingDown / cooldownRemainingSec が混入すると、API を呼ばない
        // handleFinalize やモード切替ボタンまでクールダウン中に無効化されてしまう回帰を防ぐ。
        expect(source).toMatch(/const isBusy = isLoadingChat \|\| isGeneratingImages;/);
    });

    it('handleRefine は isCoolingDown を明示的にチェックする（Ctrl+Enter ショートカット経由でボタンの disabled を迂回できるため）', () => {
        const refineMatch = source.match(/const handleRefine = async[\s\S]*?\n {4}\};/);
        expect(refineMatch).toBeTruthy();
        expect(refineMatch![0]).toMatch(/isBusy \|\| isCoolingDown/);
    });

    it('2026-07-12 (code-review medium CONFIRMED): クールダウンはモジュールレベル変数 sharedCooldownUntil から初期化する（モーダルは SettingModals.tsx の {isImageGenModalOpen && <ImageGenerationModal/>} で毎回アンマウント/リマウントされるため、useState 初期値をリテラルにするとモーダルを閉じてすぐ開き直すだけでクールダウンが回避できてしまう）', () => {
        expect(source).toMatch(/let sharedCooldownUntil: number \| null = null;/);
        expect(source).toMatch(/useState<number \| null>\(sharedCooldownUntil\)/);
    });

    it('2026-07-12 (pr-test-analyzer HIGH指摘対応): setCooldownUntil は sharedCooldownUntil への書き込みを伴う（読み取り初期化だけを検証しても、書き込み側 (sharedCooldownUntil = value;) が抜けるとモジュール変数が更新されず「閉じてすぐ開き直すとクールダウンが消える」バグが再発するため、書き込み側も直接 pin する）', () => {
        const setterMatch = source.match(/const setCooldownUntil = \(value: number \| null\) => \{[\s\S]*?\n {4}\};/);
        expect(setterMatch).toBeTruthy();
        expect(setterMatch![0]).toMatch(/sharedCooldownUntil = value;/);
        expect(setterMatch![0]).toMatch(/setCooldownUntilState\(value\);/);
    });

    it('2026-07-12 (code-review medium CONFIRMED): isOpen リセット useEffect はクールダウンを巻き込まない（旧実装は setCooldownUntil(null) をここで呼んでおり、モーダルの閉じ直しでクールダウンを無効化できた）', () => {
        const resetEffectMatch = source.match(/useEffect\(\(\) => \{\s*if \(isOpen\) \{[\s\S]*?\n {4}\}, \[isOpen, characterDescription\]\);/);
        expect(resetEffectMatch).toBeTruthy();
        expect(resetEffectMatch![0]).not.toMatch(/setCooldownUntil/);
        expect(resetEffectMatch![0]).not.toMatch(/setCooldownRemainingSec/);
    });

    it('2026-07-12 (code-review medium CONFIRMED): handleSendMessage（チャット経由の生成）は isCoolingDown 中に finalPrompt が来てもチャット上にフィードバックし、handleGenerate の無言の早期 return に落とさない（handleRefine/生成ボタンのみ isCoolingDown 対応で、チャットフローだけ漏れていた）', () => {
        const sendMessageMatch = source.match(/const handleSendMessage = async[\s\S]*?\n {4}\};/);
        expect(sendMessageMatch).toBeTruthy();
        expect(sendMessageMatch![0]).toMatch(/if \(finalPrompt\) \{\s*\n[\s\S]*?if \(isCoolingDown\) \{/);
    });

    it('2026-07-12 (pr-test-analyzer MEDIUM指摘対応): isCoolingDown 分岐は setChatHistory でユーザーに文言を見せ、else 節は handleGenerate 呼び出しを保持する（前者が欠けるとフィードバックが無言で消え、後者が欠けるとチャット経由の通常生成が全滅する。regex が isCoolingDown ブロックの存在だけを見て中身を見ないと両方の欠落を検出できないため中身まで pin する）', () => {
        const sendMessageMatch = source.match(/const handleSendMessage = async[\s\S]*?\n {4}\};/);
        const finalPromptBlock = sendMessageMatch![0].match(/if \(finalPrompt\) \{[\s\S]*?\n {8}\}/);
        expect(finalPromptBlock).toBeTruthy();
        expect(finalPromptBlock![0]).toMatch(/if \(isCoolingDown\) \{\s*\n\s*setChatHistory\(prev => \[\.\.\.prev, \{[\s\S]*?\}\]\);\s*\n\s*\} else \{\s*\n\s*await handleGenerate\(finalPrompt\);\s*\n\s*\}/);
    });
});
