import { v4 as uuidv4 } from 'uuid';
import { AppState, ChatMessage, NovelChunk, PlotItem, SettingItem } from '../types';
import * as novelApi from '../novelApi';
import * as utilityApi from '../utilityApi';

const initialState = {
    userInput: '',
    isLoading: false,
    aiSuggestions: { knowledge: [], plot: [] } as { knowledge: string[]; plot: PlotItem[] },
    archivedKnowledgeSuggestions: [] as { id: string; content: string }[],
    archivedPlotSuggestions: [] as PlotItem[],
    generationMode: 'write' as 'write' | 'consult',
    isImageGenerating: false,
    continuationChoices: null as { id: string; title: string; text: string }[] | null,
    lastUserPrompt: null as string | null,
};

export interface AiSlice {
    userInput: string;
    isLoading: boolean;
    aiSuggestions: { knowledge: string[]; plot: PlotItem[] };
    archivedKnowledgeSuggestions: { id: string; content: string }[];
    archivedPlotSuggestions: PlotItem[];
    generationMode: 'write' | 'consult';
    isImageGenerating: boolean;
    continuationChoices: { id: string; title: string; text: string }[] | null;
    lastUserPrompt: string | null;

    setUserInput: (input: string) => void;
    setGenerationMode: (mode: 'write' | 'consult') => void;
    setContinuationChoices: (choices: { id: string; title: string; text: string }[] | null) => void;
    submitMessage: (promptOverride?: string) => Promise<void>;
    handleAdoptContinuation: (text: string) => void;
    handleRejectContinuation: (id: string) => void;
    regenerateContinuations: () => Promise<void>;
    handleApproveSuggestion: (suggestion: any, type: 'knowledge' | 'plot') => void;
    handleRejectSuggestion: (suggestion: any, type: 'knowledge' | 'plot') => void;
    setIsImageGenerating: (isGenerating: boolean) => void;
}

