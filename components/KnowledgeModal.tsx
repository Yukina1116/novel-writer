import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { KnowledgeItem } from '../types';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';
import { HelpPopover } from './HelpPopover';
import { useStore } from '../store/index';

export const KnowledgeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Partial<KnowledgeItem>, type?: 'knowledge') => void;
    itemToEdit: KnowledgeItem | null;
    allKnowledge: KnowledgeItem[];
    isMobile?: boolean;
}> = ({
    isOpen,
    onClose,
    onSave,
    itemToEdit,
    allKnowledge,
    isMobile = false,
}) => {
    const [name, setName] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [isCategoryHelpOpen, setIsCategoryHelpOpen] = useState(false);
    const categoryHelpRef = useRef<HTMLButtonElement>(null);
    const setHelpTopic = useStore((state: any) => state.setHelpTopic);

    // 編集済みフラグ管理
    const [editedFields, setEditedFields] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            const initialData = {
                name: itemToEdit?.name || '',
                content: itemToEdit?.content || '',
                category: itemToEdit?.category || '未分類',
                tags: itemToEdit?.tags || [],
            };
            setName(initialData.name);
            setContent(initialData.content);
            setCategory(initialData.category);
            setTags(initialData.tags);
            setTagInput('');
            setEditedFields(new Set());
            setInitialStateString(JSON.stringify(initialData));
        }
    }, [isOpen, itemToEdit]);

    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        const currentState = { name, content, category, tags };
        return JSON.stringify(currentState) !== initialStateString;
    }, [name, content, category, tags, initialStateString]);

    const existingCategories = useMemo(() => {
        if (!allKnowledge) return ['未分類'];
        const categories = new Set(allKnowledge.map(k => k.category || '未分類'));
        return Array.from(categories);
    }, [allKnowledge]);

    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTag = tagInput.trim();
            if (newTag && !tags.includes(newTag)) {
                setTags([...tags, newTag]);
                markEdited('tags');
            }
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
        markEdited('tags');
    };

    const markEdited = (fieldKey: string) => {
        setEditedFields(prev => new Set(prev).add(fieldKey));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({ ...itemToEdit, name, content, category, tags }, 'knowledge');
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
        (document.getElementById('knowledge-form') as HTMLFormElement)?.requestSubmit();
        setIsConfirmCloseOpen(false);
    };

    const renderLabel = (label: string, fieldKey?: string, helpNode?: React.ReactNode) => {
        const isAuto = itemToEdit?.isAutoFilled && fieldKey && !editedFields.has(fieldKey);
        return (
            <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-gray-300">{label}</label>
                {helpNode}
                {isAuto && (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 px-1.5 py-0.5 rounded font-bold animate-pulse">補完済み</span>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    const modalContainerClass = isMobile 
        ? "fixed inset-0 bg-gray-900 w-full h-[100dvh] flex flex-col z-[60]"
        : "bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl border border-gray-700 max-h-[90vh] flex flex-col overflow-hidden";
    
    const inputClass = `w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white ${isMobile ? 'text-base' : 'text-sm'}`;
    const buttonClass = (colorClass: string) => `${colorClass} text-white rounded-md transition btn-pressable flex items-center justify-center gap-2 ${isMobile ? 'p-3 text-base w-full' : 'px-4 py-2 text-sm'}`;

    return createPortal(
        <div className={isMobile ? "fixed inset-0 z-[60]" : "fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[80]"}>
            <div className={modalContainerClass}>
                <UnsavedChangesPopover
                    isOpen={isConfirmCloseOpen}
                    targetRef={closeButtonRef}
                    onCancel={() => setIsConfirmCloseOpen(false)}
                    onCloseWithoutSaving={() => { setIsConfirmCloseOpen(false); onClose(); }}
                    onSaveAndClose={handleSaveAndClose}
                />
                
                <div className={`flex justify-between items-center flex-shrink-0 ${isMobile ? 'p-4 border-b border-gray-700' : 'p-6 pb-4 border-b border-gray-700'}`}>
                    <h2 className={`font-bold text-yellow-400 flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                        <Icons.LightbulbIcon />
                        {itemToEdit ? 'ナレッジを編集' : 'ナレッジを新規作成'}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setHelpTopic && setHelpTopic('knowledge')} className="p-2 rounded-full hover:bg-gray-700 transition" aria-label="ヘルプ">
                            <Icons.HelpCircleIcon className="h-5 w-5 text-white" />
                        </button>
                        <button ref={closeButtonRef} type="button" onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition text-white"><Icons.XIcon /></button>
                    </div>
                </div>

                <form id="knowledge-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={`flex-grow overflow-y-auto min-h-0 ${isMobile ? 'px-4 pb-24 pt-4' : 'px-6 py-4'}`}>
                    <div className="space-y-6">
                        <div>
                            {renderLabel("名前 *", "name")}
                            <input
                                id="knowledge-name"
                                type="text"
                                value={name}
                                onChange={e => { setName(e.target.value); markEdited('name'); }}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div className={`grid ${isMobile ? 'grid-cols-1 gap-6' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}>
                            <div>
                                {renderLabel("カテゴリ", "category", (
                                    <button type="button" ref={categoryHelpRef} onMouseEnter={() => setIsCategoryHelpOpen(true)} onMouseLeave={() => setIsCategoryHelpOpen(false)} className="focus:outline-none">
                                        <Icons.HelpCircleIcon className="h-4 w-4 text-gray-400 hover:text-white" />
                                    </button>
                                ))}
                                <input
                                    id="knowledge-category"
                                    type="text"
                                    value={category}
                                    onChange={e => { setCategory(e.target.value); markEdited('category'); }}
                                    list="category-suggestions"
                                    className={inputClass}
                                />
                                <datalist id="category-suggestions">
                                    {existingCategories.map(cat => <option key={cat} value={cat} />)}
                                </datalist>
                            </div>
                            <div>
                                {renderLabel("タグ (Enterで追加)", "tags")}
                                <input
                                    id="knowledge-tags"
                                    type="text"
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={handleTagInputKeyDown}
                                    placeholder="タグを追加..."
                                    className={inputClass}
                                />
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {tags.map(tag => (
                                        <span key={tag} className={`flex items-center gap-1 bg-gray-700 text-white font-medium pl-2.5 pr-1.5 rounded-full ${isMobile ? 'text-sm py-1' : 'text-xs py-1'}`}>
                                            {tag}
                                            <button type="button" onClick={() => handleRemoveTag(tag)} className="text-gray-400 hover:text-white p-1">
                                                <Icons.XIcon className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div>
                            {renderLabel("内容", "content")}
                            <textarea
                                id="knowledge-content"
                                value={content}
                                onChange={e => { setContent(e.target.value); markEdited('content'); }}
                                rows={10}
                                className={`${inputClass} resize-none`}
                            />
                        </div>
                    </div>
                </form>
                
                <div 
                    className={`flex-shrink-0 border-t border-gray-700 bg-gray-900/50 ${isMobile ? 'flex flex-col gap-3 px-4 py-4' : 'flex justify-end gap-3 px-6 py-4'}`}
                    style={isMobile ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : {}}
                >
                    <button type="button" onClick={handleCloseRequest} className={buttonClass('bg-gray-600 hover:bg-gray-500')}>
                        <Icons.XIcon className="h-4 w-4" />
                        キャンセル
                    </button>
                    <button type="submit" form="knowledge-form" data-testid="modal-save-button" className={buttonClass('bg-indigo-600 hover:bg-indigo-500 font-bold')}>
                        <Icons.CheckIcon className="h-4 w-4" />
                        保存
                    </button>
                </div>
            </div>
            <HelpPopover
                isOpen={isCategoryHelpOpen}
                targetRef={categoryHelpRef}
                onClose={() => setIsCategoryHelpOpen(false)}
            >
                新しいカテゴリを追加するには、ここに直接名前を入力して保存してください。
            </HelpPopover>
        </div>,
        document.body
    );
};