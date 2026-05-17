import type { AuthStatus, CurrentUser } from '../store/authSlice';

export type MobileAuthVariant = 'loading' | 'cta' | 'user';

// 独立ファイルにしている理由: MobileAuthSection.tsx は store/index 経由で
// firebaseClient まで transitive import するため、test が firebase env なしで動かない。
// pure 関数だけを切り出して store 依存を完全に断つ (CI で env 不要)。
export const selectMobileAuthVariant = (
    authStatus: AuthStatus,
    currentUser: CurrentUser | null,
): MobileAuthVariant => {
    if (authStatus === 'initializing') return 'loading';
    if (authStatus === 'unauthenticated' || !currentUser) return 'cta';
    return 'user';
};
