
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/index';
import { helpTexts } from '../helpTexts';

interface TooltipProps {
    helpId: string;
    children: React.ReactElement<any>;
    placement?: 'top' | 'right' | 'left' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({ helpId, children, placement = 'top' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const userMode = useStore(state => state.userMode);
    const timeoutRef = useRef<number | null>(null);

    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifier = isMac ? '⌘' : 'Ctrl';

    const data = helpTexts[helpId]?.[userMode];

    // クリーンアップ処理
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const hideTooltip = () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsVisible(false);
    };

    const showTooltip = (e: React.MouseEvent) => {
        if (isVisible || timeoutRef.current !== null) return;

        const rect = e.currentTarget.getBoundingClientRect();
        
        const updatePos = () => {
            if (placement === 'right') {
                setPosition({
                    top: rect.top + rect.height / 2,
                    left: rect.right + 10
                });
            } else if (placement === 'left') {
                setPosition({
                    top: rect.top + rect.height / 2,
                    left: rect.left - 10
                });
            } else if (placement === 'bottom') {
                setPosition({
                    top: rect.bottom + 10,
                    left: rect.left + rect.width / 2
                });
            } else {
                setPosition({
                    top: rect.top - 10,
                    left: rect.left + rect.width / 2
                });
            }
        };

        updatePos();
        
        timeoutRef.current = window.setTimeout(() => {
            setIsVisible(true);
            timeoutRef.current = null;
        }, 150);
    };

    if (!data) return children;

    const trigger = React.cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => {
            children.props.onMouseEnter?.(e);
            showTooltip(e);
        },
        onMouseLeave: (e: React.MouseEvent) => {
            children.props.onMouseLeave?.(e);
            hideTooltip();
        },
        onMouseDown: (e: React.MouseEvent) => {
            hideTooltip(); // クリックした瞬間に隠す
            children.props.onMouseDown?.(e);
        }
    });

    const transform = placement === 'right' 
        ? 'translateY(-50%)' 
        : placement === 'left'
            ? 'translate(-100%, -50%)'
            : placement === 'bottom'
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -100%)';

    const arrowClass = placement === 'right' 
        ? "absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 border-l border-b border-gray-700 rotate-45"
        : placement === 'left'
            ? "absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-gray-900 border-t border-r border-gray-700 rotate-45"
            : placement === 'bottom'
                ? "absolute left-1/2 -top-1 -translate-x-1/2 w-2 h-2 bg-gray-900 border-l border-t border-gray-700 rotate-45"
                : "absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45";

    return (
        <>
            {trigger}
            {isVisible && createPortal(
                <div 
                    style={{ 
                        position: 'fixed',
                        top: position.top,
                        left: position.left,
                        transform: transform,
                        zIndex: 9999
                    }}
                    className="pointer-events-none"
                >
                    <div className="animate-in zoom-in duration-150">
                        <div className="bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg shadow-2xl min-w-[160px] max-w-[240px] relative">
                            <div className="flex justify-between items-center mb-1 gap-2">
                                <span className="font-bold text-xs text-indigo-300 whitespace-nowrap">{data.title}</span>
                                {data.shortcut && (
                                    <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400 border border-gray-700 whitespace-nowrap">
                                        {modifier}+{data.shortcut}
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-200 leading-relaxed whitespace-pre-wrap">{data.desc}</p>
                            {data.tech && (
                                <div className="mt-1.5 pt-1.5 border-t border-gray-800 text-[9px] text-emerald-400 font-mono">
                                    dev: {data.tech}
                                </div>
                            )}
                            <div className={arrowClass}></div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
