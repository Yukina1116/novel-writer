
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { ChatMessage } from '../types';
import { useRequiresAuth } from '../hooks/useRequiresAuth';
import { IMAGE_GENERATION_BATCH_SIZE, IMAGE_GENERATION_COOLDOWN_MS } from '../shared/imageGenerationConfig';

// SettingModals.tsx は {isImageGenModalOpen && <ImageGenerationModal .../>} という
// 条件付きレンダリングでこのコンポーネントを毎回アンマウント/リマウントする。クールダウンを
// コンポーネント内 useState だけで管理すると「閉じてすぐ開き直す」操作で容易にリセットされ、
// 連続生成防止の意味がなくなるため、モジュールレベル変数で保持し再マウントをまたいで復元する
// (2026-07-12、code-review medium で3系統の独立finderが指摘した重大バグの修正)。
// 既知の限界: この変数はブラウザタブ (JS モジュールスコープ) 単位でしか共有されない。
// Vertex AI 側の quota はプロジェクト全体で共有されるため、複数タブ・複数ユーザーが
// 同時に生成すると、それぞれのタブでは isCoolingDown=false のまま合算で quota を
// 超過しうる。根本対応 (Firestore 等でのサーバー側共有状態管理) は今回のスコープ外。
let sharedCooldownUntil: number | null = null;

