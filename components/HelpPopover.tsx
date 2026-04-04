import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const HelpPopover: React.FC<{
    isOpen: boolean;
    targetRef: React.RefObject<any>;
    onClose: () => void;
    children: React.ReactNode;
    placement?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ isOpen, targetRef, onClose, children, placement = 'bottom' }) => {
    const popoverRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [transform, setTransform] = useState('translateX(-50%)');
    const [arrowClass, setArrowClass] = useState('absolute left-1/2 -translate-x-1/2 top-[-8px] w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-gray-600');
  
    useEffect(() => {
      if (isOpen && targetRef.current) {
        const targetRect = targetRef.current.getBoundingClientRect();
        let top = 0;
        let left = 0;
        let newTransform = '';
        let newArrowClass = '';

        switch (placement) {
            case 'top':
                top = targetRect.top - 8;
                left = targetRect.left + targetRect.width / 2;
                newTransform = 'translateX(-50%) translateY(-100%)';
                newArrowClass = 'absolute left-1/2 -translate-x-1/2 bottom-[-8px] w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-gray-600';
                break;
            case 'right':
                top = targetRect.top + targetRect.height / 2;
                left = targetRect.right + 8;
                newTransform = 'translateY(-50%)';
                newArrowClass = 'absolute top-1/2 -translate-y-1/2 left-[-8px] w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-gray-600';
                break;
            case 'left':
                top = targetRect.top + targetRect.height / 2;
                left = targetRect.left - 8;
                newTransform = 'translateX(-100%) translateY(-50%)';
                newArrowClass = 'absolute top-1/2 -translate-y-1/2 right-[-8px] w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-gray-600';
                break;
            case 'bottom':
            default:
                top = targetRect.bottom + 8;
                left = targetRect.left + targetRect.width / 2;
                newTransform = 'translateX(-50%)';
                newArrowClass = 'absolute left-1/2 -translate-x-1/2 top-[-8px] w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-gray-600';
                break;
        }

        setPosition({ top, left });
        setTransform(newTransform);
        setArrowClass(newArrowClass);
      }
    }, [isOpen, targetRef, placement]);
  
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (
          isOpen &&
          popoverRef.current &&
          !popoverRef.current.contains(event.target) &&
          targetRef.current &&
          !targetRef.current.contains(event.target)
        ) {
          onClose();
        }
      };
  
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen, onClose, targetRef]);
  
    if (!isOpen) return null;
  
    return createPortal(
      <div
        ref={popoverRef}
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: transform,
        }}
        className="z-[100] bg-gray-600 text-white rounded-lg shadow-xl border border-gray-500 p-3 w-auto max-w-xs text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={arrowClass}></div>
        {children}
      </div>,
      document.body
    );
  };