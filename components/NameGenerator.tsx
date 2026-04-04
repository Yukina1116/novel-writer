import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';

interface NameGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (category: string, keywords: string) => Promise<string[]>;
    onApply: (name: string) => void;
    applyButtonText: string;
    initialCategory?: string;
    initialKeywords?: string;
    isContextual?: boolean;
}

export const NameGenerator: React.FC<NameGeneratorProps> = ({
    isOpen,
    onClose,
    onGenerate,
    onApply,
    applyButtonText,
    initialCategory = 'ファンタジー風',
    initialKeywords = '',
    isContextual = false
}) => {
    const [categories, setCategories] = useState<string[]>([]);
    const [categoryInput, setCategoryInput] = useState('');
    const [keywords, setKeywords] = useState(initialKeywords);
    const [generatedNames, setGeneratedNames] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKeyText = isMac ? '⌘Cmd' : 'Ctrl';

    const presetCategories = ['ファンタジー風', 'SF風', '現代日本風', '中華風', '地名', '組織名', '技名'];

    useEffect(() => {
        if (isOpen) {
            setCategories(initialCategory ? [initialCategory] : []);
            setKeywords(initialKeywords);
            setGeneratedNames([]);
            setIsLoading(false);
            setCategoryInput('');
            // Focus the modal to capture key events
            setTimeout(() => modalRef.current?.focus(), 0);
        }
    }, [isOpen, initialCategory, initialKeywords]);
    
    const handleAddCategory = (cat: string) => {
        const newCat = cat.trim();
        if (newCat && !categories.includes(newCat)) {
            setCategories([...categories, newCat]);
        }
    };

    const handleRemoveCategory = (catToRemove: string) => {
        setCategories(categories.filter(cat => cat !== catToRemove));
    };

    const handleCategoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCategoryInput(e.target.value);
    };

    const handleCategoryInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddCategory(categoryInput);
            setCategoryInput('');
        }
    };

    const handleGenerateClick = async () => {
        if (isLoading) return;
        setIsLoading(true);
        setGeneratedNames([]);
        const categoryString = categories.join(', ');
        const names = await onGenerate(categoryString, keywords);
        setGeneratedNames(names);
        setIsLoading(false);
    };
    
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            onClose();
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            handleGenerateClick();
        }
    };

    if (!isOpen) return null;

    const modalTitle = isContextual ? `${initialCategory}を生成` : '固有名詞ジェネレーター';

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[80]">
            <div
                ref={modalRef}
                tabIndex={-1} // Make it focusable to receive key events
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700 max-h-[90vh] flex flex-col outline-none"
                onKeyDown={handleKeyDown}
            >
                <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-700 flex-shrink-0">
                    <h2 className="text-xl font-bold text-teal-400 flex items-center gap-2">
                        {isContextual ? <Icons.SparklesIcon className="h-6 w-6" /> : <Icons.DiceIcon className="h-6 w-6" />}
                        {modalTitle}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition text-white"><Icons.XIcon /></button>
                </div>

                <div className="flex-grow overflow-y-auto p-6 min-h-0">
                    <div className="space-y-4">
                        {!isContextual && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">カテゴリ</label>
                                <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-900 border border-gray-600 rounded-md">
                                    {categories.map((cat) => (
                                        <span key={cat} className="flex items-center gap-1 bg-indigo-600 text-white text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
                                            {cat}
                                            <button onClick={() => handleRemoveCategory(cat)} className="text-indigo-200 hover:text-white">
                                                <Icons.XIcon className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        type="text"
                                        value={categoryInput}
                                        onChange={handleCategoryInputChange}
                                        onKeyDown={handleCategoryInputKeyDown}
                                        onBlur={() => { handleAddCategory(categoryInput); setCategoryInput(''); }}
                                        placeholder={categories.length > 0 ? 'さらに追加...' : 'カテゴリを入力または選択...'}
                                        className="bg-transparent focus:outline-none text-sm text-white flex-grow min-w-[120px]"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {presetCategories.filter(pc => !categories.includes(pc)).map(cat => (
                                        <button type="button" key={cat} onClick={() => { handleAddCategory(cat); }} className="px-2 py-1 text-xs rounded-full bg-gray-700 hover:bg-gray-600 transition text-gray-300">
                                            + {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">キーワード (任意)</label>
                            <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="例: 炎, 伝説, 女性" className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
                        </div>
                    </div>
                    
                    <div className="mt-6">
                        <button onClick={handleGenerateClick} disabled={isLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md disabled:bg-gray-500 btn-pressable btn-invert-indigo">
                            {isLoading ? <Icons.LoaderIcon className="h-5 w-5" /> : <Icons.MoonIcon className="h-5 w-5" />}
                            {isLoading ? '生成中...' : `名前を生成 (${modifierKeyText}+Enter)`}
                        </button>
                    </div>

                    <div className="mt-6">
                        <h3 className="text-lg font-semibold text-gray-300 mb-2 border-t border-gray-700 pt-4">生成結果</h3>
                        {isLoading ? (
                            <div className="flex justify-center items-center h-24">
                                <Icons.LoaderIcon className="h-8 w-8 text-indigo-400" />
                            </div>
                        ) : generatedNames.length > 0 ? (
                            <ul className="space-y-2">
                                {generatedNames.map((name, index) => (
                                    <li key={index} className="flex items-center justify-between bg-gray-900/50 p-2 rounded-md">
                                        <span className="text-white">{name}</span>
                                        <button onClick={() => onApply(name)} className="px-3 py-1 text-xs rounded-md btn-pressable btn-invert-teal">{applyButtonText}</button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-4">ここに名前が生成されます。</p>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
