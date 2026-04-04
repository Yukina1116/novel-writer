import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { ChatMessage, SettingItem } from '../types';
import { updateCharacterData, generateCharacterReply } from '../characterApi';

const mergeCharacterData = (original, patch) => {
    if (!patch || typeof patch !== 'object') return original;
    const merged = { ...(original || {}) };

    for (const key in patch) {
        if (key === 'appearance' && typeof patch.appearance === 'object' && patch.appearance !== null) {
            // Special handling for the 'appearance' object to merge traits correctly
            const originalAppearance = original?.appearance || { imageUrl: '', traits: [] };
            const patchAppearance = patch.appearance;
            const mergedAppearance = { ...originalAppearance };

            if (patchAppearance.imageUrl !== undefined) {
                mergedAppearance.imageUrl = patchAppearance.imageUrl;
            }

            if (Array.isArray(patchAppearance.traits)) {
                const newTraits = [...(originalAppearance.traits || [])];
                patchAppearance.traits.forEach(patchTrait => {
                    const index = newTraits.findIndex(t => t.key === patchTrait.key);
                    if (index !== -1) {
                        // If trait key exists, update it
                        newTraits[index] = { ...newTraits[index], ...patchTrait };
                    } else {
                        // If new trait key, add it
                        newTraits.push(patchTrait);
                    }
                });
                mergedAppearance.traits = newTraits.filter(t => t.key || t.value); // Clean up empty traits
            }
            merged.appearance = mergedAppearance;
        } else if (patch[key] !== undefined) {
            // For all other properties, simply overwrite
            merged[key] = patch[key];
        }
    }
    return merged;
};


