import React, { useState, useEffect } from 'react';
import { useStore } from '../store/index';

const timelineTutorialSteps = [
    {
        title: 'タイムラインへようこそ！',
        content: '物語の出来事を時系列で整理する場所です。誰がいつどこで何をしていたか、一目でわかるように管理しましょう。',
        targetId: null,
    },
    {
        title: '① レーン',
        content: '「レーン」は、キャラクター別や場所別など、出来事を分類する列です。まずは新しいレーンを追加してみましょう。',
        targetId: 'tutorial-timeline-add-lane-btn',
        placement: 'bottom',
    },
    {
        title: '② イベントの追加',
        content: '各レーンに、物語の出来事（イベント）を追加できます。時期、タイトル、詳細を記録しましょう。',
        targetId: 'tutorial-timeline-add-event-btn',
        placement: 'bottom',
    },
    {
        title: '③ ドラッグ＆ドロップ',
        content: 'イベントカードはドラッグ＆ドロップで、レーン内での順序変更や、別のレーンへの移動が簡単にできます。',
        targetId: 'tutorial-timeline-board',
        placement: 'top-start',
    },
    {
        title: '④ 保存',
        content: '編集が終わったら、忘れずに保存ボタンを押してくださいね。',
        targetId: 'tutorial-timeline-save-btn',
        placement: 'top',
    },
    {
        title: '準備完了！',
        content: 'これでタイムラインは完璧です！物語の矛盾を防ぎ、より緻密なプロットを作り上げましょう！',
        targetId: null,
    },
];

const getTargetPosition = (targetId) => {
    if (!targetId) return null;
    const element = document.getElementById(targetId);
    if (!element) return null;
    return element.getBoundingClientRect();
};

export const TimelineTutorial = () => {
    const isTutorialActive = useStore(state => state.isTimelineTutorialActive);
    const tutorialStep = useStore(state => state.timelineTutorialStep);
    const nextTutorialStep = useStore(state => state.nextTimelineTutorialStep);
    const endTutorial = useStore(state => state.endTimelineTutorial);
    
    const [position, setPosition] = useState(null);
    const [style, setStyle] = useState({});

    const currentStep = timelineTutorialSteps[tutorialStep];

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
                    border: '2px solid #fb923c', // orange-400
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
        if (tutorialStep < timelineTutorialSteps.length - 1) {
            nextTutorialStep();
        } else {
            endTutorial();
        }
    }

    return (
        <>
            {position && <div style={style}></div>}
            <div style={{...popoverStyle, position: 'fixed'}} className="bg-gray-800 border border-orange-400 rounded-lg shadow-2xl w-80 p-5 text-white">
                <h3 className="font-bold text-lg text-orange-300 mb-2">{currentStep.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{currentStep.content}</p>
                <div className="flex justify-between items-center">
                    <button onClick={endTutorial} className="text-xs text-gray-400 hover:text-white">ツアーを終了</button>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{tutorialStep + 1} / {timelineTutorialSteps.length}</span>
                        <button onClick={handleNext} className="px-4 py-2 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-400 transition">
                            {tutorialStep === timelineTutorialSteps.length - 1 ? '完了' : '次へ'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};