import React, { useState, useEffect, useMemo, useRef } from 'react';
// FIX: The file 'store.ts' does not exist, changed import to 'store/index.ts'.
import { useStore } from '../store/index';
import * as Icons from '../icons';

export const CommandPalette = () => {
    const activeModal = useStore(state => state.activeModal);
    const closeModal = useStore(state => state.closeModal);
    const openModal = useStore(state => state.openModal);
    const userMode = useStore(state => state.userMode);
    const generationMode = useStore(state => state.generationMode);
    const setGenerationMode = useStore(state => state.setGenerationMode);

    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const isCommandPaletteOpen = activeModal === 'commandPalette';

    const commands = useMemo(() => {
        const baseCommands = [
            { name: '新規キャラクター作成', action: () => openModal('character'), icon: <Icons.UserPlusIcon /> },
            { name: '新規世界観設定作成', action: () => openModal('world'), icon: <Icons.GlobeIcon /> },
            { name: '新規ナレッジ作成', action: () => openModal('knowledge'), icon: <Icons.LightbulbIcon /> },
            { name: '新規プロット作成', action: () => openModal('plot'), icon: <Icons.ClipboardListIcon /> },
            { name: '相関図を開く', action: () => openModal('characterChart'), icon: <Icons.UserCogIcon /> },
            { name: 'タイムラインを開く', action: () => openModal('timeline'), icon: <Icons.ClockIcon /> },
            { name: '設定を開く', action: () => openModal('aiSettings'), icon: <Icons.SettingsIcon /> },
            { name: `AIモード切替: ${generationMode === 'write' ? '相談' : '執筆'}モードへ`, action: () => setGenerationMode(generationMode === 'write' ? 'consult' : 'write'), icon: <Icons.BotIcon /> },
        ];

        if (userMode === 'simple') {
            return baseCommands.filter(c => c.name !== 'タイムラインを開く');
        }
        return baseCommands;
    }, [openModal, generationMode, setGenerationMode, userMode]);

    const filteredCommands = useMemo(() =>
        commands.filter(command =>
            command.name.toLowerCase().includes(searchTerm.toLowerCase())
        ), [searchTerm, commands]);

    useEffect(() => {
        if (isCommandPaletteOpen) {
            setSearchTerm('');
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isCommandPaletteOpen]);

    useEffect(() => {
        setActiveIndex(0);
    }, [searchTerm]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prevIndex) => (prevIndex + 1) % filteredCommands.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prevIndex) => (prevIndex - 1 + filteredCommands.length) % filteredCommands.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const command = filteredCommands[activeIndex];
            if (command) {
                command.action();
                closeModal();
            }
        } else if (e.key === 'Escape') {
            closeModal();
        }
    };

    if (!isCommandPaletteOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-start z-50 pt-20"
            onClick={closeModal}
        >
            <div
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-xl border border-gray-700 max-h-[70vh] flex flex-col"
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="p-3 border-b border-gray-700">
                    <div className="relative">
                        <Icons.SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="コマンドを検索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-transparent border-none pl-10 pr-4 py-1 text-md text-white focus:ring-0"
                        />
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-2">
                    {filteredCommands.length > 0 ? (
                        filteredCommands.map((command, index) => (
                            <button
                                key={command.name}
                                onClick={() => { command.action(); closeModal(); }}
                                className={`w-full flex items-center gap-3 text-left p-3 rounded-md transition-colors ${index === activeIndex ? 'bg-indigo-600/50' : 'hover:bg-gray-700/50'}`}
                            >
                                <div className="text-gray-400">{command.icon}</div>
                                <span className="text-white">{command.name}</span>
                            </button>
                        ))
                    ) : (
                        <p className="text-center text-gray-500 p-8">コマンドが見つかりません。</p>
                    )}
                </div>
            </div>
        </div>
    );
};