const HelpModal = ({ onClose }) => {
    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKey = isMac ? '⌘Cmd' : 'Ctrl';
    
    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[90]">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-indigo-400 flex items-center"><Icons.HelpCircleIcon className="h-5 w-5 mr-2" />AIキャラクター生成アシスタント ヘルプ</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                </div>
                <div className="flex-grow overflow-y-auto pr-2 space-y-6 text-gray-300">
                    <div>
                        <h3 className="font-semibold text-lg text-lime-400 mb-2">基本操作</h3>
                        <p className="text-sm">AIアシスタントとの対話を通じて、キャラクターの設定をゼロから作り上げたり、既存の設定を深掘りしたりできます。</p>
                        <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                            <li>作りたいキャラクターのイメージをAIに伝えます。（例：「明るい性格の魔法使い」）</li>
                            <li>AIが質問を返してくるので、会話を続けて設定を具体化していきます。</li>
                            <li>決まった設定は右側の「生成プレビュー」にリアルタイムで反映されます。</li>
                            <li>最後に「この内容を反映する」ボタンを押すと、キャラクター設定フォームに内容が自動で入力されます。</li>
                        </ol>
                    </div>
                    <div className="border-t border-gray-700 pt-4">
                        <h3 className="font-semibold text-lg text-lime-400 mb-2">2つのモードについて</h3>
                        <p className="text-sm">既存のキャラクターを編集する際には、2つのモードを使い分けると便利です。</p>
                        <div className="mt-4 space-y-4">
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                                <h4 className="font-semibold text-md text-lime-300 flex items-center gap-2"><Icons.LightbulbIcon />相談するモード</h4>
                                <p className="text-sm mt-1">AIにアイデアを出してもらったり、壁打ち相手になってもらう時に使います。ここでの会話は、右側のプレビュー（設定データ）には反映されません。</p>
                                <div className="mt-2 text-sm">
                                    <p className="font-semibold text-gray-300">こんな時に便利！</p>
                                    <ul className="list-disc list-inside text-gray-400 mt-1 space-y-1">
                                        <li><kbd>「このキャラクターの服装、何かいいアイデアない？」</kbd></li>
                                        <li><kbd>「もっと面白くするにはどうしたらいいかな？」</kbd></li>
                                        <li><kbd>「彼の過去について、悲しいエピソードを3つ考えて」</kbd></li>
                                    </ul>
                                </div>
                                <p className="text-xs text-gray-500 mt-3">チャットの色: <span className="text-lime-400">緑</span> / ショートカット: <kbd>{modifierKey}</kbd>+<kbd>Enter</kbd></p>
                            </div>
                             <div className="bg-gray-900/50 p-4 rounded-lg">
                                <h4 className="font-semibold text-md text-indigo-300 flex items-center gap-2"><Icons.CogIcon />設定に反映モード</h4>
                                <p className="text-sm mt-1">キャラクターの具体的な設定（名前、性格など）を追加・変更したい時に使います。AIへの指示が、右側のプレビュー（設定データ）に直接反映されます。</p>
                                <div className="mt-2 text-sm">
                                    <p className="font-semibold text-gray-300">指示の例</p>
                                    <ul className="list-disc list-inside text-gray-400 mt-1 space-y-1">
                                        <li><kbd>「性格に『優しい』を追加して」</kbd></li>
                                        <li><kbd>「年齢を『20歳』に変更して」</kbd></li>
                                        <li><kbd>「髪の色は金色、瞳の色は青にして」</kbd></li>
                                    </ul>
                                </div>
                                <p className="text-xs text-gray-500 mt-3">チャットの色: <span className="text-indigo-400">青</span> / ショートカット: <kbd>Alt</kbd>+<kbd>Enter</kbd></p>
                            </div>
                        </div>
                         <p className="text-sm mt-4">新規作成時は、すべての会話が「設定に反映モード」として扱われます。</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- Character Generation Modal Component ---
export const CharacterGenerationModal = ({ isOpen, onClose, onApply, initialData }) => {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUpdatingPreview, setIsUpdatingPreview] = useState(false);
    const [currentCharacterData, setCurrentCharacterData] = useState<Partial<SettingItem> | null>(null);
    const [mode, setMode] = useState<'create' | 'update'>('create');
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const chatEndRef = useRef(null);
    const userInputRef = useRef(null);
    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKeyText = isMac ? '⌘Cmd' : 'Ctrl';

    useEffect(() => {
        if (isOpen) {
            setCurrentCharacterData(initialData || null);
            
            let hasInitialData = false;
            if (initialData && Object.keys(initialData).length > 0) {
                const hasTopLevelData = Object.entries(initialData).some(([key, value]) => {
                    return key !== 'appearance' && typeof value === 'string' && value.trim() !== '';
                });

                let hasAppearanceData = false;
                if (initialData.appearance) {
                    if (initialData.appearance.imageUrl && initialData.appearance.imageUrl.trim() !== '') {
                        hasAppearanceData = true;
                    }
                    if (initialData.appearance.traits && initialData.appearance.traits.some(t => t.value && t.value.trim() !== '')) {
                        hasAppearanceData = true;
                    }
                }
                
                hasInitialData = hasTopLevelData || hasAppearanceData;
            }

            setMode(hasInitialData ? 'update' : 'create');

            const initialMessage = hasInitialData
                ? '以下の設定でキャラクター生成を開始します。ここから設定を深掘りしていきましょう！\n\n他にどのような設定を追加しますか？'
                : 'キャラクター設定の相談を始めます。\n希望の要素を伝えると、AIが質問を返して設定を具体化していきます。\n\nでは、どのようなキャラクターを生成しますか？\n例：明るい性格の魔法使い、影のある探偵';
            
            setChatHistory([{ role: 'assistant', text: initialMessage, mode: 'consult' }]);
            setUserInput('');
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, isLoading]);
    
    useEffect(() => {
        if (userInputRef.current) {
            userInputRef.current.style.height = 'auto';
            const scrollHeight = userInputRef.current.scrollHeight;
            userInputRef.current.style.height = `${scrollHeight}px`;
        }
    }, [userInput]);

    const handleSendMessage = async (intent: 'consult' | 'update') => {
        const trimmedInput = userInput.trim();
        const isBusy = isLoading || isUpdatingPreview;
        if (!trimmedInput || isBusy) return;

        const userMessageMode = intent === 'consult' ? 'consult' : 'write';
        const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: trimmedInput, mode: userMessageMode }];
        setChatHistory(newHistory);
        setUserInput('');
        
        setIsLoading(true);
    
        const dataResult = await updateCharacterData(newHistory, currentCharacterData, intent);
        
        if (dataResult.success === false) {
            setChatHistory(prev => [...prev, { role: 'assistant', text: `エラーが発生しました: ${dataResult.error.message}`, mode: 'consult' }]);
            setIsLoading(false);
            return;
        }
        
        const resultData = dataResult.data;
    
        // Case 1 & 2: AI gives a direct reply (consultation or clarification)
        if ('consultation_reply' in resultData || 'clarification_needed' in resultData) {
            const reply = ('consultation_reply' in resultData) 
                ? resultData.consultation_reply 
                : resultData.clarification_needed;
            
            setChatHistory(prev => [...prev, { role: 'assistant', text: reply, mode: 'consult' }]);
            setIsLoading(false); // All done
            return;
        }
        
        // Case 3: AI gives a data patch. We need to update the preview and then get a confirmation reply.
        const patch = resultData;
    
        // Show spinner in preview pane while merging/updating
        setIsUpdatingPreview(true); 
        const newCharacterData = mergeCharacterData(currentCharacterData, patch);
        setCurrentCharacterData(newCharacterData);
        setIsUpdatingPreview(false);

        // After first data update in create mode, switch UI to update mode
        if (mode === 'create' && Object.keys(newCharacterData).length > 0) {
            const hasMeaningfulData = Object.entries(newCharacterData).some(([key, value]) => {
                if (key === 'appearance' && value) {
                    const app = value as any;
                    return (app.imageUrl && app.imageUrl.trim() !== '') || (app.traits && app.traits.length > 0);
                }
                return !!value;
            });
            if (hasMeaningfulData) {
                setMode('update');
            }
        }
    
        // Now, get a confirmation reply. The main spinner is still active.
        const replyResult = await generateCharacterReply(newCharacterData);
        
        if (replyResult.success === false) {
            console.error(replyResult.error);
            setChatHistory(prev => [...prev, { role: 'assistant', text: "設定を更新しました。", mode: 'consult' }]);
        } else {
            const reply = replyResult.data.reply;
            if (reply) {
                setChatHistory(prev => [...prev, { role: 'assistant', text: reply, mode: 'consult' }]);
            }
        }
        
        setIsLoading(false); // End of all operations
    };
    
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (e.altKey) {
                e.preventDefault();
                handleSendMessage('update');
            } else if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                handleSendMessage(mode === 'update' ? 'consult' : 'update');
            }
        }
    };
    
    const handleApply = () => {
        onApply(currentCharacterData);
        onClose();
    };

    if (!isOpen) return null;

    const renderPreview = () => {
        if (isUpdatingPreview) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <Icons.LoaderIcon className="w-8 h-8 text-teal-400 mb-4" />
                    <p className="text-sm text-teal-300">AIがプロフィールを更新中...</p>
                </div>
            );
        }

        if (!currentCharacterData) return <p className="text-sm text-gray-500 text-center p-4">AIとの対話で決まった設定が、ここにリアルタイムで反映されます。</p>;
        
        const { name, furigana, gender, age, species, origin, affiliation, firstPersonPronoun, personality, speechPattern, secret, themeColor, longDescription, appearance } = currentCharacterData;

        return (
            <div className="space-y-4 text-sm text-white">
                {name && <div><strong className="text-gray-400">名前:</strong><p className="pl-2">{name} {furigana && `(${furigana})`}</p></div>}
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {gender && <div><strong className="text-gray-400">性別:</strong><p className="pl-2">{gender}</p></div>}
                    {age && <div><strong className="text-gray-400">年齢:</strong><p className="pl-2">{age}</p></div>}
                    {species && <div><strong className="text-gray-400">種族:</strong><p className="pl-2">{species}</p></div>}
                    {origin && <div><strong className="text-gray-400">出身:</strong><p className="pl-2">{origin}</p></div>}
                    {affiliation && <div><strong className="text-gray-400">所属組織:</strong><p className="pl-2">{affiliation}</p></div>}
                    {firstPersonPronoun && <div><strong className="text-gray-400">一人称:</strong><p className="pl-2">{firstPersonPronoun}</p></div>}
                </div>
                
                {themeColor && <div className="flex items-center"><strong className="text-gray-400 mr-2">テーマカラー:</strong> <span className="w-4 h-4 rounded-full border border-gray-600" style={{ backgroundColor: themeColor }}></span><span className="ml-2 font-mono">{themeColor}</span></div>}

                {personality && <div><strong className="text-gray-400">性格:</strong><p className="pl-2 whitespace-pre-wrap">{personality}</p></div>}
                {speechPattern && <div><strong className="text-gray-400">話し方:</strong><p className="pl-2 whitespace-pre-wrap">{speechPattern}</p></div>}
                {secret && <div><strong className="text-gray-400">秘密:</strong><p className="pl-2 whitespace-pre-wrap">{secret}</p></div>}
                {longDescription && <div><strong className="text-gray-400">詳細設定:</strong><p className="pl-2 whitespace-pre-wrap">{longDescription}</p></div>}
                
                {appearance?.traits && appearance.traits.length > 0 && (
                    <div>
                        <strong className="text-gray-400">容姿特徴:</strong>
                        <ul className="list-disc list-inside pl-2 mt-1 space-y-1">
                            {appearance.traits.map(t => <li key={t.key}>{t.key}: {t.value}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    const isBusy = isLoading || isUpdatingPreview;

    return createPortal(
        <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[80]">
                <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col border border-gray-700">
                    <div className="flex justify-between items-center p-4 border-b border-gray-700">
                        <h2 className="text-xl font-bold text-teal-400 flex items-center gap-2"><Icons.MoonIcon />AIキャラクター生成アシスタント</h2>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setIsHelpOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition" aria-label="ヘルプ">
                                <Icons.HelpCircleIcon className="h-5 w-5 text-white" />
                            </button>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                        </div>
                    </div>
                    <div className="flex-grow flex min-h-0">
                        <div className="w-1/2 flex flex-col p-4 border-r border-gray-700">
                            <div className="flex-grow overflow-y-auto space-y-4 pr-2">
                                {chatHistory.map((msg, index) => {
                                    const bubbleColor = msg.role === 'user'
                                        ? (msg.mode === 'consult' ? 'bg-lime-600/50' : 'bg-indigo-600/50')
                                        : 'bg-gray-700/50';

                                    return (
                                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                            {msg.role === 'assistant' && <Icons.BotIcon className="h-6 w-6 text-teal-400 flex-shrink-0" />}
                                            <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl text-sm ${bubbleColor}`}>
                                                <p className="whitespace-pre-wrap text-white">{msg.text}</p>
                                            </div>
                                            {msg.role === 'user' && <Icons.UserIcon />}
                                        </div>
                                    );
                                })}
                                {isLoading && <div className="flex items-start gap-3"><Icons.BotIcon className="h-6 w-6 text-teal-400 flex-shrink-0" /><div className="px-4 py-3 rounded-xl bg-gray-700/50"><div className="flex items-center space-x-2"><div className="h-2 w-2 bg-teal-300 rounded-full animate-pulse"></div><div className="h-2 w-2 bg-teal-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="h-2 w-2 bg-teal-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div></div></div></div>}
                                <div ref={chatEndRef} />
                            </div>
                            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(mode === 'update' ? 'consult' : 'update'); }} className="pt-4 border-t border-gray-700">
                                <div className="flex-1 bg-gray-900 border border-gray-600 rounded-lg overflow-hidden flex flex-col">
                                    <textarea
                                        ref={userInputRef}
                                        rows={3}
                                        value={userInput}
                                        onChange={(e) => setUserInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={
                                            mode === 'create' 
                                            ? "例：明るい性格の魔法使い、影のある探偵" 
                                            : "例：年齢を25歳にして / 服装のアイデアを出して"
                                        }
                                        className="flex-1 bg-transparent border-none px-4 py-2 text-sm resize-none overflow-y-auto max-h-48 focus:ring-0 text-white"
                                        disabled={isBusy}
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-2">
                                    <div className="text-xs text-gray-500">
                                        {mode === 'update'
                                            ? <div className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 items-center">
                                                <div className="flex items-center gap-1 justify-end whitespace-nowrap">💡</div>
                                                <div><kbd>{modifierKeyText}</kbd>＋<kbd>Enter</kbd></div>
                                                <div className="flex items-center gap-1 justify-end whitespace-nowrap">⚙️</div>
                                                <div><kbd>Alt</kbd>＋<kbd>Enter</kbd></div>
                                            </div>
                                            : <span><kbd>{modifierKeyText}</kbd>＋<kbd>Enter</kbd>で送信</span>
                                        }
                                    </div>
                                    {mode === 'create' ? (
                                        <button type="submit" disabled={isBusy || !userInput.trim()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold btn-pressable btn-invert-teal disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed">
                                            <Icons.SendIcon className="h-5 w-5" />
                                            送信
                                        </button>
                                    ) : (
                                        <div className="flex items-end gap-2">
                                            <div className="relative group">
                                                <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-900 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 group-hover:delay-500 transition-opacity pointer-events-none transform -translate-x-1/2 left-1/2 z-10 shadow-lg">
                                                    <p className="font-bold">アイデア出しに使います (設定は変更されません)</p>
                                                    <p className="mt-1">例: <kbd>「服装のアイデアを出して」</kbd></p>
                                                    <svg className="absolute text-gray-900 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                                                </div>
                                                <button type="button" onClick={() => handleSendMessage('consult')} disabled={isBusy || !userInput.trim()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold btn-pressable btn-invert-lime disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed">
                                                    <Icons.LightbulbIcon className="h-5 w-5" />
                                                    相談する
                                                </button>
                                            </div>
                                            <div className="relative group">
                                                <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-900 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 group-hover:delay-500 transition-opacity pointer-events-none transform -translate-x-1/2 left-1/2 z-10 shadow-lg">
                                                    <p className="font-bold">設定データを直接変更します</p>
                                                    <p className="mt-1">例: <kbd>「性格を『優しい』に変更して」</kbd></p>
                                                    <svg className="absolute text-gray-900 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                                                </div>
                                                <button type="button" onClick={() => handleSendMessage('update')} disabled={isBusy || !userInput.trim()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold btn-pressable btn-invert-indigo disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed">
                                                    <Icons.CogIcon className="h-5 w-5" />
                                                    設定に反映
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </form>
                        </div>
                        <div className="w-1/2 p-4 flex flex-col">
                            <h3 className="text-lg font-semibold text-gray-300 mb-3">生成プレビュー</h3>
                            <div className="flex-grow bg-gray-900/50 rounded-lg p-3 overflow-y-auto relative">
                                {renderPreview()}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <button onClick={handleApply} disabled={!currentCharacterData || isBusy} className="px-6 py-2 bg-indigo-600 rounded-md hover:bg-indigo-500 transition font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed text-white">この内容を反映する</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
        </>
    , document.body);
};