
import React from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { useStore } from '../store/index';

export const TutorialModeSelectionModal = () => {
    const activeModal = useStore(state => state.activeModal);
    const closeModal = useStore(state => state.closeModal);
    const startTutorial = useStore(state => state.startTutorial);
    const endTutorial = useStore(state => state.endTutorial);

    const isOpen = activeModal === 'tutorialModeSelection';

    const handleSelect = (action: 'start' | 'skip') => {
        if (action === 'start') {
            startTutorial();
        } else {
            endTutorial(); // Mark tutorial as completed
        }
        closeModal();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[9998]">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-8 border border-indigo-500/50">
                <div className="text-center">
                    <Icons.BotIcon className="h-12 w-12 text-indigo-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">小説らいたーへようこそ！</h2>
                    <p className="text-gray-400 mb-8">最初に、アプリの基本的な使い方を学びますか？</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-8">
                    <button
                        onClick={() => handleSelect('start')}
                        className="flex flex-col items-center gap-2 p-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition btn-pressable transform hover:scale-105"
                    >
                        <div className="flex items-center gap-2 text-lg">
                            <Icons.LightbulbIcon className="h-5 w-5 text-yellow-300" />
                            <span>はい！</span>
                        </div>
                        <span className="text-xs font-normal opacity-80">基本操作を学びます</span>
                    </button>
                    <button
                        onClick={() => handleSelect('skip')}
                        className="flex flex-col items-center gap-2 p-6 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition btn-pressable transform hover:scale-105"
                    >
                        <div className="flex items-center gap-2 text-lg">
                            <Icons.UserCogIcon className="h-5 w-5 text-gray-300" />
                            <span>いいえ</span>
                        </div>
                        <span className="text-xs font-normal opacity-80">すぐに執筆します</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
