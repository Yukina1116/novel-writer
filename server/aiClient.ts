import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export const getAiClient = (): GoogleGenAI => {
    if (client) return client;

    if (process.env.USE_VERTEX_AI === 'true') {
        // 2026-06-20 Phase 2 prod migration の paired fail-fast (firebaseAdmin.ts と同設計)。
        // hardcoded 'novel-writer-dev' fallback は本番で wrong project に AI 呼出を撃つ
        // silent bug を生む (Vertex AI is per-project)。env 未設定で startup error にする。
        const project = process.env.GCP_PROJECT;
        if (!project) {
            throw new Error(
                'Vertex AI client initialization failed: GCP_PROJECT env var must be set when USE_VERTEX_AI=true. ' +
                'Check Cloud Run / GitHub Actions deploy workflow env-vars (.github/workflows/deploy*.yml).'
            );
        }
        client = new GoogleGenAI({
            vertexai: true,
            project,
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
