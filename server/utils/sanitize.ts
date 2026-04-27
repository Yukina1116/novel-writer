/**
 * Firestore Partial Update では `undefined` フィールドが拒否される。`null` への
 * フォールバックは「明示的な null 上書き」になり既存値を破壊するため、書込前に
 * undefined キーを除去する（rules/production-data-safety.md §1）。
 *
 * 戻り値型は `Partial<SanitizedForUpdate<T>>` = `{ [K in keyof T]?: Exclude<T[K], undefined> }`:
 *   - 各キー値域から `undefined` を除く（`Exclude<T[K], undefined>`）
 *   - キー自体は optional（ランタイムで「値が undefined のキーは消える」挙動と一致）
 *
 * これにより呼び出し側は戻り値の各キーを `string | undefined` として narrow せざるを
 * 得なくなり、silent partial update（キー消失を見逃して `tx.update` が no-op になる）
 * のリスクが型レベルで防がれる。
 *
 * 旧バージョン（戻り値型 `SanitizedForUpdate<T>` で Partial なし）は AC D7 文言の
 * 「undefined フリー」を字面解釈した結果、ランタイムでキーが消える可能性を型が
 * 表明しない unsound キャストになっていた（M3 PR-D /review-pr の silent-failure-hunter
 * + type-design-analyzer 二重指摘で発覚、本ファイルは正解版）。
 */
export type SanitizedForUpdate<T> = { [K in keyof T]: Exclude<T[K], undefined> };

export const sanitizeForUpdate = <T extends Record<string, unknown>>(obj: T): Partial<SanitizedForUpdate<T>> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<SanitizedForUpdate<T>>;
