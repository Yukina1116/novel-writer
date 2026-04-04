import React from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { useStore } from '../store/index';

export const SyncDialog = () => {
    const activeModal = useStore(state => state.activeModal);
    const closeModal = useStore(state => state.closeModal);
    const syncLinkedData = useStore(state => state.syncLinkedData);
    const unlinkItems = useStore(state => state.unlinkItems);
    
    const isOpen = activeModal === 'syncDialog';

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[90]">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-gray-700">
                <h2 className="text-xl font-bold text-indigo-400 mb-4 flex items-center gap-2">
                    <Icons.GitBranchIcon />
                    関連データの同期
                </h2>
                <p className="text-sm text-gray-300 mb-6">
                    このプロットカードには、リンクされたタイムラインイベントがあります。
                    内容が異なっているようですが、更新しますか？
                </p>
                <div className="flex flex-col space-y-3">
                    <button
                        onClick={() => {
                            syncLinkedData();
                            closeModal();
                        }}
                        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition btn-pressable"
                    >
                        更新する (タイムラインに反映)
                    </button>
                    <button
                        onClick={closeModal}
                        className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition btn-pressable"
                    >
                        今回のみスキップ
                    </button>
                    <button
                        onClick={() => {
                            unlinkItems();
                            closeModal();
                        }}
                        className="w-full px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition btn-pressable"
                    >
                        永続的に同期しない (リンク解除)
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};