import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;
let imageClient: GoogleGenAI | null = null;

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

// Nano Banana 2 Lite (gemini-3.1-flash-lite-image) は Global エンドポイントのみ対応
// (2026-07-05 移行時点の実測知見)。Vertex モードでは region 固定の getAiClient() とは
// 別インスタンスが必要。API キーモードには region の概念がないため getAiClient() を共用する。
export const getImageAiClient = (): GoogleGenAI => {
    if (process.env.USE_VERTEX_AI !== 'true') {
        return getAiClient();
    }

    if (imageClient) return imageClient;

    const project = process.env.GCP_PROJECT;
    if (!project) {
        throw new Error(
            'Vertex AI image client initialization failed: GCP_PROJECT env var must be set when USE_VERTEX_AI=true. ' +
            'Check Cloud Run / GitHub Actions deploy workflow env-vars (.github/workflows/deploy*.yml).'
        );
    }
    imageClient = new GoogleGenAI({
        vertexai: true,
        project,
        location: 'global',
    });

    return imageClient;
};

export const TEXT_MODEL = 'gemini-3.1-flash-lite';
export const IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
