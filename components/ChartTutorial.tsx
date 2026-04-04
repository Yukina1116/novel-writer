import React, { useState, useEffect } from 'react';
import { useStore } from '../store/index';

const chartTutorialSteps = [
    {
        title: '相関図へようこそ！',
        content: 'ここではキャラクター同士の関係性を視覚的に整理できます。ドラッグ＆ドロップで配置を自由に変更できます。',
        targetId: null,
    },
    {
        title: '① 移動モード',
        content: 'このモードでは、キャラクターのノードをドラッグして配置を変更したり、画面をスクロールしたりできます。',
        targetId: 'tutorial-chart-navigate-btn',
        placement: 'bottom',
    },
    {
        title: '② 関係の追加',
        content: '「関係を追加」モードにして、キャラクターを2人順番にクリックすると、新しい関係線を追加できます。',
        targetId: 'tutorial-chart-add-btn',
        placement: 'bottom',
    },
    {
        title: '③ 関係の削除',
        content: '「関係を削除」モードで線をクリックするか、2人のキャラクターを選択して、関係を削除できます。',
        targetId: 'tutorial-chart-delete-btn',
        placement: 'bottom',
    },
    {
        title: '④ 編集',
        content: '関係線をクリックすると、ラベルや色、呼び方を編集できます。',
        targetId: 'tutorial-chart-svg',
        placement: 'top-start',
    },
    {
        title: '⑤ 保存',
        content: '編集が終わったら、忘れずに保存ボタンを押してくださいね。',
        targetId: 'tutorial-chart-save-btn',
        placement: 'top',
    },
    {
        title: '準備完了！',
        content: '複雑な人間関係もこれでスッキリ整理できます！',
        targetId: null,
    },
];

const getTargetPosition = (targetId) => {
    if (!targetId) return null;
    const element = document.getElementById(targetId);
    if (!element) return null;
    return element.getBoundingClientRect();
};

export const ChartTutorial = () => {
    const isTutorialActive = useStore(state => state.isChartTutorialActive);
    const tutorialStep = useStore(state => state.chartTutorialStep);
    const nextTutorialStep = useStore(state => state.nextChartTutorialStep);
    const endTutorial = useStore(state => state.endChartTutorial);
    
    const [position, setPosition] = useState(null);
    const [style, setStyle] = useState({});

    const currentStep = chartTutorialSteps[tutorialStep];

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
                    border: '2px solid #8b5cf6', // violet-500
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

        const timer = setTimeout(updatePosition, 100); 
        
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
        const popoverWidth = 320; 
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
        if (tutorialStep < chartTutorialSteps.length - 1) {
            nextTutorialStep();
        } else {
            endTutorial();
        }
    }

    return (
        <>
            {position && <div style={style}></div>}
            <div style={{...popoverStyle, position: 'fixed'}} className="bg-gray-800 border border-violet-400 rounded-lg shadow-2xl w-80 p-5 text-white">
                <h3 className="font-bold text-lg text-violet-300 mb-2">{currentStep.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{currentStep.content}</p>
                <div className="flex justify-between items-center">
                    <button onClick={endTutorial} className="text-xs text-gray-400 hover:text-white">ツアーを終了</button>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{tutorialStep + 1} / {chartTutorialSteps.length}</span>
                        <button onClick={handleNext} className="px-4 py-2 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-500 transition">
                            {tutorialStep === chartTutorialSteps.length - 1 ? '完了' : '次へ'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};