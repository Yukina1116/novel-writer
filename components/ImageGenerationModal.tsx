
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { ChatMessage } from '../types';

// --- Image Generation Modal ---
export const ImageGenerationModal = ({ isOpen, onClose, onGenerate, onGeneratePrompt, onApplyImage, characterDescription, isGenerating: isGeneratingProp }) => {
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
        }
    }, [isOpen, characterDescription]);

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

    const handleGenerate = async (promptToUse: string) => {
        setIsGeneratingImages(true);
        setGeneratedImages([]);
        setSelectedImage(null);
        setBasePrompt(promptToUse);
        const result = await onGenerate(promptToUse);
        if (result) {
            setGeneratedImages(result);
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
            await handleGenerate(finalPrompt);
        }
    };
    
    const handleRefine = async () => {
        if (!refinementInput.trim() || !basePrompt || isBusy) return;

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
                        <button onClick={handleRefine} disabled={isBusy || !refinementInput.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-sm rounded-md hover:bg-cyan-500 transition text-white disabled:bg-gray-600">
                            <Icons.MagicWandIcon /> 修正して再生成
                        </button>
                        <button onClick={handleFinalize} disabled={isBusy} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-sm rounded-md hover:bg-emerald-500 transition text-white disabled:bg-gray-600">
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
                        <button type="submit" className="bg-cyan-600 text-white rounded-full p-2 hover:bg-cyan-500 self-end flex-shrink-0" disabled={isBusy || !chatInput.trim()}><Icons.SendIcon /></button>
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
                    <div className="mt-auto pt-4">
                        <button
                            onClick={() => {
                                const prompt = `masterpiece, best quality, anime style, full body, 1girl, solo, simple white background, no text, no letters, ${characterDescription.replace(/[\n\r:]+/g, ', ')}`;
                                handleGenerate(prompt);
                            }}
                            disabled={isBusy || !characterDescription.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-sm rounded-md hover:bg-cyan-500 transition text-white disabled:bg-gray-600"
                        >
                            <Icons.MoonIcon /> 画像を生成
                        </button>
                    </div>
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
                <div className="flex-grow flex min-h-0">
                    <div className="w-1/2 flex flex-col p-4 border-r border-gray-700">{renderLeftPanel()}</div>
                    <div className="w-1/2 p-4 flex flex-col overflow-y-auto">
                        <div className="w-full grid grid-cols-2 gap-4">
                            {isGeneratingImages ? (
                                Array(2).fill(0).map((_, i) => <div key={i} className="bg-gray-900/50 rounded-lg flex items-center justify-center aspect-w-3 aspect-h-4"><Icons.LoaderIcon className="h-10 w-10 text-cyan-400" /></div>)
                            ) : generatedImages.length > 0 ? (
                                generatedImages.map((image, index) => (
                                    <div key={index} onClick={() => setSelectedImage(image)} className={`relative rounded-lg overflow-hidden cursor-pointer group transition-all duration-300 ${selectedImage === image ? 'ring-4 ring-blue-500' : 'ring-2 ring-transparent hover:ring-blue-500'}`}>
                                        <div className="aspect-w-3 aspect-h-4">
                                            <img src={image} alt={`Generated character ${index + 1}`} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><p className="text-white font-bold">選択</p></div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-2 min-h-[300px] bg-gray-900/50 rounded-lg flex items-center justify-center"><p className="text-gray-500">ここに画像が生成されます</p></div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
