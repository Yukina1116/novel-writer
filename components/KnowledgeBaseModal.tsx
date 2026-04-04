
import React, { useState, useMemo, useEffect } from 'react';
import * as Icons from '../icons';
import { KnowledgeItem } from '../types';
import { useStore } from '../store/index';
import { KnowledgeTutorial } from './KnowledgeTutorial';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';

interface KnowledgeBaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    knowledgeBase: KnowledgeItem[];
    onAddItem: () => void;
    onEditItem: (item: KnowledgeItem) => void;
    onDeleteItem: (id: string) => void;
    onTogglePin: (id: string) => void;
}


export const CategoryView: React.FC<{
    category: string;
    items: KnowledgeItem[];
    expanded: boolean;
    toggleCategory: () => void;
    attributes?: any;
    listeners?: any;
}> = ({ category, items, expanded, toggleCategory, attributes, listeners }) => (
    <>
        <div className="flex items-center gap-2 mb-2">
            <div {...(attributes as any)} {...(listeners as any)} className="cursor-grab text-gray-500 hover:text-gray-300">
                <Icons.GripVerticalIcon className="h-5 w-5" />
            </div>
            <button onClick={toggleCategory} className="flex-grow flex items-center gap-2 text-left text-lg font-semibold text-gray-300">
                {expanded ? <Icons.ChevronDownIcon className="h-5 w-5" /> : <Icons.ChevronRightIcon className="h-5 w-5" />}
                <span>{category}</span>
                <span className="text-sm font-normal text-gray-500">({items.length})</span>
            </button>
        </div>
    </>
);

export const SortableCategory: React.FC<{
    category: string;
    items: KnowledgeItem[];
    expanded: boolean;
    toggleCategory: () => void;
    onDeleteItem: (id: string) => void;
    onTogglePin: (id: string) => void;
    onEditItem: (item: KnowledgeItem) => void;
    handleToggleKnowledgeArchive: (id: string) => void;
    setDeletingId: (id: string | null) => void;
    deletingId: string | null;
    activeId: string | null;
}> = (props) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `cat-${props.category}` });
    const style = { transform: CSS.Transform.toString(transform), transition, width: '100%', opacity: props.activeId === `cat-${props.category}` ? 0.5 : 1 };

    return (
        <div ref={setNodeRef} style={style}>
            <CategoryView {...props} attributes={attributes} listeners={listeners} />
            {props.expanded && (
                <div className="space-y-2 pl-4">
                    <SortableContext items={props.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        {props.items.map(item => (
                            <SortableItem key={item.id} item={item} onDeleteItem={props.onDeleteItem} onTogglePin={props.onTogglePin} onEditItem={props.onEditItem} handleToggleKnowledgeArchive={props.handleToggleKnowledgeArchive} setDeletingId={(id) => props.setDeletingId(id)} deletingId={props.deletingId} activeId={props.activeId} />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
};

export const ItemView: React.FC<{
    item: KnowledgeItem;
    onDeleteItem: (id: string) => void;
    onTogglePin: (id: string) => void;
    onEditItem: (item: KnowledgeItem) => void;
    handleToggleKnowledgeArchive: (id: string) => void;
    setDeletingId: (id: string | null) => void;
    deletingId: string | null;
    attributes?: any;
    listeners?: any;
}> = ({ item, onDeleteItem, onTogglePin, onEditItem, handleToggleKnowledgeArchive, setDeletingId, deletingId, attributes, listeners }) => (
    <div key={item.id} className={`p-3 rounded-lg flex gap-2 ${item.isPinned ? 'bg-yellow-800/20' : 'bg-gray-900/50'} ${item.isArchived ? 'opacity-50' : ''} ${deletingId === item.id ? 'border border-red-500 bg-red-900/20' : ''}`}>
        <div {...(attributes as any)} {...(listeners as any)} className="cursor-grab text-gray-500 hover:text-gray-300 flex items-center">
            <Icons.GripVerticalIcon className="h-5 w-5" />
        </div>
        <div className="flex-grow overflow-hidden">
            <div className="flex justify-between items-start">
                <p className={`font-bold truncate ${item.isPinned ? 'text-yellow-300' : item.isArchived ? 'text-white' : 'text-yellow-400'}`}>{item.name}</p>
                <div className="flex gap-2 flex-shrink-0 ml-2">
                    {deletingId === item.id ? (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <span className="text-xs text-red-300 font-bold mr-1">削除?</span>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); setDeletingId(null); }} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded shadow-md">はい</button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded shadow-md">いいえ</button>
                        </div>
                    ) : (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); handleToggleKnowledgeArchive(item.id); }} className={`p-1 rounded-full ${item.isArchived ? 'text-white' : 'text-gray-400'} hover:bg-gray-700`} title={item.isArchived ? '参照に戻す' : '非参照にする'}>
                                <Icons.ArchiveIcon className="h-4 w-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onTogglePin(item.id); }} className={`p-1 rounded-full ${item.isPinned ? 'text-yellow-400' : 'text-gray-400'} hover:bg-yellow-500/20`} title={item.isPinned ? 'ピンを外す' : 'ピン留めする'}>
                                <Icons.PinIcon className={`h-4 w-4 ${item.isPinned ? 'fill-current' : ''}`} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onEditItem(item); }} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="編集">
                                <Icons.EditIcon className="h-4 w-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="削除">
                                <Icons.TrashIcon className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{item.content}</p>
            <div className="flex flex-wrap gap-1 mt-2">
                {item.tags?.map(tag => (
                    <span key={tag} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
            </div>
        </div>
    </div>
);

export const SortableItem: React.FC<{
    item: KnowledgeItem;
    onDeleteItem: (id: string) => void;
    onTogglePin: (id: string) => void;
    onEditItem: (item: KnowledgeItem) => void;
    handleToggleKnowledgeArchive: (id: string) => void;
    setDeletingId: (id: string | null) => void;
    deletingId: string | null;
    activeId: string | null;
}> = (props) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.item.id });
    const style = { transform: CSS.Transform.toString(transform), transition, width: '100%', opacity: props.activeId === props.item.id ? 0.5 : 1 };
    
    return (
        <div ref={setNodeRef} style={style}>
            <ItemView {...props} attributes={attributes} listeners={listeners} />
        </div>
    );
};

