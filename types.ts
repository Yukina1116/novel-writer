
import * as React from 'react';

export type UserMode = 'simple' | 'standard' | 'pro';

export interface AiSettings {
    perspective: string;
    length: number;
    tone: string;
    creativity: string;
    knowledgeAdherence: string;
    suggestionFrequency: string;
    memoryScope: string;
    assistantPersona: string;
    markdownFrequency: string;
    showSpeakerInDialogue: boolean;
    writingStyleMimicry: boolean;
    generateMultipleContinuations: boolean;
    applySpeakerColorToDialogue: boolean;
}

export interface DisplaySettings {
    theme: 'light' | 'sepia' | 'dark';
    fontFamily: string;
    fontSize: number;
    swapSidebars?: boolean;
}

export interface NovelChunk {
    id: string;
    text: string;
    memo?: string;
    isPinned?: boolean;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
    mode: 'write' | 'consult';
}

export interface SettingItem {
    id: string;
    type: 'character' | 'world';
    name: string;
    longDescription?: string;
    memo?: string;
    exportDescription?: string;
    isAutoFilled?: boolean;
    
    // Character specific
    furigana?: string;
    gender?: string;
    age?: string;
    species?: string;
    firstPersonPronoun?: string;
    personality?: string;
    origin?: string;
    affiliation?: string;
    speechPattern?: string;
    secret?: string;
    themeColor?: string;
    hairColor?: string;
    eyeColor?: string;
    appearance?: {
        imageUrl: string;
        traits: { key: string, value: string }[];
    };
    
    // World specific
    fields?: { key: string, value: string }[];
    mapImageUrl?: string;
}

export interface KnowledgeItem {
    id: string;
    name: string;
    content: string;
    category?: string;
    tags?: string[];
    isPinned?: boolean;
    isAutoFilled?: boolean;
    isArchived?: boolean;
    order?: number;
}

export interface PlotItem {
    id: string;
    title: string;
    summary: string;
    type: string;
    linkedEventId?: string;
    lastModified?: number;
}

// FIX: Added missing Relation interface for character chart.
export interface Relation {
    id: string;
    source: string;
    target: string;
    label: string;
    color: string;
    callName?: string;
}

// FIX: Added missing NodePosition interface for character chart.
export interface NodePosition {
    characterId: string;
    x: number;
    y: number;
}

// FIX: Added missing PlotRelation interface for plot board.
export interface PlotRelation {
    id: string;
    source: string;
    target: string;
    label: string;
    memo?: string;
    color?: string;
}

// FIX: Added missing PlotNodePosition interface for plot board.
export interface PlotNodePosition {
    plotId: string;
    x: number;
    y: number;
}

// FIX: Added missing TimelineEvent interface for timeline.
export interface TimelineEvent {
    id: string;
    title: string;
    timestamp: string;
    description: string;
    laneId: string;
    locationId?: string;
    customLocationName?: string;
    lastModified?: number;
    linkedPlotId?: string;
}

// FIX: Added missing TimelineLane interface for timeline lanes.
export interface TimelineLane {
    id: string;
    name: string;
    color: string;
}

export interface ExtractedCharacterDetail {
  name: string;
  age: number | null;
  gender: string | null;
  personality: string;
  speechStyle: string;
  role: string;
  confidence: "high" | "medium" | "low";
  suggestedColor?: string;
  summary: string;
  detailDescription: string;
  memo: string;
  dialogueSamples: string[]; // 新規追加: セリフサンプル3件
}

export interface AnalysisResult {
  characters: {
    match: string[];
    similar: { text: string; target: string }[];
    new: string[];
    extractedDetails: ExtractedCharacterDetail[];
  };
  worldContext: {
    worldKeywords: string[];
    genre: string;
    tone: string;
  };
  worldTerms: {
    match: string[];
    similar: { text: string; target: string }[];
    new: { name: string; description: string }[]; 
  };
  dialogues: {
    text: string;
    possibleSpeaker: string | null;
  }[];
  notes: string[];
}

export interface AppState {
    allProjectsData: { [key: string]: Project };
    activeProjectId: string | null;
    userInput: string;
    isLoading: boolean;
    aiSuggestions: {
        knowledge: string[];
        plot: PlotItem[];
    };
    archivedKnowledgeSuggestions: { id: string; content: string }[];
    archivedPlotSuggestions: PlotItem[];
    generationMode: 'write' | 'consult';
    highlightedChunkId: string | null;
    projectTitle: string;
    editingChunkId: string | null;
    saveStatus: 'synced' | 'saving' | 'dirty' | 'error';
    isImageGenerating: boolean;
    leftPanelTab: LeftPanelTab;
    floatingWindows: FloatingWindow[];
    isLeftSidebarOpen: boolean;
    isRightSidebarOpen: boolean;
    leftSidebarWidth: number;
    rightSidebarWidth: number;
    newChunkText: string;
    isNewChunkInputOpen: boolean;
    isLeftPanelDropdownOpen: boolean;
    continuationChoices: { id: string; title: string; text: string }[] | null;
    historyTree: HistoryTree;
    lastUserPrompt: string | null;
    draggedChapterId: string | null;
    dropTargetId: string | null;
    isTutorialActive: boolean;
    tutorialStep: number;
    isKnowledgeTutorialActive: boolean;
    knowledgeTutorialStep: number;
    isChartTutorialActive: boolean;
    chartTutorialStep: number;
    isPlotBoardTutorialActive: boolean;
    plotBoardTutorialStep: number;
    isTimelineTutorialActive: boolean;
    timelineTutorialStep: number;
    hasCompletedGlobalTutorial?: boolean;
    hasCompletedGlobalKnowledgeTutorial?: boolean;
    hasCompletedGlobalChartTutorial?: boolean;
    hasCompletedGlobalPlotBoardTutorial?: boolean;
    hasCompletedGlobalTimelineTutorial?: boolean;
    userMode: UserMode;
    undoScope: UndoScope;
    toast: ToastMessage | null;
    historyPanelHeight: number;
    isHistoryPanelDocked: boolean;
    highlightedEventId: string | null;
    
