import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Icons from '../icons';
import { AiSettings, Project, DisplaySettings, UserMode, UndoScope, HistoryType } from '../types';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';
import { useStore } from '../store/index';
import { compressImage } from '../utils';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AiSettings;
  displaySettings: DisplaySettings;
  handleDisplaySettingChange: (key: keyof DisplaySettings, value: any) => void;
  onHelpClick: (topic: string) => void;
  userProfile: Project['userProfile'];
  setActiveProjectData: (updater: (data: Project) => Project, historyLabel?: { type: HistoryType; label: string }) => void;
  isMobile?: boolean;
}

export const AiSettingsModal = ({ isOpen, onClose, settings, displaySettings, handleDisplaySettingChange, onHelpClick, userProfile, setActiveProjectData, isMobile = false }: AiSettingsModalProps) => {
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [userName, setUserName] = useState('');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    
    const closeButtonRef = useRef(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const userMode = useStore(state => state.userMode);
    const setUserMode = useStore(state => state.setUserMode);
    const undoScope = useStore(state => state.undoScope);
    const setUndoScope = useStore(state => state.setUndoScope);
    const pinnedSettingIds = useStore(state => state.pinnedSettingIds);
    const togglePinnedSetting = useStore(state => state.togglePinnedSetting);
    const showToastNotifications = useStore(state => state.showToastNotifications);
    const setShowToastNotifications = useStore(state => state.setShowToastNotifications);

    useEffect(() => {
        if (isOpen) {
            setCurrentSettings(settings);
            setUserName(userProfile?.name || '');
            setInitialStateString(JSON.stringify({ settings, name: userProfile?.name || '' }));
        }
    }, [isOpen, settings, userProfile]);

    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        const currentState = JSON.stringify({ settings: currentSettings, name: userName });
        return currentState !== initialStateString;
    }, [currentSettings, userName, initialStateString]);

    const handleCloseRequest = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };

    const handleChange = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
        setCurrentSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleToneButtonClick = (toneWord) => {
        const currentTone = currentSettings.tone || '';
        if (currentTone.split(/,?\s+/).includes(toneWord)) return;
        const newTone = currentTone ? `${currentTone}, ${toneWord}` : toneWord;
        handleChange('tone', newTone);
    };

    const handleSave = () => {
        setActiveProjectData(d => ({
            ...d,
            aiSettings: currentSettings,
            userProfile: { ...(d.userProfile || { iconUrl: '' }), name: userName },
            lastModified: new Date().toISOString(),
        }), { type: 'settings', label: 'AI・プロフィール設定を更新' });
        
        onClose();
    };

    const handleSaveAndClose = () => {
        handleSave();
        setIsConfirmCloseOpen(false);
    };

    const handleIconUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const result = reader.result as string;
                const compressed = await compressImage(result);
                setActiveProjectData(d => ({
                    ...d,
                    userProfile: { ...d.userProfile, iconUrl: compressed },
                    lastModified: new Date().toISOString(),
                }), { type: 'settings', label: 'ユーザーアイコンを更新' });
            };
            reader.readAsDataURL(file);
        }
    };

    if (!isOpen) return null;

    const lengthValue = Number(currentSettings.length);
    const isShort = lengthValue <= 400;
    const isMedium = lengthValue > 400 && lengthValue < 1200;
    const isLong = lengthValue >= 1200;

    // Styles for mobile optimization
    const modalContainerClass = isMobile 
        ? "fixed inset-0 bg-gray-900 w-full h-[100dvh] flex flex-col z-[60]"
        : "bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl border border-gray-700 max-h-[90vh] flex flex-col overflow-hidden";
    
    const sectionClass = `p-4 bg-gray-900/30 rounded-lg space-y-4 ${isMobile ? 'mb-4' : ''}`;
    const labelClass = `text-gray-300 font-medium flex items-center gap-1 ${isMobile ? 'mb-2' : 'mb-2 sm:mb-0'}`;
    const inputClass = `w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white ${isMobile ? 'text-base' : 'text-sm'}`;
    const buttonClass = (isActive: boolean) => `text-sm rounded-full transition btn-pressable ${isMobile ? 'py-3 px-4 flex-grow text-center' : 'px-3 py-1'} ${isActive ? 'bg-indigo-600 font-semibold text-white' : 'bg-gray-700 text-gray-300'}`;
    const actionButtonClass = (colorClass: string) => `${colorClass} text-white rounded-md transition btn-pressable flex items-center justify-center gap-2 ${isMobile ? 'p-3 text-base w-full' : 'px-4 py-2 text-sm'}`;

    const renderPinButton = (id: string) => {
        if (userMode !== 'pro') return null;
        const isPinned = pinnedSettingIds.includes(id);
        return (
            <button
                type="button"
                onClick={() => togglePinnedSetting(id)}
                className={`p-1.5 rounded-md transition-colors btn-pressable ${
                    isPinned 
                        ? 'text-indigo-400 bg-indigo-500/10' 
                        : 'text-gray-600 hover:text-gray-400'
                }`}
                title={isPinned ? "クイック設定から外す" : "クイック設定に追加"}
            >
                <Icons.PinIcon className={`h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
            </button>
        );
    };

    const renderSettingItem = (label: string, helpTopic: string, pinId: string | null, children: React.ReactNode) => (
        <div className={`flex flex-col ${isMobile ? 'gap-2' : 'sm:flex-row sm:items-center sm:justify-between'}`}>
            <div className="flex items-center">
                {pinId && renderPinButton(pinId)}
                <label className={labelClass}>
                    {label}
                    <button onClick={() => onHelpClick(helpTopic)} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                </label>
            </div>
            <div className={`flex gap-2 flex-wrap ${isMobile ? 'w-full' : 'justify-start sm:justify-end'}`}>
                {children}
            </div>
        </div>
    );

    const userModeOptions: { id: UserMode, title: string, description: string }[] = [
        { id: 'simple', title: 'かんたん', description: '初心者・子供向け。' },
        { id: 'standard', title: '標準', description: 'バランスの取れたモード。' },
        { id: 'pro', title: 'プロ', description: '上級者向けモード。' },
    ];

    const undoScopeOptions: { id: UndoScope; label: string }[] = [
        { id: 'all', label: 'すべての操作' },
        { id: 'text-only', label: '本文だけ' },
        { id: 'ai-only', label: 'AIチャットだけ' },
        { id: 'data-only', label: 'データ編集のみ' },
    ];

    return (
        <div className={isMobile ? "fixed inset-0 z-[60]" : "fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50"}>
            <div className={modalContainerClass}>
                <UnsavedChangesPopover
                    isOpen={isConfirmCloseOpen}
                    targetRef={closeButtonRef}
                    onCancel={() => setIsConfirmCloseOpen(false)}
                    onCloseWithoutSaving={() => { setIsConfirmCloseOpen(false); onClose(); }}
                    onSaveAndClose={handleSaveAndClose}
                />
                {/* Header */}
                <div className={`flex justify-between items-center flex-shrink-0 ${isMobile ? 'p-4 border-b border-gray-700' : 'p-6 pb-4 border-b border-gray-700'}`}>
                    <h2 className={`font-bold text-indigo-400 flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}><Icons.SettingsIcon />設定</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onHelpClick('aiSettingsHelp')} className="p-2 rounded-full hover:bg-gray-700 transition btn-pressable"><Icons.HelpCircleIcon /></button>
                        <button ref={closeButtonRef} type="button" onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition btn-pressable"><Icons.XIcon /></button>
                    </div>
                </div>

                {/* Content */}
                <div className={`flex-grow overflow-y-auto min-h-0 ${isMobile ? 'px-4 pb-24' : 'p-6 space-y-6'}`}>

                    {/* プロフィール設定 */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400">プロフィール設定</h3>
                        <div className="flex items-center gap-4">
                            <input type="file" ref={fileInputRef} onChange={handleIconUpload} accept="image/*" className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 group relative" title="アイコンを変更">
                                {userProfile?.iconUrl ? (
                                    <img src={userProfile.iconUrl} alt="User Icon" className="w-16 h-16 rounded-full object-cover" />
                                ) : (
                                    <Icons.UserIcon className="w-16 h-16 text-blue-400 p-3 bg-gray-700 rounded-full" />
                                )}
                                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icons.EditIcon className="h-6 w-6 text-white" />
                                </div>
                            </button>
                            <div className="flex-grow">
                                <label htmlFor="user-name" className="text-sm text-gray-300">ユーザーネーム</label>
                                <input id="user-name" type="text" value={userName} onChange={e => setUserName(e.target.value)} placeholder="名前を入力..." className={`${inputClass} mt-1`}/>
                                <p className="text-xs text-gray-400 mt-1">AIアシスタントがあなたを呼ぶ時の名前です。</p>
                            </div>
                        </div>
                    </div>

                    {/* 一般設定 */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400">一般設定</h3>
                        <div className="space-y-4">
                            {/* 通知設定 */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">通知を表示する</span>
                                <button
                                    onClick={() => setShowToastNotifications(!showToastNotifications)}
                                    className={`w-12 h-6 rounded-full transition-colors ${showToastNotifications ? 'bg-indigo-600' : 'bg-gray-600'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showToastNotifications ? 'translate-x-7' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            
                            {/* Undo/Redo設定 */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center">
                                    {renderPinButton('undoScope')}
                                    <label className="text-gray-300 font-medium ml-1">Undo/Redo の対象範囲</label>
                                    <button onClick={() => onHelpClick('undoScope')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                                </div>
                                <select value={undoScope} onChange={(e) => setUndoScope(e.target.value as UndoScope)} className={inputClass}>
                                    {undoScopeOptions.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ユーザーモード設定 */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400 flex items-center gap-2">
                            ユーザーモード
                            <button onClick={() => onHelpClick('userMode')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                        </h3>
                        <div className="flex flex-col gap-2 rounded-lg bg-gray-900 p-2">
                            {userModeOptions.map(option => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setUserMode(option.id)}
                                    className={`flex items-center p-3 rounded-md btn-pressable ${userMode === option.id ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' : 'text-gray-300 hover:bg-gray-700'}`}
                                >
                                    <div className="flex-grow text-left">
                                        <h4 className="font-bold">{option.title}モード</h4>
                                        <p className="text-xs opacity-80">{option.description}</p>
                                    </div>
                                    {userMode === option.id && <Icons.CheckCircleIcon className="h-5 w-5" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 文章の基本スタイル */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400 -mb-2">文章の基本スタイル</h3>
                         {renderSettingItem('文体・視点', 'perspective', 'perspective',
                            [
                                {key: 'third_person_limited', label: '三人称'},
                                {key: 'first_person', label: '一人称'},
                                {key: 'third_person_omniscient', label: '全知'}
                            ].map(val => (
                                <button key={val.key} onClick={() => handleChange('perspective', val.key)} className={buttonClass(currentSettings.perspective === val.key)}>{val.label}</button>
                            ))
                        )}
                        <div className="flex flex-col gap-2">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    {renderPinButton('tone')}
                                    <label className={labelClass}>
                                        トーン＆マナー
                                        <button onClick={() => onHelpClick('tone')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                                    </label>
                                </div>
                            </div>
                            <input type="text" value={currentSettings.tone} onChange={(e) => handleChange('tone', e.target.value)} placeholder="例：軽快で、ユーモアを交えて" className={inputClass} />
                            <div className="flex gap-2 flex-wrap mt-1">
                                {['シリアス', 'コミカル', '詩的', '淡々', '感情的'].map(val => (
                                    <button key={val} onClick={() => handleToneButtonClick(val)} className={`px-2 py-1 text-xs rounded-full bg-gray-700 hover:bg-gray-600 transition btn-pressable ${isMobile ? 'p-2' : ''}`}>{val}</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col space-y-3">
                            <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                                 <div className="flex items-center">
                                    {renderPinButton('length')}
                                    <label className={labelClass}>
                                        生成する文章量
                                        <button onClick={() => onHelpClick('length')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                                    </label>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button onClick={() => handleChange('length', 200)} className={buttonClass(isShort)}>短め</button>
                                    <button onClick={() => handleChange('length', 700)} className={buttonClass(isMedium)}>普通</button>
                                    <button onClick={() => handleChange('length', 1500)} className={buttonClass(isLong)}>長め</button>
                                </div>
                            </div>
                             <div className="flex items-center gap-4 p-2 bg-gray-800 rounded-md">
                                <input type="range" min="50" max="2000" step="50" value={lengthValue} onChange={(e) => handleChange('length', Number(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-sm font-mono text-gray-300 w-16 text-right flex-shrink-0">{lengthValue}字</span>
                            </div>
                        </div>
                    </div>

                    {/* AIの創作性 */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400 -mb-2">AIの創作性</h3>
                         {renderSettingItem('創造性のレベル', 'creativity', 'creativity',
                            ['控えめ', '普通', '大胆'].map(val => (
                                <button key={val} onClick={() => handleChange('creativity', val)} className={buttonClass(currentSettings.creativity === val)}>{val}</button>
                            ))
                        )}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                {renderPinButton('writingStyleMimicry')}
                                <label className={labelClass}>
                                    ユーザーの文体を模倣する
                                    <button onClick={() => onHelpClick('writingStyleMimicry')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                                </label>
                            </div>
                            <button
                                onClick={() => handleChange('writingStyleMimicry', !currentSettings.writingStyleMimicry)}
                                className={`w-12 h-6 rounded-full transition-colors ${currentSettings.writingStyleMimicry ? 'bg-indigo-600' : 'bg-gray-600'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${currentSettings.writingStyleMimicry ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                    
                    {/* AIの振る舞い */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400 -mb-2">AIの振る舞い</h3>
                        {renderSettingItem('AIアシスタントの口調', 'assistantPersona', 'assistantPersona',
                           <select value={currentSettings.assistantPersona} onChange={(e) => handleChange('assistantPersona', e.target.value)} className={inputClass}>
                                <option value="polite">丁寧な編集者</option>
                                <option value="friendly">親しい友人</option>
                                <option value="analytical">分析的な批評家</option>
                                <option value="muse">創造的な詩人</option>
                                <option value="fan">熱狂的なファン</option>
                            </select>
                        )}
                        {renderSettingItem('記憶の範囲', 'memoryScope', 'memoryScope',
                           <select value={currentSettings.memoryScope} onChange={(e) => handleChange('memoryScope', e.target.value)} className={inputClass}>
                                <option value="current_scene">現在のシーンのみ</option>
                                <option value="current_chapter">現在の章全体</option>
                                <option value="summary">過去の章の要約も参照</option>
                                <option value="full_context">物語全体の文脈を参照 (高精度)</option>
                            </select>
                        )}
                        {renderSettingItem('ナレッジの参照強度', 'knowledgeAdherence', 'knowledgeAdherence',
                            ['厳格', '普通', '柔軟'].map(val => (
                                <button key={val} onClick={() => handleChange('knowledgeAdherence', val)} className={buttonClass(currentSettings.knowledgeAdherence === val)}>{val}</button>
                            ))
                        )}
                        {renderSettingItem('ナレッジ提案の頻度', 'suggestionFrequency', 'suggestionFrequency',
                            ['多め', '普通', '少なめ', 'しない'].map(val => (
                                <button key={val} onClick={() => handleChange('suggestionFrequency', val)} className={buttonClass(currentSettings.suggestionFrequency === val)}>{val}</button>
                            ))
                        )}
                    </div>

                    {/* 出力フォーマット */}
                    <div className={sectionClass}>
                        <h3 className="text-lg font-semibold text-lime-400 -mb-2">出力フォーマット</h3>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                {renderPinButton('showSpeakerInDialogue')}
                                <label className={labelClass}>
                                    セリフの話者名表示
                                    <button onClick={() => onHelpClick('showSpeakerInDialogue')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                                </label>
                            </div>
                            <button
                                onClick={() => handleChange('showSpeakerInDialogue', !currentSettings.showSpeakerInDialogue)}
                                className={`w-12 h-6 rounded-full transition-colors ${currentSettings.showSpeakerInDialogue ? 'bg-indigo-600' : 'bg-gray-600'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${currentSettings.showSpeakerInDialogue ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                {renderPinButton('applySpeakerColorToDialogue')}
                                <label className={labelClass}>
                                    セリフに話者カラーを適用
                                    <button onClick={() => onHelpClick('applySpeakerColorToDialogue')} className="focus:outline-none btn-pressable"><Icons.HelpCircleIcon className="h-4 w-4" /></button>
                                </label>
                            </div>
                            <button
                                onClick={() => handleChange('applySpeakerColorToDialogue', !currentSettings.applySpeakerColorToDialogue)}
                                className={`w-12 h-6 rounded-full transition-colors ${currentSettings.applySpeakerColorToDialogue ? 'bg-indigo-600' : 'bg-gray-600'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${currentSettings.applySpeakerColorToDialogue ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        {renderSettingItem('マークダウン装飾の使用頻度', 'markdownFrequency', 'markdownFrequency',
                            ['多め', '普通', '少なめ', 'しない'].map(val => (
                                <button key={val} onClick={() => handleChange('markdownFrequency', val)} className={buttonClass(currentSettings.markdownFrequency === val)}>{val}</button>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div 
                    className={`flex-shrink-0 border-t border-gray-700 bg-gray-900/50 ${isMobile ? 'flex flex-col gap-3 px-4 py-4' : 'px-6 py-4 flex justify-end gap-3'}`}
                    style={isMobile ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : {}}
                >
                    <button type="button" onClick={handleCloseRequest} className={actionButtonClass('bg-gray-600 hover:bg-gray-500')}>
                        <Icons.XIcon className="h-4 w-4" />
                        キャンセル
                    </button>
                    <button type="button" onClick={handleSave} data-testid="modal-save-button" className={actionButtonClass('bg-indigo-600 hover:bg-indigo-500 font-bold')}>
                        <Icons.CheckIcon className="h-4 w-4" />
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};
