// パスフレーズ入力フィールド共通の clipboard ガード (AC-9)。
// onCopy / onCut を抑止してフィールド経由の clipboard 漏洩を防ぐ。
// 貼り付け (onPaste) は UX 重視で許可 (パスワードマネージャ連携)。

import type React from 'react';

const preventDefault = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    e.preventDefault();
};

export const PASSPHRASE_INPUT_GUARDS = {
    onCopy: preventDefault,
    onCut: preventDefault,
} as const;
