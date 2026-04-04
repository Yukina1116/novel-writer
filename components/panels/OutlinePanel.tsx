
import React, { useMemo, useState } from 'react';
import * as Icons from '../../icons';
import { useStore } from '../../store/index';
import { NovelChunk } from '../../types';

const EMPTY_ARRAY: any[] = [];

export const OutlinePanel = ({ isFloating = false, isMobile = false }) => {
    const activeProjectId = useStore(state => state.activeProjectId);
    const novelContent = useStore(state => state.allProjectsData?.[activeProjectId || '']?.novelContent || EMPTY_ARRAY);
    const openModal = useStore(state => state.openModal);
    const addChapter = useStore(state => state.addChapter);
    const handleDeleteChapter = useStore(state => state.handleDeleteChapter);
    const draggedChapterId = useStore(state => state.draggedChapterId);
    const dropTargetId = useStore(state => state.dropTargetId);
    const handleChapterDrop = useStore(state => state.handleChapterDrop);
    const addFloatingWindow = useStore(state => state.addFloatingWindow);
    const setIsLeftSidebarOpen = useStore(state => state.setIsLeftSidebarOpen);

    const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);
    
    const chapters = useMemo(() => {
        if (!novelContent) return [];
        
        return novelContent
            .filter((chunk, index) => {
                const isTitle = chunk.text.startsWith('# ');
                const isFirstChunkAndNotTitle = index === 0 && !isTitle;
                return isTitle || isFirstChunkAndNotTitle;
            })
            .map(chunk => {
                const isUncategorized = !chunk.text.startsWith('# ');
                const title = isUncategorized 
                    ? '章に属さない文章' 
                    : chunk.text.split('\n')[0].substring(2).trim() || '無題の章';
                
                return {
                    id: chunk.id,
                    title: title,
                    memo: isUncategorized ? undefined : chunk.memo,
                    isUncategorized: isUncategorized
                };
            });
    }, [novelContent]);

    const handleChapterJump = (chapterId: string) => {
        document.getElementById(`chapter-scroll-${chapterId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (isMobile) setIsLeftSidebarOpen(false);
    };

    const handleOpenChapterSettings = (chapter: { id: string; title: string; memo?: string; isUncategorized: boolean }) => {
        openModal('chapterSettings', { id: chapter.id, title: chapter.title, memo: chapter.memo || '', isUncategorized: chapter.isUncategorized });
    };
    
    const handleChapterDragStart = (e: React.DragEvent<HTMLDivElement>, chapterId: string) => {
        if (isMobile) return; // Mobile drag is not supported via HTML5 API
        useStore.setState({ draggedChapterId: chapterId });
        e.dataTransfer.effectAllowed = 'move';
        const itemElement = (e.currentTarget as HTMLElement).closest('.outline-item');
        if (itemElement) {
            setTimeout(() => itemElement.classList.add('dragging'), 0);
        }
    };

    const handleChapterDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
    const handleChapterDragEnter = (e: React.DragEvent<HTMLDivElement>, chapterId: string) => { 
        if (isMobile) return;
        if (draggedChapterId && draggedChapterId !== chapterId) {
            useStore.setState({ dropTargetId: chapterId });
        }
    };
    
    const onChapterDrop = (e: React.DragEvent<HTMLDivElement>, dropOnChapterId: string) => { 
        e.preventDefault(); 
        if (isMobile) return;
        if (!draggedChapterId || draggedChapterId === dropOnChapterId) { 
            useStore.setState({ dropTargetId: null }); 
            return; 
        } 
        handleChapterDrop(dropOnChapterId); 
    };
    
    const handleChapterDragEnd = () => { 
        document.querySelectorAll('.outline-item.dragging').forEach(el => el.classList.remove('dragging')); 
        useStore.setState({ draggedChapterId: null, dropTargetId: null }); 
    };

    const confirmDelete = (e: React.MouseEvent, chapterId: string) => {
        e.stopPropagation();
        handleDeleteChapter(chapterId);
        setDeletingChapterId(null);
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeletingChapterId(null);
    };

    const initiateDelete = (e: React.MouseEvent, chapterId: string) => {
        e.stopPropagation();
        setDeletingChapterId(chapterId);
    };

    return (
         <div className="flex flex-col h-full">
            {!isFloating && (
                <div className="p-2 border-b border-gray-700/50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <Icons.ListOrderedIcon className="h-4 w-4" />
                        アウトライン
                    </h3>
                    {!isMobile && (
                        <button
                            onClick={() => addFloatingWindow('outline')}
                            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 btn-pressable"
                            title="ウィンドウ化"
                        >
                            <Icons.ExternalLinkIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            )}
            <div className="outline-panel-container p-2">
                <div className="outline-list space-y-1">
                    {chapters.map(chapter => (
                        <div
                            key={chapter.id}
                            onDragOver={handleChapterDragOver}
                            onDrop={(e) => onChapterDrop(e, chapter.id)}
                            onDragEnter={(e) => handleChapterDragEnter(e, chapter.id)}
                            className={`outline-item group relative ${dropTargetId === chapter.id ? 'drag-over-top' : ''} ${deletingChapterId === chapter.id ? 'bg-red-900/30 border border-red-800' : ''}`}
                        >
                            {!isMobile && (
                                <div
                                    className="drag-handle"
                                    title="ドラッグして並び替え"
                                    draggable="true"
                                    onDragStart={(e) => handleChapterDragStart(e, chapter.id)}
                                    onDragEnd={handleChapterDragEnd}
                                >
                                    <Icons.GripVerticalIcon className="h-4 w-4" />
                                </div>
                            )}
                            
                            {deletingChapterId === chapter.id ? (
                                <div className="flex items-center justify-between w-full p-1 animate-fade-in">
                                    <span className="text-sm text-red-300 font-bold mr-2">削除しますか？</span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={(e) => confirmDelete(e, chapter.id)} 
                                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded shadow-md btn-pressable"
                                        >
                                            はい
                                        </button>
                                        <button 
                                            onClick={cancelDelete} 
                                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded shadow-md btn-pressable"
                                        >
                                            いいえ
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => handleChapterJump(chapter.id)} className="title btn-pressable text-left">{chapter.title}</button>
                                    <div 
                                        className={`actions ${isMobile ? 'mobile-always-show' : ''} flex items-center relative z-10`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation();
                                                handleOpenChapterSettings(chapter); 
                                            }} 
                                            title="章を編集" 
                                            className={`btn-pressable rounded-full text-gray-400 hover:bg-gray-700 hover:text-white ${isMobile ? 'p-3' : 'p-1'}`}
                                        >
                                            <Icons.EditIcon className="h-4 w-4" />
                                        </button>
                                        {!chapter.isUncategorized && (
                                            <button 
                                                onClick={(e) => initiateDelete(e, chapter.id)} 
                                                title="章を削除" 
                                                className={`btn-pressable rounded-full text-gray-500 hover:text-red-400 hover:bg-gray-700 ${isMobile ? 'p-3' : 'p-1'}`}
                                            >
                                                <Icons.TrashIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-2 border-t border-gray-700/50">
                    <button onClick={addChapter} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition btn-pressable"><Icons.PlusCircleIcon className="h-4 w-4" /> 新しい章を追加</button>
                </div>
            </div>
        </div>
    );
};