export const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({
    isOpen,
    onClose,
    knowledgeBase,
    onAddItem,
    onEditItem,
    onDeleteItem,
    onTogglePin,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    
    const hasCompletedGlobalKnowledgeTutorial = useStore(state => state.hasCompletedGlobalKnowledgeTutorial);
    const startKnowledgeTutorial = useStore(state => state.startKnowledgeTutorial);
    const setHelpTopic = useStore(state => state.setHelpTopic);
    const handleToggleKnowledgeArchive = useStore(state => state.handleToggleKnowledgeArchive);
    const reorderKnowledge = useStore(state => state.reorderKnowledge);
    const reorderKnowledgeCategories = useStore(state => state.reorderKnowledgeCategories);
    const rawKnowledgeCategoryOrder = useStore(state => state.allProjectsData[state.activeProjectId!]?.knowledgeCategoryOrder) as string[] | undefined;
    const knowledgeCategoryOrder = useMemo(() => rawKnowledgeCategoryOrder || [], [rawKnowledgeCategoryOrder]);
    const [localCategoryOrder, setLocalCategoryOrder] = useState<string[]>(knowledgeCategoryOrder);

    useEffect(() => {
        const allCategories = Array.from(new Set(knowledgeBase.map(k => k.category || '未分類')));
        const newOrder = [...knowledgeCategoryOrder];
        
        // localCategoryOrderに存在しないカテゴリを末尾に追加
        allCategories.forEach(cat => {
            if (!newOrder.includes(cat)) {
                newOrder.push(cat);
            }
        });
        
        // 逆に、knowledgeBaseに存在しなくなったカテゴリを削除
        const finalOrder = newOrder.filter(cat => allCategories.includes(cat));

        setLocalCategoryOrder(finalOrder);
    }, [knowledgeCategoryOrder, knowledgeBase]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setIsDragging(true);
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setIsDragging(false);
        setActiveId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // カテゴリの並び替え
        if ((active.id as string).startsWith('cat-') && (over.id as string).startsWith('cat-')) {
            const oldIndex = localCategoryOrder.indexOf((active.id as string).replace('cat-', ''));
            const newIndex = localCategoryOrder.indexOf((over.id as string).replace('cat-', ''));
            const newCategoryOrder = arrayMove(localCategoryOrder, oldIndex, newIndex) as string[];
            setLocalCategoryOrder(newCategoryOrder); // 即座に反映
            reorderKnowledgeCategories(newCategoryOrder); // ストアも更新
        } else {
            // アイテムの並び替え
            const oldIndex = knowledgeBase.findIndex(k => k.id === active.id);
            const newIndex = knowledgeBase.findIndex(k => k.id === over.id);
            const newKnowledgeBase = arrayMove(knowledgeBase, oldIndex, newIndex);
            const orderedKnowledgeBase = newKnowledgeBase.map((k, index) => ({ ...(k as any), order: index }));
            reorderKnowledge(orderedKnowledgeBase);
        }
    };

    useEffect(() => {
        if (isOpen && !hasCompletedGlobalKnowledgeTutorial) {
            const timer = setTimeout(() => {
                startKnowledgeTutorial();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, hasCompletedGlobalKnowledgeTutorial, startKnowledgeTutorial]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        knowledgeBase.forEach(item => {
            // Defensive check: ensure tags is an array before iterating
            if (Array.isArray(item.tags)) {
                item.tags.forEach(tag => {
                    if (typeof tag === 'string' && tag.trim()) {
                        tags.add(tag.trim());
                    }
                });
            }
        });
        return Array.from(tags).sort();
    }, [knowledgeBase]);

    useEffect(() => {
        if (isOpen) {
            // When opening, find all categories and set them to expanded by default.
            // Also, find newly added categories that weren't there before and expand them.
            const newExpanded: Record<string, boolean> = {};
            const allCategories = new Set(knowledgeBase.map(k => k.category || '未分類'));
            allCategories.forEach((cat: string) => {
                // If it's a new category or was previously expanded (or doesn't exist in old state), expand it.
                if (expandedCategories[cat] !== false) {
                    newExpanded[cat] = true;
                }
            });
            setExpandedCategories(newExpanded);
            setDeletingId(null);
        }
    }, [isOpen, knowledgeBase]);

    const handleTagClick = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const filteredAndSortedKnowledge = useMemo(() => {
        let filtered = [...knowledgeBase];

        // 1. Filter by selected tags (AND logic)
        if (selectedTags.length > 0) {
            filtered = filtered.filter(item =>
                selectedTags.every(tag => Array.isArray(item.tags) && item.tags.includes(tag))
            );
        }

        // 2. Filter by search term
        const term = searchTerm.toLowerCase();
        if (term) {
            filtered = filtered.filter(
                k =>
                    k.name.toLowerCase().includes(term) ||
                    k.content.toLowerCase().includes(term) ||
                    (k.category || '').toLowerCase().includes(term) ||
                    (Array.isArray(k.tags) && k.tags.some(t => t.toLowerCase().includes(term)))
            );
        }
        
        // 3. Sort by pin status then by order then by name
        filtered.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            
            return a.name.localeCompare(b.name, 'ja');
        });

        return filtered;
    }, [knowledgeBase, searchTerm, selectedTags]);

    const groupedByCategory = useMemo(() => {
        const groups = filteredAndSortedKnowledge.reduce((acc, item) => {
            const category = item.category || '未分類';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(item);
            return acc;
        }, {} as Record<string, KnowledgeItem[]>);

        return Object.entries(groups).sort((a, b) => {
            const catA = a[0];
            const catB = b[0];
            
            const indexA = localCategoryOrder.indexOf(catA);
            const indexB = localCategoryOrder.indexOf(catB);
            
            // localCategoryOrderにあるものはその順序で
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            
            // ないものは辞書順
            return catA.localeCompare(catB, 'ja');
        });
    }, [filteredAndSortedKnowledge, localCategoryOrder]);
    
    const toggleCategory = (category: string) => {
        if (isDragging) return;
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[70]">
            <KnowledgeTutorial />
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
                        <Icons.LibraryIcon className="h-6 w-6" />
                        ナレッジベース
                    </h2>
                    <div className="flex items-center gap-2">
                        <button id="tutorial-kb-add-btn" onClick={onAddItem} className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-600/80 text-white rounded-md hover:bg-yellow-600 transition btn-pressable">
                            <Icons.PlusCircleIcon />
                            新規項目を追加
                        </button>
                        <button type="button" onClick={() => setHelpTopic('knowledgeBase')} className="p-2 rounded-full hover:bg-gray-700 transition" aria-label="ヘルプ">
                            <Icons.HelpCircleIcon className="h-5 w-5 text-white" />
                        </button>
                         <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                    </div>
                </div>
                
                <div className="flex gap-4 mb-4 flex-shrink-0">
                    <div id="tutorial-kb-search" className="relative flex-grow">
                        <Icons.SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="ナレッジを検索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md pl-10 pr-4 py-2 text-sm text-white"
                        />
                    </div>
                </div>
                
                <div id="tutorial-kb-tags" className="mb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-400">タグ:</span>
                        {allTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => handleTagClick(tag)}
                                className={`px-2.5 py-1 text-xs rounded-full transition ${selectedTags.includes(tag) ? 'bg-indigo-600 text-white font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                            >
                                {tag}
                            </button>
                        ))}
                         {selectedTags.length > 0 && (
                            <button onClick={() => setSelectedTags([])} className="text-xs text-gray-400 hover:text-white">
                                <Icons.XIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div id="tutorial-kb-item-list" className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        {groupedByCategory.length > 0 ? (
                            <SortableContext items={groupedByCategory.map(([cat]) => `cat-${cat}`)} strategy={verticalListSortingStrategy}>
                                {groupedByCategory.map(([category, items]) => (
                                    <SortableCategory 
                                        key={category} 
                                        category={category} 
                                        items={items} 
                                        expanded={!!expandedCategories[category]} 
                                        toggleCategory={() => toggleCategory(category)}
                                        onDeleteItem={onDeleteItem}
                                        onTogglePin={onTogglePin}
                                        onEditItem={onEditItem}
                                        handleToggleKnowledgeArchive={handleToggleKnowledgeArchive}
                                        setDeletingId={setDeletingId}
                                        deletingId={deletingId}
                                        activeId={activeId}
                                    />
                                ))}
                            </SortableContext>
                        ) : (
                            <p className="text-center text-gray-500 py-8">
                                {searchTerm || selectedTags.length > 0 ? '条件に一致する項目はありません。' : 'ナレッジ項目がありません。'}
                            </p>
                        )}
                        <DragOverlay>
                            {activeId ? (
                                activeId.startsWith('cat-') ? (
                                    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 shadow-2xl cursor-grabbing w-full">
                                        <CategoryView 
                                            category={activeId.replace('cat-', '')} 
                                            items={groupedByCategory.find(([cat]) => `cat-${cat}` === activeId)?.[1] || []} 
                                            expanded={true} 
                                            toggleCategory={() => {}}
                                        />
                                    </div>
                                ) : (
                                    <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 shadow-2xl cursor-grabbing w-full">
                                        <ItemView 
                                            item={knowledgeBase.find(k => k.id === activeId)!} 
                                            onDeleteItem={() => {}} 
                                            onTogglePin={() => {}} 
                                            onEditItem={() => {}} 
                                            handleToggleKnowledgeArchive={() => {}} 
                                            setDeletingId={() => {}} 
                                            deletingId={null}
                                        />
                                    </div>
                                )
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>
        </div>
    );
};
