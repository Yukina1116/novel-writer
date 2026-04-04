import { Type, GenerateContentResponse } from '@google/genai';
import { NovelChunk, SettingItem } from '../../types';
import { getAiClient, TEXT_MODEL } from '../aiClient';

export const generateNames = async (category: string, keywords: string): Promise<string[]> => {
    const client = getAiClient();
    const prompt = `Generate a list of 10 unique Japanese names based on the following criteria. If keywords are provided, they describe a character's traits, so the generated names should strongly reflect the atmosphere and imagery of those traits. Return only a JSON array of strings, without any surrounding text or markdown.
Categories: ${category}
Keywords: ${keywords}
Example Format: ["名前1", "名前2", "名前3"]`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: "You are a name generation assistant specialized in creating Japanese names. You must only output Japanese names. Absolutely do not use English characters.",
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });

    return JSON.parse(response.text.trim());
};

export const generateKnowledgeName = async (sentence: string): Promise<{ name: string }> => {
    const client = getAiClient();
    const prompt = `以下の文章を、小説の世界観設定（ナレッジベース）に登録するための、簡潔な「名前（タイトル）」に要約してください。
出力は "name" というキーを持つJSONオブジェクト形式で、名前は日本語でお願いします。

文章: "${sentence}"
`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: "あなたは、文章を要約して簡潔なタイトルを作成する専門のアシスタントです。提供された文章に最もふさわしい、短い単語やフレーズを生成してください。出力は必ず指定されたJSON形式に従ってください。",
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "要約された簡潔な名前（タイトル）。" }
                },
                required: ['name']
            }
        }
    });

    return JSON.parse(response.text);
};

export const extractCharacterInfo = async (characterName: string, novelContent: NovelChunk[]): Promise<Partial<SettingItem>> => {
    const client = getAiClient();
    const extractSystemInstruction = `You are an expert literary analyst. Your task is to extract detailed information about a specific character from a novel's text. You MUST analyze the entire text provided. Based on your analysis, you MUST populate a JSON object according to the provided schema.

- Analyze all descriptions related to the character: physical appearance, personality, manner of speech, abilities, background, etc.
- Synthesize this information and fill in the corresponding fields in the JSON schema.
- For 'appearance.traits', create key-value pairs for distinct physical features (e.g., {"key": "髪の色", "value": "銀色"}).
- If information for a field is not found, omit the field from the JSON object.
- Your response MUST be ONLY the valid JSON object, with no other text or markdown.
- All output must be in Japanese.`;

    const prompt = `Novel Text:
${novelContent.map(c => c.text).join('\n\n')}

Character to extract: "${characterName}"`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: extractSystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    furigana: { type: Type.STRING },
                    gender: { type: Type.STRING },
                    age: { type: Type.STRING },
                    species: { type: Type.STRING },
                    personality: { type: Type.STRING },
                    speechPattern: { type: Type.STRING },
                    longDescription: { type: Type.STRING },
                    appearance: {
                        type: Type.OBJECT,
                        properties: {
                            traits: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { key: { type: Type.STRING }, value: { type: Type.STRING } }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    return JSON.parse(response.text);
};
