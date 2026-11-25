import React from 'react';
import { useStore } from '../store/index';
import { AI_LOGIN_HINT } from '../store/authConstants';
import { shouldShowAiLoginNotice } from './aiLoginNoticeVisibility';

// デスクトップの AI パネル上に出す常時案内。ログイン操作はヘッダーの AuthButton に一本化し、
// ここは「なぜ AI が使えないか」を示すだけ（ボタンは置かない）。
export const AiLoginNotice: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
    const authStatus = useStore(state => state.authStatus);
    if (!shouldShowAiLoginNotice(authStatus, isMobile)) return null;
    return (
        <div role="note" className="px-4 py-3 bg-app-bg border-b border-border flex-shrink-0">
            <p className="text-xs text-text-muted text-center">{AI_LOGIN_HINT}</p>
        </div>
    );
};
