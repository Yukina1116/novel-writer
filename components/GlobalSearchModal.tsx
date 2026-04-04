import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as Icons from '../icons';
import { SettingItem, KnowledgeItem, PlotItem, NovelChunk } from '../types';

interface SearchResultItemProps {
    onClick: () => void;
    icon: React.ReactNode;
    title: string;
    context: string;
    searchTerm: string;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ onClick, icon, title, context, searchTerm }) => {
    const highlight = (text: string) => {
        if (!searchTerm || !text) return text;
        const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
        return (
            <>
                {parts.map((part, i) =>
                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                        <span key={i} className="bg-yellow-500/50 text-white rounded-sm">{part}</span>
                    ) : (
                        part
                    )
                )}
            </>
        );
    };

    return (
        <button
            onClick={onClick}
            className="w-full text-left p-3 rounded-lg hover:bg-gray-700/50 transition flex items-start gap-4"
        >
            <div className="text-gray-400 mt-1">{icon}</div>
            <div className="flex-grow overflow-hidden">
                <p className="font-semibold text-white truncate">{highlight(title)}</p>
                {context && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{highlight(context)}</p>}
            </div>
        </button>
    );
};

interface GlobalSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    characters: SettingItem[];
    worldSettings: SettingItem[];
    knowledgeBase: KnowledgeItem[];
    plotBoard: PlotItem[];
    novelContent: NovelChunk[];
    onNavigateToSetting: (item: SettingItem, type: 'character' | 'world') => void;
    onNavigateToKnowledge: (item: KnowledgeItem) => void;
    onNavigateToPlot: (item: PlotItem) => void;
    onNavigateToChunk: (chunkId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
    isOpen,
    onClose,
    characters,
    worldSettings,
    knowledgeBase,
    plotBoard,
    novelContent,
    onNavigateToSetting,
    onNavigateToKnowledge,
    onNavigateToPlot,
    onNavigateToChunk,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) {
            return null;
        }
        const term = searchTerm.toLowerCase();

        const chars = characters.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.longDescription || '').toLowerCase().includes(term) ||
            (c.personality || '').toLowerCase().includes(term)
        );
        const worlds = worldSettings.filter(w =>
            w.name.toLowerCase().includes(term) ||
            (w.longDescription || '').toLowerCase().includes(term) ||
            w.fields.some(f => f.key.toLowerCase().includes(term) || f.value.toLowerCase().includes(term))
        );
        const knowledge = knowledgeBase.filter(k =>
            k.name.toLowerCase().includes(term) ||
            k.content.toLowerCase().includes(term) ||
            k.tags.some(t => t.toLowerCase().includes(term))
        );
        const plots = plotBoard.filter(p =>
            p.title.toLowerCase().includes(term) ||
            p.summary.toLowerCase().includes(term)
        );
        const chunks = novelContent.filter(c => c.text.toLowerCase().includes(term));

        return { chars, worlds, knowledge, plots, chunks };
    }, [searchTerm, characters, worldSettings, knowledgeBase, plotBoard, novelContent]);
    
    const totalResults = searchResults ? 
        searchResults.chars.length + 
        searchResults.worlds.length + 
        searchResults.knowledge.length + 
        searchResults.plots.length + 
        searchResults.chunks.length : 0;

    const renderResults = () => {
        if (!searchResults) {
            return <p className="text-center text-gray-500 py-8">プロジェクト内を検索します...</p>;
        }
        
        if (totalResults === 0) {
            return <p className="text-center text-gray-500 py-8">「{searchTerm}」に一致する結果はありませんでした。</p>;
        }

        return (
            <div className="space-y-4">
                {searchResults.chars.length > 0 && (
                    <div>
                        <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 px-3">キャラクター</h3>
                        {searchResults.chars.map(item => (
                            <SearchResultItem
                                key={item.id}
                                onClick={() => onNavigateToSetting(item, 'character')}
                                icon={<Icons.UserPlusIcon className="h-5 w-5" />}
                                title={item.name}
                                context={item.personality || item.longDescription}
                                searchTerm={searchTerm}
                            />
                        ))}
                    </div>
                )}
                {searchResults.worlds.length > 0 && (
                     <div>
                        <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 px-3">世界観</h3>
                        {searchResults.worlds.map(item => (
                            <SearchResultItem
                                key={item.id}
                                onClick={() => onNavigateToSetting(item, 'world')}
                                icon={<Icons.GlobeIcon className="h-5 w-5" />}
                                title={item.name}
                                context={item.longDescription || item.fields.map(f => `${f.key}: ${f.value}`).join(' ')}
                                searchTerm={searchTerm}
                            />
                        ))}
                    </div>
                )}
                {searchResults.knowledge.length > 0 && (
                     <div>
                        <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 px-3">ナレッジベース</h3>
                        {searchResults.knowledge.map(item => (
                            <SearchResultItem
                                key={item.id}
                                onClick={() => onNavigateToKnowledge(item)}
                                icon={<Icons.LightbulbIcon className="h-5 w-5" />}
                                title={item.name}
                                context={item.content}
                                searchTerm={searchTerm}
                            />
                        ))}
                    </div>
                )}
                 {searchResults.plots.length > 0 && (
                     <div>
                        <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 px-3">プロットボード</h3>
                        {searchResults.plots.map(item => (
                            <SearchResultItem
                                key={item.id}
                                onClick={() => onNavigateToPlot(item)}
                                icon={<Icons.ClipboardListIcon className="h-5 w-5" />}
                                title={item.title}
                                context={item.summary}
                                searchTerm={searchTerm}
                            />
                        ))}
                    </div>
                )}
                 {searchResults.chunks.length > 0 && (
                     <div>
                        <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 px-3">小説本文</h3>
                        {searchResults.chunks.map(item => (
                            <SearchResultItem
                                key={item.id}
                                onClick={() => onNavigateToChunk(item.id)}
                                icon={<Icons.FileTextIcon className="h-5 w-5" />}
                                title={item.text.startsWith('# ') ? item.text.split('\n')[0].substring(2) : `本文スニペット`}
                                context={item.text}
                                searchTerm={searchTerm}
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-start z-50 pt-20"
            onClick={onClose}
        >
            <div
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl border border-gray-700 max-h-[70vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="relative">
                        <Icons.SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="プロジェクト全体を検索... (Escで閉じる)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md pl-10 pr-10 py-2 text-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                         <button onClick={onClose} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><Icons.XIcon className="h-5 w-5"/></button>
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-2">
                    {renderResults()}
                </div>
            </div>
        </div>
    );
};