export const createAiSlice = (set, get): AiSlice => ({
    ...initialState,
    setUserInput: (input) => set({ userInput: input }),
    setGenerationMode: (mode) => set({ generationMode: mode }),
    setContinuationChoices: (choices) => set({ continuationChoices: choices }),
    submitMessage: async (promptOverride) => {
        const { userInput, isLoading, generationMode, activeProjectId, allProjectsData, userMode, setActiveProjectData } = get();
        
        // 防御処理: promptOverride が MouseEvent など文字列以外の場合に文字列として扱わないようにする
        const actualOverride = typeof promptOverride === 'string' ? promptOverride : undefined;
        const currentInput = actualOverride || userInput;
        
        if (!currentInput.trim() || isLoading || !activeProjectId) return;
        
        const activeProject = allProjectsData[activeProjectId];
        if (!activeProject) return;

        const { chatHistory, aiSettings, knowledgeBase, settings, userProfile } = activeProject;
        
        const effectiveAiSettings = { ...aiSettings };
        if (userMode === 'simple') {
            effectiveAiSettings.generateMultipleContinuations = false;
        }
        
        const isRegenerating = !!actualOverride;

        const userMessage: ChatMessage = { role: 'user', text: currentInput, mode: generationMode };
        const chatHistoryForRequest = isRegenerating ? chatHistory : [...chatHistory, userMessage];
        
        set({ isLoading: true, userInput: '', continuationChoices: null, lastUserPrompt: currentInput });
        
        if (!isRegenerating) {
            setActiveProjectData(d => ({ ...d, chatHistory: chatHistoryForRequest }), { type: 'ai', label: 'AIへメッセージを送信' });
        }

        const result = await novelApi.generateNovelContinuation({
            prompt: currentInput,
            generationMode,
            aiSettings: effectiveAiSettings,
            knowledgeBase,
            settings,
            characterRelations: activeProject.characterRelations || [],
            novelContent: activeProject.novelContent || [],
            plotBoard: activeProject.plotBoard || [],
            userName: userProfile?.name,
            userMode: userMode,
        });
        
        set({ isLoading: false });

        if (result.success === false) {
            const errorMessage: ChatMessage = { role: 'assistant', text: `エラーが発生しました: ${result.error.message}`, mode: generationMode };
            setActiveProjectData(d => ({ ...d, chatHistory: [...d.chatHistory, errorMessage] }), { type: 'ai', label: 'AIエラー応答' });
            return;
        }

        const { replyText, newChunk, continuations, suggestions, extractCharacterRequest } = result.data;
        
        if (extractCharacterRequest) {
            set({ isLoading: true });
            const extractResult = await utilityApi.extractCharacterInfo({
                characterName: extractCharacterRequest.name,
                novelContent: activeProject.novelContent,
            });
            set({ isLoading: false });

            if (extractResult.success === false) {
                alert(`キャラクター「${extractCharacterRequest.name}」の情報の自動抽出に失敗しました。手動で設定してください。\nエラー: ${extractResult.error.message}`);
                get().openModal({ name: extractCharacterRequest.name } as SettingItem, 'character');
                return;
            }
            
            const initialData = { name: extractCharacterRequest.name, ...extractResult.data };
            get().openModal(initialData as SettingItem, 'character');
            return;
        }
        
        const suggestionsWithIds = {
            ...suggestions,
            plot: (suggestions.plot || []).map(p => ({...p, id: uuidv4()})),
        };

        let filteredSuggestions = suggestionsWithIds;
        const currentProjectForFilter = get().allProjectsData[activeProjectId];
        if (suggestions.knowledge && suggestions.knowledge.length > 0 && currentProjectForFilter) {
            const existingKnowledgeNames = new Set(currentProjectForFilter.knowledgeBase.map(k => k.name));
            const existingKnowledgeContent = new Set(currentProjectForFilter.knowledgeBase.map(k => k.content));
            
            const uniqueKnowledgeSuggestions = suggestions.knowledge.filter(s => 
                !existingKnowledgeNames.has(s) && !existingKnowledgeContent.has(s)
            );

            filteredSuggestions = {
                ...suggestionsWithIds,
                knowledge: uniqueKnowledgeSuggestions,
            };
        }

        const assistantMessage: ChatMessage = { role: 'assistant', text: replyText, mode: generationMode };
        
        setActiveProjectData(d => {
            let finalNovelContent = d.novelContent;
            if (newChunk) {
                finalNovelContent = [...d.novelContent, newChunk];
                set({ highlightedChunkId: newChunk.id });
            }
            return { ...d, chatHistory: [...d.chatHistory, assistantMessage], novelContent: finalNovelContent, lastModified: new Date().toISOString() };
        }, { type: 'ai', label: 'AIからの返答' });
        
        if (continuations && continuations.length > 0) {
            set({ continuationChoices: continuations.map(c => ({ ...c, id: uuidv4() })) });
        }
        
        set({ aiSuggestions: filteredSuggestions });
    },
    handleAdoptContinuation: (text) => {
        const newChunk: NovelChunk = { id: uuidv4(), text };
        get().setActiveProjectData(d => ({ ...d, novelContent: [...d.novelContent, newChunk], lastModified: new Date().toISOString() }), { type: 'editor', label: 'AIの提案を採用' });
        set({ continuationChoices: null, highlightedChunkId: newChunk.id });
    },
    handleRejectContinuation: (id) => {
        set(state => ({
            continuationChoices: state.continuationChoices ? state.continuationChoices.filter(c => c.id !== id) : null
        }));
    },
    regenerateContinuations: async () => {
        const { lastUserPrompt, submitMessage } = get();
        if (lastUserPrompt) {
            await submitMessage(lastUserPrompt);
        }
    },
    handleApproveSuggestion: (suggestion, type) => {
        if (type === 'knowledge') {
            get().handleSaveSetting({ name: suggestion as string, content: suggestion as string }, 'knowledge');
            set(state => ({
                archivedKnowledgeSuggestions: state.archivedKnowledgeSuggestions.filter(s => s.content !== suggestion)
            }));
             set(state => ({
                aiSuggestions: {
                    ...state.aiSuggestions,
                    knowledge: state.aiSuggestions.knowledge.filter(s => s !== suggestion)
                }
            }));
        } else if (type === 'plot') {
            const { title, summary, type: plotType, id } = suggestion as PlotItem;
            const newPlotItem = { id, title, summary, type: plotType };
            get().setActiveProjectData(d => ({
                ...d,
                plotBoard: [...d.plotBoard, newPlotItem],
                plotTypeColors: { ...d.plotTypeColors, [plotType]: d.plotTypeColors?.[plotType] || '#6b7280' }
            }), { type: 'plot', label: `プロット「${title}」を追加` });
            set(state => ({
                archivedPlotSuggestions: state.archivedPlotSuggestions.filter(s => s.id !== id)
            }));
            set(state => ({
                aiSuggestions: {
                    ...state.aiSuggestions,
                    plot: state.aiSuggestions.plot.filter(s => s.id !== id)
                }
            }));
        }
    },
    handleRejectSuggestion: (suggestion, type) => {
        set(state => {
            if (type === 'knowledge') {
                const newArchived = { id: uuidv4(), content: suggestion as string };
                return {
                    aiSuggestions: {
                        ...state.aiSuggestions,
                        knowledge: state.aiSuggestions.knowledge.filter(s => s !== suggestion)
                    },
                    archivedKnowledgeSuggestions: [newArchived, ...state.archivedKnowledgeSuggestions]
                };
            } else if (type === 'plot') {
                const plotSuggestion = suggestion as PlotItem;
                 return {
                    aiSuggestions: {
                        ...state.aiSuggestions,
                        plot: state.aiSuggestions.plot.filter(s => s.id !== plotSuggestion.id)
                    },
                     archivedPlotSuggestions: [plotSuggestion, ...state.archivedPlotSuggestions]
                };
            }
            return state;
        });
    },
    setIsImageGenerating: (isGenerating) => set({ isImageGenerating: isGenerating }),
});