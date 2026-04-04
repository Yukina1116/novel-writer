import { ChatMessage, SettingItem } from './types';
import { apiCall } from './apiClient';

export const updateCharacterData = async (
    chatHistory: ChatMessage[],
    currentCharacterData: any | null,
    intent: 'consult' | 'update'
): Promise<{ success: true; data: Partial<SettingItem> | { clarification_needed: string } | { consultation_reply: string } } | { success: false; error: Error }> => {
    return apiCall('/character/update', { chatHistory, currentCharacterData, intent });
};

export const generateCharacterReply = async (updatedCharacterData: any) => {
    return apiCall<{ reply: string }>('/character/reply', { updatedCharacterData });
};

export const generateCharacterImagePrompt = async (chatHistory: ChatMessage[]) => {
    return apiCall<{ reply: string; finalPrompt: string }>('/character/image-prompt', { chatHistory });
};
