import { SettingItem, KnowledgeItem, PlotItem, LeftPanelTab, FloatingWindow, UserMode, UndoScope, ToastMessage, ModalType } from '../types';
import { v4 as uuidv4 } from 'uuid';

const initialState = {
    // Unified Modal State
    activeModal: null as ModalType | null,
    modalPayload: null as any,
    isModalDirty: false,
    isConfirmingClose: false,
    pendingModalRequest: null as { type: ModalType; payload: any } | null,

    // Other UI states
    isEditingTitle: false,
    projectTitle: '',
    editingChunkId: null as string | null,
    highlightedChunkId: null as string | null,
    leftPanelTab: 'settings' as LeftPanelTab,
    floatingWindows: [] as FloatingWindow[],
    isLeftSidebarOpen: true,
    isRightSidebarOpen: true,
    leftSidebarWidth: 350,
    rightSidebarWidth: 450,
    newChunkText: '',
    isNewChunkInputOpen: false,
    isLeftPanelDropdownOpen: false,
    draggedChapterId: null as string | null,
    dropTargetId: null as string | null,
    userMode: 'standard' as UserMode,
    undoScope: 'all' as UndoScope,
    toast: null as ToastMessage | null,
    historyPanelHeight: 250,
    isHistoryPanelDocked: true,
    highlightedEventId: null as string | null,
    pinnedSettingIds: [] as string[],
    helpTopic: null as string | null,
    pinnedPanel: null as LeftPanelTab | null,
    showToastNotifications: true,
};

export interface UiSlice {
    activeModal: ModalType | null;
    modalPayload: any;
    isModalDirty: boolean;
    isConfirmingClose: boolean;
    pendingModalRequest: { type: ModalType; payload: any } | null;

    isEditingTitle: boolean;
    projectTitle: string;
    editingChunkId: string | null;
    highlightedChunkId: string | null;
    leftPanelTab: LeftPanelTab;
    floatingWindows: FloatingWindow[];
    isLeftSidebarOpen: boolean;
    isRightSidebarOpen: boolean;
    leftSidebarWidth: number;
    rightSidebarWidth: number;
    newChunkText: string;
    isNewChunkInputOpen: boolean;
    isLeftPanelDropdownOpen: boolean;
    draggedChapterId: string | null;
    dropTargetId: string | null;
    userMode: UserMode;
    undoScope: UndoScope;
    toast: ToastMessage | null;
    historyPanelHeight: number;
    isHistoryPanelDocked: boolean;
    highlightedEventId: string | null;
    pinnedSettingIds: string[];
    helpTopic: string | null;
    pinnedPanel: LeftPanelTab | null;
    showToastNotifications: boolean;

    openModal: (type: ModalType, payload?: any) => void;
    closeModal: () => void;
    forceCloseModal: () => void;
    confirmCloseAction: (action: 'save' | 'discard') => void;
    cancelCloseAction: () => void;
    setModalDirty: (isDirty: boolean) => void;
    
    setProjectTitle: (title: string) => void;
    setIsEditingTitle: (isEditing: boolean) => void;
    setEditingChunkId: (id: string | null) => void;
    setHighlightedChunkId: (id: string | null) => void;
    setHighlightedEventId: (id: string | null) => void;
    setHelpTopic: (topic: string | null) => void;
    setLeftPanelTab: (tab: LeftPanelTab) => void;
    setPinnedPanel: (panel: LeftPanelTab | null) => void;
    addFloatingWindow: (type: LeftPanelTab) => void;
    removeFloatingWindow: (id: string) => void;
    focusWindow: (id: string) => void;
    updateWindowPosition: (id: string, position: { x: number; y: number }) => void;
    updateWindowSize: (id: string, size: { width: number; height: number }) => void;
    setIsLeftSidebarOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
    setIsRightSidebarOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
    setLeftSidebarWidth: (width: number) => void;
    setRightSidebarWidth: (width: number) => void;
    setNewChunkText: (text: string) => void;
    setIsNewChunkInputOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
    setIsLeftPanelDropdownOpen: (isOpen: boolean) => void;
    setUserMode: (mode: UserMode) => void;
    setUndoScope: (scope: UndoScope) => void;
    showToast: (message: string, type?: ToastMessage['type']) => void;
    setHistoryPanelHeight: (height: number) => void;
    setIsHistoryPanelDocked: (isDocked: boolean) => void;
    togglePinnedSetting: (id: string) => void;
    setShowToastNotifications: (show: boolean) => void;
}

