
import { GoogleGenAI } from '@google/genai';
import { SettingItem, KnowledgeItem, Project, NovelChunk, AiSettings, Relation, PlotItem } from './types';
import { useStore } from './store/index';

// FIX: Updated to strictly follow GenAI initialization guidelines using process.env.API_KEY directly.
export const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const API_TIMEOUT = 120000; // 120 seconds for general API calls
export const WRITE_API_TIMEOUT = 300000; // 5 minutes for writing mode

export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('AIの応答がタイムアウトしました。ネットワーク接続を確認するか、少し待ってからもう一度お試しください。'));
    }, ms);

    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
};

export const handleError = (error: any, functionName: string): { success: false; error: Error } => {
    console.error(`Error in ${functionName}:`, error);
    
    let message = '不明なエラーが発生しました。';

    // Prioritize nested error message if it exists, as seen in the logs.
    if (error?.error?.message) {
        message = error.error.message;
    } else if (error?.message) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    }

    // Check for specific error types from the message content
    if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
        return { success: false as const, error: new Error('AIの無料利用枠の上限に達してしまいました。APIは時間経過で回復しますが、しばらく待っても改善しない場合は、Google AI Studioでプランや支払い方法を確認してみてください。') };
    }
    if (message.includes('API key not valid')) {
        return { success: false as const, error: new Error('APIキーが無効です。設定を確認してください。') };
    }
    if (message.includes('timeout')) {
        return { success: false as const, error: new Error('AIの応答がタイムアウトしました。ネットワーク接続を確認するか、少し待ってからもう一度お試しください。')};
    }
    
    // For other cases, return the extracted or a generic message.
    return { success: false as const, error: new Error(message) };
};


export const getPersonaInstruction = (persona: string, userName?: string): string => {
    let instruction = '';
    switch (persona) {
        case 'friendly':
            instruction = `Your persona is "a close friend (親しい友人)". You MUST speak in a friendly, casual, and supportive tone. Use phrases like 「〜だね！」「〜だよ！」「どう思う？」「一緒に考えよう！」. You MUST NOT use formal language like 「〜です」「〜ます」. This is your most important characteristic.`;
            break;
        case 'polite':
            instruction = `Your persona is "a polite editor (丁寧な編集者)". Your tone MUST be formal, respectful, and professional. You MUST exclusively use "です" and "ます" style (敬体). For example: 「その設定は素晴らしいですね。」「物語の深みを増すために、別の視点を加えてみてはいかがでしょうか？」 You MUST NOT use casual language (タメ口) like 「〜だね」 or 「〜だよ」 under any circumstances.`;
            break;
        case 'analytical':
            instruction = `Your persona is "an analytical critic (分析的な批評家)". You MUST be logical, objective, and critical. Your feedback should be sharp and focused on structure, consistency, and plot integrity. Use phrases like 「論理的な矛盾があります」「その展開の蓋然性は低いです」「伏線が不足しています」. You MUST avoid emotional or overly supportive language. Your goal is to improve the work's quality through rigorous analysis.`;
            break;
        case 'muse':
            instruction = `Your persona is "a creative poet (創造的な詩人)". You MUST use poetic, metaphorical, and artistic language. Your suggestions should be abstract and inspiring. For example: 「彼の悲しみを、ただ涙で表現するのではなく、『街から色が失われた』といった比喩で描いてみては？」 You MUST avoid mundane or overly technical feedback. Your goal is to spark creativity.`;
            break;
        case 'fan':
            instruction = `Your persona is "an enthusiastic fan (熱狂的なファン)". You MUST be extremely positive, encouraging, and full of praise. Use exaggerated expressions like 「最高です！」「先生は天才です！」「早く続きが読みたいです！」 You MUST agree with the user's ideas and build upon them with excitement. You MUST NOT provide any negative criticism.`;
            break;
        default:
            instruction = `Your persona is "a polite editor (丁寧な編集者)". Your tone MUST be formal, respectful, and professional. You MUST exclusively use "です" and "ます" style (敬体). For example: 「その設定は素晴らしいですね。」「物語の深みを増すために、別の視点を加えてみてはいかがでしょうか？」 You MUST NOT use casual language (タメ口) like 「〜だね」 or 「〜だよ」 under any circumstances.`;
    }
    if (userName) {
        instruction += `\n- **User's Name:** Your conversation partner's name is "${userName}". You MUST address them by this name when appropriate (e.g., 「${userName}さん、それは素晴らしいアイデアですね！」 for polite persona, or 「${userName}、それはいいね！」 for friendly persona) to make the conversation more personal.`;
    }
    return instruction;
};


