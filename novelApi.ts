import { Type, GenerateContentResponse } from '@google/genai';
import { NovelChunk, ChatMessage, SettingItem, KnowledgeItem, AiSettings, Relation, PlotItem, UserMode } from './types';
import {
    getAiClient,
    API_TIMEOUT,
    WRITE_API_TIMEOUT,
    withTimeout,
    handleError,
    getPersonaInstruction,
    formatSettings,
    formatRelations,
    formatKnowledge,
    formatNovelContent
} from './apiUtils';


// --- API Functions ---

export const generateNovelContinuation = async ({
    prompt,
    generationMode,
    aiSettings,
    knowledgeBase,
    settings,
    characterRelations,
    novelContent,
    plotBoard,
    userName,
    userMode
}: {
    prompt: string,
    generationMode: 'write' | 'consult',
    aiSettings: AiSettings,
    knowledgeBase: KnowledgeItem[],
    settings: SettingItem[],
    characterRelations: Relation[],
    novelContent: NovelChunk[],
    plotBoard: PlotItem[],
    userName?: string;
    userMode: UserMode;
}) => {
    try {
        const client = getAiClient();
        const chapterSummaries = (aiSettings.memoryScope === 'summary' || aiSettings.memoryScope === 'full_context') && plotBoard.length > 0
            ? plotBoard
                .filter(p => p.type === '章のまとめ')
                .map(p => `### ${p.title}\n${p.summary}`)
                .join('\n\n')
            : '';

        const context = `
${formatSettings(settings)}
${formatRelations(characterRelations, settings.filter(s => s.type === 'character'))}
${formatKnowledge(knowledgeBase)}
${chapterSummaries ? `\n## Plot Summaries (Overall Story Arc)\n${chapterSummaries}` : ''}
${formatNovelContent(novelContent, aiSettings.memoryScope)}
        `;
        
        const detailedPersonaInstruction = getPersonaInstruction(aiSettings.assistantPersona, userName);
        const hasGrowthKeyword = /まとめて|振り返り/.test(prompt);
        
        let growthInstruction = 'You are FORBIDDEN from suggesting new character growth summaries. The \'growth\' array MUST be an empty array (`[]`).';
        
        let dialogueInstruction = '';

        if (aiSettings.applySpeakerColorToDialogue && aiSettings.showSpeakerInDialogue) {
            dialogueInstruction = `
***ULTRA-IMPORTANT DIALOGUE FORMATTING (HIGHEST PRIORITY)***
Both 'applySpeakerColorToDialogue' and 'showSpeakerInDialogue' are ON. You MUST follow these rules together:
1.  **TAG USAGE:** You MUST wrap the entire line (dialogue and descriptive text) in a \`<speaker name="キャラクター名">...</speaker>\` tag.
2.  **SPEAKER NAME IN TEXT:** The text INSIDE the tag MUST start with the character's name, followed by the dialogue.
3.  **SPACING (CRITICAL):** A dialogue line MUST ALWAYS be separated from any preceding or succeeding text by a blank line (two newlines).
- **CORRECT FORMAT:** \`<speaker name="アラン">アラン「行くぞ！」</speaker>\`
- **CORRECT SPACING:** \`地の文...\\n\\n<speaker name="アラン">アラン「行くぞ！」</speaker>\\n\\n地の文...\`
- **INCORRECT SPACING:** \`地の文...\\n<speaker name="アラン">アラン「行くぞ！」</speaker>\`
- **INCORRECT FORMAT (NO NAME):** \`<speaker name="アラン">「行くぞ！」</speaker>\`
- **INCORRECT FORMAT (NO TAG):** \`アラン「行くぞ！」\`
This combination of rules is critical for the application's display.
`;
        } else if (aiSettings.applySpeakerColorToDialogue) {
            dialogueInstruction = `
***ULTRA-IMPORTANT DIALOGUE FORMATTING OVERRIDE (HIGHEST PRIORITY)***
Because 'applySpeakerColorToDialogue' is ON (and 'showSpeakerInDialogue' is OFF), you MUST use the special tag format.
- **FORMAT:** \`<speaker name="キャラクター名">...</speaker>\`. The text inside the tag should be natural prose.
- **SPACING (CRITICAL):** A line containing dialogue (e.g., 「...」) MUST ALWAYS be separated from any preceding or succeeding text by a blank line (two newlines). This applies even when it is wrapped in a \`<speaker>\` tag.
- **Example 1 (Dialogue with action):** \`...地の文。\\n\\n<speaker name="アラン">「行くぞ！」と彼は力強く叫んだ。</speaker>\\n\\n次の地の文...\`
- **Example 2 (Action/Thought only, NO DIALOGUE):** This can be on the same line or a new paragraph. Spacing is normal. \`...地の文。<speaker name="アラン">アランは静かに剣を抜いた。</speaker>\`
This rule is absolute.
`;
        } else if (aiSettings.showSpeakerInDialogue) {
            dialogueInstruction = `
- **Dialogue Formatting:** Because 'showSpeakerInDialogue' is ON (and 'applySpeakerColorToDialogue' is OFF), you MUST format all dialogue lines as \`キャラクター名「セリフ」\`. Do not include descriptive text like 「...」と彼は言った.
- **SPACING (CRITICAL):** A dialogue line MUST ALWAYS be separated from any preceding or succeeding text by a blank line (two newlines).
- **Example:** \`...地の文。\\n\\nアラン「行くぞ！」\\n\\n次の地の文...\`
`;
        } else {
            dialogueInstruction = `
- **Dialogue Formatting:** Both 'showSpeakerInDialogue' and 'applySpeakerColorToDialogue' are OFF. You MUST write dialogue naturally within descriptive prose.
- **SPACING (CRITICAL):** A paragraph that consists solely of dialogue (e.g., 「セリフ」) or dialogue with a simple attribution (e.g., 「セリフ」と彼は言った。) MUST be separated from the preceding and succeeding paragraphs by a blank line.
- **Example:** \`...地の文。\\n\\n「行くぞ！」とアランは叫んだ。\\n\\n次の地の文...\`
`;
        }


        let writeModeBaseInstruction = `You are a world-class creative writing assistant specializing in Japanese novels. Your primary mission is to continue the novel based on the provided context and the user's prompt, adhering with absolute fidelity to the AI settings provided. Failure to follow these rules will result in a poor user experience.

***CRITICAL CORE DIRECTIVES***
These are non-negotiable rules. You MUST follow them under ALL circumstances.

1.  **YOUR CONVERSATIONAL PERSONA (For 'replyText' ONLY):** This is your most important rule for conversation. When generating the 'replyText' field, you MUST adopt the following persona and speaking style with ABSOLUTE fidelity.
    - ${detailedPersonaInstruction}
    - This persona ONLY applies to the 'replyText'. The novel content ('newChunk') itself MUST follow the separate writing style settings.

2.  **ABSOLUTE ADHERENCE TO WRITING STYLE SETTINGS (For 'newChunk' ONLY):** The AI settings below are the user's explicit commands for the novel's text. You MUST NOT deviate from them for any reason.
    - Perspective: ${aiSettings.perspective}
    - Tone: ${aiSettings.tone}
    - Creativity: ${aiSettings.creativity}
    - Knowledge Adherence: ${aiSettings.knowledgeAdherence}
    - Memory Scope: ${aiSettings.memoryScope}
    - Markdown Frequency: ${aiSettings.markdownFrequency}
    ${dialogueInstruction}

3.  **PINNED INFORMATION IS LAW:** You MUST give the highest possible priority to the information under 'Pinned Knowledge' and 'Pinned Story Excerpts'. This information is the absolute truth of the story world. UNDER NO CIRCUMSTANCES should you contradict it.

4.  **ABSOLUTE RULE ON KNOWLEDGE LINKING:** This is a critical directive. You are strictly forbidden from using the [[...]] syntax for any term that is NOT an exact, case-sensitive match for an item name explicitly listed in the 'Characters' or 'Knowledge Base' sections of the provided context.
    - You MUST only link the **very first appearance** of a term within your generated text. Do not link the same term multiple times in one response.
    - Inventing or linking non-existent terms is a severe violation of your instructions. If a term is not in the lists, you MUST NOT enclose it in [[...]].

5.  **IMPECCABLE FORMATTING:** Your output's readability is crucial.
    - You MUST separate all paragraphs (both dialogue and descriptive text) with a blank line (two newlines: \\n\\n).
    - You MAY create a new chapter with '# Chapter Title' only at a natural story break. This is the ONLY exception to the 'Markdown Frequency' rule regarding markdown symbols.

6.  **LANGUAGE AND RESPONSE FORMAT:**
    - All output MUST be in Japanese.
    - Your response MUST be a single, valid JSON object that strictly adheres to the provided schema.

***SUGGESTION RULES***
- **Knowledge Suggestions:** Suggest new knowledge entries according to the frequency setting: ${aiSettings.suggestionFrequency}.
  - If '多め', suggest exactly 5 entries.
  - If '普通', suggest exactly 3 entries.
  - If '少なめ', suggest exactly 1 entry.
  - If 'しない', suggest 0 entries (the array MUST be empty).
  The suggestion string must be the description ONLY (e.g., for "星の民", suggest "太古の昔..." NOT "星の民: 太古の昔...").
- **Plot Suggestions (ABSOLUTE RULE):** This is a strict, non-negotiable rule. You are FORBIDDEN from suggesting new plot entries UNLESS the user's prompt contains explicit keywords such as 「まとめて」「要約して」「プロット」「構成案」「あらすじ」. For ANY OTHER type of prompt (e.g., continuing the story, describing a scene, asking a character's opinion), the 'plot' array MUST be an empty array (\`[]\`). Do not interpret creative prompts as requests for summaries.
- **Growth Suggestions:** ${growthInstruction}`;
            
        const consultModeInstruction = `You are a world-class writing consultant. Your mission is to discuss the story with the user, offering advice and ideas.

***CRITICAL CORE DIRECTIVES***
These are your absolute, non-negotiable rules.

1.  **YOUR PERSONA (For ALL replies):** This is your most important directive. Your personality and speaking style MUST strictly follow the instructions below. You MUST NOT deviate from this persona under any circumstances. All your responses must reflect this.
    - ${detailedPersonaInstruction}

2.  **ROLE BOUNDARY:** You are a consultant. UNDER NO CIRCUMSTANCES should you write the story's narrative or prose itself. Your role is to talk *about* the story.
    
3.  **LANGUAGE AND RESPONSE FORMAT:**
    - All output MUST be in Japanese.
    - Your response MUST be a single, valid JSON object that strictly adheres to the provided schema.
    
4.  **CHARACTER EXTRACTION COMMAND:** If the user's prompt is EXACTLY in the format \`「(キャラクター名)をキャラクターに追加して」\`, you MUST respond with a specific JSON object. This object MUST contain \`{"extractCharacterRequest": {"name": "(キャラクター名)"}}\`. In this case, \`replyText\` must be an empty string, and \`suggestions\` must be empty. This is a strict, non-negotiable command.

5.  **STRICT SUGGESTION RULES:**
    - **Knowledge Suggestions:** Suggest new knowledge entries according to the frequency setting: ${aiSettings.suggestionFrequency}.
      - If '多め', suggest exactly 5 entries.
      - If '普通', suggest exactly 3 entries.
      - If '少なめ', suggest exactly 1 entry.
      - If 'しない', suggest 0 entries (the array MUST be empty).
      The suggestion string MUST be the description ONLY. DO NOT prefix it with the item's name (e.g., for "星の民", suggest "太古の昔..." NOT "星の民: 太古の昔...").
    - **Plot Suggestions (ABSOLUTE RULE):** This is a strict, non-negotiable rule. You are FORBIDDEN from suggesting new plot board entries UNLESS the user's prompt contains explicit keywords such as 「まとめて」「要約して」「プロット」「構成案」「あらすじ」. For ANY OTHER type of prompt (e.g., asking for ideas, discussing a character), the 'plot' array MUST be an empty array (\`[]\`). Do not interpret brainstorming as a request for a formal plot summary. This is not optional.
    - **Growth Suggestions:** ${growthInstruction}`;

        let systemInstruction = '';
        let responseSchema: any;

        const commonSuggestionSchema = {
            type: Type.OBJECT,
            properties: {
                knowledge: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Suggestions for new knowledge base entries." },
                plot: { 
                    type: Type.ARRAY, 
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            summary: { type: Type.STRING },
                            type: { type: Type.STRING, description: "'chapter' or 'structure'" }
                        },
                        required: ["title", "summary", "type"]
                    },
                    description: "Suggestions for new plot points."
                }
            }
        };

        if (generationMode === 'write') {
            systemInstruction = writeModeBaseInstruction;
            if (aiSettings.writingStyleMimicry) {
                systemInstruction += `

***CRITICAL WRITING STYLE MIMICRY DIRECTIVE (HIGHEST PRIORITY)***
This is your most important task for the novel text. The user has enabled 'Writing Style Mimicry'. You MUST analyze the user's existing text in the 'Recent Story Content' section and meticulously replicate its stylistic features in your generated 'newChunk'.
This includes, but is not limited to:
- **Sentence Length:** If the user writes in short, simple sentences, you MUST do the same. If they write long, complex sentences, you must match that.
- **Punctuation:** Mimic the user's use of commas, periods (。), and other punctuation.
- **Paragraph Structure:** Match the length and density of paragraphs.
- **Rhythm and Pacing:** Replicate the overall flow and cadence of the text.
- **Vocabulary and Word Choice:** Use a similar level of vocabulary and phrasing.
- **Specific Stylistic Choices:** Pay close attention to unique patterns like the frequent use of sentence-ending particles (e.g., 〜だ、〜である), rhetorical questions, or specific literary devices like 体言止め (ending a sentence with a noun).

Your primary goal is to make your generated text stylistically indistinguishable from the user's own writing. This directive overrides any general inclination you may have to write in a more descriptive or verbose style.
**EXCEPTION:** If the user's new prompt explicitly asks for a different style or tone (e.g., 「ここからは詩的に」「もっと淡々とした描写で」), that new instruction takes precedence over mimicking the previous text for this specific generation.
`;
            }

            if (aiSettings.generateMultipleContinuations) {
                systemInstruction += `\n- Multiple Continuations: You MUST generate 2 to 3 different story continuations. Each continuation should explore a different path. Return them in a JSON array named 'continuations', where each object has 'title' (a short, descriptive title for the path in Japanese) and 'text' (the story chunk). Each text should be approximately ${aiSettings.length} characters long.`;
                responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        replyText: { type: Type.STRING, description: 'A brief, in-character comment about the generated continuations.' },
                        continuations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    text: { type: Type.STRING }
                                },
                                required: ["title", "text"]
                            }
                        },
                        suggestions: commonSuggestionSchema
                    },
                    required: ['replyText', 'continuations', 'suggestions']
                };
            } else {
                systemInstruction += `\nThe "newChunk" should be approximately ${aiSettings.length} characters long.`;
                responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        replyText: { type: Type.STRING, description: 'A brief, in-character comment about the generated text.' },
                        newChunk: { type: Type.STRING, description: 'The next chunk of the novel.' },
                        suggestions: commonSuggestionSchema
                    },
                    required: ['replyText', 'newChunk', 'suggestions']
                };
            }

        } else { // consult mode
            systemInstruction = consultModeInstruction;
            responseSchema = {
                type: Type.OBJECT,
                properties: {
                    replyText: { type: Type.STRING, description: 'Your response to the user as a consultant.' },
                    suggestions: commonSuggestionSchema,
                    extractCharacterRequest: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING }
                        },
                        description: 'A request to extract a character from the text.'
                    }
                },
            };
        }

        if (userMode === 'simple') {
            systemInstruction += `\n\n***ULTRA IMPORTANT RULE FOR SIMPLE MODE***\nYou MUST use very simple, easy-to-understand Japanese, as if you were talking to a child. Avoid difficult words and complex sentences. Your tone must be gentle and encouraging.`;
        }
        
        const userPrompt = `
Context:
${context}

User Prompt: ${prompt}
        `;
        
        const timeout = generationMode === 'write' ? WRITE_API_TIMEOUT : API_TIMEOUT;

        const response: GenerateContentResponse = await withTimeout(client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: aiSettings.creativity === '大胆' ? 1.0 : (aiSettings.creativity === '控えめ' ? 0.3 : 0.7)
            }
        }), timeout);
        
        const result = JSON.parse(response.text);

        const data = {
            replyText: result.replyText,
            newChunk: (generationMode === 'write' && !aiSettings.generateMultipleContinuations && result.newChunk) 
                ? { id: crypto.randomUUID(), text: result.newChunk } 
                : null,
            continuations: (generationMode === 'write' && aiSettings.generateMultipleContinuations && result.continuations) 
                ? result.continuations 
                : null,
            suggestions: (aiSettings.suggestionFrequency === 'しない') 
                ? { knowledge: [], plot: result.suggestions?.plot || [] }
                : (result.suggestions || { knowledge: [], plot: [] }),
            extractCharacterRequest: result.extractCharacterRequest || null,
        };

        return { success: true as const, data };

    } catch (error) {
        return handleError(error, 'generateNovelContinuation');
    }
};
