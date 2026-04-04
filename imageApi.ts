import { apiCall } from './apiClient';

export const generateImage = async ({ prompt }: { prompt: string }): Promise<{ success: true; data: string[] } | { success: false; error: Error }> => {
    return apiCall<string[]>('/image/generate', { prompt });
};
