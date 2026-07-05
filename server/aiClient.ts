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
        // gemini-3.1-flash-lite / gemini-3.1-flash-lite-image はいずれも asia-northeast1
        // では 404 NOT_FOUND (2026-07-05 prod 実機検証で確認、region-scoped では未提供)。
        // global エンドポイント固定とする。旧 GCP_LOCATION env var は本設定では未使用。
        client = new GoogleGenAI({
            vertexai: true,
            project,
            location: 'global',
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

export const TEXT_MODEL = 'gemini-3.1-flash-lite';
export const IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

// Vertex AI 専用パラメータ (例: imageConfig.personGeneration) は Gemini Developer API
// (APIキーモード) では SDK 側で reject されるため、呼び出し側で分岐する必要がある。
export const isVertexAiMode = (): boolean => process.env.USE_VERTEX_AI === 'true';