// --- Image Generation Modal ---
export const ImageGenerationModal = ({ isOpen, onClose, onGenerate, onGeneratePrompt, onApplyImage, characterDescription, isGenerating: isGeneratingProp }) => {
    const { canUseAi, reason: aiBlockedReason } = useRequiresAuth();
    const [mode, setMode] = useState<'simple' | 'detailed'>('simple');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [refinementInput, setRefinementInput] = useState('');
    const [basePrompt, setBasePrompt] = useState(''); // The prompt that generated the current images
    const chatEndRef = useRef(null);
    const chatInputRef = useRef(null);
    const refinementInputRef = useRef(null);
    const [isConfirmingClose, setIsConfirmingClose] = useState(false);
    // Vertex AI 側の画像生成 quota (1分あたり IMAGE_GENERATION_BATCH_SIZE 回相当) が
    // 連続生成に耐えられず、429エラーが prod で複数回再現したための予防的クールダウン
    // (2026-07-12)。cooldownUntil は次に生成可能になる時刻 (epoch ms)。初期値を
    // sharedCooldownUntil から復元することで、モーダルの閉じ直しでクールダウンが
    // リセットされるのを防ぐ (setCooldownUntil はこのモジュール変数も同期更新する)。
    const [cooldownUntil, setCooldownUntilState] = useState<number | null>(sharedCooldownUntil);
    const [cooldownRemainingSec, setCooldownRemainingSec] = useState(() =>
        sharedCooldownUntil === null ? 0 : Math.max(0, Math.ceil((sharedCooldownUntil - Date.now()) / 1000))
    );
    const setCooldownUntil = (value: number | null) => {
        sharedCooldownUntil = value;
        setCooldownUntilState(value);
    };

    useEffect(() => {
        if (isOpen) {
            setMode('simple');
            setGeneratedImages([]);
            setSelectedImage(null);
            setRefinementInput('');
            setBasePrompt('');
            setChatHistory([{ role: 'assistant', text: 'どのような立ち絵を生成しますか？\n髪型、服装、表情、ポーズなどを自由に記述してください。\n設定が固まったら、「以上で立ち絵を生成してください」と入力してください。', mode: 'consult' }]);
            setChatInput('');
            setIsLoadingChat(false);
            setIsGeneratingImages(false);
            setIsConfirmingClose(false);
            // クールダウンはここで意図的にリセットしない。sharedCooldownUntil モジュール
            // 変数からの初期値復元により、モーダルを閉じてすぐ開き直しても連続生成防止が
            // 効き続ける (2026-07-12、旧実装ではここで毎回リセットされ回避可能だった)。
        }
    }, [isOpen, characterDescription]);

    useEffect(() => {
        if (cooldownUntil === null) return;
        const tick = () => {
            const remainingMs = cooldownUntil - Date.now();
            if (remainingMs <= 0) {
                setCooldownRemainingSec(0);
                setCooldownUntil(null);
                return;
            }
            setCooldownRemainingSec(Math.ceil(remainingMs / 1000));
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [cooldownUntil]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, isLoadingChat]);
    useEffect(() => {
        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
            chatInputRef.current.style.height = `${chatInputRef.current.scrollHeight}px`;
        }
    }, [chatInput]);

    useEffect(() => {
        if (refinementInputRef.current) {
            refinementInputRef.current.style.height = 'auto';
            refinementInputRef.current.style.height = `${refinementInputRef.current.scrollHeight}px`;
        }
    }, [refinementInput]);
    
    const isBusy = isLoadingChat || isGeneratingImages;
    // isBusy とは別枠で扱う: 「この画像で決定する」やモード切替は API 呼出を伴わない
    // ためクールダウン中でも操作可能にする。生成系ボタンにのみ個別に適用する。
    const isCoolingDown = cooldownRemainingSec > 0;
    // 3つの生成ボタンで同じ文言を使い回す (code-review medium 指摘: コピペ重複の解消)。
    const cooldownButtonLabel = `あと${cooldownRemainingSec}秒お待ちください`;
    const cooldownTitle = isCoolingDown ? `連続生成を防ぐため、${cooldownButtonLabel}` : undefined;

    const handleGenerate = async (promptToUse: string, append: boolean = false) => {
        // クールダウン中の呼び出しを弾く二重防御 (ボタン disabled が主防御)。
        if (isCoolingDown) return;
        setIsGeneratingImages(true);
        setSelectedImage(null);
        if (!append) {
            setGeneratedImages([]);
        }
        setBasePrompt(promptToUse);
        // リクエスト実行前 (await の前) にクールダウンを開始する。完了後に開始すると、
        // 実行中に閉じるボタンでモーダルを閉じてすぐ開き直した場合、in-flight の
        // リクエストと新規リクエストが重複発行され quota を倍消費してしまう
        // (handleCloseRequest は generatedImages が空の間は isGeneratingImages を
        // 見ずに即 onClose するため生成中でも閉じられる。Codex review 指摘、2026-07-12)。
        setCooldownUntil(Date.now() + IMAGE_GENERATION_COOLDOWN_MS);
        const result = await onGenerate(promptToUse, append);
        if (result) {
            setGeneratedImages(prev => append ? [...prev, ...result] : result);
        } else {
            // Handle error case, maybe show a message
        }
        setIsGeneratingImages(false);
    };

    const handleSendMessage = async () => {
        if (!chatInput.trim() || isBusy) return;

        const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: chatInput, mode: 'consult' }];
        setChatHistory(newHistory);
        setChatInput('');
        setIsLoadingChat(true);

        const result = await onGeneratePrompt(newHistory);
        // FIX: Explicitly check for failure and show an error message in the chat.
        if (result.success === false) {
            setChatHistory(prev => [...prev, { role: 'assistant', text: `エラー: ${result.error.message}`, mode: 'consult' }]);
            setIsLoadingChat(false);
            return;
        }

        setIsLoadingChat(false);

        const { reply, finalPrompt } = result.data;
        if (reply) {
            setChatHistory(prev => [...prev, { role: 'assistant', text: reply, mode: 'consult' }]);
        }
        if (finalPrompt) {
            // クールダウン中は handleGenerate 内で無言の早期 return になってしまうため、
            // ここで先にチャット上にフィードバックを出す (2026-07-12、code-review medium
            // で複数finderが指摘: チャット経由の生成だけ isCoolingDown 未チェックだった)。
            if (isCoolingDown) {
                setChatHistory(prev => [...prev, { role: 'assistant', text: `連続生成を防ぐため、あと${cooldownRemainingSec}秒お待ちください。時間を置いてから改めて生成をお願いします。`, mode: 'consult' }]);
            } else {
                await handleGenerate(finalPrompt);
            }
        }
    };
    
    const handleRefine = async () => {
        // ボタンの disabled が主防御だが、Ctrl+Enter のキーボードショートカット経由
        // でも呼ばれるため、ここでも isCoolingDown をチェックする (二重防御)。
        if (!refinementInput.trim() || !basePrompt || isBusy || isCoolingDown) return;

        // 修正用の特別な会話履歴を生成
        const refinementHistory: ChatMessage[] = [
            { role: 'user', text: `以下のプロンプトを修正してください: "${basePrompt}"`, mode: 'consult' },
            { role: 'user', text: `修正内容: "${refinementInput}"`, mode: 'consult' },
            { role: 'user', text: '以上で立ち絵を生成してください', mode: 'consult' }
        ];

        setIsGeneratingImages(true);
        setGeneratedImages([]);
        setSelectedImage(null);

        const result = await onGeneratePrompt(refinementHistory);

        // FIX: Explicitly check for failure and use the error message to provide better feedback.
        if (result.success === false) {
            alert(`プロンプトの修正に失敗しました: ${result.error.message}`);
            setIsGeneratingImages(false);
        } else if (result.data.finalPrompt) {
            await handleGenerate(result.data.finalPrompt);
        } else {
            alert('プロンプトの修正に失敗しました。');
            setIsGeneratingImages(false);
        }
        
        setRefinementInput('');
    };

    const handleFinalize = () => {
        if (selectedImage) {
            onApplyImage(selectedImage);
            onClose();
        }
    };

    const handleCloseRequest = () => {
        if (generatedImages.length > 0) {
            setIsConfirmingClose(true);
        } else {
            onClose();
        }
    };
    
    if (!isOpen) return null;

    const renderLeftPanel = () => {
        if (selectedImage) {
            return (
                <div className="flex flex-col h-full">
                    <div className="flex-grow overflow-y-auto pr-2 space-y-2 min-h-0">
                        <h3 className="text-lg font-semibold text-gray-300">修正案の入力</h3>
                        <p className="text-xs text-gray-500">選択した画像を元に、修正したい点を日本語で入力してください。(例: もっと笑って、目は赤く)</p>
                        <textarea
                            ref={refinementInputRef}
                            value={refinementInput}
                            onChange={e => setRefinementInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleRefine(); } }}
                            placeholder="修正点を入力... (Ctrl+Enterで再生成)"
                            rows={1}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm resize-none overflow-y-auto max-h-48 focus:ring-0 text-white" />
                    </div>
                    <div className="flex-shrink-0 pt-4 space-y-2">
                        <button onClick={handleRefine} disabled={!canUseAi || isBusy || isCoolingDown || !refinementInput.trim()} title={!canUseAi ? aiBlockedReason : cooldownTitle} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-sm rounded-md hover:bg-cyan-500 transition text-white disabled:bg-gray-600 disabled:cursor-not-allowed">
                            <Icons.MagicWandIcon /> {isCoolingDown ? cooldownButtonLabel : '修正して再生成'}
                        </button>
                        <button onClick={handleFinalize} disabled={!canUseAi || isBusy} title={!canUseAi ? aiBlockedReason : undefined} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-sm rounded-md hover:bg-emerald-500 transition text-white disabled:bg-gray-600 disabled:cursor-not-allowed">
                            この画像で決定する
                        </button>
                    </div>
                </div>
            );
        }

        if (mode === 'detailed') {
            return (
                <div className="flex flex-col h-full">
                    <h3 className="text-lg font-semibold text-gray-300 mb-3">AIアシスタントと対話</h3>
                    <div className="flex-grow overflow-y-auto space-y-4 pr-2 bg-gray-900/50 rounded-lg p-2">
                        {chatHistory.map((msg, index) => (
                            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'assistant' && <Icons.BotIcon className="h-6 w-6 text-cyan-400" />}
                                <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-600/50' : 'bg-gray-700/50'}`}>
                                    <p className="whitespace-pre-wrap text-white">{msg.text}</p>
                                </div>
                                {msg.role === 'user' && <Icons.UserIcon />}
                            </div>
                        ))}
                        {isLoadingChat && <div className="flex items-start gap-3"><Icons.BotIcon className="h-6 w-6 text-cyan-400" /><div className="px-4 py-3 rounded-xl bg-gray-700/50"><div className="flex items-center space-x-2"><div className="h-2 w-2 bg-cyan-300 rounded-full animate-pulse"></div><div className="h-2 w-2 bg-cyan-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="h-2 w-2 bg-cyan-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div></div></div></div>}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={e => { e.preventDefault(); handleSendMessage(); }} className="flex items-end gap-2 pt-4">
                        <div className="flex-1 bg-gray-900 border border-gray-600 rounded-lg overflow-hidden flex flex-col">
                            <textarea
                                ref={chatInputRef}
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSendMessage(); } }}
                                placeholder="AIに指示を入力... (Ctrl+Enterで送信)"
                                rows={1}
                                className="flex-1 bg-transparent border-none px-4 py-2 text-sm resize-none overflow-y-auto max-h-32 focus:ring-0 text-white"
                                disabled={isBusy} />
                        </div>
                        <button type="submit" className="bg-cyan-600 text-white rounded-full p-2 hover:bg-cyan-500 self-end flex-shrink-0 disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={!canUseAi || isBusy || !chatInput.trim()} title={!canUseAi ? aiBlockedReason : undefined}><Icons.SendIcon /></button>
                    </form>
                </div>
            );
        } else { // mode === 'simple'
            return (
                <div className="flex flex-col h-full">
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">キャラクター設定の概要</h3>
                    <div className="bg-gray-900/50 rounded-lg p-3 overflow-y-auto mb-4 text-xs text-gray-400 flex-grow">
                        <p className="whitespace-pre-wrap">{characterDescription || '設定が入力されていません。'}</p>
                    </div>
                    {generatedImages.length === 0 && (
                        <div className="mt-auto pt-4">
                            <button
                                onClick={() => {
                                    const prompt = `masterpiece, best quality, full body, solo, adult, simple white background, no text, no letters, ${characterDescription.replace(/[\n\r:]+/g, ', ')}`;
                                    handleGenerate(prompt);
                                }}
                                disabled={!canUseAi || isBusy || isCoolingDown || !characterDescription.trim()}
                                title={!canUseAi ? aiBlockedReason : cooldownTitle}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-sm rounded-md hover:bg-cyan-500 transition text-white disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                <Icons.MoonIcon /> {isCoolingDown ? cooldownButtonLabel : '画像を生成'}
                            </button>
                        </div>
                    )}
                </div>
            );
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[70]">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-gray-700 relative">
                {isConfirmingClose && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col justify-center items-center z-10 rounded-lg">
                        <div className="bg-gray-700 p-8 rounded-lg shadow-lg text-center max-w-md">
                            <h3 className="text-lg font-bold text-white mb-4">確認</h3>
                            <p className="text-white mb-6">生成した画像は保存されません。このまま閉じてもよろしいですか？</p>
                            <div className="flex justify-center gap-4">
                                <button onClick={() => setIsConfirmingClose(false)} className="flex items-center justify-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition btn-pressable">
                                    <Icons.XIcon className="h-5 w-5 flex-shrink-0" />
                                    <span>キャンセル</span>
                                </button>
                                <button onClick={onClose} className="flex items-center justify-center gap-2 px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition btn-pressable">
                                    <Icons.TrashIcon className="h-5 w-5" />
                                    <span>閉じる</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2"><Icons.MoonIcon />AI 立ち絵生成</h2>
                    <div className="flex items-center p-1 bg-gray-900 rounded-lg">
                        <button onClick={() => !isBusy && setMode('simple')} className={`px-3 py-1 text-sm rounded-md transition text-white ${mode === 'simple' ? 'bg-indigo-600' : 'hover:bg-gray-700'}`}>簡易生成</button>
                        <button onClick={() => !isBusy && setMode('detailed')} className={`px-3 py-1 text-sm rounded-md transition text-white ${mode === 'detailed' ? 'bg-indigo-600' : 'hover:bg-gray-700'}`}>詳細生成</button>
                    </div>
                    <button onClick={handleCloseRequest} className="p-2 rounded-full text-white hover:bg-gray-700 transition"><Icons.XIcon /></button>
                </div>
                <div className="flex-grow flex flex-col md:flex-row min-h-0">
                    <div className="w-full md:w-1/2 flex flex-col p-4 border-b md:border-b-0 md:border-r border-gray-700 min-h-0">{renderLeftPanel()}</div>
                    <div className="w-full md:w-1/2 p-4 flex flex-col overflow-y-auto min-h-0">
                        <div className="w-full grid grid-cols-2 gap-4">
                            {generatedImages.map((image, index) => (
                                <div key={index} onClick={() => setSelectedImage(image)} className={`relative rounded-lg overflow-hidden cursor-pointer group transition-all duration-300 ${selectedImage === image ? 'ring-4 ring-blue-500' : 'ring-2 ring-transparent hover:ring-blue-500'}`}>
                                    <div className="aspect-w-3 aspect-h-4">
                                        <img src={image} alt={`Generated character ${index + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><p className="text-white font-bold">選択</p></div>
                                </div>
                            ))}
                            {isGeneratingImages && (
                                Array(IMAGE_GENERATION_BATCH_SIZE).fill(0).map((_, i) => <div key={`loading-${i}`} className="bg-gray-900/50 rounded-lg flex items-center justify-center aspect-w-3 aspect-h-4"><Icons.LoaderIcon className="h-10 w-10 text-cyan-400" /></div>)
                            )}
                            {!isGeneratingImages && generatedImages.length === 0 && (
                                <div className="col-span-2 min-h-[300px] bg-gray-900/50 rounded-lg flex items-center justify-center"><p className="text-gray-500">ここに画像が生成されます</p></div>
                            )}
                        </div>
                        {!isGeneratingImages && generatedImages.length > 0 && (
                            <button
                                onClick={() => handleGenerate(basePrompt, true)}
                                disabled={!canUseAi || isBusy || isCoolingDown}
                                title={!canUseAi ? aiBlockedReason : cooldownTitle}
                                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-sm rounded-md hover:bg-gray-600 transition text-white disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                <Icons.PlusCircleIcon className="h-5 w-5" /> {isCoolingDown ? cooldownButtonLabel : `追加で${IMAGE_GENERATION_BATCH_SIZE}枚生成する`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
