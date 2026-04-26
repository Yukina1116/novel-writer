import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/index';

export const AuthButton: React.FC = () => {
    const authStatus = useStore(state => state.authStatus);
    const currentUser = useStore(state => state.currentUser);
    const signInWithGoogle = useStore(state => state.signInWithGoogle);
    const signOut = useStore(state => state.signOut);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    if (authStatus === 'initializing') {
        return (
            <div role="status" aria-label="認証状態確認中" className="px-3 py-2 text-xs text-text-muted">
                <span aria-hidden="true">認証確認中…</span>
            </div>
        );
    }

    if (authStatus === 'unauthenticated' || !currentUser) {
        return (
            <button
                type="button"
                onClick={() => { void signInWithGoogle(); }}
                className="px-3 py-2 text-sm rounded-md btn-pressable btn-invert-indigo flex items-center gap-2"
                aria-label="Google でログイン"
                title="Google でログインすると AI 機能が使えます"
            >
                <span>ログイン</span>
            </button>
        );
    }

    const displayLabel = currentUser.email ?? currentUser.displayName ?? 'ログイン中';

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsMenuOpen((p) => !p)}
                className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-panel-bg transition btn-pressable"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
            >
                {currentUser.photoURL ? (
                    <img
                        src={currentUser.photoURL}
                        alt=""
                        className="h-7 w-7 rounded-full"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="h-7 w-7 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center" aria-hidden="true">
                        {(currentUser.email ?? '?').slice(0, 1).toUpperCase()}
                    </div>
                )}
                <span className="text-sm text-text-main truncate max-w-[180px] hidden sm:inline">{displayLabel}</span>
            </button>
            {isMenuOpen && (
                <div role="menu" className="absolute top-full right-0 mt-2 w-56 bg-panel-bg border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 text-xs text-text-muted border-b border-border break-all">
                        {displayLabel}
                    </div>
                    <button
                        type="button"
                        onClick={() => { setIsMenuOpen(false); void signOut(); }}
                        role="menuitem"
                        className="w-full px-4 py-3 text-left text-sm text-text-main hover:bg-app-bg transition"
                    >
                        ログアウト
                    </button>
                </div>
            )}
        </div>
    );
};
