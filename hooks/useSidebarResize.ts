import React, { useState } from 'react';

export const useSidebarResize = (
    leftSidebarWidth: number,
    setLeftSidebarWidth: (width: number) => void,
    rightSidebarWidth: number,
    setRightSidebarWidth: (width: number) => void
) => {
    const [isResizing, setIsResizing] = useState(false);

    const handleResizeStart = (side: 'left' | 'right', e: React.MouseEvent) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        const startX = e.clientX;
        const startWidth = side === 'left' ? leftSidebarWidth : rightSidebarWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            let newWidth: number;

            if (side === 'left') {
                newWidth = startWidth + deltaX;
            } else { // right
                newWidth = startWidth - deltaX;
            }

            const minWidth = 250;
            const maxWidth = window.innerWidth / 2;
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;

            if (side === 'left') {
                setLeftSidebarWidth(newWidth);
            } else {
                setRightSidebarWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            setIsResizing(false);
        };

        setIsResizing(true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return { isResizing, handleResizeStart };
};