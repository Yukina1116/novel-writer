import { GenerateImagesResponse } from '@google/genai';
import { getAiClient, IMAGE_MODEL } from '../aiClient';

export const generateImage = async (prompt: string): Promise<string[]> => {
    const client = getAiClient();
    const response: GenerateImagesResponse = await client.models.generateImages({
        model: IMAGE_MODEL,
        prompt,
        config: {
            numberOfImages: 4,
            outputMimeType: 'image/png',
            aspectRatio: '3:4',
        },
    });

    return response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
};
