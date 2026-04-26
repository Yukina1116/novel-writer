import { useMemo } from 'react';
import { useStore } from '../store/index';
import { TIER0_REASON } from '../store/authConstants';

const AUTH_INITIALIZING_REASON = '認証確認中…';

export interface RequiresAuthState {
    /** True when the current user has a sufficient tier to use AI. */
    canUseAi: boolean;
    /** Tooltip / aria-disabled reason to surface when disabled. Empty string when allowed. */
    reason: string;
}

// Per ADR-0001: only the FE button-disable layer; BE-side auth gate
// (Bearer token verification) is enforced separately.
// 'initializing' gets its own copy so users in the boot window see "wait"
// instead of "log in" — they may already be signed in but not yet rehydrated.
export const useRequiresAuth = (): RequiresAuthState => {
    const authStatus = useStore((state) => state.authStatus);
    return useMemo<RequiresAuthState>(() => {
        if (authStatus === 'authenticated') return { canUseAi: true, reason: '' };
        if (authStatus === 'initializing') return { canUseAi: false, reason: AUTH_INITIALIZING_REASON };
        return { canUseAi: false, reason: TIER0_REASON };
    }, [authStatus]);
};
