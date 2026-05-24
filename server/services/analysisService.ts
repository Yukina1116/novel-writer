import { Type } from '@google/genai';
import { AnalysisResult, SettingItem, KnowledgeItem } from '../../types';
import { getAiClient, TEXT_MODEL } from '../aiClient';

const systemInstruction = `
あなたは「小説テキストのインポート解析AI」です。
ユーザーがインポートしたテキストを読み取り、登場するキャラクターの詳細なキャラクター設定と世界観の分析を行ってください。

目的は「設定の下書きを完成させること」です。
作者があとから微調整する前提なので、多少踏み込んだ推測や解釈を含めて構いません。

【解析のガイドライン：キャラクター分析】

■ 人物候補の積極抽出（最重要）
テキストに登場するすべての「人物として識別できる存在」を、固有名詞か否かに関わらず人物候補として積極的に抽出してください。
characters.new と extractedDetails.name は同じ呼称を共有し、原則として一文字一句一致させること。

抽出対象（広めに取る）：
- 固有名詞: 「太郎」「アイリス」「サクラ先輩」など
- 親族・関係呼称: 「お母さん」「父」「兄さん」「祖母」など
- 役割・職業呼称: 「先生」「主人公」「店主」「校長」「医者」など
- 物語内で識別可能な代名詞・指示語: 「あの子」「彼女」「少年」「青年」など、文脈から独立した個人を指していると判断できるもの

判断基準：
- 「同じ呼称が複数回登場し、一貫した個人を指している」と読み取れる場合は人物候補として扱う
- 一度きりのモブや、特定の個人を指していないと判断される一般名詞（「人々」「群衆」など）は除外
- 迷ったら抽出側に倒す（作者が後から削除するほうが、見落とすより害が少ない）

■ キャラクターごとに以下の情報を生成してください：

1. summary（約200字）
- 性格、話し方・口調、他者との距離感、物語内での立ち位置を中心に要約。

2. detailDescription（約500字）
- 性格の成り立ち、行動原理・価値観、感情の癖、過去や背景（推測可）、他キャラとの関係性の傾向。

3. memo（約500字）
- 本文から読み取れるが明示されていない情報、矛盾や揺れがありそうな点、今後の伏線になりそうな要素、作者が注意すべきポイント。

4. dialogueSamples（3件）
- そのキャラクターを象徴するセリフを3つ抽出または生成してください。
- セリフが本文に存在しない場合は、性格・口調から推測して生成可。

【解析のガイドライン：世界観・用語分析】
- 物語の「ジャンル」「トーン（雰囲気）」、および象徴的な「キーワード（用語・場所・アイテム）」を抽出してください。
- 各キーワードに対し、AI補完による説明文（description）を **300〜400字程度** で生成してください。

【重要な制約】
- 推定が強い部分は「〜と考えられる」「〜の可能性がある」と表現すること。
- 出力は指定されたJSON形式のみで行うこと。
- 全てのテキストは日本語で記述すること。
`;

export const analyzeTextForImport = async (
    importedText: string,
    existingCharacters: SettingItem[],
    existingWorldSettings: SettingItem[],
    existingKnowledge: KnowledgeItem[]
): Promise<AnalysisResult> => {
    const client = getAiClient();

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

    const response = await client.models.generateContent({
        model: TEXT_MODEL,
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
                                    properties: { text: { type: Type.STRING }, target: { type: Type.STRING } },
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
                                    properties: { text: { type: Type.STRING }, target: { type: Type.STRING } },
                                    required: ["text", "target"]
                                }
                            },
                            new: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        description: { type: Type.STRING }
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
    if (!text) throw new Error('AIからの応答が空でした。');
    return JSON.parse(text);
};
