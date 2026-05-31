/**
 * 固有名詞ジェネレーター (NameGenerator) のカテゴリ定義。
 *
 * カテゴリ文字列は AI プロンプトの "Categories:" にそのまま渡るため、
 * UI 表示・preset ボタン・各フォームのデフォルト値で同じ文字列を共有する必要がある。
 * リテラルが複数箇所に散ると typo / drift の温床になるため、ここに一元集約する。
 *
 * 2 つの軸が混在している点に注意:
 *   - スタイル軸: ファンタジー風 / SF風 / 現代日本風 / 中華風（名前の雰囲気・文化圏）
 *   - 対象種別軸: キャラクター名 / 地名 / 組織名 / 技名（何の名前を生成するか）
 *
 * 今後フォームが増えたら、各フォームは `initialCategory={NAME_CATEGORY.XXX}` を渡すだけで
 * 「そのフォームが期待するカテゴリを初期選択」できる。store / firebase 依存ゼロの pure モジュール。
 */
export const NAME_CATEGORY = {
    // スタイル軸
    FANTASY: 'ファンタジー風',
    SF: 'SF風',
    MODERN_JP: '現代日本風',
    CHINESE: '中華風',
    // 対象種別軸
    CHARACTER: 'キャラクター名',
    PLACE: '地名',
    ORGANIZATION: '組織名',
    SKILL: '技名',
} as const;

export type NameCategory = (typeof NAME_CATEGORY)[keyof typeof NAME_CATEGORY];

/**
 * NameGenerator のプリセットボタンに表示するカテゴリ一覧（表示順）。
 * スタイル軸を先に、対象種別軸を後に並べる。
 */
export const PRESET_NAME_CATEGORIES: readonly NameCategory[] = [
    NAME_CATEGORY.FANTASY,
    NAME_CATEGORY.SF,
    NAME_CATEGORY.MODERN_JP,
    NAME_CATEGORY.CHINESE,
    NAME_CATEGORY.CHARACTER,
    NAME_CATEGORY.PLACE,
    NAME_CATEGORY.ORGANIZATION,
    NAME_CATEGORY.SKILL,
];