export const formatSettings = (settings: SettingItem[]): string => {
    const characters = settings.filter(s => s.type === 'character');
    const worlds = settings.filter(s => s.type === 'world');
    
    let formatted = '## Characters\n';
    characters.forEach(c => {
        formatted += `### ${c.name}\n`;
        if (c.longDescription) formatted += `${c.longDescription}\n`;
        if (c.firstPersonPronoun) formatted += `- First-person Pronoun: ${c.firstPersonPronoun}\n`;
        if (c.personality) formatted += `- Personality: ${c.personality}\n`;
        if (c.speechPattern) formatted += `- Speech Pattern: ${c.speechPattern}\n`;
    });

    formatted += '\n## World Settings\n';
    worlds.forEach(w => {
        formatted += `### ${w.name}\n`;
        if (w.longDescription) formatted += `${w.longDescription}\n`;
        if(w.fields){
            w.fields.forEach(f => {
                formatted += `- ${f.key}: ${f.value}\n`;
            });
        }
    });
    return formatted;
};

export const formatRelations = (relations: Relation[], characters: SettingItem[]): string => {
    if (relations.length === 0) return '';
    const characterMap = new Map(characters.map(c => [c.id, c.name]));
    let formatted = '\n## Character Relationships\n';
    relations.forEach(rel => {
        const sourceName = characterMap.get(rel.source);
        const targetName = characterMap.get(rel.target);
        if (sourceName && targetName) {
            formatted += `- ${sourceName} -> ${targetName}: ${rel.label}`;
            if (rel.callName) {
                formatted += ` (How ${sourceName} calls ${targetName}: ${rel.callName})`;
            }
            formatted += '\n';
        }
    });
    return formatted;
};


export const formatKnowledge = (knowledge: KnowledgeItem[]): string => {
    const activeKnowledge = knowledge.filter(k => !k.isArchived);
    const pinned = activeKnowledge.filter(k => k.isPinned);
    const unpinned = activeKnowledge.filter(k => !k.isPinned);

    let formatted = '';

    const formatItems = (items: KnowledgeItem[]) => {
        const groupedByCategory = items.reduce((acc, item) => {
            const category = item.category || 'Uncategorized';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(item);
            return acc;
        }, {} as Record<string, KnowledgeItem[]>);

        let categoryFormatted = '';
        for (const category in groupedByCategory) {
            categoryFormatted += `### Category: ${category}\n`;
            groupedByCategory[category].forEach(item => {
                const tags = item.tags?.length > 0 ? ` [Tags: ${item.tags.join(', ')}]` : '';
                categoryFormatted += `#### ${item.name}${tags}\n`;
                categoryFormatted += `${item.content}\n\n`;
            });
        }
        return categoryFormatted;
    };

    if (pinned.length > 0) {
        formatted += '## Pinned Knowledge (Highest Priority Rules)\n';
        formatted += formatItems(pinned);
    }
    
    if (unpinned.length > 0) {
        formatted += '## Knowledge Base (Immutable Rules)\n';
        formatted += formatItems(unpinned);
    }

    if (formatted === '') {
        return 'No knowledge base entries.';
    }

    return formatted;
};

export const formatNovelContent = (content: NovelChunk[], memoryScope: string): string => {
    if (content.length === 0) return 'The story has not started yet.';

    const pinned = content.filter(c => c.isPinned);
    const unpinned = content.filter(c => !c.isPinned);
    let formatted = '';

    if (pinned.length > 0) {
        formatted += '## Pinned Story Excerpts (Key Events & Context)\n';
        formatted += pinned.map(c => c.text).join('\n\n') + '\n\n';
    }

    if (memoryScope === 'full_context') {
        if (unpinned.length > 0) {
            formatted += '## Full Story Content (from beginning to end)\n' + unpinned.map(c => c.text).join('\n\n');
        }
    } else if (memoryScope === 'summary') {
        if (unpinned.length > 0) {
            // For summary, provide a bit of recent context to bridge the gap.
            formatted += '## Recent Story Content\n' + unpinned.slice(-3).map(c => c.text).join('\n\n');
        }
    } else if (memoryScope === 'current_chapter') {
        if (unpinned.length > 0) {
            // Approximation: get last 10 chunks for a "chapter"
            formatted += '## Recent Story Content\n' + unpinned.slice(-10).map(c => c.text).join('\n\n');
        }
    } else { // 'current_scene' and default
        if (unpinned.length > 0) {
            formatted += '## Recent Story Content\n' + unpinned.slice(-2).map(c => c.text).join('\n\n');
        }
    }
    
    return formatted.trim() || 'No relevant content to display.';
};
