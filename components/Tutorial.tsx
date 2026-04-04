import React, { useState, useEffect, useMemo } from 'react';
// FIX: The file 'store.ts' does not exist, changed import to 'store/index.ts'.
import { useStore } from '../store/index';
import * as Icons from '../icons';

const pcTutorialSteps = [
    {
        title: 'STEP1: プロジェクト画面へようこそ！',
        content: 'ここで物語のタイトルを決めたり、過去の作品を開いたりできます。まずは全体を見ていきましょう！',
        targetId: null,
    },
    {
        title: 'STEP2: 左パネル（設定ライブラリ）',
        content: '物語の心臓部！キャラクター、世界観、年表など、物語の重要な設定をすべてここで管理します。',
        targetId: 'tutorial-left-panel',
        placement: 'right',
    },
    {
        title: 'STEP3: 右パネル（AIアシスタント）',
        content: 'あなたの執筆パートナーです。物語の続きを書いてもらったり、アイデアの相談をしたりできます。',
        targetId: 'tutorial-right-panel',
        placement: 'left',
    },
    {
        title: 'STEP4: 執筆／相談モード',
        content: '「相談モード」ではアイデア出し、「執筆モード」では物語の生成と、AIの役割を切り替えられます。',
        targetId: 'tutorial-mode-switch',
        placement: 'top',
    },
    {
        title: 'STEP5: 本文編集UI',
        content: 'AIが生成した物語はここに表示されます。もちろん、あなた自身で直接編集することもできます。',
        targetId: 'tutorial-center-panel',
        placement: 'top-start',
    },
    {
        title: 'STEP6: 便利ツール',
        content: '左パネルのツール群から、相関図やタイムラインを開いて、物語の全体像を視覚的に整理することもできます。',
        targetId: 'tutorial-left-panel',
        placement: 'right'
    },
    {
        title: 'STEP7: 完了！',
        content: 'これで基本的な使い方はマスターしました！さあ、あなただけの物語を紡ぎ始めましょう！',
        targetId: null,
    },
];

const mobileTutorialSteps = [
    {
        title: 'STEP1: 執筆画面へようこそ！',
        content: 'スマホでも快適に物語を執筆できます。まずは基本的な使い方を見ていきましょう！',
        targetId: null,
    },
    {
        title: 'STEP2: メニュー',
        content: 'ここから、検索、表示設定、プレビュー、書き出しなどの機能にアクセスできます。プロジェクト一覧に戻るのもここからです。',
        targetId: 'tutorial-mobile-menu-btn',
        placement: 'bottom-end',
    },
    {
        title: 'STEP3: 本文編集エリア',
        content: 'ここをタップして物語を執筆します。段落をタップすると編集モードになり、長押しや選択で便利なツールバーが表示されます。',
        targetId: 'tutorial-center-panel',
        placement: 'bottom',
    },
    {
        title: 'STEP4: 完了！',
        content: '準備は整いました。いつでもどこでも、あなたの物語を紡ぎましょう！',
        targetId: null,
    },
];

const getTargetPosition = (targetId) => {
    if (!targetId) return null;
    // FIX: Update getTargetPosition to also query for data-tutorial-id to support elements where the id attribute was duplicated.
    const element = document.getElementById(targetId) || document.querySelector(`[data-tutorial-id="${targetId}"]`);
    if (!element) return null;
    return element.getBoundingClientRect();
};

interface TutorialProps {
    isMobile?: boolean;
}

export const Tutorial: React.FC<TutorialProps> = ({ isMobile = false }) => {
    const isTutorialActive = useStore(state => state.isTutorialActive);
    const tutorialStep = useStore(state => state.tutorialStep);
    const nextTutorialStep = useStore(state => state.nextTutorialStep);
    const prevTutorialStep = useStore(state => state.prevTutorialStep);
    const endTutorial = useStore(state => state.endTutorial);
    
    const [position, setPosition] = useState(null);
    const [style, setStyle] = useState({});

    const steps = isMobile ? mobileTutorialSteps : pcTutorialSteps;
    const currentStep = steps[tutorialStep];

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
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
                    border: '2px solid #6366f1',
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

        // Small delay to ensure UI is rendered (especially for mobile menu)
        const timer = setTimeout(updatePosition, 100);
        
        const handleResize = () => updatePosition();
        window.addEventListener('resize', handleResize);
        
        // Also listen for scroll on main containers if they exist
        const leftPanel = document.querySelector('.flex-grow.overflow-y-auto.p-4'); // A bit fragile selector
        leftPanel?.addEventListener('scroll', handleResize);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
            leftPanel?.removeEventListener('scroll', handleResize);
        };

    }, [isTutorialActive, tutorialStep, currentStep]);
    

    if (!isTutorialActive || !currentStep) return null;

    // FIX: Changed type to `any` to resolve incorrect TypeScript errors about missing properties on `React.CSSProperties`.
    const popoverStyle: any = {};
    
    // Mobile specific adjustments
    const popoverWidth = isMobile ? 300 : 320;
    const maxWidth = isMobile ? '90vw' : '320px';

    if (position) {
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
            case 'bottom-end':
                 popoverStyle.top = `${position.bottom + gap}px`;
                 popoverStyle.right = `${window.innerWidth - position.right}px`;
                 break;
            case 'bottom':
            default:
                popoverStyle.top = `${position.bottom + gap}px`;
                // Center align for mobile if possible, otherwise left align
                if (isMobile) {
                     popoverStyle.left = '50%';
                     popoverStyle.transform = 'translateX(-50%)';
                } else {
                    popoverStyle.left = `${position.left}px`;
                }
                break;
        }
    } else {
        // Center the popover if there's no target
        popoverStyle.top = '50%';
        popoverStyle.left = '50%';
        popoverStyle.transform = 'translate(-50%, -50%)';
    }
    
    const handleNext = () => {
        if (tutorialStep < steps.length - 1) {
            nextTutorialStep();
        } else {
            endTutorial();
        }
    }

    return (
        <>
            {position && <div style={style}></div>}
            <div 
                style={{...popoverStyle, position: 'fixed', zIndex: 10001, width: popoverWidth, maxWidth: maxWidth}} 
                className="bg-gray-800 border border-indigo-500 rounded-lg shadow-2xl p-5 text-white transition-all duration-200"
            >
                <h3 className="font-bold text-lg text-indigo-400 mb-2">{currentStep.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{currentStep.content}</p>
                <div className="flex justify-between items-center">
                    <button onClick={endTutorial} className="text-xs text-gray-400 hover:text-white">ツアーを終了</button>
                    <div className="flex items-center gap-2">
                        {tutorialStep > 0 && (
                             <button onClick={prevTutorialStep} className="px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-500 transition">
                                戻る
                            </button>
                        )}
                        <span className="text-xs text-gray-500">{tutorialStep + 1} / {steps.length}</span>
                        <button onClick={handleNext} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-500 transition">
                            {tutorialStep === steps.length - 1 ? '完了' : '次へ'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};