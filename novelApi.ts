import { NovelChunk, ChatMessage, SettingItem, KnowledgeItem, AiSettings, Relation, PlotItem, UserMode } from './types';
import { apiCall } from './apiClient';

export const generateNovelContinuation = async (params: {
    prompt: string;
    generationMode: 'write' | 'consult';
    aiSettings: AiSettings;
    knowledgeBase: KnowledgeItem[];
    settings: SettingItem[];
    characterRelations: Relation[];
    novelContent: NovelChunk[];
    plotBoard: PlotItem[];
    userName?: string;
    userMode: UserMode;
}) => {
    return apiCall<{
        replyText: string;
        newChunk: { id: string; text: string } | null;
        continuations: Array<{ title: string; text: string }> | null;
        suggestions: { knowledge: string[]; plot: Array<{ title: string; summary: string; type: string }> };
        extractCharacterRequest: { name: string } | null;
    }>('/novel/generate', params);
};
