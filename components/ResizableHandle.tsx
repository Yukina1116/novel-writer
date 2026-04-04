import React from 'react';

export const ResizableHandle = ({ onMouseDown }) => {
    return (
        <div
            onMouseDown={onMouseDown}
            className="flex-shrink-0 w-2 cursor-col-resize group flex items-center justify-center"
            style={{ userSelect: 'none' }}
        >
            <div className="w-0.5 h-full bg-gray-700/50 transition-colors duration-200 group-hover:bg-indigo-500"></div>
        </div>
    );
};
