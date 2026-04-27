/**
 * Firestore Partial Update では `undefined` フィールドが拒否される。`null` への
 * フォールバックは「明示的な null 上書き」になり既存値を破壊するため、書込前に
 * undefined キーを除去する（rules/production-data-safety.md §1）。
 */
export const sanitizeForUpdate = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
