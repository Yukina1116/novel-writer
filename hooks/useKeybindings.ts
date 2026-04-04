
import React, { useEffect } from 'react';
// FIX: The file 'store.ts' does not exist, changed import to 'store/index.ts'.
import { useStore } from '../store/index';
import { ModalType } from '../types';

interface UseKeybindingsProps {
    isAnyModalOpen: boolean;
    editingChunkId: string | null;
    openModal: (type: ModalType, payload?: any) => void;
    setIsLeftSidebarOpen: (update: (prev: boolean) => boolean) => void;
    setIsRightSidebarOpen: (update: (prev: boolean) => boolean) => void;
    userInputRef: React.RefObject<HTMLTextAreaElement>;
    generationMode: 'write' | 'consult';
    setGenerationMode: (mode: 'write' | 'consult') => void;
    undo: () => void;
    redo: () => void;
    novelContent: any[]; // Simplified type for dependency
    setEditingChunkId: (id: string | null) => void;
}

export const useKeybindings = ({
    isAnyModalOpen,
    editingChunkId,
    openModal,
    setIsLeftSidebarOpen,
    setIsRightSidebarOpen,
    userInputRef,
    generationMode,
    setGenerationMode,
    undo,
    redo,
    novelContent,
    setEditingChunkId
}: UseKeybindingsProps) => {
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            if (isCtrlOrCmd && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const editor = document.getElementById('novel-editor-content');
                if (!editor) return;

                const chapterElements = Array.from(editor.querySelectorAll('[id^="chapter-scroll-"]'));
                if (chapterElements.length < 2) return;
                
                const viewportCenter = editor.getBoundingClientRect().top + editor.clientHeight / 2;
                
                let closestChapterIndex = -1;
                let minDistance = Infinity;

                chapterElements.forEach((el, index) => {
                    const distance = Math.abs(el.getBoundingClientRect().top - viewportCenter);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestChapterIndex = index;
                    }
                });

                if (closestChapterIndex !== -1) {
                    if (e.key === 'ArrowDown') {
                        const nextIndex = closestChapterIndex + 1;
                        if (nextIndex < chapterElements.length) {
                            chapterElements[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    } else { // ArrowUp
                        const prevIndex = closestChapterIndex - 1;
                        if (prevIndex >= 0) {
                            chapterElements[prevIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
                return;
            }

            if (isCtrlOrCmd) {
                 if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
                 if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
                 if (e.key === 'f') { e.preventDefault(); openModal('globalSearch'); return; }
                 if (e.key === 'k') { e.preventDefault(); openModal('commandPalette'); return; }
                if (e.key === 's') {
                    if (e.altKey) {
                        e.preventDefault();
                        openModal('aiSettings');
                        return;
                    }
                    e.preventDefault();
                    document.querySelector<HTMLButtonElement>('[data-testid="modal-save-button"]')?.click();
                    return;
                }
                if (e.shiftKey) {
                    switch (e.key.toLowerCase()) {
                        case 'm':
                            e.preventDefault();
                            setGenerationMode(generationMode === 'write' ? 'consult' : 'write');
                            break;
                        case 'c':
                            e.preventDefault();
                            openModal('characterChart');
                            break;
                        case 't':
                            e.preventDefault();
                            openModal('timeline');
                            break;
                        case 'p':
                             e.preventDefault();
                             openModal('plot');
                             break;
                        case 'g':
                             e.preventDefault();
                             openModal('nameGenerator');
                             break;
                        case 'k':
                             e.preventDefault();
                             openModal('knowledgeBase');
                             break;
                    }
                    return;
                }

                if (!isInputFocused) {
                    switch(e.key) {
                        case '1':
                            e.preventDefault();
                            (document.querySelector('#tutorial-left-panel button, #tutorial-left-panel a') as HTMLElement)?.focus();
                            break;
                        case '2':
                            e.preventDefault();
                            (document.getElementById('novel-editor-content') as HTMLElement)?.focus();
                            break;
                        case '3':
                            e.preventDefault();
                            userInputRef.current?.focus();
                            break;
                        case 'i':
                            if (e.altKey) {
                                e.preventDefault();
                                useStore.getState().setIsNewChunkInputOpen(p => !p);
                            }
                            break;
                        case 'c': if (e.altKey) { e.preventDefault(); openModal('character'); } break;
                        case 'w': if (e.altKey) { e.preventDefault(); openModal('world'); } break;
                        case 'k': if (e.altKey && !isCtrlOrCmd) { e.preventDefault(); openModal('knowledge'); } break;
                        case 'a': if (e.altKey) { e.preventDefault(); openModal('importText'); } break; // Alt+Aを追加
                        case '[': e.preventDefault(); setIsLeftSidebarOpen(p => !p); break;
                        case ']': e.preventDefault(); setIsRightSidebarOpen(p => !p); break;
                        case '/': 
                            if (userInputRef && userInputRef.current) {
                                e.preventDefault();
                                userInputRef.current.focus();
                            }
                            break;
                    }
                }
            }

            if (e.key === 'ArrowUp' && !isInputFocused) {
                if (isAnyModalOpen || editingChunkId) return;
                e.preventDefault();
                if (novelContent && novelContent.length > 0) {
                    const lastChunk = novelContent[novelContent.length - 1];
                    if (lastChunk) {
                        setEditingChunkId(lastChunk.id);
                        document.getElementById(`chunk-${lastChunk.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isAnyModalOpen, editingChunkId, openModal, setEditingChunkId, undo, redo, novelContent, userInputRef, generationMode, setGenerationMode, setIsLeftSidebarOpen, setIsRightSidebarOpen]);
};
