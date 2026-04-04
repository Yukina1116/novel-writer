import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { ChatMessage, SettingItem } from '../types';
import { updateWorldData, generateWorldReply } from '../worldApi';

const mergeWorldData = (original, patch) => {
    if (!patch || typeof patch !== 'object') return original;
    const merged = { ...(original || {}) };

    for (const key in patch) {
        if (key === 'fields' && Array.isArray(patch.fields)) {
            const newFields = [...(original?.fields || [])];
            patch.fields.forEach(patchField => {
                const index = newFields.findIndex(f => f.key === patchField.key);
                if (index !== -1) {
                    newFields[index] = { ...newFields[index], ...patchField };
                } else {
                    newFields.push(patchField);
                }
            });
            merged.fields = newFields.filter(f => f.key || f.value);
        } else if (patch[key] !== undefined) {
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
                    <h2 className="text-xl font-bold text-indigo-400 flex items-center"><Icons.HelpCircleIcon className="h-5 w-5 mr-2" />AI世界設定アシスタント ヘルプ</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                </div>
                <div className="flex-grow overflow-y-auto pr-2 space-y-6 text-gray-300">
                    <div>
                        <h3 className="font-semibold text-lg text-lime-400 mb-2">基本操作</h3>
                        <p className="text-sm">AIアシスタントとの対話を通じて、世界観の設定をゼロから作り上げたり、既存の設定を深掘りしたりできます。</p>
                        <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                            <li>作りたい世界観のイメージをAIに伝えます。（例：「魔法と科学が共存する都市」）</li>
                            <li>AIが質問を返してくるので、会話を続けて設定を具体化していきます。</li>
                            <li>決まった設定は右側の「生成プレビュー」にリアルタイムで反映されます。</li>
                            <li>最後に「この内容を反映する」ボタンを押すと、世界観設定フォームに内容が自動で入力されます。</li>
                        </ol>
                    </div>
                    <div className="border-t border-gray-700 pt-4">
                        <h3 className="font-semibold text-lg text-lime-400 mb-2">2つのモードについて</h3>
                        <p className="text-sm">既存の世界観を編集する際には、2つのモードを使い分けると便利です。</p>
                        <div className="mt-4 space-y-4">
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                                <h4 className="font-semibold text-md text-lime-300 flex items-center gap-2"><Icons.LightbulbIcon />相談するモード</h4>
                                <p className="text-sm mt-1">AIにアイデアを出してもらったり、壁打ち相手になってもらう時に使います。ここでの会話は、右側のプレビュー（設定データ）には反映されません。</p>
                                <div className="mt-2 text-sm">
                                    <p className="font-semibold text-gray-300">こんな時に便利！</p>
                                    <ul className="list-disc list-inside text-gray-400 mt-1 space-y-1">
                                        <li><kbd>「この世界の魔法体系について、面白いアイデアない？」</kbd></li>
                                        <li><kbd>「もっと深みのある歴史にするにはどうしたらいい？」</kbd></li>
                                    </ul>
                                </div>
                                <p className="text-xs text-gray-500 mt-3">チャットの色: <span className="text-lime-400">緑</span> / ショートカット: <kbd>{modifierKey}</kbd>+<kbd>Enter</kbd></p>
                            </div>
                             <div className="bg-gray-900/50 p-4 rounded-lg">
                                <h4 className="font-semibold text-md text-indigo-300 flex items-center gap-2"><Icons.CogIcon />設定に反映モード</h4>
                                <p className="text-sm mt-1">世界観の具体的な設定を追加・変更したい時に使います。AIへの指示が、右側のプレビュー（設定データ）に直接反映されます。</p>
                                <div className="mt-2 text-sm">
                                    <p className="font-semibold text-gray-300">指示の例</p>
                                    <ul className="list-disc list-inside text-gray-400 mt-1 space-y-1">
                                        <li><kbd>「『王都』という場所の設定を追加して」</kbd></li>
                                        <li><kbd>「通貨単位を『ギル』に設定して」</kbd>→ プレビューに項目が追加されます</li>
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


// --- World Generation Modal Component ---
export const WorldGenerationModal = ({ isOpen, onClose, onApply, initialData }) => {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUpdatingPreview, setIsUpdatingPreview] = useState(false);
    const [currentWorldData, setCurrentWorldData] = useState<Partial<SettingItem> | null>(null);
    const [mode, setMode] = useState<'create' | 'update'>('create');
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const chatEndRef = useRef(null);
    const userInputRef = useRef(null);
    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKeyText = isMac ? '⌘Cmd' : 'Ctrl';


    useEffect(() => {
        if (isOpen) {
            setCurrentWorldData(initialData || null);
            const hasInitialData = initialData && (initialData.name || (initialData.fields && initialData.fields.length > 0));
            setMode(hasInitialData ? 'update' : 'create');

            const initialMessage = hasInitialData
                ? '以下の設定で世界観の構築を開始します。ここから設定を深掘りしていきましょう！\n\n他にどのような設定を追加しますか？'
                : '世界設定の相談を始めます。\n希望の要素を伝えると、AIが質問を返して設定を具体化していきます。\n\nでは、どのような世界を生成しますか？\n例：魔法と科学が共存する都市、荒廃した未来';
            
            setChatHistory([{ role: 'assistant', text: initialMessage, mode: 'consult' }]);
            setUserInput('');
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, isLoading, isUpdatingPreview]);
    
    useEffect(() => {
        if (userInputRef.current) {
            userInputRef.current.style.height = 'auto';
            const scrollHeight = userInputRef.current.scrollHeight;
            userInputRef.current.style.height = `${scrollHeight}px`;
        }
    }, [userInput]);

    const addMessageToHistory = (message: ChatMessage) => {
        setChatHistory(prev => [...prev, message]);
    };
    
// FIX: Refactored function to create a single `newHistory` array that is explicitly typed and used for both the state update and the API call. This resolves a TypeScript type error and a logical bug where stale state could be used.
    const handleSendMessage = async (intent: 'consult' | 'update') => {
        const trimmedInput = userInput.trim();
        const isBusy = isLoading || isUpdatingPreview;
        if (!trimmedInput || isBusy) return;

        const userMessageMode = intent === 'consult' ? 'consult' : 'write';
        const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: trimmedInput, mode: userMessageMode }];
        setChatHistory(newHistory);
        setUserInput('');
        setIsLoading(true);

        const dataResult = await updateWorldData(newHistory, currentWorldData, intent);

        if (dataResult.success === false) {
            addMessageToHistory({ role: 'assistant', text: `エラーが発生しました: ${dataResult.error.message}`, mode: 'consult' });
            setIsLoading(false);
            return;
        }

        const resultData = dataResult.data;

        if ('consultation_reply' in resultData) {
            addMessageToHistory({ role: 'assistant', text: resultData.consultation_reply, mode: 'consult' });
        } else if ('clarification_needed' in resultData) {
            addMessageToHistory({ role: 'assistant', text: resultData.clarification_needed, mode: 'consult' });
        } else { // It's a patch
            const patch = resultData;
            setIsUpdatingPreview(true);
            const newData = mergeWorldData(currentWorldData, patch);
            setCurrentWorldData(newData);
            setIsUpdatingPreview(false);
            
            if (mode === 'create' && (newData.name || (newData.fields && newData.fields.length > 0))) {
                setMode('update');
            }

            const replyResult = await generateWorldReply(newData);
            if (replyResult.success) {
                addMessageToHistory({ role: 'assistant', text: replyResult.data.reply, mode: 'consult' });
            } else {
                addMessageToHistory({ role: 'assistant', text: "設定を更新しました。", mode: 'consult' });
            }
        }

        setIsLoading(false);
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
        onApply(currentWorldData);
        onClose();
    };

    if (!isOpen) return null;

    const renderPreview = () => {
        if (isUpdatingPreview) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <Icons.LoaderIcon className="w-8 h-8 text-green-400 mb-4" />
                    <p className="text-sm text-green-300">AIがプロフィールを更新中...</p>
                </div>
            );
        }

        if (!currentWorldData) return <p className="text-sm text-gray-500 text-center p-4">AIとの対話で決まった設定が、ここにリアルタイムで反映されます。</p>;
        
        const { name, fields } = currentWorldData as Partial<SettingItem>;

        return (
            <div className="space-y-4 text-sm text-white">
                {name && <div><strong className="text-gray-400">名前:</strong><p className="pl-2">{name}</p></div>}
                
                {fields && fields.length > 0 && (
                    <div>
                        <strong className="text-gray-400">カスタム項目:</strong>
                        <ul className="list-disc list-inside pl-2 mt-1 space-y-2">
                            {fields.map(f => (
                                <li key={f.key}>
                                    <span className="font-semibold">{f.key}:</span>
                                    <p className="pl-4 whitespace-pre-wrap">{f.value}</p>
                                </li>
                            ))}
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
                        <h2 className="text-xl font-bold text-green-400 flex items-center gap-2"><Icons.MoonIcon />AI世界設定アシスタント</h2>
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
                                {chatHistory.map((msg, index) => (
                                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                        {msg.role === 'assistant' && <Icons.BotIcon className="h-6 w-6 text-green-400 flex-shrink-0" />}
                                        <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl text-sm ${msg.role === 'user' ? (msg.mode === 'consult' ? 'bg-lime-600/50' : 'bg-indigo-600/50') : 'bg-gray-700/50'}`}>
                                            <p className="whitespace-pre-wrap text-white">{msg.text}</p>
                                        </div>
                                        {msg.role === 'user' && <Icons.UserIcon />}
                                    </div>
                                ))}
                                {(isLoading || isUpdatingPreview) && <div className="flex items-start gap-3"><Icons.BotIcon className="h-6 w-6 text-green-400 flex-shrink-0" /><div className="px-4 py-3 rounded-xl bg-gray-700/50"><div className="flex items-center space-x-2"><div className="h-2 w-2 bg-green-300 rounded-full animate-pulse"></div><div className="h-2 w-2 bg-green-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="h-2 w-2 bg-green-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div></div></div></div>}
                                <div ref={chatEndRef} />
                            </div>
                            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(mode === 'create' ? 'update' : 'consult'); }} className="pt-4 border-t border-gray-700">
                                <div className="flex-1 bg-gray-900 border border-gray-600 rounded-lg overflow-hidden flex flex-col">
                                    <textarea
                                        ref={userInputRef}
                                        rows={3}
                                        value={userInput}
                                        onChange={(e) => setUserInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={
                                            mode === 'create' 
                                            ? "例：魔法と科学が共存する都市" 
                                            : "例：通貨単位を『ギル』にして / この世界の歴史についてアイデアを出して"
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
                                                    <p className="mt-1">例: <kbd>「この世界の魔法についてアイデアを出して」</kbd></p>
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
                                                    <p className="mt-1">例: <kbd>「通貨を『ギル』に設定して」</kbd></p>
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
                                <button onClick={handleApply} disabled={!currentWorldData || isBusy} className="px-6 py-2 bg-indigo-600 rounded-md hover:bg-indigo-500 transition font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed text-white">この内容を反映する</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
        </>
    , document.body);
};