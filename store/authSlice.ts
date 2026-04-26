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

// Centralizes the get()-cast pattern shared across all auth error paths.
// Mirrors the cast style used by sibling slices (projectSlice etc.) since
// store action types are unioned at composition time, not in the slice.
const reportAuthError = (
    get: () => unknown,
    prefix: string,
    error: unknown,
): string => {
    const message = error instanceof Error ? error.message : String(error);
    (get() as { showToast?: (m: string, t: string) => void }).showToast?.(
        `${prefix}: ${message}`,
        'error',
    );
    return message;
};

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
                const message = reportAuthError(get, '認証状態の取得に失敗しました', error);
                set({ currentUser: null, authStatus: 'unauthenticated', authError: message });
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
            console.error('signInWithGoogle failed:', error);
            const message = reportAuthError(get, 'ログインに失敗しました', error);
            set({ authError: message });
        }
    },

    signOut: async () => {
        try {
            set({ authError: null });
            await firebaseSignOut(auth);
            // currentUser update flows through onAuthStateChanged listener.
        } catch (error: unknown) {
            console.error('signOut failed:', error);
            const message = reportAuthError(get, 'ログアウトに失敗しました', error);
            set({ authError: message });
        }
    },
});