export const createUiSlice = (set, get): UiSlice => ({
    ...initialState,

    // --- New Modal Management Logic ---
    openModal: (type, payload = null) => {
        const { activeModal, isModalDirty } = get();

        if (type === 'help') {
            get().setHelpTopic(payload?.topic || null);
            return;
        }

        if (activeModal === type) return;

        const open = () => {
            set({
                activeModal: type,
                modalPayload: payload,
                isModalDirty: false,
                isConfirmingClose: false,
                pendingModalRequest: null,
            });
        };

        if (activeModal) {
            if (isModalDirty) {
                set({ isConfirmingClose: true, pendingModalRequest: { type, payload } });
            } else {
                get().forceCloseModal();
                setTimeout(open, 50); // Open on next tick after closing animation
            }
        } else {
            open();
        }
    },
    
    closeModal: () => {
        const { isModalDirty } = get();
        if (isModalDirty) {
            set({ isConfirmingClose: true, pendingModalRequest: null });
        } else {
            get().forceCloseModal();
        }
    },

    forceCloseModal: () => {
        set({
            activeModal: null,
            modalPayload: null,
            isModalDirty: false,
            isConfirmingClose: false,
        });
    },

    confirmCloseAction: (action) => {
        const { pendingModalRequest, forceCloseModal, openModal } = get();
        
        if (action === 'save') {
             document.querySelector<HTMLButtonElement>('[data-testid="modal-save-button"]')?.click();
             forceCloseModal();
             if (pendingModalRequest) {
                setTimeout(() => openModal(pendingModalRequest.type, pendingModalRequest.payload), 100);
             }
        } else { // 'discard'
             forceCloseModal();
             if (pendingModalRequest) {
                openModal(pendingModalRequest.type, pendingModalRequest.payload);
             }
        }
    },
    
    cancelCloseAction: () => {
        set({ isConfirmingClose: false, pendingModalRequest: null });
    },
    
    setModalDirty: (isDirty) => {
        set({ isModalDirty: isDirty });
    },
    
    // --- Other UI State ---
    setProjectTitle: (title) => set({ projectTitle: title }),
    setIsEditingTitle: (isEditing) => set({ isEditingTitle: isEditing }),
    setEditingChunkId: (id) => set({ editingChunkId: id }),
    setHighlightedChunkId: (id) => set({ highlightedChunkId: id }),
    setHighlightedEventId: (id) => set({ highlightedEventId: id }),
    setHelpTopic: (topic) => set({ helpTopic: topic }),
    setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
    setPinnedPanel: (panel) => set({ pinnedPanel: panel }),
    addFloatingWindow: (type) => {
        const { floatingWindows } = get();
        const existing = floatingWindows.find(w => w.type === type);
        if (existing) {
            get().focusWindow(existing.id);
            return;
        }

        if (type === 'history') {
            set({ isHistoryPanelDocked: false });
        }

        const maxZ = Math.max(100, ...floatingWindows.map(w => w.zIndex));
        const newWindow: FloatingWindow = {
            id: uuidv4(),
            type,
            position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
            size: { width: 350, height: 500 },
            zIndex: maxZ + 1,
        };
        set({ floatingWindows: [...floatingWindows, newWindow] });
    },
    removeFloatingWindow: (id) => {
        set(state => {
            const windowToRemove = state.floatingWindows.find(w => w.id === id);
            if (windowToRemove?.type === 'history') {
                return {
                    floatingWindows: state.floatingWindows.filter(w => w.id !== id),
                    isHistoryPanelDocked: true
                };
            }
            return {
                floatingWindows: state.floatingWindows.filter(w => w.id !== id)
            };
        });
    },
    focusWindow: (id) => {
        set(state => {
            const windows = state.floatingWindows;
            const maxZ = Math.max(100, ...windows.map(w => w.zIndex));
            return {
                floatingWindows: windows.map(w => 
                    w.id === id ? { ...w, zIndex: maxZ + 1 } : w
                )
            };
        });
    },
    updateWindowPosition: (id, position) => {
        set(state => ({
            floatingWindows: state.floatingWindows.map(w =>
                w.id === id ? { ...w, position } : w
            )
        }));
    },
    updateWindowSize: (id, size) => {
        set(state => ({
            floatingWindows: state.floatingWindows.map(w =>
                w.id === id ? { ...w, size } : w
            )
        }));
    },
    setIsLeftSidebarOpen: (isOpen) => {
        const newIsOpen = typeof isOpen === 'function' ? isOpen(get().isLeftSidebarOpen) : isOpen;
        set({ isLeftSidebarOpen: newIsOpen });
    },
    setIsRightSidebarOpen: (isOpen) => {
        const newIsOpen = typeof isOpen === 'function' ? isOpen(get().isRightSidebarOpen) : isOpen;
        set({ isRightSidebarOpen: newIsOpen });
    },
    setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
    setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
    setNewChunkText: (text) => set({ newChunkText: text }),
    setIsNewChunkInputOpen: (isOpen) => {
        const newIsOpen = typeof isOpen === 'function' ? isOpen(get().isNewChunkInputOpen) : isOpen;
        set({ isNewChunkInputOpen: newIsOpen });
    },
    setIsLeftPanelDropdownOpen: (isOpen) => set({ isLeftPanelDropdownOpen: isOpen }),
    setUserMode: (mode) => set({ userMode: mode }),
    setUndoScope: (scope) => set({ undoScope: scope }),
    showToast: (message, type = 'info') => {
        if (!get().showToastNotifications) return;
        set({ toast: { id: Date.now(), message, type } });
        setTimeout(() => {
            set(state => state.toast?.message === message ? { toast: null } : {});
        }, 2500); // Wait a bit longer than the animation
    },
    setHistoryPanelHeight: (height) => set({ historyPanelHeight: height }),
    setIsHistoryPanelDocked: (isDocked: boolean) => set({ isHistoryPanelDocked: isDocked }),
    togglePinnedSetting: (id: string) => {
        const { pinnedSettingIds, showToast } = get();
        const isPinned = pinnedSettingIds.includes(id);

        if (isPinned) {
            set({ pinnedSettingIds: pinnedSettingIds.filter(pid => pid !== id) });
            showToast('クイック設定から削除しました');
        } else {
            // 制限を撤廃
            set({ pinnedSettingIds: [...pinnedSettingIds, id] });
            showToast('クイック設定に追加しました', 'success');
        }
    },
    setShowToastNotifications: (show) => set({ showToastNotifications: show }),
});