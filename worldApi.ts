import { ChatMessage } from './types';
import { apiCall } from './apiClient';

export const updateWorldData = async (
    chatHistory: ChatMessage[],
    currentWorldData: any | null,
    intent: 'consult' | 'update'
) => {
    return apiCall<any>('/world/update', { chatHistory, currentWorldData, intent });
};

export const generateWorldReply = async (updatedWorldData: any) => {
    return apiCall<{ reply: string; meta_notes?: string }>('/world/reply', { updatedWorldData });
};
