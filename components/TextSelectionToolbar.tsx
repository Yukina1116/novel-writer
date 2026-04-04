import React from 'react';
import * as Icons from '../icons';

interface TextSelectionToolbarProps {
    position: { top: number; left: number };
    onAction: (actionType: 'proofread' | 'summarize' | 'poetic' | 'dialogue') => void;
}

export const TextSelectionToolbar: React.FC<TextSelectionToolbarProps> = ({ position, onAction }) => {
    const actions = [
        { type: 'proofread' as const, icon: <Icons.CheckCircleIcon className="h-4 w-4" />, label: '校正して' },
        { type: 'summarize' as const, icon: <Icons.FileTextIcon className="h-4 w-4" />, label: '要約して' },
        { type: 'poetic' as const, icon: <Icons.SparklesIcon className="h-4 w-4" />, label: 'より詩的に' },
        { type: 'dialogue' as const, icon: <Icons.UserIcon className="h-4 w-4" />, label: '会話文に' },
    ];

    return (
        <div
            style={{ top: position.top, left: position.left }}
            className="absolute z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-lg flex items-center gap-1 p-1"
        >
            {actions.map(action => (
                <button
                    key={action.type}
                    onClick={() => onAction(action.type)}
                    title={action.label}
                    className="p-2 text-gray-300 hover:bg-gray-700 rounded-md transition-colors btn-pressable"
                >
                    {action.icon}
                </button>
            ))}
        </div>
    );
};