import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DisplaySettings } from '../types';

export const DisplaySettingsPopover = ({ isOpen, onClose, anchorRef, settings, onSettingChange }) => {
    const popoverRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                left: rect.right,
            });
        }
    }, [isOpen, anchorRef]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isOpen && popoverRef.current && !popoverRef.current.contains(event.target) && anchorRef.current && !anchorRef.current.contains(event.target)) {
                onClose();
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, anchorRef]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={popoverRef}
            style={{
                position: 'absolute',
                top: position.top,
                left: position.left,
                transform: 'translateX(-100%)',
            }}
            role="dialog"
            aria-labelledby="display-settings-heading"
            className="bg-gray-700 p-4 rounded-lg shadow-xl border border-gray-600 z-[100] w-64 space-y-4"
        >
            <h3 id="display-settings-heading" className="sr-only">表示設定</h3>
            <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">カラーテーマ</label>
                <div className="flex justify-between gap-2">
                    <button onClick={() => onSettingChange('theme', 'light')} className={`flex-1 py-1 rounded text-xs transition text-white ${settings.theme === 'light' ? 'bg-indigo-600 font-semibold' : 'bg-gray-600 hover:bg-gray-500'}`}>白</button>
                    <button onClick={() => onSettingChange('theme', 'sepia')} className={`flex-1 py-1 rounded text-xs transition text-white ${settings.theme === 'sepia' ? 'bg-indigo-600 font-semibold' : 'bg-gray-600 hover:bg-gray-500'}`}>セピア</button>
                    <button onClick={() => onSettingChange('theme', 'dark')} className={`flex-1 py-1 rounded text-xs transition text-white ${settings.theme === 'dark' ? 'bg-indigo-600 font-semibold' : 'bg-gray-600 hover:bg-gray-500'}`}>黒</button>
                </div>
            </div>
            <div>
                <label htmlFor="font-family-select" className="text-sm font-medium text-gray-300 block mb-2">フォント</label>
                <select id="font-family-select" value={settings.fontFamily} onChange={e => onSettingChange('fontFamily', e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-1 text-sm text-white">
                    <option value="sans">Noto Sans JP</option>
                    <option value="serif">Noto Serif JP</option>
                    <option value="rounded-sans">M PLUS Rounded 1c</option>
                    <option value="handwriting">Yuji Syuku</option>
                    <option value="sawarabi-serif">Sawarabi Mincho</option>
                    <option value="kiwi-maru">Kiwi Maru</option>
                </select>
            </div>
            <div className="space-y-1">
                <label htmlFor="font-size-range" className="text-sm font-medium text-gray-300 block">文字サイズ: {settings.fontSize}px</label>
                <input id="font-size-range" type="range" min="12" max="24" step="0.5" value={settings.fontSize} onChange={e => onSettingChange('fontSize', parseFloat(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
            </div>
        </div>,
        document.body
    );
};
