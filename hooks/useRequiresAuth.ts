import { useStore } from '../store/index';

export const TIER0_REASON = 'ログインして利用してください（AI 機能は無料アカウントから）';

export interface RequiresAuthState {
    /** True when the current user has a sufficient tier to use AI. */
    canUseAi: boolean;
    /** Tooltip / aria-disabled reason to surface when disabled. Empty string when allowed. */
    reason: string;
}

// Tier 0 (initializing or unauthenticated) blocks AI; Tier 1+ allows.
// Per ADR-0001 spec PR-B B.5: only the FE button-disable layer; the BE auth
// gate (Bearer token verification) is M3 scope.
export const useRequiresAuth = (): RequiresAuthState => {
    const authStatus = useStore((state) => state.authStatus);
    if (authStatus === 'authenticated') {
        return { canUseAi: true, reason: '' };
    }
    return { canUseAi: false, reason: TIER0_REASON };
};
