import React, { useState, useEffect } from 'react';
// FIX: The file 'store.ts' does not exist, changed import to 'store/index.ts'.
import { useStore } from '../store/index';

const knowledgeTutorialSteps = [
    {
        title: 'ナレッジベースへようこそ！',
        content: 'ここは物語の「ルールブック」です。キャラクターの設定や世界の法則など、AIに守ってほしい不変のルールを記録しましょう。',
        targetId: null,
    },
    {
        title: '① 新規項目の作成',
        content: 'まずは新しい設定項目を追加してみましょう。キャラクター名、地名、魔法のルールなど、何でも登録できます。',
        targetId: 'tutorial-kb-add-btn',
        placement: 'bottom',
    },
    {
        title: '② 検索機能',
        content: '設定が増えてきたら、ここでキーワード検索ができます。項目名だけでなく、内容やタグも検索対象です。',
        targetId: 'tutorial-kb-search',
        placement: 'bottom',
    },
    {
        title: '③ タグでの絞り込み',
        content: '項目に付けたタグで、関連する設定だけを絞り込んで表示できます。「重要アイテム」や「伏線」などのタグを作ると便利です。',
        targetId: 'tutorial-kb-tags',
        placement: 'bottom',
    },
    {
        title: '④ 項目の管理',
        content: '作成した項目はここに一覧表示されます。ピン留めして常にAIに強く意識させたり、編集や削除ができます。',
        targetId: 'tutorial-kb-item-list',
        placement: 'right',
    },
    {
        title: '準備完了！',
        content: 'これでナレッジベースを使いこなせますね！設定を充実させて、物語に深みを与えましょう！',
        targetId: null,
    },
];

const getTargetPosition = (targetId) => {
    if (!targetId) return null;
    const element = document.getElementById(targetId);
    if (!element) return null;
    return element.getBoundingClientRect();
};

export const KnowledgeTutorial = () => {
    const isTutorialActive = useStore(state => state.isKnowledgeTutorialActive);
    const tutorialStep = useStore(state => state.knowledgeTutorialStep);
    const nextTutorialStep = useStore(state => state.nextKnowledgeTutorialStep);
    const endTutorial = useStore(state => state.endKnowledgeTutorial);
    
    const [position, setPosition] = useState(null);
    const [style, setStyle] = useState({});

    const currentStep = knowledgeTutorialSteps[tutorialStep];

    useEffect(() => {
        if (!isTutorialActive || !currentStep) return;

        const updatePosition = () => {
            const targetRect = getTargetPosition(currentStep.targetId);
            setPosition(targetRect);

            if (targetRect) {
                const highlightStyle = {
                    position: 'fixed',
                    top: `${targetRect.top - 4}px`,
                    left: `${targetRect.left - 4}px`,
                    width: `${targetRect.width + 8}px`,
                    height: `${targetRect.height + 8}px`,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
                    border: '2px solid #facc15', // yellow-400
                    borderRadius: '8px',
                    zIndex: 10000,
                    transition: 'all 0.3s ease-in-out',
                    pointerEvents: 'none',
                };
                setStyle(highlightStyle);
            } else {
                 setStyle({});
            }
        };

        const timer = setTimeout(updatePosition, 50); 
        
        const handleResize = () => updatePosition();
        window.addEventListener('resize', handleResize);
        
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
        };

    }, [isTutorialActive, tutorialStep, currentStep]);
    

    if (!isTutorialActive || !currentStep) return null;

    // FIX: Changed type to `any` to resolve incorrect TypeScript errors about missing properties on `React.CSSProperties`.
    const popoverStyle: any = { zIndex: 10001 };
    if (position) {
        const popoverWidth = 320; // w-80
        const gap = 12;

        switch (currentStep.placement) {
            case 'right':
                popoverStyle.top = `${position.top}px`;
                popoverStyle.left = `${position.right + gap}px`;
                break;
            case 'left':
                popoverStyle.top = `${position.top}px`;
                popoverStyle.left = `${position.left - popoverWidth - gap}px`;
                break;
            case 'top':
                popoverStyle.top = `${position.top - gap}px`;
                popoverStyle.left = `${position.left}px`;
                popoverStyle.transform = 'translateY(-100%)';
                break;
            case 'bottom':
            default:
                popoverStyle.top = `${position.bottom + gap}px`;
                popoverStyle.left = `${position.left}px`;
                break;
        }
    } else {
        popoverStyle.top = '50%';
        popoverStyle.left = '50%';
        popoverStyle.transform = 'translate(-50%, -50%)';
    }
    
    const handleNext = () => {
        if (tutorialStep < knowledgeTutorialSteps.length - 1) {
            nextTutorialStep();
        } else {
            endTutorial();
        }
    }

    return (
        <>
            {position && <div style={style}></div>}
            <div style={{...popoverStyle, position: 'fixed'}} className="bg-gray-800 border border-yellow-400 rounded-lg shadow-2xl w-80 p-5 text-white">
                <h3 className="font-bold text-lg text-yellow-300 mb-2">{currentStep.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{currentStep.content}</p>
                <div className="flex justify-between items-center">
                    <button onClick={endTutorial} className="text-xs text-gray-400 hover:text-white">ツアーを終了</button>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{tutorialStep + 1} / {knowledgeTutorialSteps.length}</span>
                        <button onClick={handleNext} className="px-4 py-2 bg-yellow-500 text-black text-sm rounded-md hover:bg-yellow-400 transition">
                            {tutorialStep === knowledgeTutorialSteps.length - 1 ? '完了' : '次へ'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};