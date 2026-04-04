import React from 'react';

export const useHorizontalResize = (
    initialHeight: number,
    setHeight: (height: number) => void,
    panelRef: React.RefObject<HTMLDivElement>
) => {
    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const startY = e.clientY;
        const startHeight = initialHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaY = moveEvent.clientY - startY;
            let newHeight = startHeight - deltaY;

            const containerHeight = panelRef.current?.clientHeight || window.innerHeight;
            const minHeight = 150;
            const maxHeight = containerHeight - 200;
            if (newHeight < minHeight) newHeight = minHeight;
            if (newHeight > maxHeight) newHeight = maxHeight;

            setHeight(newHeight);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return { handleResizeStart };
};
