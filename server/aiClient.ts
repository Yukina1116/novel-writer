import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export const getAiClient = (): GoogleGenAI => {
    if (client) return client;

    if (process.env.USE_VERTEX_AI === 'true') {
        client = new GoogleGenAI({
            vertexai: true,
            project: process.env.GCP_PROJECT || 'novel-writer-dev',
            location: process.env.GCP_LOCATION || 'asia-northeast1',
        });
    } else {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set. Set USE_VERTEX_AI=true for Vertex AI mode.');
        }
        client = new GoogleGenAI({ apiKey });
    }

    return client;
};

export const TEXT_MODEL = 'gemini-2.5-flash';
export const IMAGE_MODEL = 'imagen-4.0-generate-001';
