import { NovelChunk, SettingItem } from './types';
import { apiCall } from './apiClient';

export const generateNames = async ({ category, keywords }: { category: string; keywords: string }): Promise<{ success: true; data: string[] } | { success: false; error: Error }> => {
    return apiCall<string[]>('/utility/names', { category, keywords });
};

export const generateKnowledgeName = async ({ sentence }: { sentence: string }): Promise<{ success: true; data: { name: string } } | { success: false; error: Error }> => {
    return apiCall<{ name: string }>('/utility/knowledge-name', { sentence });
};

export const extractCharacterInfo = async ({ characterName, novelContent }: { characterName: string; novelContent: NovelChunk[] }): Promise<{ success: true; data: Partial<SettingItem> } | { success: false; error: Error }> => {
    return apiCall<Partial<SettingItem>>('/utility/extract-character', { characterName, novelContent });
};
