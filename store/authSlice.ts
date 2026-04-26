import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    type User,
} from 'firebase/auth';
import { auth } from '../firebaseClient';

export type AuthStatus = 'initializing' | 'unauthenticated' | 'authenticated';

export interface CurrentUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

export interface AuthSlice {
    currentUser: CurrentUser | null;
    authStatus: AuthStatus;
    authError: string | null;
    initAuth: () => () => void;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const toCurrentUser = (user: User | null): CurrentUser | null =>
    user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
    } : null;

export const createAuthSlice = (set, get): AuthSlice => ({
    currentUser: null,
    authStatus: 'initializing' as AuthStatus,
    authError: null,

    // Subscribe to onAuthStateChanged. Returns unsubscribe function.
    // Per ADR-0001 / spec: IndexedDB is NOT touched on login/logout.
    initAuth: () => {
        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                set({
                    currentUser: toCurrentUser(user),
                    authStatus: user ? 'authenticated' : 'unauthenticated',
                    authError: null,
                });
            },
            (error) => {
                console.error('onAuthStateChanged error:', error);
                set({
                    currentUser: null,
                    authStatus: 'unauthenticated',
                    authError: error.message,
                });
                (get() as { showToast?: (m: string, t: string) => void }).showToast?.(
                    `認証状態の取得に失敗しました: ${error.message}`,
                    'error',
                );
            },
        );
        return unsubscribe;
    },

    signInWithGoogle: async () => {
        try {
            set({ authError: null });
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            // currentUser update flows through onAuthStateChanged listener.
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('signInWithGoogle failed:', error);
            set({ authError: message });
            (get() as { showToast?: (m: string, t: string) => void }).showToast?.(
                `ログインに失敗しました: ${message}`,
                'error',
            );
        }
    },

    signOut: async () => {
        try {
            set({ authError: null });
            await firebaseSignOut(auth);
            // currentUser update flows through onAuthStateChanged listener.
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('signOut failed:', error);
            set({ authError: message });
            (get() as { showToast?: (m: string, t: string) => void }).showToast?.(
                `ログアウトに失敗しました: ${message}`,
                'error',
            );
        }
    },
});

// Tier derivation: pure function over auth state.
// Tier 0 = unauthenticated (or initializing), Tier 1 = authenticated.
// Tier 2 (Stripe) is M5 scope; not represented yet.
export const selectTier = (state: Pick<AuthSlice, 'authStatus'>): 0 | 1 =>
    state.authStatus === 'authenticated' ? 1 : 0;