    activeModal: ModalType | null;
    modalPayload: any;
    isModalDirty: boolean;
    isConfirmingClose: boolean;
    pendingModalRequest: null | { type: ModalType; payload: any };

    pinnedSettingIds: string[];

    lastAnalysisResult: AnalysisResult | null;
}

export interface Project {
    id: string;
    name: string;
    lastModified: string;
    isSimpleMode?: boolean;
    settings: SettingItem[];
    novelContent: NovelChunk[];
    chatHistory: ChatMessage[];
    knowledgeBase: KnowledgeItem[];
    knowledgeCategoryOrder?: string[];
    plotBoard: PlotItem[];
    plotTypeColors: { [key: string]: string };
    plotRelations: PlotRelation[];
    plotNodePositions: PlotNodePosition[];
    timeline: TimelineEvent[];
    timelineLanes: TimelineLane[];
    characterRelations: Relation[];
    nodePositions: NodePosition[];
    userProfile?: {
        iconUrl: string;
        name?: string;
    };
    historyTree?: HistoryTree;
    aiSettings: AiSettings;
    displaySettings: DisplaySettings;
}

export type LeftPanelTab = 'settings' | 'characters' | 'worlds' | 'knowledge' | 'plots' | 'outline' | 'history';

export interface FloatingWindow {
    id: string;
    type: LeftPanelTab;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
}

export type HistoryType = "editor" | "character" | "world" | "knowledge" | "plot" | "timeline" | "chart" | "ai" | "settings" | "outline";
export type UndoScope = "all" | "text-only" | "ai-only" | "data-only";

export interface HistoryNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  timestamp: number;
  type: HistoryType;
  label: string;
  payload: Project;
}

export interface HistoryTree {
    nodes: Record<string, HistoryNode>;
    currentNodeId: string | null;
    rootId: string | null;
}

export interface ToastMessage {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error';
}

export type ModalType =
  | 'character'
  | 'world'
  | 'knowledge'
  | 'plot'
  | 'aiSettings'
  | 'preview'
  | 'help'
  | 'generalHelp'
  | 'characterChart'
  | 'htmlExport'
  | 'timeline'
  | 'nameGenerator'
  | 'knowledgeBase'
  | 'chapterSettings'
  | 'globalSearch'
  | 'commandPalette'
  | 'syncDialog'
  | 'tutorialModeSelection'
  | 'displaySettings'
  | 'importText'
  | 'importConflict';

// --- Backup (M4) ---

// Schema version for full-data backup. Bump when adding/removing top-level
// keys or changing project-field shape. Importing a higher version must fail
// loudly (AC-4) so users do not silently lose data.
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupV1 {
    schemaVersion: 1;
    exportedAt: string;
    appVersion: string;
    projects: Project[];
    tutorialState: {
        hasCompletedGlobalTutorial?: boolean;
        hasCompletedGlobalKnowledgeTutorial?: boolean;
        hasCompletedGlobalChartTutorial?: boolean;
        hasCompletedGlobalPlotBoardTutorial?: boolean;
        hasCompletedGlobalTimelineTutorial?: boolean;
    };
    analysisHistory: AnalysisResult[];
}

export type ImportConflictResolution = 'overwrite' | 'duplicate' | 'skip';

export interface ImportConflict {
    incomingId: string;
    incomingName: string;
    existingName: string;
    resolution: ImportConflictResolution;
}

export interface ImportPlan {
    backup: BackupV1;
    conflicts: ImportConflict[];
}

export interface AppActions {
    loadInitialState: () => void;
    setActiveProjectId: (id: string | null) => void;
    createProject: (projectName: string, mode: 'simple' | 'standard') => void;
    deleteProject: (projectId: string) => void;
    importProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
    exportHtml: (options: any) => void;

    setSimpleMode: (isSimple: boolean) => void;
    setUserInput: (input: string) => void;
    setGenerationMode: (mode: 'write' | 'consult') => void;
    setHighlightedChunkId: (id: string | null) => void;
    setLeftPanelTab: (tab: LeftPanelTab) => void;
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
    setContinuationChoices: (choices: { id: string; title: string; text: string }[] | null) => void;
    setProjectTitle: (title: string) => void;
    setIsEditingTitle: (isEditing: boolean) => void;

    openModal: (type: ModalType, payload?: any) => void;
    closeModal: () => void;
    forceCloseModal: () => void;
    confirmCloseAction: (action: 'save' | 'discard') => void;
    cancelCloseAction: (action: 'save' | 'discard') => void;
    setModalDirty: (isDirty: boolean) => void;

    setActiveProjectData: (updater: (data: Project) => Project, historyLabel?: { type: HistoryType; label: string }, options?: { mode: 'merge' | 'replace' }) => void;
}
