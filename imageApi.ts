import { apiCall } from './apiClient';

export const generateImage = async (
    { prompt, isAdditionalGeneration = false }: { prompt: string; isAdditionalGeneration?: boolean },
): Promise<{ success: true; data: string[] } | { success: false; error: Error }> => {
    return apiCall<string[]>('/image/generate', { prompt, isAdditionalGeneration });
};
