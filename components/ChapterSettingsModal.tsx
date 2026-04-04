
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Icons from '../icons';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';

interface ChapterSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (details: { id: string; newTitle: string; newMemo: string; isUncategorized: boolean }) => void;
    chapter: { id: string; title: string; memo: string; isUncategorized: boolean } | null;
}

export const ChapterSettingsModal: React.FC<ChapterSettingsModalProps> = ({ isOpen, onClose, onSave, chapter }) => {
    const [title, setTitle] = useState('');
    const [memo, setMemo] = useState('');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const closeButtonRef = useRef(null);

    useEffect(() => {
        if (isOpen && chapter) {
            setTitle(chapter.isUncategorized ? '' : chapter.title);
            setMemo(chapter.memo || '');
        }
    }, [isOpen, chapter]);

    const isDirty = useMemo(() => {
        if (!chapter) return false;
        const initialTitle = chapter.isUncategorized ? '' : chapter.title;
        const initialMemo = chapter.memo || '';
        return title !== initialTitle || memo !== initialMemo;
    }, [title, memo, chapter]);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        const finalTitle = title.trim() || (chapter?.isUncategorized ? '無題の章' : chapter?.title);
        if (!finalTitle) return;

        onSave({
            id: chapter.id,
            newTitle: finalTitle,
            newMemo: memo,
            isUncategorized: chapter.isUncategorized,
        });
        onClose();
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
        }
    };
    
    const handleCloseRequest = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };
    
    const handleSaveAndClose = () => {
        (document.getElementById('chapter-settings-form') as HTMLFormElement)?.requestSubmit();
        setIsConfirmCloseOpen(false);
    };

    if (!isOpen || !chapter) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <UnsavedChangesPopover
                    isOpen={isConfirmCloseOpen}
                    targetRef={closeButtonRef}
                    onCancel={() => setIsConfirmCloseOpen(false)}
                    onCloseWithoutSaving={() => { setIsConfirmCloseOpen(false); onClose(); }}
                    onSaveAndClose={handleSaveAndClose}
                />
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
                        <Icons.CogIcon className="h-6 w-6" />
                        章の設定
                    </h2>
                    <button ref={closeButtonRef} onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                </div>

                <div className="flex-grow overflow-y-auto pr-2">
                    <form id="chapter-settings-form" onSubmit={handleSave} onKeyDown={handleKeyDown} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">章のタイトル <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={chapter.isUncategorized ? "例: プロローグ" : "章のタイトルを入力"}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                章のメモ (AIは参照しません)
                            </label>
                            <textarea
                                value={memo}
                                onChange={e => setMemo(e.target.value)}
                                placeholder="この章のプロット、修正点などを記録します..."
                                rows={8}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white resize-y"
                            />
                        </div>
                    </form>
                </div>
                
                <div className="mt-6 flex justify-end items-center border-t border-gray-700 pt-4 flex-shrink-0">
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition">
                            <Icons.XIcon className="h-4 w-4" />
                            キャンセル
                        </button>
                        <button type="submit" form="chapter-settings-form" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition">
                            <Icons.CheckIcon className="h-4 w-4" />
                            保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
