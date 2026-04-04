import { Type, GenerateContentResponse } from '@google/genai';
import { ChatMessage } from '../../types';
import { getAiClient, TEXT_MODEL } from '../aiClient';

const systemInstruction = `
You are a world-building assistant AI.
Your job is to interpret the user's intent ("update" or "consult") and return **a single valid JSON object** in response.

***CORE PRINCIPLES:***
1. Respect the user's world tone and continuity.
2. Keep the data schema consistent — never output invalid structures.
3. Always reply in **Japanese**.
4. Output must be **only JSON**, no extra text.

---

🧭 INTENT RULES

If intent = "update":
- Three cases:
  1. **Empty fields exist** → ask to fill them next.
     → Output: {"clarification_needed": "〜を教えてください。"}
  2. **Direct field change** → apply patch.
     → Output: {"fields": [{"key": "通貨単位", "value": "ギル"}]}
  3. **Ambiguous request** → ask for clarification.
     → Output: {"clarification_needed": "〜とは、どの部分を指しますか？"}

If intent = "consult":
→ Output: {"consultation_reply": "〜"}

---

🧩 VALID JSON STRUCTURES
1. {"fields": [{"key": "X", "value": "Y"}]}
2. {"clarification_needed": "質問文"}
3. {"consultation_reply": "返答文"}

Do NOT mix keys from different structures.
`;

const worldSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, nullable: true },
        fields: {
            type: Type.ARRAY,
            nullable: true,
            items: {
                type: Type.OBJECT,
                properties: { key: { type: Type.STRING }, value: { type: Type.STRING } },
                required: ['key', 'value']
            }
        },
        longDescription: { type: Type.STRING, nullable: true },
        memo: { type: Type.STRING, nullable: true },
        exportDescription: { type: Type.STRING, nullable: true },
        mapImageUrl: { type: Type.STRING, nullable: true },
    },
};

export const updateWorldData = async (chatHistory: ChatMessage[], currentWorldData: any | null, intent: 'consult' | 'update') => {
    const client = getAiClient();
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            ...worldSchema.properties,
            clarification_needed: { type: Type.STRING, nullable: true },
            consultation_reply: { type: Type.STRING, nullable: true },
        },
        required: []
    };

    const singlePrompt = `
あなたは���世界観AIくん」です。
ユーザーの世界構築を支援し、自然なやり取りを通じて設定を発展させます。

【これ��での会話】
${chatHistory.map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`).join('\n')}

【現在の世界データ】
${JSON.stringify(currentWorldData || {}, null, 2)}

【ユーザーの意図】"${intent}"
【最新のリクエスト】"${chatHistory[chatHistory.length - 1].text}"

---

🎯 **出力ルール**
- intent が "update" の場合:
  - 明確な指示 → {"fields": [...]}
  - 曖昧な指示 → {"clarification_needed": "..."}
- intent が "consult" の場合:
  - {"consultation_reply": "..."}
他のキーを同時に含めないでください。

出力は **有効な JSON オブジェクト1つのみ**。
`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: singlePrompt,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
        }
    });

    const parsedJson = JSON.parse(response.text);
    if (parsedJson.clarification_needed) return { clarification_needed: parsedJson.clarification_needed };
    if (parsedJson.consultation_reply) return { consultation_reply: parsedJson.consultation_reply };
    return parsedJson;
};

export const generateWorldReply = async (updatedWorldData: any) => {
    const client = getAiClient();
    const replySystemInstruction = `
あなたは「世界観AIくん」です。
ユーザーが構築している世界設定を理解し、親しみやすく・かつ的確にコメントします。
開発者的・物語設計的な視点も自然に織り交ぜて構いません。
ただし「メタ的に言うと」などの表現は避けてください。

***出力形式***
JSONで返すこと：
{
  "reply": "ユーザーへの自然なコメント",
  "meta_notes": "整合性・改善案・補足（任意）"
}
`;

    const prompt = `
以下は最新の世界データです。
更新内容を踏まえて、コメントと補足を生成してください。

【世界データ】
${JSON.stringify(updatedWorldData, null, 2)}

出力は JSON オブジェクト1つのみです。
`;

    const response: GenerateContentResponse = await client.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: replySystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    reply: { type: Type.STRING },
                    meta_notes: { type: Type.STRING, nullable: true },
                },
                required: ['reply'],
            }
        }
    });

    try {
        return JSON.parse(response.text);
    } catch {
        return { reply: "設定を反映しました！問題はなさそうで���。", meta_notes: null };
    }
};
