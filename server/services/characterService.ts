import { Type, GenerateContentResponse } from '@google/genai';
import { ChatMessage, SettingItem } from '../../types';
import { getAiClient, TEXT_MODEL } from '../aiClient';
import {
    CHARACTER_UPDATE_SYSTEM_INSTRUCTION,
    CHARACTER_REPLY_SYSTEM_INSTRUCTION,
    buildCharacterContents,
    sanitizeCharacterPatch,
} from './characterPrompt';

const characterSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, nullable: true },
        furigana: { type: Type.STRING, nullable: true },
        gender: { type: Type.STRING, nullable: true },
        age: { type: Type.STRING, nullable: true },
        species: { type: Type.STRING, nullable: true },
        origin: { type: Type.STRING, nullable: true },
        affiliation: { type: Type.STRING, nullable: true },
        firstPersonPronoun: { type: Type.STRING, nullable: true },
        personality: { type: Type.STRING, nullable: true },
        speechPattern: { type: Type.STRING, nullable: true },
        secret: { type: Type.STRING, nullable: true },
        themeColor: { type: Type.STRING, nullable: true },
        longDescription: { type: Type.STRING, nullable: true },
        appearance: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
                imageUrl: { type: Type.STRING, nullable: true },
                traits: {
                    type: Type.ARRAY,
                    nullable: true,
                    items: {
                        type: Type.OBJECT,
                        properties: { key: { type: Type.STRING }, value: { type: Type.STRING } },
                        required: ['key', 'value']
                    }
                }
            }
        }
    }
};

export const updateCharacterData = async (chatHistory: ChatMessage[], currentCharacterData: any | null, intent: 'consult' | 'update') => {
    const client = getAiClient();
    const responseSchema = {
        ...characterSchema,
        properties: {
            ...characterSchema.properties,
            clarification_needed: { type: Type.STRING, nullable: true },
            consultation_reply: { type: Type.STRING, nullable: true }
        },
        required: [],
    };

    // 空履歴ガード（P2）: 従来は配列末尾参照で例外になっていた。
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        return { clarification_needed: 'どのようなキャラクターにしたいか、もう少し教えてください。' };
    }

    // 症状A の中核: 最後の1件だけでなく会話履歴全体をマルチターンで渡す。
    const contents = buildCharacterContents(chatHistory, currentCharacterData, intent);

    // 履歴がすべて assistant 等で user ターンが残らなかった場合のガード（空 contents で API を呼ばない）。
    if (contents.length === 0) {
        return { clarification_needed: 'どのようなキャラクターにしたいか、もう少し教えてください。' };
    }

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents,
        config: {
            systemInstruction: CHARACTER_UPDATE_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema
        }
    });

    const parsedJson = JSON.parse(response.text);
    if (parsedJson.clarification_needed) return { clarification_needed: parsedJson.clarification_needed };
    if (parsedJson.consultation_reply) return { consultation_reply: parsedJson.consultation_reply };
    delete parsedJson.clarification_needed;
    delete parsedJson.consultation_reply;
    // null/undefined を除去し、既存値の意図しない上書きを防ぐ（P2）。
    return sanitizeCharacterPatch(parsedJson);
};

export interface CharacterReplyContext {
    latestUserMessage?: string;
    appliedPatch?: Record<string, unknown>;
}

export const generateCharacterReply = async (updatedCharacterData: any, context?: CharacterReplyContext) => {
    const client = getAiClient();

    const contextLines: string[] = [];
    if (context?.latestUserMessage) {
        contextLines.push(`The user's latest message was: "${context.latestUserMessage}"`);
    }
    if (context?.appliedPatch && Object.keys(context.appliedPatch).length > 0) {
        contextLines.push(`The change just applied to the profile: ${JSON.stringify(context.appliedPatch)}`);
    }
    const contextBlock = contextLines.length > 0 ? `\n\n${contextLines.join('\n')}` : '';

    const prompt = `Here is the updated character profile:
${JSON.stringify(updatedCharacterData, null, 2)}${contextBlock}

Please provide a conversational reply that reflects what was just changed, and a relevant follow-up question.`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: CHARACTER_REPLY_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: { reply: { type: Type.STRING } },
                required: ['reply'],
            }
        }
    });

    try {
        return JSON.parse(response.text).reply;
    } catch {
        return "設定を更新しました！他に何か追加したいことはありますか？";
    }
};

export const generateCharacterImagePrompt = async (chatHistory: ChatMessage[]) => {
    const client = getAiClient();
    const history = chatHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    const imgSystemInstruction = `You are an assistant that helps create prompts for an image generation AI.
    Based on the user's description, you will build a detailed prompt.

    **CRITICAL RULES:**
    1.  Your conversational replies ('reply' field) MUST be in Japanese.
    2.  The final image generation prompt ('finalPrompt' field) MUST be a detailed, comma-separated list of keywords in English.
    3.  The 'finalPrompt' MUST ALWAYS start with: "masterpiece, best quality, anime style, full body, 1girl, solo, simple white background, no text, no letters, ".
    4.  After these initial keywords, append the detailed character description.

    **WORKFLOW:**
    - When the user indicates they are ready to generate (e.g., "画像生成して", "それでお願い"):
        - Set 'reply' to an empty string.
        - Construct the 'finalPrompt'.
    - For all other turns:
        - Provide a question or comment in 'reply'.
        - Set 'finalPrompt' to an empty string.`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: history,
        config: {
            systemInstruction: imgSystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    reply: { type: Type.STRING },
                    finalPrompt: { type: Type.STRING }
                },
                required: ['reply', 'finalPrompt']
            }
        }
    });

    return JSON.parse(response.text);
};
