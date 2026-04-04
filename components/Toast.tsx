import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { useStore } from '../store/index';

export const Toast = ({ className = "" }: { className?: string }) => {
    const toast = useStore(state => state.toast);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (toast) {
            setIsVisible(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    if (!toast) return null;

    const iconMap = {
        info: <Icons.InfoIcon className="h-5 w-5 text-blue-300" />,
        success: <Icons.CheckCircleIcon className="h-5 w-5 text-green-300" />,
        error: <Icons.InfoIcon className="h-5 w-5 text-red-300" />,
    };

    return (
        <div 
            className={`absolute top-2 left-2 z-[9999] transition-all duration-500 ease-in-out ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'} ${className}`}
        >
            <div className="bg-gray-700 border border-gray-600 rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3">
                {iconMap[toast.type] || iconMap.info}
                <span className="text-white text-sm">{toast.message}</span>
            </div>
        </div>
    );
};
