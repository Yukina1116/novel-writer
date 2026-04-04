import React, { useRef, useEffect, useState } from 'react';
import { NovelEditor } from './components/NovelEditor';
import { Header } from './components/Header';
import { ModalManager } from './components/ModalManager';
import { CommandPalette } from './components/CommandPalette';
import { Tutorial } from './components/Tutorial';
import { TutorialModeSelectionModal } from './components/TutorialModeSelectionModal';
import { useStore } from './store/index';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';

const AppMobile: React.FC = () => {
    // Headerコンポーネントが必要とするrefを作成
    const displayMenuButtonRef = useRef<HTMLButtonElement>(null);
    const userInputRef = useRef<HTMLTextAreaElement>(null);

    const activeProjectId = useStore(state => state.activeProjectId);
    const hasCompletedGlobalTutorial = useStore(state => state.hasCompletedGlobalTutorial);
    const openModal = useStore(state => state.openModal);
    
    const isLeftSidebarOpen = useStore(state => state.isLeftSidebarOpen);
    const isRightSidebarOpen = useStore(state => state.isRightSidebarOpen);
    const setIsLeftSidebarOpen = useStore(state => state.setIsLeftSidebarOpen);
    const setIsRightSidebarOpen = useStore(state => state.setIsRightSidebarOpen);

    const projectName = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.name : '');
    const novelContent = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.novelContent : []);
    const activeProjectExists = useStore(state => !!(activeProjectId && state.allProjectsData[activeProjectId]));
    
    const [isInitialized, setIsInitialized] = useState(false);
    const [viewportHeight, setViewportHeight] = useState('100dvh');

    // スワイプ操作用のRef
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        // スマホ版起動時は左右のカラムを閉じる
        setIsLeftSidebarOpen(false);
        setIsRightSidebarOpen(false);
        
        // 初期化完了フラグを立てる
        const timer = setTimeout(() => {
            setIsInitialized(true);
        }, 100);
        
        return () => clearTimeout(timer);
    }, [setIsLeftSidebarOpen, setIsRightSidebarOpen]);

    // Visual Viewport APIによるキーボード表示時の高さ調整
    useEffect(() => {
        const handleResize = () => {
            if (window.visualViewport) {
                setViewportHeight(`${window.visualViewport.height}px`);
                // キーボード表示時にレイアウトが崩れないようトップにスクロール固定
                window.scrollTo(0, 0);
            } else {
                setViewportHeight(`${window.innerHeight}px`);
            }
        };

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
            handleResize(); // 初期値設定
        } else {
            window.addEventListener('resize', handleResize);
        }

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleResize);
            } else {
                window.removeEventListener('resize', handleResize);
            }
        };
    }, []);

    useEffect(() => {
        if (isInitialized && activeProjectExists && !hasCompletedGlobalTutorial) {
            // スマホ版でも初回チュートリアル選択を表示
            const timer = setTimeout(() => openModal('tutorialModeSelection'), 500);
            return () => clearTimeout(timer);
        }
    }, [isInitialized, activeProjectExists, hasCompletedGlobalTutorial, openModal]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;

        const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        const diffX = touchEnd.x - touchStartRef.current.x;
        const diffY = touchEnd.y - touchStartRef.current.y;
        const startX = touchStartRef.current.x;
        
        touchStartRef.current = null;

        // 誤爆防止ロジックの強化
        // 1. 横移動が縦移動の2倍以上であること (意図的な横スワイプのみを検出)
        if (Math.abs(diffX) < Math.abs(diffY) * 2) return;
        
        // しきい値設定
        const minSwipeDistance = 50; // スワイプとみなす最小距離
        const edgeThreshold = 50; // エッジスワイプとみなす画面端からの距離
        const maxVerticalDeviation = 50; // 許容する縦方向のズレ (100から50へ厳格化)

        if (Math.abs(diffX) < minSwipeDistance) return;
        if (Math.abs(diffY) > maxVerticalDeviation) return;

        const screenWidth = window.innerWidth;

        if (diffX > 0) {
            // 右スワイプ ( -> )
            if (isRightSidebarOpen) {
                // 右パネルが開いていれば閉じる
                setIsRightSidebarOpen(false);
            } else if (!isLeftSidebarOpen && startX < edgeThreshold) {
                // 左パネルが閉じていて、左端からのスワイプなら開く
                setIsLeftSidebarOpen(true);
            }
        } else {
            // 左スワイプ ( <- )
            if (isLeftSidebarOpen) {
                // 左パネルが開いていれば閉じる
                setIsLeftSidebarOpen(false);
            } else if (!isRightSidebarOpen && startX > screenWidth - edgeThreshold) {
                // 右パネルが閉じていて、右端からのスワイプなら開く
                setIsRightSidebarOpen(true);
            }
        }
    };

    const handleExportProject = (projectId: string) => {
        const projectData = useStore.getState().allProjectsData[projectId];
        if (!projectData) return;
        const dataStr = JSON.stringify(projectData, null, 2);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([dataStr], { type: 'application/json' }));
        link.download = `${projectData.name}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
     const handleExportTxt = () => {
        if (!activeProjectExists) return;
        const textContent = novelContent.map(chunk => chunk.text).join('\n\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([textContent], { type: 'text/plain;charset=utf-8' }));
        link.download = `${projectName}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    // データ読み込み中、または初期化処理中はローディングを表示
    if (!activeProjectExists || !isInitialized) {
        return (
            <div className="flex flex-col items-center justify-center h-[100dvh] bg-gray-900 text-gray-400 gap-4">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p>物語を読み込んでいます...</p>
            </div>
        );
    }

    return (
        <div 
            className="flex flex-col w-full bg-gray-900 text-gray-200 overflow-hidden relative"
            style={{ height: viewportHeight }} // 動的な高さを適用
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* アプリケーション機能に必要なオーバーレイコンポーネント */}
            <Tutorial isMobile={true} />
            <TutorialModeSelectionModal />
            <ModalManager displayMenuButtonRef={displayMenuButtonRef} isMobile={true} />
            <CommandPalette />

            {/* ヘッダーエリア */}
            <div className="w-full border-b border-gray-700 bg-gray-800 flex-shrink-0 z-30">
                <Header displayMenuButtonRef={displayMenuButtonRef} isMobile={true} />
            </div>

            {/* 1カラムエディタエリア */}
            <div className="flex-1 overflow-hidden flex flex-col relative z-0 min-h-0">
                <NovelEditor />
            </div>

            {/* オーバーレイパネル: 左 (設定・アウトライン) */}
            {isLeftSidebarOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-gray-900 flex flex-col animate-slide-in-left shadow-2xl"
                    style={{ height: viewportHeight }} // 動的な高さを適用
                >
                    <LeftPanel 
                        onExportProject={() => activeProjectId && handleExportProject(activeProjectId)} 
                        onExportTxt={handleExportTxt} 
                        isMobile={true}
                    />
                </div>
            )}

            {/* オーバーレイパネル: 右 (AIアシスタント) */}
            {isRightSidebarOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-gray-900 flex flex-col animate-slide-in-right shadow-2xl"
                    style={{ height: viewportHeight }} // 動的な高さを適用
                >
                    <RightPanel 
                        userInputRef={userInputRef}
                        isMobile={true}
                    />
                </div>
            )}
        </div>
    );
};

export default AppMobile;