import React from 'react';

export const HorizontalResizableHandle = ({ onMouseDown }) => {
    return (
        <div
            onMouseDown={onMouseDown}
            className="h-2 cursor-row-resize group flex items-center justify-center bg-gray-900/50 flex-shrink-0"
            style={{ userSelect: 'none' }}
        >
            <div className="h-0.5 w-full bg-gray-700/50 transition-colors duration-200 group-hover:bg-indigo-500"></div>
        </div>
    );
};
