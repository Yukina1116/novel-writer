
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { DisplaySettings, SettingItem } from '../types';
import { compressImage } from '../utils';

interface HtmlExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: any) => void;
  displaySettings: DisplaySettings;
  settings: SettingItem[];
}

const Checkbox: React.FC<{
    id: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    indented?: boolean;
}> = ({ id, label, checked, onChange, disabled = false, indented = false }) => (
    <div className={`flex items-center ${indented ? 'ml-6' : ''}`}>
        <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500" />
        <label htmlFor={id} className={`ml-2 text-sm ${disabled ? 'text-gray-500' : 'text-gray-300'}`}>{label}</label>
    </div>
);

const DescriptionEditorPopover = ({ editingItem, onClose, onSave }) => {
    const [description, setDescription] = useState(editingItem.item.exportDescription || '');
    const popoverRef = useRef(null);
    const textareaRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        setDescription(editingItem.item.exportDescription || '');
        setTimeout(() => textareaRef.current?.focus(), 0);

        const anchorRect = editingItem.anchorEl.getBoundingClientRect();
        const popoverWidth = 320; // w-80
        
        let left = anchorRect.left - popoverWidth - 16;
        if (left < 10) {
            left = anchorRect.right + 16;
        }

        setPosition({
            top: anchorRect.top + window.scrollY,
            left: left + window.scrollX
        });
        
    }, [editingItem]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleSave = () => {
        onSave(description);
    };

    return createPortal(
        <div
            ref={popoverRef}
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
            className="absolute z-[60] w-80 bg-gray-700 rounded-lg shadow-xl border border-gray-600 p-4 flex flex-col"
            onClick={e => e.stopPropagation()}
        >
            <h4 className="text-md font-semibold text-white mb-2">{editingItem.item.name}</h4>
            <p className="text-xs text-gray-400 mb-2">書き出し用の説明文を編集</p>
            <textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white resize-y"
            />
            <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="flex items-center gap-1 px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500">
                    <Icons.XIcon className="h-3 w-3" />
                    キャンセル
                </button>
                <button type="button" onClick={handleSave} className="flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500">
                    <Icons.CheckIcon className="h-3 w-3" />
                    保存
                </button>
            </div>
        </div>,
        document.body
    );
};


