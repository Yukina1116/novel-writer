import React, { useState, useMemo } from 'react';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { AnalysisResult, SettingItem, KnowledgeItem, ExtractedCharacterDetail } from '../types';
import { useRequiresAuth } from '../hooks/useRequiresAuth';

type PreviewTarget = {
  type: 'character' | 'world' | 'knowledge';
  name: string;
  isNew: boolean;
  targetId?: string;
  data: Partial<ExtractedCharacterDetail> & { description?: string; memo?: string };
};

export const ImportTextModal: React.FC = () => {
  const { canUseAi, reason: aiBlockedReason } = useRequiresAuth();
  const [inputText, setInputText] = useState('');
  const [step, setStep] = useState<'input' | 'reflect'>('input');
  const [previewItem, setPreviewItem] = useState<PreviewTarget | null>(null);
  
  const analyzeImportedText = useStore(state => state.analyzeImportedText);
  const lastAnalysisResult = useStore(state => state.lastAnalysisResult);
  const analysisHistory = useStore(state => state.analysisHistory);
  const loadAnalysisHistory = useStore(state => state.loadAnalysisHistory);
  const clearAnalysisResult = useStore(state => state.clearAnalysisResult);
  const applyAnalysisResults = useStore(state => state.applyAnalysisResults);
  const closeModal = useStore(state => state.closeModal);
  const isLoading = useStore(state => state.isLoading);
  const activeProjectId = useStore(state => state.activeProjectId);
  const projectData = useStore(state => state.allProjectsData[activeProjectId]);
  
  const [showHistory, setShowHistory] = useState(false);
  const [currentAnalysisResult, setCurrentAnalysisResult] = useState<AnalysisResult | null>(null);

  React.useEffect(() => {
    loadAnalysisHistory();
  }, [loadAnalysisHistory]);

  React.useEffect(() => {
    if (lastAnalysisResult) {
      setCurrentAnalysisResult(lastAnalysisResult);
    }
  }, [lastAnalysisResult]);
  
  const existingSettings = projectData?.settings || [];
  const existingCharacters = useMemo(() => existingSettings.filter(s => s.type === 'character'), [existingSettings]);

  // 反映の選択状態
  const [selectedChars, setSelectedChars] = useState<Record<string, { action: 'create' | 'link' | 'ignore'; targetId?: string }>>({});
  const [selectedTerms, setSelectedTerms] = useState<Record<string, { action: 'world' | 'knowledge' | 'ignore' }>>({});

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    await analyzeImportedText(inputText);
    setStep('reflect');
  };

  const handleBackToInput = () => {
    setStep('input');
    clearAnalysisResult();
    setPreviewItem(null);
  };

  const handleApply = () => {
    const charPayload = (Object.entries(selectedChars) as [string, { action: 'create' | 'link' | 'ignore'; targetId?: string }][])
        .filter(([_, val]) => val.action !== 'ignore')
        .map(([name, val]) => ({ name, ...val }));
    
    const termPayload = (Object.entries(selectedTerms) as [string, { action: 'world' | 'knowledge' | 'ignore' }][])
        .filter(([_, val]) => val.action !== 'ignore')
        .map(([name, val]) => ({ name, ...val }));

    applyAnalysisResults({
        characters: charPayload,
        worldTerms: termPayload
    }, inputText);
    closeModal();
  };

  const reflectSummary = useMemo(() => {
    const chars = (Object.values(selectedChars) as { action: string }[]).filter(v => v.action !== 'ignore').length;
    const terms = (Object.values(selectedTerms) as { action: string }[]).filter(v => v.action !== 'ignore').length;
    return { chars, terms };
  }, [selectedChars, selectedTerms]);

  // プレビュー表示用のデータを生成
  const showPreview = (name: string, type: 'char' | 'term', isSimilar: boolean) => {
    if (type === 'char') {
      const detail = currentAnalysisResult?.characters.extractedDetails.find(ed => ed.name === name);
      const targetId = isSimilar ? (selectedChars[name]?.targetId || currentAnalysisResult?.characters.similar.find(s => s.text === name)?.target) : undefined;
      
      setPreviewItem({
        type: 'character',
        name,
        isNew: !isSimilar,
        targetId: typeof targetId === 'string' ? existingCharacters.find(c => c.name === targetId)?.id : targetId,
        data: detail ? {
          ...detail,
        } : {
          personality: "解析エンジンにより抽出",
          speechStyle: "不明",
          role: "不明",
          confidence: "low",
          memo: "詳細データなし",
          summary: "データなし",
          detailDescription: "詳細データが生成されませんでした。",
          dialogueSamples: []
        }
      });
    } else {
      const action = selectedTerms[name]?.action || 'world';
      const termDetail = currentAnalysisResult?.worldTerms.new.find(t => t.name === name);
      
      setPreviewItem({
        type: action === 'knowledge' ? 'knowledge' : 'world',
        name,
        isNew: true,
        data: {
          description: termDetail?.description || "インポート解析による補完。出典：インポートテキスト"
        }
      });
    }
  };

  const getConfidenceInfo = (confidence: string | undefined) => {
      switch (confidence?.toLowerCase()) {
          case 'high':
              return { label: '確実（AI自信：高）', color: 'bg-green-500/10 text-green-400 border-green-500/30' };
          case 'medium':
              return { label: '推測（AI自信：中）', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' };
          case 'low':
              return { label: '要確認（AI自信：低）', color: 'bg-red-500/10 text-red-400 border-red-500/30' };
          default:
              return null;
      }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[80] p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
          <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
            <Icons.TIcon className="h-6 w-6" />
            テキストインポート解析 {step === 'reflect' && '・反映プレビュー'}
          </h2>
          <button onClick={closeModal} className="p-2 rounded-full hover:bg-gray-700 transition">
            <Icons.XIcon />
          </button>
        </div>

        <div className="flex-grow flex min-h-0 overflow-hidden">
          {step === 'input' ? (
            <>
              {/* Input Phase */}
              <div className="w-1/2 flex flex-col p-6 border-r border-gray-700">
                <label className="block text-sm font-medium text-gray-400 mb-2">取り込むテキストをペースト</label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="ここに外部で書いた本文を貼り付けてください..."
                  className="flex-grow bg-gray-900 border border-gray-600 rounded-md p-4 text-sm text-white resize-none focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                />
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={handleAnalyze}
                    disabled={!canUseAi || isLoading || !inputText.trim()}
                    title={!canUseAi ? aiBlockedReason : undefined}
                    className="flex-grow h-12 flex items-center justify-center gap-2 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {isLoading ? <Icons.LoaderIcon className="animate-spin h-5 w-5" /> : <Icons.TIcon className="h-5 w-5" />}
                    </div>
                    <span>AIで設定を抽出して反映準備</span>
                  </button>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="h-12 w-12 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-md transition shadow-lg"
                    title="解析履歴"
                  >
                    <Icons.HistoryIcon className="h-5 w-5" />
                  </button>
                </div>
                {showHistory && (
                  <div className="mt-4 bg-gray-900 border border-gray-700 rounded-md p-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-2">直近の解析履歴</h4>
                    {analysisHistory.length === 0 ? (
                      <p className="text-xs text-gray-500">履歴はありません。</p>
                    ) : (
                      <div className="space-y-2">
                        {analysisHistory.map((h, i) => {
                          const title = h.characters.extractedDetails.length > 0 
                            ? h.characters.extractedDetails[0].name 
                            : (h.worldTerms.new.length > 0 ? h.worldTerms.new[0].name : `解析 ${i + 1}`);
                          return (
                            <div 
                              key={i} 
                              onClick={() => {
                                setCurrentAnalysisResult(h);
                                setStep('reflect');
                              }}
                              className="text-xs text-gray-300 p-2 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:bg-gray-700"
                            >
                              <p className="font-bold truncate">{title}</p>
                              <p className="truncate">{h.characters.extractedDetails.length} キャラクター, {h.worldTerms.new.length} 用語</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="w-1/2 flex flex-col items-center justify-center p-12 text-gray-400 text-center">
                <div className="bg-indigo-500/10 p-6 rounded-full mb-6">
                  <Icons.TIcon className="h-16 w-16 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold mb-4 text-white">執筆準備をスマートに</h3>
                <p className="text-sm leading-relaxed max-w-md">
                  貼り付けたテキストから、AIが自動で登場人物や用語を抽出します。<br/>
                  抽出された設定は、既存の設定と照らし合わせて「新規登録」するか「既存キャラに追記」するかを自由に選べます。
                </p>
              </div>
            </>
          ) : (
            /* Reflection Phase */
            <div className="w-full flex min-h-0">
              {/* Left Column: List */}
              <div className="w-1/3 flex flex-col border-r border-gray-700 bg-gray-900/20 overflow-y-auto p-4 space-y-6">
                {!currentAnalysisResult ? (
                  <div className="flex flex-col justify-center items-center h-full gap-3">
                    <Icons.LoaderIcon className="animate-spin h-8 w-8 text-indigo-500" />
                    <span className="text-sm text-gray-500">解析データを読み込み中...</span>
                  </div>
                ) : (
                  <>
                    <section>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-2">登場人物候補</h3>
                      <div className="space-y-2">
                        {currentAnalysisResult.characters.similar.map((item, idx) => (
                          <div 
                            key={`sim-${idx}`} 
                            onClick={() => showPreview(item.text, 'char', true)}
                            className={`p-3 rounded-lg border cursor-pointer transition flex items-center gap-3 ${previewItem?.name === item.text ? 'bg-indigo-600/20 border-indigo-500' : 'bg-gray-800/40 border-gray-700 hover:bg-gray-700/50'}`}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedChars[item.text]?.action === 'link'} 
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedChars(prev => ({
                                  ...prev,
                                  [item.text]: { action: e.target.checked ? 'link' : 'ignore', targetId: prev[item.text]?.targetId || existingCharacters.find(c => c.name === item.target)?.id }
                                }));
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-indigo-600"
                            />
                            <div className="flex-grow min-w-0">
                              <p className="text-sm font-bold text-white truncate">{item.text}</p>
                              <p className="text-[10px] text-yellow-500">既存: {item.target} に追記</p>
                            </div>
                          </div>
                        ))}
                        {currentAnalysisResult.characters.new.map((name) => (
                          <div 
                            key={`new-${name}`} 
                            onClick={() => showPreview(name, 'char', false)}
                            className={`p-3 rounded-lg border cursor-pointer transition flex items-center gap-3 ${previewItem?.name === name ? 'bg-indigo-600/20 border-indigo-500' : 'bg-gray-800/40 border-gray-700 hover:bg-gray-700/50'}`}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedChars[name]?.action === 'create'} 
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedChars(prev => ({
                                  ...prev,
                                  [name]: { action: e.target.checked ? 'create' : 'ignore' }
                                }));
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-indigo-600"
                            />
                            <div className="flex-grow min-w-0">
                              <p className="text-sm font-bold text-white truncate">{name}</p>
                              <p className="text-[10px] text-blue-400">新規登録予定</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-2">用語・世界観候補</h3>
                      <div className="space-y-2">
                        {currentAnalysisResult.worldTerms.new.map((termObj) => (
                          <div 
                            key={`term-${termObj.name}`} 
                            onClick={() => showPreview(termObj.name, 'term', false)}
                            className={`p-3 rounded-lg border cursor-pointer transition flex items-center gap-3 ${previewItem?.name === termObj.name ? 'bg-indigo-600/20 border-indigo-500' : 'bg-gray-800/40 border-gray-700 hover:bg-gray-700/50'}`}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedTerms[termObj.name]?.action !== 'ignore'} 
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedTerms(prev => ({
                                  ...prev,
                                  [termObj.name]: { action: e.target.checked ? 'world' : 'ignore' }
                                }));
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-indigo-600"
                            />
                            <div className="flex-grow min-w-0">
                              <p className="text-sm font-bold text-white truncate">{termObj.name}</p>
                              <p className="text-[10px] text-green-400">
                                {selectedTerms[termObj.name]?.action === 'knowledge' ? 'ナレッジに登録' : '世界観に登録'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>

              {/* Right Column: Detail Preview */}
              <div className="w-2/3 flex flex-col bg-gray-900/40 overflow-hidden relative">
                {previewItem ? (
                  <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/30">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-white">{previewItem.name}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${previewItem.isNew ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'}`}>
                            {previewItem.isNew ? '新規' : '追記予定'}
                          </span>
                          {previewItem.data.confidence && (
                             <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${getConfidenceInfo(previewItem.data.confidence)?.color || 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'}`}>
                                {getConfidenceInfo(previewItem.data.confidence)?.label || previewItem.data.confidence}
                             </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {previewItem.type === 'character' ? '登場人物設定' : '世界観・ナレッジ設定'} として反映されます
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-600 hover:border-indigo-500 transition">
                          <input 
                            type="checkbox" 
                            checked={previewItem.type === 'character' ? (selectedChars[previewItem.name]?.action !== 'ignore') : (selectedTerms[previewItem.name]?.action !== 'ignore')}
                            onChange={(e) => {
                              if (previewItem.type === 'character') {
                                setSelectedChars(prev => ({
                                  ...prev,
                                  [previewItem.name]: { ...prev[previewItem.name], action: e.target.checked ? (previewItem.isNew ? 'create' : 'link') : 'ignore' }
                                }));
                              } else {
                                setSelectedTerms(prev => ({
                                  ...prev,
                                  [previewItem.name]: { ...prev[previewItem.name], action: e.target.checked ? 'world' : 'ignore' }
                                }));
                              }
                            }}
                          />
                          <span className="text-sm font-bold text-gray-300">この項目を反映する</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex-grow overflow-y-auto p-6 space-y-8">
                      {previewItem.type === 'character' ? (
                        /* Character Detailed Preview */
                        <div className="space-y-8">
                          {/* Quick Info Grid */}
                          <div className="grid grid-cols-4 gap-4">
                             <div className="bg-gray-800/40 p-3 rounded border border-gray-700/50">
                               <p className="text-[10px] text-gray-500 uppercase mb-1">推定年齢</p>
                               <p className="text-sm text-white font-bold">{previewItem.data.age || '不明'}</p>
                             </div>
                             <div className="bg-gray-800/40 p-3 rounded border border-gray-700/50">
                               <p className="text-[10px] text-gray-500 uppercase mb-1">性別</p>
                               <p className="text-sm text-white font-bold">{previewItem.data.gender || '不明'}</p>
                             </div>
                             <div className="bg-gray-800/40 p-3 rounded border border-gray-700/50">
                               <p className="text-[10px] text-gray-500 uppercase mb-1">役割</p>
                               <p className="text-sm text-indigo-300 font-bold">{previewItem.data.role}</p>
                             </div>
                             <div className="bg-gray-800/40 p-3 rounded border border-gray-700/50 flex items-center justify-between">
                               <div>
                                 <p className="text-[10px] text-gray-500 uppercase mb-1">テーマカラー</p>
                                 <p className="text-[10px] font-mono text-gray-300">{previewItem.data.suggestedColor || 'N/A'}</p>
                               </div>
                               {previewItem.data.suggestedColor && (
                                 <div className="w-6 h-6 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: previewItem.data.suggestedColor }} />
                               )}
                             </div>
                          </div>

                          {/* Deep Analysis Sections */}
                          <div className="space-y-6">
                            <section className="bg-indigo-900/10 p-5 rounded-lg border border-indigo-500/20 shadow-inner">
                               <h4 className="text-xs font-bold text-indigo-400 mb-3 flex items-center gap-2">
                                 <Icons.BotIcon className="h-3 w-3" /> キャラクター要約 (Summary)
                               </h4>
                               <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{previewItem.data.summary}</p>
                            </section>

                            <section className="space-y-3">
                               <h4 className="text-xs font-bold text-gray-400 mb-1 px-1">詳細設定 (Detail Description)</h4>
                               <div className="bg-gray-800/30 p-5 rounded-lg border border-gray-700/50">
                                 <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{previewItem.data.detailDescription}</p>
                               </div>
                            </section>

                            <section className="space-y-3">
                               <h4 className="text-xs font-bold text-yellow-500 mb-1 px-1 flex items-center gap-2">
                                 <Icons.LightbulbIcon className="h-3 w-3" /> 解析メモ・考察 (Memo)
                               </h4>
                               <div className="bg-yellow-900/5 p-5 rounded-lg border border-yellow-500/10 italic">
                                 <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{previewItem.data.memo}</p>
                               </div>
                            </section>

                            <section className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                 <h4 className="text-[10px] font-bold text-gray-500 uppercase px-1">口調・話し方</h4>
                                 <div className="bg-gray-800/20 p-3 rounded border border-gray-700/30 text-xs text-gray-300">{previewItem.data.speechStyle}</div>
                               </div>
                               <div className="space-y-2">
                                 <h4 className="text-[10px] font-bold text-gray-500 uppercase px-1">性格キーワード</h4>
                                 <div className="bg-gray-800/20 p-3 rounded border border-gray-700/30 text-xs text-gray-300">{previewItem.data.personality}</div>
                               </div>
                            </section>

                            <section className="space-y-3">
                               <h4 className="text-xs font-bold text-teal-400 mb-1 px-1 flex items-center gap-2">
                                 <Icons.TIcon className="h-3 w-3" /> セリフサンプル (Dialogue Samples)
                               </h4>
                               <div className="bg-teal-900/5 p-4 rounded-lg border border-teal-500/20 space-y-2">
                                 {previewItem.data.dialogueSamples?.map((sample, sIdx) => (
                                   <p key={sIdx} className="text-sm text-teal-100 italic">「{sample}」</p>
                                 )) || <p className="text-xs text-gray-600">サンプルなし</p>}
                               </div>
                            </section>
                          </div>
                        </div>
                      ) : (
                        /* World/Term Preview */
                        <div className="space-y-6">
                           <section className="bg-indigo-900/10 p-6 rounded-lg border border-indigo-500/20 shadow-inner">
                             <h4 className="text-xs font-bold text-indigo-400 mb-3 flex items-center gap-2">
                               <Icons.BotIcon className="h-3 w-3" /> AI補完による説明文 (要約)
                             </h4>
                             <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{previewItem.data.description}</p>
                           </section>
                           
                           <div className="flex items-center gap-4 p-4 bg-gray-800/30 rounded border border-gray-700/50">
                             <span className="text-xs text-gray-400">登録先カテゴリの選択:</span>
                             <label className="text-xs text-gray-300 flex items-center gap-1 cursor-pointer">
                               <input 
                                 type="radio" 
                                 name="termType" 
                                 checked={selectedTerms[previewItem.name]?.action === 'world'}
                                 onChange={() => setSelectedTerms(prev => ({ ...prev, [previewItem.name]: { action: 'world' } }))}
                               />
                               世界観設定 (地図・カスタム項目)
                             </label>
                             <label className="text-xs text-gray-300 flex items-center gap-1 cursor-pointer">
                               <input 
                                 type="radio" 
                                 name="termType" 
                                 checked={selectedTerms[previewItem.name]?.action === 'knowledge'}
                                 onChange={() => setSelectedTerms(prev => ({ ...prev, [previewItem.name]: { action: 'knowledge' } }))}
                               />
                               ナレッジベース (事典形式)
                             </label>
                           </div>

                           <div className="p-4 bg-yellow-900/5 border border-yellow-500/10 rounded-lg">
                             <p className="text-[10px] text-yellow-500 leading-relaxed italic">
                               ※世界観設定として登録する場合、この説明文は「メモ（AI非参照）」に保存されます。<br/>
                               ナレッジベースとして登録する場合、この説明文は「内容」として保存され、AIの参照対象となります。
                             </p>
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 text-center p-12">
                    <Icons.EyeIcon className="h-16 w-16 mb-4 opacity-20" />
                    <h3 className="text-lg font-bold mb-2">プレビューを選択</h3>
                    <p className="text-sm max-w-xs">
                      左側のリストから項目を選択して、AIが抽出した分析結果を検品してください。
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Summary Area */}
        {step === 'reflect' && (
          <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-8 ml-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">REFLECT TARGET</span>
                <div className="flex gap-4 text-sm font-bold text-white">
                  <span>キャラ: {reflectSummary.chars} 件</span>
                  <span>用語: {reflectSummary.terms} 件</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleBackToInput}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition font-bold flex items-center gap-2"
              >
                <Icons.ArrowLeftIcon className="h-4 w-4"/>
                戻る
              </button>
              <button 
                onClick={handleApply}
                disabled={reflectSummary.chars === 0 && reflectSummary.terms === 0}
                className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-bold transition shadow-lg active:scale-95 disabled:opacity-50"
              >
                選択した設定を反映して取り込む
              </button>
            </div>
          </div>
        )}

        {step === 'input' && (
          <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-end flex-shrink-0">
             <button
                onClick={closeModal}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition font-bold"
              >
                キャンセル
              </button>
          </div>
        )}
      </div>
    </div>
  );
};