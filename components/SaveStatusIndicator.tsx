import React from 'react';
import * as Icons from '../icons';

export const SaveStatusIndicator = ({ status }) => {
    let icon, text, color;

    switch (status) {
        case 'saving':
            icon = <Icons.LoaderIcon aria-hidden="true" />;
            text = '保存中...';
            color = 'text-blue-400';
            break;
        case 'dirty':
            icon = <Icons.EditIcon className="h-4 w-4" aria-hidden="true" />;
            text = '編集中...';
            color = 'text-yellow-400';
            break;
        case 'synced':
        default:
            icon = <Icons.CheckCircleIcon aria-hidden="true" />;
            text = '自動保存済';
            color = 'text-green-400';
            break;
    }

    return (
        <div role="status" aria-live="polite" className={`flex items-center gap-2 text-sm ${color} transition-colors`}>
            {icon}
            <span>{text}</span>
        </div>
    );
};
