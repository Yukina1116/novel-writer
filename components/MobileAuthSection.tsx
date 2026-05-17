import React from 'react';
import { useStore } from '../store/index';
import type { AuthStatus, CurrentUser } from '../store/authSlice';

type MobileAuthVariant = 'loading' | 'cta' | 'user';

// MobileAuthSection.test.ts が import して同じロジックを pin する。
// テストで再宣言しない (実コードと drift する事故を防ぐ)。
export const selectMobileAuthVariant = (
    authStatus: AuthStatus,
    currentUser: CurrentUser | null | undefined,
): MobileAuthVariant => {
    if (authStatus === 'initializing') return 'loading';
    if (authStatus === 'unauthenticated' || !currentUser) return 'cta';
    return 'user';
};

export const MobileAuthSection: React.FC = () => {
    const authStatus = useStore(state => state.authStatus);
    const currentUser = useStore(state => state.currentUser);
    const signInWithGoogle = useStore(state => state.signInWithGoogle);
    const signOut = useStore(state => state.signOut);

    const variant = selectMobileAuthVariant(authStatus, currentUser);

    if (variant === 'loading') {
        return (
            <div
                role="status"
                aria-label="認証状態確認中"
                className="px-4 py-3 text-xs text-text-muted bg-app-bg border-b border-border"
            >
                認証確認中…
            </div>
        );
    }

    if (variant === 'cta' || !currentUser) {
        return (
            <div className="px-4 py-3 bg-app-bg border-b border-border">
                <button
                    type="button"
                    onClick={() => { void signInWithGoogle(); }}
                    className="w-full px-3 py-3 text-sm rounded-md btn-pressable btn-invert-indigo flex items-center justify-center gap-2"
                    aria-label="Google でログイン"
                >
                    <span className="font-bold">Google でログイン</span>
                </button>
                <p className="mt-2 text-xs text-text-muted text-center">
                    ログインすると AI 機能（小説生成・キャラクター作成など）が使えます
                </p>
            </div>
        );
    }

    const displayLabel = currentUser.email ?? currentUser.displayName ?? 'ログイン中';

    return (
        <div className="px-4 py-3 bg-app-bg border-b border-border">
            <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                    <img
                        src={currentUser.photoURL}
                        alt=""
                        className="h-8 w-8 rounded-full flex-shrink-0"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div
                        className="h-8 w-8 rounded-full bg-indigo-600 text-white text-sm flex items-center justify-center flex-shrink-0"
                        aria-hidden="true"
                    >
                        {(currentUser.email ?? '?').slice(0, 1).toUpperCase()}
                    </div>
                )}
                <div className="flex-grow min-w-0">
                    <div className="text-xs text-text-muted">ログイン中</div>
                    <div className="text-sm text-text-main truncate" title={displayLabel}>
                        {displayLabel}
                    </div>
                </div>
            </div>
            <button
                type="button"
                onClick={() => { void signOut(); }}
                className="mt-2 w-full px-3 py-2 text-xs rounded-md text-text-muted hover:text-text-main hover:bg-panel-bg transition btn-pressable border border-border"
            >
                ログアウト
            </button>
        </div>
    );
};
