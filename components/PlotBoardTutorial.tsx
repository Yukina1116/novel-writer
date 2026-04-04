import React, { useState, useEffect } from 'react';
// FIX: The file 'store.ts' does not exist, changed import to 'store/index.ts'.
import { useStore } from '../store/index';

const plotBoardTutorialSteps = [
    {
        title: 'プロットボードへようこそ！',
        content: '物語の設計図を組み立てる場所です。章のあらすじや構成をカード形式で整理し、物語の全体像を掴みましょう。',
        targetId: null,
    },
    {
        title: '① 新規カードの作成',
        content: 'ここから新しいプロットカード（章のあらすじ、登場人物の行動など）を作成できます。',
        targetId: 'tutorial-plotboard-add-card-btn',
        placement: 'bottom',
    },
    {
        title: '② 関係性の追加',
        content: '「関係を追加」モードにしてカードを2つ選ぶと、「原因→結果」や「伏線→回収」といった関係性を線で結べます。',
        targetId: 'tutorial-plotboard-add-relation-btn',
        placement: 'bottom',
    },
    {
        title: '③ カードの移動',
        content: 'カードはドラッグ＆ドロップで自由に配置できます。あなたの思考に合わせて、見やすく整理しましょう。',
        targetId: 'tutorial-plotboard-canvas',
        placement: 'top-start',
    },
    {
        title: '④ 保存',
        content: '編集が終わったら、忘れずに保存ボタンを押してくださいね。',
        targetId: 'tutorial-plotboard-save-btn',
        placement: 'top',
    },
    {
        title: '準備完了！',
        content: 'これでプロットボードを使いこなせます！物語の骨格をしっかり組み立てていきましょう！',
        targetId: null,
    },
];

const getTargetPosition = (targetId) => {
    if (!targetId) return null;
    const element = document.getElementById(targetId);
    if (!element) return null;
    return element.getBoundingClientRect();
};

export const PlotBoardTutorial = () => {
    const isTutorialActive = useStore(state => state.isPlotBoardTutorialActive);
    const tutorialStep = useStore(state => state.plotBoardTutorialStep);
    const nextTutorialStep = useStore(state => state.nextPlotBoardTutorialStep);
    const endTutorial = useStore(state => state.endPlotBoardTutorial);
    
    const [position, setPosition] = useState(null);
    const [style, setStyle] = useState({});

    const currentStep = plotBoardTutorialSteps[tutorialStep];

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
                    border: '2px solid #22d3ee', // cyan-400
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
                popoverStyle.left = `${position.right - popoverWidth}px`;
                popoverStyle.transform = 'translateY(-100%)';
                break;
            case 'top-start':
                popoverStyle.top = `${position.top + gap}px`;
                popoverStyle.left = `${position.left + gap}px`;
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
        if (tutorialStep < plotBoardTutorialSteps.length - 1) {
            nextTutorialStep();
        } else {
            endTutorial();
        }
    }

    return (
        <>
            {position && <div style={style}></div>}
            <div style={{...popoverStyle, position: 'fixed'}} className="bg-gray-800 border border-cyan-400 rounded-lg shadow-2xl w-80 p-5 text-white">
                <h3 className="font-bold text-lg text-cyan-300 mb-2">{currentStep.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{currentStep.content}</p>
                <div className="flex justify-between items-center">
                    <button onClick={endTutorial} className="text-xs text-gray-400 hover:text-white">ツアーを終了</button>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{tutorialStep + 1} / {plotBoardTutorialSteps.length}</span>
                        <button onClick={handleNext} className="px-4 py-2 bg-cyan-500 text-white text-sm rounded-md hover:bg-cyan-400 transition">
                            {tutorialStep === plotBoardTutorialSteps.length - 1 ? '完了' : '次へ'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};