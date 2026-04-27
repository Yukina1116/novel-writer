/**
 * Firestore Partial Update では `undefined` フィールドが拒否される。`null` への
 * フォールバックは「明示的な null 上書き」になり既存値を破壊するため、書込前に
 * undefined キーを除去する（rules/production-data-safety.md §1）。
 *
 * 戻り値型は `SanitizedForUpdate<T>` で各キーの値域から undefined を除去した
 * undefined フリー表現を取る（M3 PR-D / type-design-analyzer 指摘）。
 *
 * **前提**: 呼び出し側は固定キーのリテラルオブジェクトを渡すこと（`users.ts` の
 * 用法に準拠）。ランタイムは `Object.fromEntries(filter)` でキーが消える可能性
 * があるが、現呼び出し元では各キー値が常に定義されているため戻り値型の表明と
 * 矛盾しない。将来 optional 入力を導入する場合は呼び出し側で if 除外を行うこと。
 */
export type SanitizedForUpdate<T> = { [K in keyof T]: Exclude<T[K], undefined> };

export const sanitizeForUpdate = <T extends Record<string, unknown>>(obj: T): SanitizedForUpdate<T> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as SanitizedForUpdate<T>;
