import { Type, GenerateContentResponse } from '@google/genai';
import { ChatMessage, SettingItem } from './types';
import { getAiClient, withTimeout, handleError, WRITE_API_TIMEOUT, API_TIMEOUT } from './apiUtils';

// --- System Instructions ---

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
    *   Example: User says "服装のアイデアを出して". Output MUST be: \`{"consultation_reply": "いいですね！ファンタジーな服装のアイデアですね。例えば、星空をモチーフにした、銀糸の刺繍が入った深い青色のローブなんてどうでしょう？それとも、動きやすい冒険者風の革鎧にしますか？"}\`
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
                        properties: { 
                            key: { type: Type.STRING }, 
                            value: { type: Type.STRING } 
                        },
                        required: ['key', 'value']
                    }
                }
            }
        }
    }
};

async function updateCharacterDataInternal(chatHistory: ChatMessage[], currentCharacterData: any | null, intent: 'consult' | 'update') {
    const client = getAiClient();
    const responseSchema = {
        ...characterSchema,
        properties: {
            ...characterSchema.properties,
            clarification_needed: {
                type: Type.STRING,
                description: "If the user's request is ambiguous, ask a clarifying question here. If you are providing a patch, this field MUST be null or omitted.",
                nullable: true
            },
            consultation_reply: {
                type: Type.STRING,
                description: "If the user is asking for ideas or having a general conversation, provide your creative response here.",
                nullable: true
            }
        },
        required: [], 
    };
    
    const singlePrompt = `
**Current Character Data (JSON):**
This is the data you are working with.
\`\`\`json
${JSON.stringify(currentCharacterData || {}, null, 2)}
\`\`\`

**User's Intent:**
This request is a "${intent}". 'update' means modify the data. 'consult' means brainstorm ideas without modifying data.

**User's Request:**
"${chatHistory[chatHistory.length - 1].text}"

**Your Task:**
Based on your system instructions, the user's intent, and their request, generate the appropriate JSON output.
`;


    const response: GenerateContentResponse = await withTimeout(client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: singlePrompt,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: responseSchema
        }
    }), WRITE_API_TIMEOUT);

    try {
        const parsedJson = JSON.parse(response.text);
        if (parsedJson.clarification_needed) {
            return { clarification_needed: parsedJson.clarification_needed };
        }
        if (parsedJson.consultation_reply) {
            return { consultation_reply: parsedJson.consultation_reply };
        }
        delete parsedJson.clarification_needed;
        delete parsedJson.consultation_reply;
        return parsedJson;
    } catch (e) {
        console.error("Failed to parse JSON from AI:", response.text);
        throw new Error("AIから無効なデータ形式を受け取りました。もう一度試してください。");
    }
}

async function generateCharacterReplyInternal(updatedCharacterData: any) {
    const client = getAiClient();
    const systemInstruction = `You are a friendly and helpful assistant for novel writing. Your task is to generate a conversational reply based on the character data provided.

***RULES***
1.  **INPUT:** You will receive a JSON object with a character's current profile.
2.  **TASK:** Formulate a brief, engaging reply in Japanese. Acknowledge the recent updates and ask a relevant follow-up question to encourage the user to provide more details (e.g., if personality was just added, ask about appearance).
3.  **OUTPUT:** Your response MUST be ONLY a JSON object with a single key "reply" containing the conversational text in Japanese.`;

    const prompt = `Here is the updated character profile:
${JSON.stringify(updatedCharacterData, null, 2)}

Please provide a conversational reply and a follow-up question based on this data.`;

    const response: GenerateContentResponse = await withTimeout(client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: { reply: { type: Type.STRING } },
                required: ['reply'],
            }
        }
    }), API_TIMEOUT);

    try {
      const parsedJson = JSON.parse(response.text);
      return parsedJson.reply;
    } catch(e) {
      console.error("Failed to parse JSON from AI for reply:", response.text);
      // If parsing fails, return a generic reply instead of crashing.
      return "設定を更新しました！他に何か追加したいことはありますか？";
    }
}

export const updateCharacterData = async (chatHistory: ChatMessage[], currentCharacterData: any | null, intent: 'consult' | 'update'): Promise<{ success: true, data: Partial<SettingItem> | { clarification_needed: string } | { consultation_reply: string } } | { success: false, error: Error }> => {
    try {
        const characterData = await updateCharacterDataInternal(chatHistory, currentCharacterData, intent);
        return { success: true as const, data: characterData };
    } catch (error) {
        return handleError(error, 'updateCharacterData');
    }
};

export const generateCharacterReply = async (updatedCharacterData: any) => {
    try {
        const reply = await generateCharacterReplyInternal(updatedCharacterData);
        return { success: true as const, data: { reply } };
    } catch (error) {
        return handleError(error, 'generateCharacterReply');
    }
};


// --- Image Prompt Generation ---
export const generateCharacterImagePrompt = async (chatHistory: ChatMessage[]) => {
    try {
        const client = getAiClient();
        const history = chatHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{text: m.text}] }));
        const systemInstruction = `You are an assistant that helps create prompts for an image generation AI.
        Based on the user's description, you will build a detailed prompt.

        **CRITICAL RULES:**
        1.  Your conversational replies ('reply' field) MUST be in Japanese. You should ask clarifying questions to gather details.
        2.  The final image generation prompt ('finalPrompt' field) MUST be a detailed, comma-separated list of keywords in English.
        3.  The 'finalPrompt' MUST ALWAYS start with the following keywords, exactly as written: "masterpiece, best quality, anime style, full body, 1girl, solo, simple white background, no text, no letters, ".
        4.  After these initial keywords, append the detailed character description you've gathered from the conversation, also as comma-separated English keywords.

        **WORKFLOW:**
        - Engage in a conversation with the user to refine the character's appearance.
        - When the user indicates they are ready to generate (e.g., "画像生成して", "それでお願い"), you MUST:
            - Set the 'reply' field to an empty string.
            - Construct the 'finalPrompt' according to the CRITICAL RULES above.
        - For all other conversational turns, you MUST:
            - Provide a question or comment in the 'reply' field.
            - Set the 'finalPrompt' field to an empty string.`;

        const response: GenerateContentResponse = await withTimeout(client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: history,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        reply: { type: Type.STRING, description: "Your conversational reply or question in Japanese." },
                        finalPrompt: { type: Type.STRING, description: "The final, English, comma-separated prompt for the image AI." }
                    },
                    required: ['reply', 'finalPrompt']
                }
            }
        }), WRITE_API_TIMEOUT);
        
        const data = JSON.parse(response.text);
        return { success: true as const, data };
    } catch (error) {
        return handleError(error, 'generateCharacterImagePrompt');
    }
};