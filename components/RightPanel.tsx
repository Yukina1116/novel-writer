import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { parseMarkdown } from '../utils';
import { Tooltip } from './Tooltip';
import { HistoryPanel } from './panels/HistoryPanel';
import { HorizontalResizableHandle } from './HorizontalResizableHandle';
import { useHorizontalResize } from '../hooks/useHorizontalResize';
import { ChatMessage, PlotItem } from '../types';
import { QuickSettingsArea } from './QuickSettingsArea';

interface RightPanelProps {
    userInputRef: React.RefObject<HTMLTextAreaElement>;
    isMobile?: boolean;
}

// AI支援メニューの定義
const menuData = [
    {
        label: '執筆支援',
        icon: Icons.PenSquareIcon,
        color: 'text-blue-400',
        items: [
            { label: '続きを書いて', description: '現在の文脈から自然な続きを生成します。', icon: Icons.SparklesIcon, prompt: '続きを書いてください。' },
            { label: '情景描写を追加', description: '今のシーンに鮮やかな情景描写を加えます。', icon: Icons.ImageIcon, prompt: '今のシーンに、より詳細な情景描写を追加してください。' },
            { label: '心理描写を深掘り', description: 'キャラクターの心情をより深く描きます。', icon: Icons.UserIcon, prompt: 'キャラクターの心の動きをもっと詳しく描写してください。' },
            { label: 'アクション描写の強化', description: '動きのあるシーンをダイナミックに。', icon: Icons.MagicWandIcon, prompt: 'このシーンのアクション描写をもっと躍動感のある、迫力重視の文章に書き換えてください。' },
            { label: '会話シーンを生成', description: 'キャラ同士の掛け合いを作ります。', icon: Icons.BotIcon, prompt: 'この状況でキャラクターたちが交わす、テンポの良い会話シーンを生成してください。' },
        ]
    },
    {
        label: '推敲・校正',
        icon: Icons.CheckCircleIcon,
        color: 'text-emerald-400',
        items: [
            { label: '誤字脱字チェック', description: '文章のミスを見つけて修正案を出します。', icon: Icons.CheckCircleIcon, prompt: 'これまでの文章に誤字脱字や不自然な日本語がないかチェックして、修正案を提示してください。' },
            { label: '表現を豊かに', description: '語彙を増やし、より魅力的な文章にします。', icon: Icons.SparklesIcon, prompt: '文章の語彙を豊かにし、より魅力的な表現にブラッシュアップしてください。' },
            { label: '語尾の重複を修正', description: '「〜た。」などが続く単調さを解消。', icon: Icons.ListOrderedIcon, prompt: '同じ語尾（「〜た」「〜だ」など）が連続して単調になっている箇所を特定し、リズム良く書き換えてください。' },
            { label: 'もっと簡潔な表現に', description: '無駄を削ぎ落として読みやすくします。', icon: Icons.FileTextIcon, prompt: 'この文章を、意味を変えずに、よりシンプルで読みやすい簡潔な表現に直してください。' },
        ]
    },
    {
        label: 'アイデア相談',
        icon: Icons.LightbulbIcon,
        color: 'text-amber-400',
        items: [
            { label: '次の展開の案', description: '物語を盛り上げる次の展開を3つ提案します。', icon: Icons.GitBranchIcon, prompt: '物語を面白くするための、次の展開のアイデアを3つ出してください。' },
            { label: '設定の矛盾チェック', description: 'これまでの設定と矛盾がないか確認します。', icon: Icons.AlertTriangleIcon, prompt: '現在の物語の展開に、設定資料（左パネル）との矛盾がないかチェックしてください。' },
            { label: 'キャラクターの反応案', description: 'ある事件に対し、キャラならどう動くか。', icon: Icons.UserCogIcon, prompt: 'この状況で、各キャラクターならどのような反応や行動をとるか、性格設定に基づいてシミュレートしてください。' },
            { label: '伏線・ギミックの提案', description: '物語の謎や驚きの仕掛けを考案。', icon: Icons.LockIcon, prompt: '物語をより奥深くするために、後に回収できるような伏線や、読者を驚かせるギミックのアイデアを提案してください。' },
        ]
    },
    {
        label: '特殊生成',
        icon: Icons.BentoMenuIcon,
        color: 'text-purple-400',
        items: [
            { label: '章タイトルの案', description: '内容にぴったりのタイトルを考えます。', icon: Icons.TIcon, prompt: 'ここまでの内容にふさわしい、印象的で続きが読みたくなるような章タイトルの案をいくつか出してください。' },
            { label: '読者の感想シミュレート', description: '読んだ人がどう感じるか、客観的に評価。', icon: Icons.EyeIcon, prompt: '一人の読者として、ここまでの文章を読んだ感想（良かった点、気になった点、期待すること）を忖度なしで聞かせてください。' },
            { label: 'あらすじ（140字）', description: 'SNSでの宣伝や紹介に便利な短縮。', icon: Icons.SendIcon, prompt: 'この物語のあらすじを、魅力を凝縮して140文字以内でまとめてください。' },
        ]
    }
];