export const HtmlExportModal = ({ isOpen, onClose, onExport, displaySettings, settings }: HtmlExportModalProps) => {
    const [localCharacters, setLocalCharacters] = useState<SettingItem[]>([]);
    const [localWorldSettings, setLocalWorldSettings] = useState<SettingItem[]>([]);
    const [editingItem, setEditingItem] = useState<{ item: SettingItem; type: 'character' | 'world'; anchorEl: HTMLElement } | null>(null);

    const [options, setOptions] = useState({
        coverType: 'image_with_text', // 'text_only', 'image_only', 'image_with_text'
        authorName: '',
        coverImageSrc: '',
        useCurrentStyle: true,
        fontFamily: displaySettings.fontFamily,
        fontSize: displaySettings.fontSize,
        theme: displaySettings.theme,
        addToc: true,
        selectedCharacterIds: [],
        addCharacterImages: true,
        selectedWorldIds: [],
        afterword: '',
    });
    
    useEffect(() => {
        if (isOpen) {
            const chars = settings.filter(s => s.type === 'character');
            const worlds = settings.filter(s => s.type === 'world');
            setLocalCharacters(chars);
            setLocalWorldSettings(worlds);

            setOptions(prev => ({
                ...prev,
                fontFamily: displaySettings.fontFamily,
                fontSize: displaySettings.fontSize,
                theme: displaySettings.theme,
                selectedCharacterIds: chars.map(c => c.id),
                selectedWorldIds: worlds.map(w => w.id),
            }));
        } else {
            setEditingItem(null);
        }
    }, [isOpen, displaySettings, settings]);

    const handleChange = (key, value) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const result = reader.result as string;
                const compressed = await compressImage(result);
                handleChange('coverImageSrc', compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleExportClick = () => {
        onExport({
            ...options,
            charactersToExport: localCharacters.filter(c => options.selectedCharacterIds.includes(c.id)),
            worldSettingsToExport: localWorldSettings.filter(w => options.selectedWorldIds.includes(w.id)),
        });
        onClose();
    };
    
    const handleSelectionChange = (key, id) => {
        const currentSelection = options[key];
        const newSelection = currentSelection.includes(id)
            ? currentSelection.filter(i => i !== id)
            : [...currentSelection, id];
        handleChange(key, newSelection);
    };

    const handleSelectAll = (key, items) => {
        handleChange(key, items.map(item => item.id));
    };

    const handleDeselectAll = (key) => {
        handleChange(key, []);
    };


    if (!isOpen) return null;
    
    return createPortal(
        <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
                <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-indigo-400">HTML書き出し設定</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                        {/* Cover Page */}
                        <div className="p-4 bg-gray-900/50 rounded-lg">
                            <h3 className="font-semibold mb-3 text-lg text-lime-400">表紙</h3>
                            <div className="space-y-3">
                                <div className="flex items-center gap-6 mb-3">
                                    <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                                        <input type="radio" name="coverType" value="text_only" checked={options.coverType === 'text_only'} onChange={() => handleChange('coverType', 'text_only')} className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500" />
                                        <span className="ml-2">文字のみ</span>
                                    </label>
                                    <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                                        <input type="radio" name="coverType" value="image_only" checked={options.coverType === 'image_only'} onChange={() => handleChange('coverType', 'image_only')} className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500" />
                                        <span className="ml-2">画像のみ</span>
                                    </label>
                                    <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                                        <input type="radio" name="coverType" value="image_with_text" checked={options.coverType === 'image_with_text'} onChange={() => handleChange('coverType', 'image_with_text')} className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500" />
                                        <span className="ml-2">画像付き</span>
                                    </label>
                                </div>
                                <div className="space-y-3">
                                    {(options.coverType === 'text_only' || options.coverType === 'image_with_text') && (
                                        <div>
                                            <label htmlFor="authorName" className="block text-sm text-gray-400 mb-1">著者名</label>
                                            <input type="text" id="authorName" value={options.authorName} onChange={e => handleChange('authorName', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"/>
                                        </div>
                                    )}
                                    {(options.coverType === 'image_only' || options.coverType === 'image_with_text') && (
                                        <div className="space-y-3 pt-2 border-t border-gray-700/50">
                                            <div>
                                                <label htmlFor="coverImageFile" className="block text-sm text-gray-400 mb-1">画像ファイル</label>
                                                <input type="file" id="coverImageFile" accept="image/png, image/jpeg" onChange={handleImageUpload} className="w-full text-sm text-gray-300 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"/>
                                            </div>
                                            <div className="text-center text-xs text-gray-500">または</div>
                                            <div>
                                                <label htmlFor="coverImageSrc" className="block text-sm text-gray-400 mb-1">画像URL</label>
                                                <input type="text" id="coverImageSrc" value={options.coverImageSrc.startsWith('data:') ? '' : options.coverImageSrc} onChange={e => handleChange('coverImageSrc', e.target.value)} placeholder="https://..." className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"/>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {/* Style */}
                        <div className="p-4 bg-gray-900/50 rounded-lg">
                            <h3 className="font-semibold mb-3 text-lg text-lime-400">スタイル</h3>
                            <div className="space-y-4">
                                <Checkbox id="useCurrentStyle" label="現在の表示設定を使用する" checked={options.useCurrentStyle} onChange={val => handleChange('useCurrentStyle', val)} />
                                <div className={`grid grid-cols-2 gap-4 transition-opacity ${options.useCurrentStyle ? 'opacity-50' : 'opacity-100'}`}>
                                    <div>
                                        <label className="text-sm text-gray-400 block mb-1">フォント</label>
                                        <select value={options.fontFamily} onChange={e => handleChange('fontFamily', e.target.value)} disabled={options.useCurrentStyle} className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1 text-sm text-white disabled:bg-gray-700">
                                            <option value="sans">Noto Sans JP</option>
                                            <option value="serif">Noto Serif JP</option>
                                            <option value="rounded-sans">M PLUS Rounded 1c</option>
                                            <option value="handwriting">Yuji Syuku</option>
                                            <option value="sawarabi-serif">Sawarabi Mincho</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-400 block mb-1">文字サイズ: {options.fontSize}px</label>
                                        <input type="range" min="12" max="24" step="0.5" value={options.fontSize} onChange={e => handleChange('fontSize', parseFloat(e.target.value))} disabled={options.useCurrentStyle} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:bg-gray-700"/>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-sm text-gray-400 block mb-1">カラーテーマ</label>
                                        <div className="flex justify-between gap-2">
                                            <button onClick={() => handleChange('theme', 'light')} disabled={options.useCurrentStyle} className={`flex-1 py-1 rounded text-xs transition text-white ${options.theme === 'light' ? 'bg-indigo-600 font-semibold' : 'bg-gray-600 hover:bg-gray-500'} disabled:bg-gray-700 disabled:hover:bg-gray-700`}>白</button>
                                            <button onClick={() => handleChange('theme', 'sepia')} disabled={options.useCurrentStyle} className={`flex-1 py-1 rounded text-xs transition text-white ${options.theme === 'sepia' ? 'bg-indigo-600 font-semibold' : 'bg-gray-600 hover:bg-gray-500'} disabled:bg-gray-700 disabled:hover:bg-gray-700`}>セピア</button>
                                            <button onClick={() => handleChange('theme', 'dark')} disabled={options.useCurrentStyle} className={`flex-1 py-1 rounded text-xs transition text-white ${options.theme === 'dark' ? 'bg-indigo-600 font-semibold' : 'bg-gray-600 hover:bg-gray-500'} disabled:bg-gray-700 disabled:hover:bg-gray-700`}>黒</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Content */}
                        <div className="p-4 bg-gray-900/50 rounded-lg">
                            <h3 className="font-semibold mb-3 text-lg text-lime-400">追加コンテンツ</h3>
                            <div className="space-y-4">
                                <Checkbox id="addToc" label="目次を自動生成する (本文中の見出しから作成)" checked={options.addToc} onChange={val => handleChange('addToc', val)} />
                                
                                {/* Character Selection */}
                                <div>
                                    <h4 className="text-md font-semibold text-gray-300 mb-2">登場人物一覧</h4>
                                    {localCharacters.length > 0 ? (
                                        <>
                                            <div className="flex gap-2 mb-2">
                                                <button onClick={() => handleSelectAll('selectedCharacterIds', localCharacters)} className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white">すべて選択</button>
                                                <button onClick={() => handleDeselectAll('selectedCharacterIds')} className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white">すべて解除</button>
                                            </div>
                                            <div className="max-h-32 overflow-y-auto space-y-1 p-2 border border-gray-700 rounded-md">
                                                {localCharacters.map(char => (
                                                    <div key={char.id} className="flex items-center justify-between">
                                                        <Checkbox id={`char-${char.id}`} label={char.name} checked={options.selectedCharacterIds.includes(char.id)} onChange={() => handleSelectionChange('selectedCharacterIds', char.id)} />
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setEditingItem({ item: char, type: 'character', anchorEl: e.currentTarget }); }}
                                                            className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"
                                                            title="書き出し用説明文を編集"
                                                        >
                                                            <Icons.PlusCircleIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <Checkbox id="addCharacterImages" label="キャラクター画像も表示する" checked={options.addCharacterImages} onChange={val => handleChange('addCharacterImages', val)} disabled={options.selectedCharacterIds.length === 0} indented />
                                        </>
                                    ) : <p className="text-sm text-gray-500">追加できるキャラクターがいません。</p>}
                                </div>

                                {/* World Selection */}
                                <div>
                                    <h4 className="text-md font-semibold text-gray-300 mb-2">世界観・用語集</h4>
                                    {localWorldSettings.length > 0 ? (
                                        <>
                                            <div className="flex gap-2 mb-2">
                                                <button onClick={() => handleSelectAll('selectedWorldIds', localWorldSettings)} className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white">すべて選択</button>
                                                <button onClick={() => handleDeselectAll('selectedWorldIds')} className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white">すべて解除</button>
                                            </div>
                                            <div className="max-h-32 overflow-y-auto space-y-1 p-2 border border-gray-700 rounded-md">
                                                {localWorldSettings.map(world => (
                                                    <div key={world.id} className="flex items-center justify-between">
                                                        <Checkbox id={`world-${world.id}`} label={world.name} checked={options.selectedWorldIds.includes(world.id)} onChange={() => handleSelectionChange('selectedWorldIds', world.id)} />
                                                         <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setEditingItem({ item: world, type: 'world', anchorEl: e.currentTarget }); }}
                                                            className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"
                                                            title="書き出し用説明文を編集"
                                                        >
                                                            <Icons.PlusCircleIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : <p className="text-sm text-gray-500">追加できる世界観設定がありません。</p>}
                                </div>
                            </div>
                        </div>
                        {/* Afterword */}
                        <div className="p-4 bg-gray-900/50 rounded-lg">
                            <h3 className="font-semibold mb-3 text-lg text-lime-400">あとがき</h3>
                            <textarea
                                value={options.afterword}
                                onChange={e => handleChange('afterword', e.target.value)}
                                rows={4}
                                placeholder="あとがきを入力..."
                                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white resize-y"
                            />
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3 border-t border-gray-700 pt-4">
                        <button type="button" onClick={onClose} className="flex items-center gap-2 px-4 py-2 rounded-md btn-pressable btn-invert-gray">
                            <Icons.XIcon className="h-4 w-4" />
                            キャンセル
                        </button>
                        <button type="button" onClick={handleExportClick} className="px-6 py-2 rounded-md font-semibold btn-pressable btn-invert-orange">この設定で書き出す</button>
                    </div>
                </div>
            </div>
             {editingItem && (
                <DescriptionEditorPopover
                    editingItem={editingItem}
                    onClose={() => setEditingItem(null)}
                    onSave={(newDescription) => {
                        if (editingItem.type === 'character') {
                            setLocalCharacters(prev => prev.map(c => c.id === editingItem.item.id ? { ...c, exportDescription: newDescription } : c));
                        } else {
                            setLocalWorldSettings(prev => prev.map(w => w.id === editingItem.item.id ? { ...w, exportDescription: newDescription } : w));
                        }
                        setEditingItem(null);
                    }}
                />
            )}
        </>,
        document.body
    );
};
