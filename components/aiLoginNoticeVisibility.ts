import type { AuthStatus } from '../store/authSlice';

// store / firebase 非依存の pure 関数（mobileAuthVariant.ts と同じ規律）。
// モバイルは MobileAuthSection が常時案内を出すため二重表示しない。
// initializing は表示しない（ログイン済みユーザーに一瞬出るちらつき防止）。
export const shouldShowAiLoginNotice = (authStatus: AuthStatus, isMobile: boolean): boolean =>
    !isMobile && authStatus === 'unauthenticated';
