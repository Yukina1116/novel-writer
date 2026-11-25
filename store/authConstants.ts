// Shared between FE button-disable layer (useRequiresAuth) and the
// defense-in-depth API client gate (apiClient). Single source of truth so
// the user-facing wording stays consistent.
export const TIER0_REASON = 'ログインして利用してください（AI 機能は無料アカウントから）';
export const TIER0_API_BLOCK_MESSAGE = 'ログインしてから AI 機能をご利用ください。';

// 未ログイン時の「ログインで何ができるか」案内。モバイル(MobileAuthSection)と
// デスクトップ(AiLoginNotice)で同一文言を保つため単一定義にする。
// ログインで AI 機能が使える事実のみを述べる（データ同期・保存を匂わせない）。
export const AI_LOGIN_HINT = 'ログインすると AI 機能（小説生成・キャラクター作成など）が使えます';
