
import { GoogleGenAI, Type } from "@google/genai";
import { useStore } from './store/index';
import { AnalysisResult, SettingItem, KnowledgeItem } from "./types";
import { withTimeout, handleError, WRITE_API_TIMEOUT } from "./apiUtils";

const systemInstruction = `
あなたは「小説テキストのインポート解析AI」です。
ユーザーがインポートしたテキストを読み取り、登場するキャラクターの詳細なキャラクター設定と世界観の分析を行ってください。

目的は「設定の下書きを完成させること」です。
作者があとから微調整する前提なので、多少踏み込んだ推測や解釈を含めて構いません。

【解析のガイドライン：キャラクター分析】
キャラクターごとに以下の情報を生成してください：

1. summary（約200字）
- 性格、話し方・口調、他者との距離感、物語内での立ち位置を中心に要約。

2. detailDescription（約500字）
- 性格の成り立ち、行動原理・価値観、感情の癖、過去や背景（推測可）、他キャラとの関係性の傾向。

3. memo（約500字）
- 本文から読み取れるが明示されていない情報、矛盾や揺れがありそうな点、今後の伏線になりそうな要素、作者が注意すべきポイント。

4. dialogueSamples（3件）
- そのキャラクターを象徴するセリフを3つ抽出または生成してください。
- インポートテキスト内にそのキャラのセリフがあればそれを優先し、なければ性格設定に基づいて作成してください。

【解析のガイドライン：世界観・用語分析】
- 物語の「ジャンル」「トーン（雰囲気）」、および象徴的な「キーワード（用語・場所・アイテム）」を抽出してください。
- 各キーワードに対し、AI補完による説明文（description）を **300〜400字程度** で生成してください。本文の内容に基づきつつ、必要であれば背景設定を論理的に推定して補完してください。

【重要な制約】
- 本文に書かれていない情報は「推定」で補完してよいが、推定が強い部分は「〜と考えられる」「〜の可能性がある」と表現すること。
- 出力は指定されたJSON形式のみで行うこと。
- 全てのテキストは日本語で記述すること。
`;

export const analyzeTextForImportInternal = async (
  importedText: string,
  existingCharacters: SettingItem[],
  existingWorldSettings: SettingItem[],
  existingKnowledge: KnowledgeItem[]
): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const existingDataSummary = {
    characters: existingCharacters.map(c => ({ id: c.id, name: c.name, aliases: [c.furigana, c.firstPersonPronoun].filter(Boolean) })),
    worldSettings: existingWorldSettings.map(w => ({ id: w.id, name: w.name })),
    knowledge: existingKnowledge.map(k => ({ id: k.id, name: k.name }))
  };

  const prompt = `
以下のインポートテキストを解析し、既存データと照合しつつ詳細な設定を作成してください。

【既存データ要約】
${JSON.stringify(existingDataSummary, null, 2)}

【インポートテキスト】
${importedText}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          characters: {
            type: Type.OBJECT,
            properties: {
              match: { type: Type.ARRAY, items: { type: Type.STRING } },
              similar: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    target: { type: Type.STRING }
                  },
                  required: ["text", "target"]
                }
              },
              new: { type: Type.ARRAY, items: { type: Type.STRING } },
              extractedDetails: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    age: { type: Type.INTEGER, nullable: true },
                    gender: { type: Type.STRING, nullable: true },
                    personality: { type: Type.STRING },
                    speechStyle: { type: Type.STRING },
                    role: { type: Type.STRING },
                    confidence: { type: Type.STRING },
                    suggestedColor: { type: Type.STRING, nullable: true },
                    summary: { type: Type.STRING },
                    detailDescription: { type: Type.STRING },
                    memo: { type: Type.STRING },
                    dialogueSamples: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["name", "personality", "speechStyle", "role", "confidence", "summary", "detailDescription", "memo", "dialogueSamples"]
                }
              }
            },
            required: ["match", "similar", "new", "extractedDetails"]
          },
          worldContext: {
            type: Type.OBJECT,
            properties: {
              worldKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              genre: { type: Type.STRING },
              tone: { type: Type.STRING }
            },
            required: ["worldKeywords", "genre", "tone"]
          },
          worldTerms: {
            type: Type.OBJECT,
            properties: {
              match: { type: Type.ARRAY, items: { type: Type.STRING } },
              similar: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    target: { type: Type.STRING }
                  },
                  required: ["text", "target"]
                }
              },
              new: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING, description: "300〜400字程度の詳細な要約・推定設定" }
                  },
                  required: ["name", "description"]
                }
              }
            },
            required: ["match", "similar", "new"]
          },
          dialogues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                possibleSpeaker: { type: Type.STRING, nullable: true }
              },
              required: ["text"]
            }
          },
          notes: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["characters", "worldContext", "worldTerms", "dialogues", "notes"]
      }
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error('AIからの応答が空でした。');
  }
  return JSON.parse(text);
};

export const analyzeTextForImport = async (
  importedText: string,
  existingCharacters: SettingItem[],
  existingWorldSettings: SettingItem[],
  existingKnowledge: KnowledgeItem[]
): Promise<{ success: true, data: AnalysisResult } | { success: false, error: Error }> => {
  try {
    const result = await withTimeout(
      analyzeTextForImportInternal(importedText, existingCharacters, existingWorldSettings, existingKnowledge),
      WRITE_API_TIMEOUT
    );
    useStore.getState().saveAnalysisHistory(result);
    return { success: true as const, data: result };
  } catch (error) {
    return handleError(error, 'analyzeTextForImport');
  }
};
