import { Type, GenerateContentResponse } from '@google/genai';
import { ChatMessage, SettingItem } from '../../types';
import { getAiClient, TEXT_MODEL } from '../aiClient';

const systemInstruction = `You are a multi-modal assistant for character creation. Your task is to analyze a user's request based on their specified **intent** and respond in the correct JSON format.

***CRITICAL RULES:***

1.  **CHECK THE USER'S INTENT:** The user will explicitly state their intent as either 'update' or 'consult'. You MUST follow the instructions for that intent precisely.

2.  **IF INTENT IS 'update':**
    *   The user wants to modify the character data. Your goal is to generate a JSON "patch" or ask a clarifying question.
    *   **If the request is clear:** Generate a JSON "patch" object containing ONLY the modified or new fields. NEVER return the full character object.
        -   Example: User says "彼の性格を『冷酷非道』に変更して". Output MUST be: \`{"personality": "冷酷非道"}\`.
    *   **If the request is ambiguous:** If the user's request to update data is vague (e.g., "彼の外見を更新して"), you MUST ask for clarification. Generate a JSON object with a single key: \`"clarification_needed"\`.
        -   Example Output: \`{"clarification_needed": "承知しました。外見のどの部分を更新しますか？（例：髪の色、目の色、服装など）"}\`.
    *   Under the 'update' intent, you MUST NOT use the "consultation_reply" field.

3.  **IF INTENT IS 'consult':**
    *   The user wants to brainstorm or have a conversation. You MUST NOT generate a data patch or ask for data-entry style clarification.
    *   Your role is to be a creative partner. Respond conversationally.
    *   To do this, generate a JSON object with a single key: \`"consultation_reply"\`. The value will be your creative, conversational response in Japanese.
    *   Under the 'consult' intent, you MUST NOT generate a JSON patch or use the "clarification_needed" field.

4.  **Output Format:** Your entire output MUST BE a single, valid JSON object matching one of the three structures described above. No other text is allowed. All string values inside the JSON must be in Japanese.`;

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

    const singlePrompt = `
**Current Character Data (JSON):**
\`\`\`json
${JSON.stringify(currentCharacterData || {}, null, 2)}
\`\`\`

**User's Intent:** "${intent}"

**User's Request:**
"${chatHistory[chatHistory.length - 1].text}"

**Your Task:**
Based on your system instructions, the user's intent, and their request, generate the appropriate JSON output.
`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: singlePrompt,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema
        }
    });

    const parsedJson = JSON.parse(response.text);
    if (parsedJson.clarification_needed) return { clarification_needed: parsedJson.clarification_needed };
    if (parsedJson.consultation_reply) return { consultation_reply: parsedJson.consultation_reply };
    delete parsedJson.clarification_needed;
    delete parsedJson.consultation_reply;
    return parsedJson;
};

export const generateCharacterReply = async (updatedCharacterData: any) => {
    const client = getAiClient();
    const replySystemInstruction = `You are a friendly and helpful assistant for novel writing. Your task is to generate a conversational reply based on the character data provided.

***RULES***
1.  **INPUT:** You will receive a JSON object with a character's current profile.
2.  **TASK:** Formulate a brief, engaging reply in Japanese. Acknowledge the recent updates and ask a relevant follow-up question.
3.  **OUTPUT:** Your response MUST be ONLY a JSON object with a single key "reply" containing the conversational text in Japanese.`;

    const prompt = `Here is the updated character profile:
${JSON.stringify(updatedCharacterData, null, 2)}

Please provide a conversational reply and a follow-up question based on this data.`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: replySystemInstruction,
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
