import { GenerateImagesResponse } from '@google/genai';
import { getAiClient, API_TIMEOUT, withTimeout, handleError } from './apiUtils';

export const generateImage = async ({ prompt }: { prompt: string }): Promise<{ success: true, data: string[] } | { success: false, error: Error }> => {
    try {
        const client = getAiClient();
        const response: GenerateImagesResponse = await withTimeout(client.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 4,
              outputMimeType: 'image/png',
              aspectRatio: '3:4',
            },
        }), API_TIMEOUT);
        
        const images = response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
        return { success: true as const, data: images };

    } catch (error) {
        return handleError(error, 'generateImage');
    }
};