import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import parse from 'html-react-parser';
import { NovelChunk, SettingItem, KnowledgeItem, AiSettings } from '../types';
import { renderMarkdown } from '../utils/sanitizeHtml';

import * as Icons from '../icons';
import { useStore } from '../store/index';
import { Tooltip } from './Tooltip';

// 執筆の世界観に合うプリセットカラー
const PRESET_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', 
    '#6366f1', '#a855f7', '#ec4899', '#94a3b8', '#ffffff'
];

interface EditableParagraphProps {
    chunk: NovelChunk;
    characters: SettingItem[];
    knowledgeBase: KnowledgeItem[];
    onTextChange: (chunkId: string, newText: string) => void;
    onTogglePin: (chunkId: string) => void;
    isHighlighted: boolean;
    isEditing: boolean;
    onStartEdit: () => void;
    onEndEdit: () => void;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
}

export const EditableParagraph: React.FC<EditableParagraphProps> = React.memo(({
    chunk, characters, knowledgeBase, onTextChange, onTogglePin, isHighlighted, isEditing, onStartEdit, onEndEdit, scrollContainerRef
}) => {
    const [editText, setEditText] = useState(chunk.text);
    const [brushColor, setBrushColor] = useState('#ef4444');
    const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
    const [isApplyPulseActive, setIsApplyPulseActive] = useState(false);
    const [palettePos, setPalettePos] = useState<{ top: number; left: number } | null>(null);
    
    // パレット制御用のRef
    const colorPaletteRef = useRef<HTMLDivElement>(null);
    const paletteButtonRef = useRef<HTMLButtonElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // 選択範囲を保持するためのRef
    const selectionRef = useRef({ start: 0, end: 0 });

    const aiSettings = useStore(state => state.allProjectsData[state.activeProjectId]?.aiSettings);

    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKeyText = isMac ? '⌘Cmd' : 'Ctrl';

    const scrollCorrectionData = useRef<{ top: number } | null>(null);
    const [isAwaitingCorrection, setIsAwaitingCorrection] = useState(false);

    // 選択範囲が変更されたら保存しておく
    const syncSelection = () => {
        if (textareaRef.current) {
            selectionRef.current = {
                start: textareaRef.current.selectionStart,
                end: textareaRef.current.selectionEnd
            };
        }
    };

    // パレットの位置計算と外側クリック検知
    useLayoutEffect(() => {
        if (!isColorPaletteOpen) {
            setPalettePos(null);
            return;
        }

        const updatePosition = () => {
            if (paletteButtonRef.current) {
                const rect = paletteButtonRef.current.getBoundingClientRect();
                setPalettePos({
                    top: rect.bottom + window.scrollY,
                    left: rect.left + window.scrollX
                });
            }
        };

        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                colorPaletteRef.current && !colorPaletteRef.current.contains(target) &&
                paletteButtonRef.current && !paletteButtonRef.current.contains(target)
            ) {
                setIsColorPaletteOpen(false);
                setIsApplyPulseActive(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isColorPaletteOpen]);

    useEffect(() => {
        if (isEditing) {
            setEditText(chunk.text);
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus({ preventScroll: true });
                    textareaRef.current.style.height = 'auto';
                    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                    syncSelection();
                }
            }, 0);
        } else {
            setIsColorPaletteOpen(false);
            setIsApplyPulseActive(false);
        }
    }, [isEditing, chunk.text]);

    useEffect(() => {
        if (isHighlighted && wrapperRef.current) {
            wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isHighlighted]);

    const measureAndStorePosition = () => {
        const container = scrollContainerRef.current;
        if (container && wrapperRef.current) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = wrapperRef.current.getBoundingClientRect();
            const top = elementRect.top - containerRect.top;
            scrollCorrectionData.current = { top };
        }
    };
    
    useLayoutEffect(() => {
        if (isAwaitingCorrection && scrollCorrectionData.current !== null) {
            const container = scrollContainerRef.current;
            if (container && wrapperRef.current) {
                const containerRect = container.getBoundingClientRect();
                const newRect = wrapperRef.current.getBoundingClientRect();
                const newTop = newRect.top - containerRect.top;
                const oldTop = scrollCorrectionData.current.top;
                const delta = newTop - oldTop;
                if (Math.abs(delta) > 1) {
                    container.scrollTop += delta;
                }
            }
            scrollCorrectionData.current = null;
            setIsAwaitingCorrection(false);
        }
    }, [isAwaitingCorrection, chunk.text]);

    const handleSave = () => {
        measureAndStorePosition();
        setIsAwaitingCorrection(true);
        onTextChange(chunk.id, editText);
        onEndEdit();
    };
    
    const handleCancel = () => {
        measureAndStorePosition();
        setIsAwaitingCorrection(true);
        onEndEdit();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
        if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
        if ((e.ctrlKey || e.metaKey)) {
            switch (e.key) {
                case 'b': e.preventDefault(); applyMarkdown('**'); break;
                case 'u': e.preventDefault(); applyMarkdown('__'); break;
                case 'h': e.preventDefault(); applyMarkdown('# '); break;
                case 'r': e.preventDefault(); applyMarkdown('{', '|ふりがな}'); break;
                case 'c': if(e.shiftKey) { e.preventDefault(); applyMarkdown(`<c:${brushColor}>`, '</c>', 'テキスト', true); } break;
                default: break;
            }
        }
    };
    
    const applyMarkdown = (prefix: string, suffix: string = prefix, placeholder: string = 'テキスト', shouldClearSelection: boolean = false) => {
        if (!textareaRef.current) return;
        
        // Refから保存済みの選択範囲を取得
        const { start, end } = selectionRef.current;
        
        setEditText(prev => {
            const selectedText = prev.substring(start, end);
            const newText = selectedText || placeholder;
            const replacement = `${prefix}${newText}${suffix}`;
            const newEditText = prev.substring(0, start) + replacement + prev.substring(end);
            
            // ステート反映後のカーソル制御
            setTimeout(() => {
                if (!textareaRef.current) return;
                textareaRef.current.focus({ preventScroll: true });
                
                if (shouldClearSelection) {
                    const newPos = start + replacement.length;
                    textareaRef.current.setSelectionRange(newPos, newPos);
                    window.getSelection()?.removeAllRanges();
                } else if (selectedText) {
                    textareaRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
                } else {
                    textareaRef.current.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length);
                }
                syncSelection();
            }, 0);

            return newEditText;
        });
    };

    const wrapperClassName = `relative group transition-all duration-300 ${isHighlighted ? 'bg-indigo-500/10' : ''} ${chunk.isPinned ? 'bg-yellow-500/10' : ''} rounded-md my-4 select-text`;

    // 共通のボタンMouseDownイベント（フォーカス奪取防止）
    const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();

    return (
        <div ref={wrapperRef} id={`chunk-${chunk.id}`} className={wrapperClassName}>
            {isEditing ? (
                <div className="bg-gray-800 border-2 border-indigo-500 rounded-md flex flex-col shadow-lg overflow-hidden">
                    <div className="sticky-toolbar bg-gray-700/90 backdrop-blur-sm">
                         <div className="p-2 flex gap-1 border-b border-gray-600 items-center">
                            {/* FIX: Changed id to helpId for Tooltip components to match the expected prop name. */}
                            <Tooltip helpId="bold">
                                <button onMouseDown={preventFocusLoss} onClick={() => applyMarkdown('**')} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors"><Icons.BoldIcon className="h-4 w-4" /></button>
                            </Tooltip>
                            <Tooltip helpId="underline">
                                <button onMouseDown={preventFocusLoss} onClick={() => applyMarkdown('__')} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors"><Icons.UnderlineIcon className="h-4 w-4" /></button>
                            </Tooltip>
                            <Tooltip helpId="heading">
                                <button onMouseDown={preventFocusLoss} onClick={() => applyMarkdown('# ')} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors"><Icons.TypeIcon className="h-4 w-4" /></button>
                            </Tooltip>
                            <Tooltip helpId="ruby">
                                <button onMouseDown={preventFocusLoss} onClick={() => applyMarkdown('{', '|ふりがな}')} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-600 rounded font-bold text-xs px-2">ルビ</button>
                            </Tooltip>
                            
                            <div className="w-px h-4 bg-gray-600 mx-1" />

                            <div className="relative flex items-center">
                                <div className="flex items-center gap-0.5 bg-gray-800/50 rounded-md p-0.5 border border-gray-600/50">
                                    {/* FIX: Changed id to helpId for Tooltip component. */}
                                    <Tooltip helpId="palette">
                                        <button 
                                            onMouseDown={preventFocusLoss}
                                            onClick={() => {
                                                applyMarkdown(`<c:${brushColor}>`, '</c>', 'テキスト', true);
                                                setIsApplyPulseActive(false);
                                            }} 
                                            className={`p-1.5 rounded hover:bg-gray-600 transition-all duration-300 flex items-center justify-center ${isApplyPulseActive ? 'animate-pulse-prompt' : ''}`}
                                            style={{ color: brushColor }}
                                        >
                                            <Icons.PaletteIcon className="h-4 w-4 drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]" />
                                        </button>
                                    </Tooltip>
                                    {/* FIX: Changed id to helpId for Tooltip component. */}
                                    <Tooltip helpId="palette_select">
                                        <button 
                                            ref={paletteButtonRef}
                                            onMouseDown={preventFocusLoss}
                                            onClick={() => {
                                                setIsColorPaletteOpen(!isColorPaletteOpen);
                                                if (isColorPaletteOpen) setIsApplyPulseActive(false);
                                            }}
                                            className="p-1 text-gray-400 hover:text-white transition-colors"
                                        >
                                            <Icons.ChevronDownIcon className={`h-3 w-3 transition-transform duration-200 ${isColorPaletteOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                    </Tooltip>
                                </div>

                                {isColorPaletteOpen && palettePos && createPortal(
                                    <div 
                                        ref={colorPaletteRef}
                                        style={{ 
                                            position: 'absolute',
                                            top: `${palettePos.top + 8}px`,
                                            left: `${palettePos.left}px`,
                                        }}
                                        className="z-[100] bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 min-w-[220px]"
                                    >
                                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-700">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Preset</span>
                                        </div>
                                        <div className="grid grid-cols-5 gap-2 mb-5">
                                            {PRESET_COLORS.map(color => (
                                                <button
                                                    key={color}
                                                    onMouseDown={preventFocusLoss}
                                                    onClick={() => {
                                                        setBrushColor(color);
                                                        applyMarkdown(`<c:${color}>`, '</c>', 'テキスト', true);
                                                        setIsColorPaletteOpen(false);
                                                        setIsApplyPulseActive(false);
                                                    }}
                                                    className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 active:scale-90 ${brushColor.toLowerCase() === color.toLowerCase() ? 'border-white ring-2 ring-indigo-500 ring-offset-1 ring-offset-gray-800 scale-110' : 'border-transparent opacity-80 hover:opacity-100'}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-700">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Characters</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mb-5">
                                            {characters.filter(c => c.themeColor).length > 0 ? (
                                                characters.filter(c => c.themeColor).map(char => (
                                                    <button
                                                        key={char.id}
                                                        onMouseDown={preventFocusLoss}
                                                        onClick={() => {
                                                            setBrushColor(char.themeColor!);
                                                            applyMarkdown(`<c:${char.themeColor}>`, '</c>', 'テキスト', true);
                                                            setIsColorPaletteOpen(false);
                                                            setIsApplyPulseActive(false);
                                                        }}
                                                        className={`flex items-center gap-2 p-2 rounded-lg transition-all hover:bg-gray-700 active:scale-95 text-left border ${brushColor.toLowerCase() === char.themeColor!.toLowerCase() ? 'bg-indigo-900/30 border-indigo-500/50' : 'border-transparent bg-gray-700/30'}`}
                                                    >
                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: char.themeColor, boxShadow: `0 0 6px ${char.themeColor}60` }} />
                                                        <span className="text-[11px] text-gray-200 truncate font-medium">{char.name}</span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="col-span-2 py-2 text-center text-[10px] text-gray-500 italic">No character colors set</div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-700">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Custom</span>
                                        </div>
                                        <div className="flex items-center gap-3 bg-gray-900/60 p-2 rounded-lg border border-gray-700 shadow-inner">
                                            <div className="relative w-7 h-7 rounded-md overflow-hidden border border-gray-500 group-hover:border-white transition-colors">
                                                <input 
                                                    type="color" 
                                                    value={brushColor} 
                                                    onMouseDown={preventFocusLoss}
                                                    onChange={(e) => {
                                                        setBrushColor(e.target.value);
                                                        setIsApplyPulseActive(true);
                                                    }} 
                                                    className="absolute -inset-2 w-12 h-12 cursor-pointer bg-transparent border-none"
                                                />
                                            </div>
                                            <span className="text-[11px] text-gray-300 font-mono flex-grow select-all uppercase tracking-tight">{brushColor}</span>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="relative bg-gray-800/50">
                        <textarea
                            ref={textareaRef}
                            value={editText}
                            onSelect={syncSelection}
                            onKeyUp={syncSelection}
                            onMouseUp={syncSelection}
                            onFocus={syncSelection}
                            onChange={(e) => {
                                setEditText(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${textareaRef.current.scrollHeight}px`;
                                syncSelection();
                            }}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent p-4 text-white focus:outline-none resize-none"
                            aria-label="本文段落の編集"
                            style={{
                                minHeight: '120px',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                lineHeight: 'inherit',
                                overflowY: 'auto',
                            }}
                        />
                    </div>
                     <div className="flex justify-end gap-2 p-3 bg-gray-900/20 border-t border-gray-700/50">
                        <button onMouseDown={preventFocusLoss} onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-300 text-xs rounded-md hover:bg-gray-600 transition-colors">
                            <Icons.XIcon className="h-3.5 w-3.5" />
                            キャンセル
                        </button>
                        <button onMouseDown={preventFocusLoss} onClick={handleSave} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-500 transition-all font-bold shadow-md">
                            <Icons.CheckIcon className="h-3.5 w-3.5" />
                            保存 ({modifierKeyText}+Enter)
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {chunk.isPinned && <Icons.PinIcon aria-hidden="true" className="absolute top-1 left-1 h-3 w-3 text-yellow-400 fill-current" title="この段落はピン留めされています" />}
                    <div className={`whitespace-pre-wrap ${chunk.isPinned ? 'pl-5' : ''} select-text`}>
                        {parse(renderMarkdown(chunk.text, characters, knowledgeBase, aiSettings) || '<br/>')}
                    </div>
                    <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                        <button 
                            onClick={() => onTogglePin(chunk.id)} 
                            title={chunk.isPinned ? "ピンを外す" : "ピン留めする"} 
                            aria-label={chunk.isPinned ? "この段落のピン留めを外す" : "この段落をピン留めする"}
                            aria-pressed={chunk.isPinned}
                            className={`p-1.5 bg-gray-700 text-gray-300 rounded-full focus:opacity-100 ${chunk.isPinned ? 'text-yellow-400' : 'hover:text-yellow-400'}`}
                        >
                           <Icons.PinIcon aria-hidden="true" className={`h-4 w-4 ${chunk.isPinned ? 'fill-current' : ''}`} />
                        </button>
                        <button 
                            onClick={onStartEdit} 
                            title="編集" 
                            aria-label="この段落を編集する"
                            className="p-1.5 bg-gray-700 text-gray-300 rounded-full focus:opacity-100 hover:text-white"
                        >
                            <Icons.EditIcon aria-hidden="true" className="h-4 w-4" />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
});
