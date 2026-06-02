import { ChatMessage } from '../../types';
import { sanitizeForPrompt, IMAGE_OMITTED_MARKER as PROMPT_IMAGE_OMITTED_MARKER } from '../utils/promptSafety';

/**
 * キャラクター生成アシスタントのプロンプト構築ロジック（pure helper）。
 *
 * AI クライアントに依存しない純粋関数のみを置く。characterService.ts は
 * aiClient (@google/genai) を import するため、ここを分離するとロジックを
 * モックなしで単体テストできる（pure helper 分離パターン）。
 */

/** Gemini に渡す会話履歴の最大ターン数。短いキャラ作成セッション想定の防御上限。 */
export const MAX_HISTORY_TURNS = 20;

/**
 * ユーザー向けテキストに内部スキーマ名を出させないための共通ルール（症状B対策）。
 * update / reply 両方の systemInstruction 末尾に連結する。
 */
export const USER_FACING_LANGUAGE_RULES = `

***USER-FACING LANGUAGE RULES (MANDATORY):***
- Any text shown to the user (the "consultation_reply", "clarification_needed", or "reply" string) MUST be natural, conversational Japanese.
- NEVER expose internal schema keys or implementation jargon to the user, such as: longDescription, traits, appearance, personality, firstPersonPronoun, themeColor, JSON, field, list, patch, property, schema, object.
- NEVER ask the user which internal field or data structure to store information in. Decide the appropriate place yourself.
- If clarification is genuinely needed, ask ONLY about the character concept in plain Japanese (e.g. "どんな性格にしますか？" "外見の特徴も決めておきますか？"). Do not surface storage or format choices.`;

/**
 * updateCharacterData 用 systemInstruction。
 * intent は履歴最終ターンの <RUNTIME_CONTEXT> から読む方針（マルチターン化対応）。
 */
export const CHARACTER_UPDATE_SYSTEM_INSTRUCTION = `You are a multi-modal assistant for character creation. You receive the full conversation as a sequence of turns and must respond in the correct JSON format.

***CRITICAL RULES:***

1.  **DETERMINE INTENT FROM RUNTIME CONTEXT:** The authoritative intent ('update' or 'consult') for THIS response is given in the <RUNTIME_CONTEXT> block appended to the LAST user turn, together with the current character data. Earlier user turns are tagged with <TURN_INTENT> for context ONLY; never let an old turn's intent override the current <RUNTIME_CONTEXT>. Always read the whole conversation so that short replies such as a simple agreement are interpreted against what was just discussed.

2.  **IF INTENT IS 'update':**
    *   The user wants to modify the character data. Generate a JSON "patch" or ask a clarifying question.
    *   **If the request is clear:** Generate a JSON "patch" object containing ONLY the modified or new fields. NEVER return the full character object.
    *   **If the request is ambiguous:** ask for clarification with a single key "clarification_needed" (plain Japanese, about the character itself).
    *   Under the 'update' intent, you MUST NOT use the "consultation_reply" field.

3.  **IF INTENT IS 'consult':**
    *   The user wants to brainstorm or talk. You MUST NOT generate a data patch or data-entry style clarification.
    *   Respond conversationally as a creative partner via a single key "consultation_reply" (Japanese).
    *   Under the 'consult' intent, you MUST NOT generate a JSON patch or use the "clarification_needed" field.

4.  **Output Format:** Your entire output MUST BE a single, valid JSON object matching one of the three structures above. No other text is allowed. All string values inside the JSON must be in Japanese.${USER_FACING_LANGUAGE_RULES}`;

/** generateCharacterReply 用 systemInstruction。直近の更新内容を踏まえた確認返答を生成する。 */
export const CHARACTER_REPLY_SYSTEM_INSTRUCTION = `You are a friendly and helpful assistant for novel writing. Your task is to generate a conversational reply that acknowledges what was JUST updated and moves the conversation forward.

***RULES***
1.  **INPUT:** You receive the character's current profile, and (when available) the user's latest message and the change that was just applied.
2.  **TASK:** Formulate a brief, engaging reply in Japanese that naturally reflects what was just changed, then ask ONE relevant follow-up question.
3.  **OUTPUT:** Your response MUST be ONLY a JSON object with a single key "reply" containing the conversational text in Japanese.${USER_FACING_LANGUAGE_RULES}`;

/** Gemini contents の 1 ターン表現。 */
export type GeminiContent = { role: 'user' | 'model'; parts: { text: string }[] };

/**
 * 会話履歴を直近 maxTurns に制限する。
 * Gemini の contents は user ロール始まりが要求されるため、先頭に並ぶ
 * assistant（初期メッセージ等）は落とす。
 */
export function trimHistory(history: ChatMessage[], maxTurns: number = MAX_HISTORY_TURNS): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  let trimmed = history.slice(-maxTurns);
  while (trimmed.length > 0 && trimmed[0].role !== 'user') {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

/**
 * 後方互換 re-export: PR #132 で本ファイルに置いていた helper / 定数を `server/utils/promptSafety.ts`
 * に集約 (character / world 共通)。既存 import 経路 (`from './characterPrompt'`) を壊さないため
 * ここから re-export する。新規 import は直接 `server/utils/promptSafety` 推奨。
 */
export { sanitizeForPrompt as stripPromptHeavyFields } from '../utils/promptSafety';
export const IMAGE_OMITTED_MARKER = PROMPT_IMAGE_OMITTED_MARKER;

/**
 * 会話履歴をマルチターン contents に変換する（症状A対策の中核）。
 *
 * - 最終 user ターンには <RUNTIME_CONTEXT>（今回の intent + 現在のキャラデータ）を付記。
 * - それ以前の user ターンには当時の <TURN_INTENT> を付記（過去の文脈として保持）。
 * - assistant ターンはそのまま model ロールへ。
 * - currentCharacterData は stripPromptHeavyFields で base64 dataURI を omit してから埋め込む。
 */
export function buildCharacterContents(
  history: ChatMessage[],
  currentCharacterData: unknown,
  intent: 'consult' | 'update'
): GeminiContent[] {
  const trimmed = trimHistory(history);
  const safeCurrent = sanitizeForPrompt(currentCharacterData ?? {});
  return trimmed.map((message, index) => {
    const isLast = index === trimmed.length - 1;
    let text = message.text;

    if (isLast) {
      text = `${message.text}\n\n<RUNTIME_CONTEXT>\nintent: ${intent}\ncurrentCharacterData: ${JSON.stringify(
        safeCurrent
      )}\n</RUNTIME_CONTEXT>`;
    } else if (message.role === 'user') {
      const turnIntent = message.mode === 'write' ? 'update' : 'consult';
      text = `<TURN_INTENT>${turnIntent}</TURN_INTENT>\n${message.text}`;
    }

    return { role: message.role === 'user' ? 'user' : 'model', parts: [{ text }] };
  });
}

/**
 * AI が返した patch から null / undefined を除去する（既存値の意図しない消去対策, P2）。
 *
 * responseSchema が全フィールド nullable のため、AI が無関係なフィールドに null を
 * 入れて返すと、FE 側 mergeCharacterData で既存値を null 上書きしてしまう。
 * patch には「実際に変更したいフィールド」だけを残す。
 */
export function sanitizeCharacterPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== null && v !== undefined)
  ) as Partial<T>;
}
