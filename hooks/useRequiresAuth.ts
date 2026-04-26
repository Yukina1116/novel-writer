import { useMemo } from 'react';
import { useStore } from '../store/index';
import { TIER0_REASON } from '../store/authConstants';

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
    // Memo so consumers' button props stay reference-stable across renders.
    return useMemo<RequiresAuthState>(
        () => authStatus === 'authenticated'
            ? { canUseAi: true, reason: '' }
            : { canUseAi: false, reason: TIER0_REASON },
        [authStatus],
    );
};