// 提案履歴モーダルの定義
const SuggestionHistoryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    knowledgeSuggestions: { id: string; content: string }[];
    onApproveKnowledge: (s: { id: string; content: string }) => Promise<void>;
    plotSuggestions: PlotItem[];
    onApprovePlot: (s: PlotItem, type: 'plot') => void;
    loadingKnowledge: string | null;
}> = ({ isOpen, onClose, knowledgeSuggestions, onApproveKnowledge, plotSuggestions, onApprovePlot, loadingKnowledge }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4" onClick={onClose}>
            <div className="bg-panel-bg rounded-lg shadow-xl w-full max-w-2xl border border-border max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h3 className="text-lg font-bold text-text-main flex items-center gap-2"><Icons.HistoryIcon className="h-5 w-5"/> 提案履歴</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-app-bg text-text-main"><Icons.XIcon /></button>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-6">
                    <div>
                        <h4 className="text-sm font-semibold text-warning mb-3">却下したナレッジ提案</h4>
                        <div className="space-y-2">
                            {knowledgeSuggestions?.length > 0 ? knowledgeSuggestions.map((s) => (
                                <div key={s.id} className="bg-app-bg p-3 rounded-md flex justify-between items-center gap-4">
                                    <p className="text-xs text-text-main flex-grow">{s.content}</p>
                                    <button 
                                        onClick={() => onApproveKnowledge(s)} 
                                        disabled={loadingKnowledge === s.content}
                                        className="flex-shrink-0 px-3 py-1 bg-accent text-white text-xs rounded hover:bg-accent/90 disabled:bg-text-muted flex items-center justify-center min-w-[60px]"
                                    >
                                        {loadingKnowledge === s.content ? <Icons.LoaderIcon className="h-3 w-3 animate-spin" /> : '採用する'}
                                    </button>
                                </div>
                            )) : <p className="text-xs text-text-muted text-center py-4">履歴はありません</p>}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-accent mb-3">却下したプロット提案</h4>
                        <div className="space-y-2">
                            {plotSuggestions?.length > 0 ? plotSuggestions.map((s) => (
                                <div key={s.id} className="bg-app-bg p-3 rounded-md flex justify-between items-center gap-4">
                                    <div className="flex-grow min-w-0">
                                        <p className="text-xs font-bold text-accent truncate">{s.title}</p>
                                        <p className="text-[10px] text-text-muted truncate">{s.summary}</p>
                                    </div>
                                    <button onClick={() => onApprovePlot(s, 'plot')} className="flex-shrink-0 px-3 py-1 bg-accent text-white text-xs rounded hover:bg-accent/90 min-w-[60px]">採用する</button>
                                </div>
                            )) : <p className="text-xs text-text-muted text-center py-4">履歴はありません</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const RightPanel: React.FC<RightPanelProps> = ({ userInputRef, isMobile = false }) => {
    const isRightSidebarOpen = useStore(state => state.isRightSidebarOpen);
    const setIsRightSidebarOpen = useStore(state => state.setIsRightSidebarOpen);
    const rightSidebarWidth = useStore(state => state.rightSidebarWidth);
    const activeProjectId = useStore(state => state.activeProjectId);
    
    const chatHistory = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.chatHistory : []);
    const aiSettings = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.aiSettings : undefined);
    const settings = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.settings : []);
    const knowledgeBase = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.knowledgeBase : []);
    const userProfile = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.userProfile : undefined);
    const isSimpleMode = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.isSimpleMode : false);

    const characterName = useMemo(() => {
        const characterSetting = settings.find(s => s.type === 'character');
        return characterSetting?.name || 'キャラクター';
    }, [settings]);

    const userInput = useStore(state => state.userInput);
    const isLoading = useStore(state => state.isLoading);
    const continuationChoices = useStore(state => state.continuationChoices);
    const aiSuggestions = useStore(state => state.aiSuggestions) || { knowledge: [], plot: [] };
    const archivedKnowledgeSuggestions = useStore(state => state.archivedKnowledgeSuggestions);
    const archivedPlotSuggestions = useStore(state => state.archivedPlotSuggestions);
    const generationMode = useStore(state => state.generationMode);
    const historyTree = useStore(state => state.historyTree);
    const userMode = useStore(state => state.userMode);
    const historyPanelHeight = useStore(state => state.historyPanelHeight);
    const isHistoryPanelDocked = useStore(state => state.isHistoryPanelDocked);

    const setUserInput = useStore(state => state.setUserInput);
    const setGenerationMode = useStore(state => state.setGenerationMode);
    const submitMessage = useStore(state => state.submitMessage);
    const handleAdoptContinuation = useStore(state => state.handleAdoptContinuation);
    const handleRejectContinuation = useStore(state => state.handleRejectContinuation);
    const regenerateContinuations = useStore(state => state.regenerateContinuations);
    const handleApproveSuggestion = useStore(state => state.handleApproveSuggestion);
    const handleRejectSuggestion = useStore(state => state.handleRejectSuggestion);
    const openModal = useStore(state => state.openModal);
    const undo = useStore(state => state.undo);
    const redo = useStore(state => state.redo);
    const setActiveProjectData = useStore(state => state.setActiveProjectData);
    const handleSaveSetting = useStore(state => state.handleSaveSetting);
    const setHistoryPanelHeight = useStore(state => state.setHistoryPanelHeight);
    
    if (!activeProjectId) return null;

    const [loadingKnowledge, setLoadingKnowledge] = useState<string | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isFeatureMenuOpen, setIsFeatureMenuOpen] = useState(false);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const featureMenuRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    
    const chatEndRef = useRef<HTMLDivElement>(null);
    const isResizing = false;
    const resizeTransitionClass = isResizing || isMobile ? '' : 'transition-[width] duration-300 ease-in-out';
    const widthStyle = isMobile ? { width: '100%', height: '100%' } : { width: isRightSidebarOpen ? `${rightSidebarWidth}px` : '0px' };
    
    const { handleResizeStart } = useHorizontalResize(historyPanelHeight, setHistoryPanelHeight, panelRef);
    
    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKeyText = isMac ? '⌘Cmd' : 'Ctrl';

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, continuationChoices, isLoading]);
    
    useEffect(() => { 
        if (userInputRef.current) { 
            userInputRef.current.style.height = 'auto'; 
            userInputRef.current.style.height = `${userInputRef.current.scrollHeight}px`; 
        } 
    }, [userInput, userInputRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (featureMenuRef.current && !featureMenuRef.current.contains(event.target as Node)) {
                setIsFeatureMenuOpen(false);
            }
        };
        if (isFeatureMenuOpen) { document.addEventListener('mousedown', handleClickOutside); }
        if (!isFeatureMenuOpen) { setActiveMenu(null); }
        return () => { document.removeEventListener('mousedown', handleClickOutside); };
    }, [isFeatureMenuOpen]);
    
    const handleFormSubmit = (e: React.FormEvent) => { e.preventDefault(); submitMessage(); };
    const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitMessage(); } };

    const handleMenuItemClick = (item: typeof menuData[0]['items'][0]) => {
        setUserInput(item.prompt);
        userInputRef.current?.focus();
        setIsFeatureMenuOpen(false);
    };

    const handleInputFocus = () => {
        if (isMobile) {
            setTimeout(() => {
                userInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300);
        }
    };

    const handleApproveKnowledgeSuggestion = async (suggestion: { content: string, id?: string }) => {
        setLoadingKnowledge(suggestion.content);
        try {
            const { generateKnowledgeName } = await import('../utilityApi');
            const nameResult = await generateKnowledgeName({ sentence: suggestion.content });
            if (nameResult.success === false) { 
                handleSaveSetting({ name: suggestion.content, content: suggestion.content }, 'knowledge'); 
            } else { 
                handleSaveSetting({ name: nameResult.data.name, content: suggestion.content }, 'knowledge'); 
            }
    
            useStore.setState(state => ({ 
                aiSuggestions: { 
                    ...state.aiSuggestions, 
                    knowledge: state.aiSuggestions.knowledge.filter(s => s !== suggestion.content) 
                } 
            }));
            if (suggestion.id) { 
                useStore.setState(state => ({ 
                    archivedKnowledgeSuggestions: state.archivedKnowledgeSuggestions.filter(s => s.id !== suggestion.id) 
                })); 
            }
        } catch (error) {
            console.error("Error approving knowledge suggestion:", error);
            handleSaveSetting({ name: suggestion.content, content: suggestion.content }, 'knowledge');
        } finally { setLoadingKnowledge(null); }
    };

    const canUndo = historyTree.currentNodeId !== null && historyTree.nodes[historyTree.currentNodeId]?.parentId !== null;
    const canRedo = historyTree.currentNodeId !== null && (historyTree.nodes[historyTree.currentNodeId]?.childrenIds?.length || 0) > 0;

    const activeGroup = useMemo(() => menuData.find(g => g.label === activeMenu), [activeMenu]);
    const currentMenuItems = activeGroup?.items;
    const activeColor = activeGroup ? activeGroup.color : 'text-gray-400';

    return (
        <div
            className={`flex-shrink-0 bg-panel-bg backdrop-blur-sm flex flex-col ${resizeTransitionClass} ${(isRightSidebarOpen && !isMobile) ? 'border-l border-border' : ''}`}
            style={widthStyle}
            id="tutorial-right-panel"
        >
            <div className={`overflow-hidden h-full flex flex-col`}>
                {(isRightSidebarOpen || isMobile) && ( <>
                    <div className="p-4 border-b border-border flex justify-between items-center flex-shrink-0">
                        <h2 className="text-xl font-bold text-center text-text-main">AIアシスタント</h2>
                        <div className="flex items-center">
                            <Tooltip helpId="general_help" placement="bottom">
                                <button onClick={() => openModal('generalHelp')} className="p-2 text-text-muted hover:bg-app-bg hover:text-text-main rounded-full transition btn-pressable" title="ヘルプ"><Icons.HelpCircleIcon className="h-5 w-5" /></button>
                            </Tooltip>
                            <Tooltip helpId="undo" placement="left">
                                <button onClick={undo} disabled={!canUndo} className="p-2 text-text-muted hover:bg-app-bg hover:text-text-main rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed btn-pressable" title={`元に戻す (${modifierKeyText}+Z)`}><Icons.UndoIcon /></button>
                            </Tooltip>
                            <Tooltip helpId="redo" placement="left">
                                <button onClick={redo} disabled={!canRedo} className="p-2 text-text-muted hover:bg-app-bg hover:text-text-main rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed btn-pressable" title={`やり直す (${modifierKeyText}+Y)`}><Icons.RedoIcon /></button>
                            </Tooltip>
                            {isMobile && (
                                <button onClick={() => setIsRightSidebarOpen(false)} className="p-2 text-text-muted hover:bg-app-bg hover:text-text-main rounded-full transition btn-pressable"><Icons.XIcon className="h-5 w-5" /></button>
                            )}
                        </div>
                    </div>
                    <div ref={panelRef} className="flex-grow flex flex-col min-h-0">
                        <div className="flex-grow flex flex-col min-h-0">
                            <QuickSettingsArea />
                            <div className="flex-1 p-4 overflow-y-auto">
                                <div className="space-y-4">
                                    {chatHistory.map((msg, index) => (
                                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                            {msg.role === 'assistant' && <Icons.BotIcon />}
                                            <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl ${msg.role === 'user' ? (msg.mode === 'consult' ? 'bg-lime-600/50' : 'bg-blue-600/50') : (msg.mode === 'write' ? 'bg-blue-600/50' : 'bg-lime-600/50')}`}>
                                                <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text, settings.filter(s => s.type === 'character'), knowledgeBase, aiSettings, { applySpeakerColor: false, applyKnowledgeLinks: false, applyCustomColors: false }) }} />
                                            </div>
                                            {msg.role === 'user' && (userProfile?.iconUrl ? <img src={userProfile.iconUrl} alt="User Icon" className="h-6 w-6 rounded-full object-cover flex-shrink-0" /> : <Icons.UserIcon />)}
                                        </div>
                                    ))}
                                    {isLoading && <div className="flex items-start gap-3"><Icons.BotIcon /><div className="px-4 py-3 rounded-xl bg-gray-700/50"><div className="flex items-center space-x-2"><div className="h-2 w-2 bg-indigo-300 rounded-full animate-pulse"></div><div className="h-2 w-2 bg-indigo-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="h-2 w-2 bg-indigo-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div></div></div></div>}
                                    <div ref={chatEndRef} />
                                </div>
                                {continuationChoices && continuationChoices.length > 0 && <div className="p-3 bg-gray-700/50 rounded-lg border border-indigo-500/50 my-4"><h4 className="text-sm font-semibold text-indigo-300 flex items-center gap-2 mb-3"><Icons.SparklesIcon /> AIからの複数展開の提案</h4><div className="space-y-3">{continuationChoices.map((choice) => ( <div key={choice.id} className="bg-gray-800 p-3 rounded-md"><h5 className="font-bold text-indigo-400">{choice.title}</h5><p className="text-sm text-gray-300 mt-1 line-clamp-3">{choice.text}</p><div className="text-right mt-2 flex justify-end gap-2"><button onClick={() => handleRejectContinuation(choice.id)} className="px-3 py-1 rounded-md text-xs font-semibold btn-pressable btn-invert-red">却下</button><button onClick={() => handleAdoptContinuation(choice.text)} className="px-3 py-1 rounded-md text-xs font-semibold btn-pressable btn-invert-green">この展開を採用</button></div></div> ))}</div></div>}
                                {continuationChoices && continuationChoices.length === 0 && <div className="p-3 bg-gray-700/50 rounded-lg border border-indigo-500/50 my-4 text-center"><p className="text-sm text-gray-400 mb-3">すべての提案を却下しました。</p><button onClick={regenerateContinuations} disabled={isLoading} className="px-4 py-2 text-sm rounded-md btn-pressable btn-invert-indigo disabled:bg-gray-500">{isLoading ? '生成中...' : 'やり直す'}</button></div>}
                            </div>
                            {(aiSuggestions?.knowledge?.length > 0 || aiSuggestions?.plot?.length > 0) && <div className="p-4 border-t border-gray-700/50 max-h-64 overflow-y-auto flex-shrink-0 space-y-4">
                                {aiSuggestions?.knowledge?.length > 0 && <div className="p-3 bg-gray-700/50 rounded-lg border border-yellow-500/50"><h4 className="text-sm font-semibold text-yellow-300 mb-3 flex items-center"><Icons.BrainCircuitIcon />AIからのナレッジ提案</h4><div className="space-y-2 max-h-32 overflow-y-auto pr-2">{aiSuggestions.knowledge.map((suggestion, index) => { const isThisLoading = loadingKnowledge === suggestion; return <div key={index} className="flex justify-between items-center bg-gray-800 p-2 rounded-md text-xs"><p className="text-gray-300 mr-2">{suggestion}</p><div className="flex-shrink-0">
                                    <Tooltip helpId="apply_ai" placement="top">
                                        <button onClick={() => !isThisLoading && handleApproveKnowledgeSuggestion({ content: suggestion })} disabled={isThisLoading} className="px-2 py-1 rounded-md mr-2 font-semibold w-16 disabled:bg-gray-500 flex justify-center items-center btn-pressable btn-invert-green">{isThisLoading ? <Icons.LoaderIcon className="h-4 w-4" /> : '承認'}</button>
                                    </Tooltip>
                                    <button onClick={() => handleRejectSuggestion(suggestion, 'knowledge')} disabled={isThisLoading} className="px-2 py-1 rounded-md font-semibold w-16 disabled:bg-gray-500 btn-pressable btn-invert-red">却下</button></div></div>; })}</div></div>}
                                {aiSuggestions?.plot?.length > 0 && <div className="p-3 bg-gray-700/50 rounded-lg border border-cyan-500/50"><h4 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center"><Icons.BrainCircuitIcon />AIからのプロット提案</h4><div className="space-y-2 max-h-32 overflow-y-auto pr-2">{aiSuggestions.plot.map((suggestion) => ( <div key={suggestion.id} className="bg-gray-800 p-2 rounded-md text-xs"><p className="font-bold text-cyan-400">{suggestion.title}</p><p className="text-gray-300 mt-1">{suggestion.summary}</p><div className="text-right mt-2">
                                    <Tooltip helpId="apply_ai" placement="top">
                                        <button onClick={() => handleApproveSuggestion(suggestion, 'plot')} className="px-2 py-1 rounded-md mr-2 font-semibold w-16 btn-pressable btn-invert-green">承認</button>
                                    </Tooltip>
                                    <button onClick={() => handleRejectSuggestion(suggestion, 'plot')} className="px-2 py-1 rounded-md font-semibold w-16 btn-pressable btn-invert-red">却下</button></div></div> ))}</div></div>}
                            </div>}
                            <div 
                                className="p-4 border-t border-gray-700/50 flex-shrink-0"
                                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                            >
                                <div id="tutorial-mode-switch" title={`ショートカットで切替 (${modifierKeyText}+Shift+M)`} className="flex justify-center items-center gap-4 mb-2">
                                    <Tooltip helpId="mode_switch" placement="top">
                                        <div className="flex gap-4">
                                            <label className="flex items-center justify-center text-center cursor-pointer"><input type="radio" name="mode" value="consult" checked={generationMode === 'consult'} onChange={() => setGenerationMode('consult')} className="hidden"/><span className={`px-4 py-1 text-sm rounded-full btn-pressable ${generationMode === 'consult' ? 'font-semibold btn-invert-lime' : 'btn-invert-gray'}`}>相談<wbr/>モード</span></label>
                                            <label className="flex items-center justify-center text-center cursor-pointer"><input type="radio" name="mode" value="write" checked={generationMode === 'write'} onChange={() => setGenerationMode('write')} className="hidden"/><span className={`px-4 py-1 text-sm rounded-full btn-pressable ${generationMode === 'write' ? 'font-semibold btn-invert-blue' : 'btn-invert-gray'}`}>執筆<wbr/>モード</span></label>
                                        </div>
                                    </Tooltip>
                                    {userMode !== 'simple' && (
                                        <Tooltip helpId="multiple_suggestions" placement="top">
                                            <div className={`flex items-center space-x-2 group relative transition-opacity ${generationMode === 'consult' ? 'opacity-50 cursor-not-allowed' : ''} ${isSimpleMode ? 'hidden' : ''}`} title={generationMode === 'consult' ? "複数提案は執筆モードでのみ利用できます" : "ONにすると、執筆モード時にAIが複数の展開案を提案します。"}>
                                                <label htmlFor="multiple-continuations-toggle" className={`text-xs text-gray-400 ${generationMode === 'consult' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>複数提案</label>
                                                <button type="button" onClick={() => { if (generationMode === 'write') { setActiveProjectData(d => ({ ...d, aiSettings: { ...d.aiSettings, generateMultipleContinuations: !d.aiSettings.generateMultipleContinuations } })); } }} className={`relative inline-flex h-5 w-10 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${ aiSettings.generateMultipleContinuations ? 'bg-indigo-600' : 'bg-gray-600' } ${generationMode === 'consult' ? 'cursor-not-allowed' : 'cursor-pointer'} btn-pressable`} role="switch" aria-checked={aiSettings.generateMultipleContinuations} disabled={generationMode === 'consult'}><span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ aiSettings.generateMultipleContinuations ? 'translate-x-5' : 'translate-x-0' }`} /></button>
                                            </div>
                                        </Tooltip>
                                    )}
                                </div>
                                <form onSubmit={handleFormSubmit}>
                                    <div className="relative" ref={featureMenuRef}>
                                        {userMode !== 'simple' && isFeatureMenuOpen && (
                                            <div className={`absolute right-0 bottom-full mb-2 w-80 bg-gray-700 rounded-lg shadow-lg z-20 border border-gray-600 transition-all duration-300 ease-out transform ${activeMenu ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                                                {menuData.map(group => (
                                                    <button type="button" key={group.label} onClick={() => setActiveMenu(group.label)} className="w-full text-left p-3 hover:bg-gray-600 transition flex items-center gap-3 first:rounded-t-lg last:rounded-b-lg">
                                                        <group.icon className={`h-5 w-5 ${group.color} flex-shrink-0`} />
                                                        <span className={`flex-grow ${group.color} font-semibold`}>{group.label}</span>
                                                        <Icons.ChevronRightIcon className="h-4 w-4 text-gray-500" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {userMode !== 'simple' && currentMenuItems && (
                                            <div className={`absolute right-0 bottom-full mb-2 w-80 bg-gray-700 rounded-lg shadow-lg z-20 border border-gray-600 transition-all duration-300 ease-out transform ${activeMenu ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                                                <div className="p-2 border-b border-gray-700 flex items-center">
                                                    <button type="button" onClick={() => setActiveMenu(null)} className="p-1 text-gray-400 hover:text-white"><Icons.ArrowLeftIcon className="h-5 w-5"/></button>
                                                    <h4 className={`text-white font-bold text-center flex-grow ${activeColor}`}>{activeMenu}</h4>
                                                </div>
                                                <div className="max-h-80 overflow-y-auto">
                                                {currentMenuItems.map(item => (
                                                    <button type="button" key={item.label} onClick={() => handleMenuItemClick(item)} className="w-full text-left p-3 hover:bg-gray-600 transition flex items-start gap-3">
                                                        <item.icon className={`h-5 w-5 ${activeColor} mt-0.5 flex-shrink-0`} />
                                                        <div><p className="font-semibold text-white">{item.label}</p><p className="text-xs text-gray-400">{item.description}</p></div>
                                                    </button>
                                                ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-end gap-2">
                                            <div className="flex-grow flex flex-col bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
                                                <Tooltip helpId="focus_ai" placement="top">
                                                    <textarea 
                                                        ref={userInputRef} 
                                                        id="tutorial-ai-input" 
                                                        rows={userMode === 'simple' ? 4 : 2} 
                                                        value={userInput} 
                                                        onChange={(e) => setUserInput(e.target.value)} 
                                                        onKeyDown={handleKeyDown} 
                                                        onFocus={handleInputFocus}
                                                        placeholder={continuationChoices ? "採用する展開を選択してください" : `AIへの指示を入力...`} 
                                                        className="w-full bg-transparent border-none px-4 py-2 text-sm resize-none overflow-y-auto max-h-96 focus:ring-0 text-white" 
                                                        disabled={isLoading || !!continuationChoices} 
                                                    />
                                                </Tooltip>
                                                <div className="flex items-center gap-2 px-2 pb-1.5">
                                                    {userMode !== 'simple' && (
                                                        <div className="flex justify-between items-center flex-grow">
                                                            <Tooltip helpId="suggestion_history" placement="top">
                                                                <button type="button" onClick={() => setIsHistoryOpen(p => !p)} className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-700">
                                                                    <Icons.HistoryIcon className="h-3 w-3" />
                                                                    <span>履歴</span>
                                                                </button>
                                                            </Tooltip>
                                                            <Tooltip helpId="ai_support_menu" placement="top">
                                                                <button type="button" onClick={() => setIsFeatureMenuOpen(p => !p)} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="AI支援メニュー">
                                                                    <Icons.PlusCircleIcon className="h-4 w-4" />
                                                                </button>
                                                            </Tooltip>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <Tooltip helpId="send_ai" placement="left">
                                                <button 
                                                    onClick={() => submitMessage()} 
                                                    type="button" 
                                                    className="w-12 h-12 flex items-center justify-center text-white rounded-full flex-shrink-0 btn-pressable btn-invert-indigo shadow-lg mb-0.5" 
                                                    disabled={isLoading || !userInput.trim() || !!continuationChoices}
                                                >
                                                    <Icons.SendIcon className="h-6 w-6" />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                        
                        {/* 修正: シンプルモード時は非表示にする */}
                        {userMode === 'pro' && isHistoryPanelDocked && !isMobile && (
                            <>
                                <HorizontalResizableHandle onMouseDown={handleResizeStart} />
                                <div
                                    style={{ height: `${historyPanelHeight}px` }}
                                    className="flex-shrink-0 overflow-hidden"
                                >
                                    <HistoryPanel />
                                </div>
                            </>
                        )}
                    </div>
                </> )}
            </div>
            {userMode === 'pro' && (
                <SuggestionHistoryModal 
                    isOpen={isHistoryOpen} 
                    onClose={() => setIsHistoryOpen(false)} 
                    knowledgeSuggestions={archivedKnowledgeSuggestions} 
                    onApproveKnowledge={handleApproveKnowledgeSuggestion} 
                    plotSuggestions={archivedPlotSuggestions} 
                    onApprovePlot={handleApproveSuggestion} 
                    loadingKnowledge={loadingKnowledge} 
                />
            )}
        </div>
    );
};
