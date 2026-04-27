/**
 * Firestore Partial Update では `undefined` フィールドが拒否される。`null` への
 * フォールバックは「明示的な null 上書き」になり既存値を破壊するため、書込前に
 * undefined キーを除去する（rules/production-data-safety.md §1）。
 *
 * 戻り値型は `{ [K in keyof T]: Exclude<T[K], undefined> }` で undefined フリーを
 * 型レベルで表現する（M3 PR-D, type-design-analyzer 指摘）。実装は同じく
 * Object.fromEntries による浅いフィルタで、ネスト先には触れない。
 */
export type SanitizedForUpdate<T> = { [K in keyof T]: Exclude<T[K], undefined> };

export const sanitizeForUpdate = <T extends Record<string, unknown>>(obj: T): Partial<SanitizedForUpdate<T>> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<SanitizedForUpdate<T>>;
