import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from '../icons';
import { getContrastingTextColor } from '../utils';
import { SettingItem, Relation, NodePosition } from '../types';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';
import { useStore } from '../store/index';
import { ChartTutorial } from './ChartTutorial';

// 関係を一意に識別するヘルパー
const getRelId = (rel: Relation) => rel.id || `${rel.source}-${rel.target}-${rel.label}`;

export const RelationEditor = ({ relation, characters, onSave, onDelete, onClose }) => {
    const [label, setLabel] = useState(relation.label || '');
    const [color, setColor] = useState(relation.color || '#6b7280');
    const [targetId, setTargetId] = useState(relation.target || '');
    const [callName, setCallName] = useState(relation.callName || '');

    const sourceChar = characters.find(c => c.id === relation.source);
    const targetChar = characters.find(c => c.id === targetId);
    
    const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0, []);
    const modifierKeyText = isMac ? '⌘Cmd' : 'Ctrl';

    const handleSave = () => {
        onSave({ ...relation, label, color, target: targetId, callName });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
        }
    };

    const presetColors = {
        '友好': '#14b8a6', '敵対': '#f43f5e', '協力': '#0ea5e9',
        '恋愛': '#d946ef', '家族': '#f59e0b', '師弟': '#8b5cf6', '不明': '#6b7280'
    };
    
    return (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm border-t border-gray-700 p-4 z-20 shadow-2xl animate-in slide-in-from-bottom duration-200" onKeyDown={handleKeyDown}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Icons.EditIcon className="h-5 w-5 text-indigo-400"/>
                    関係を編集
                </h3>
                <div className="flex items-center gap-2">
                    <button 
                        type="button" 
                        onClick={() => { if(window.confirm('この関係を削除しますか？')) onDelete(relation); }} 
                        className="flex items-center gap-1 px-3 py-1 bg-red-900/50 text-red-400 border border-red-800 rounded hover:bg-red-800 hover:text-white transition btn-pressable text-xs"
                    >
                        <Icons.TrashIcon className="h-3 w-3"/>
                        この関係を削除
                    </button>
                    <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 btn-pressable"><Icons.XIcon className="h-5 w-5 text-white"/></button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                    <p className="text-sm bg-gray-800 p-2 rounded border border-gray-700">
                        <span className="font-semibold text-blue-400">{sourceChar?.name || '不明'}</span>
                        <span className="text-gray-500 mx-2">→</span>
                        <span className="font-semibold text-green-400">{targetChar?.name || '不明'}</span>
                    </p>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">関係の相手</label>
                        <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none">
                            {characters.map(char => <option key={char.id} value={char.id}>{char.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">関係性 (ラベル)</label>
                        <input type="text" value={label} onChange={e => setLabel(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"/>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">呼び方</label>
                        <input type="text" value={callName} onChange={e => setCallName(e.target.value)} placeholder="例: 〇〇さん" className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"/>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">クイック設定</label>
                        <div className="flex gap-2 flex-wrap">
                            {Object.entries(presetColors).map(([pl, pc]) => (
                                <button key={pl} type="button" onClick={() => { setLabel(pl); setColor(pc); }} className="px-2 py-1 text-[10px] rounded-full btn-pressable border border-transparent hover:border-white/50" style={{ backgroundColor: pc, color: getContrastingTextColor(pc) }}>{pl}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">線の色</label>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-8 p-1 bg-gray-800 border border-gray-600 rounded-md cursor-pointer"/>
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-700/50">
                <button type="button" onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition font-bold btn-pressable shadow-lg">
                    <Icons.CheckIcon className="h-4 w-4" />保存 ({modifierKeyText}+Enter)
                </button>
            </div>
        </div>
    );
};

export const CharacterChartModal = ({ isOpen, onClose, characters, relations, nodePositions, onSave, onHelpClick, isMobile = false }) => {
    console.log('CharacterChartModal rendered');
    const [localNodes, setLocalNodes] = useState<(SettingItem & NodePosition)[]>([]);
    const [localRelations, setLocalRelations] = useState<Relation[]>([]);
    const [activeDrag, setActiveDrag] = useState<{nodeId: string, offsetX: number, offsetY: number} | null>(null);
    const [isEditingRelation, setIsEditingRelation] = useState<Relation | null>(null);
    const [mode, setMode] = useState<'navigate' | 'add_relation' | 'delete_relation'>('navigate');
    const [firstSelectionForAdd, setFirstSelectionForAdd] = useState<string | null>(null);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    
    const svgRef = useRef<SVGSVGElement>(null);
    const closeButtonRef = useRef(null);
    const isInitializedRef = useRef(false);

    const startChartTutorial = useStore(state => state.startChartTutorial);
    const hasCompletedGlobalChartTutorial = useStore(state => state.hasCompletedGlobalChartTutorial);

    // 【修正の核心】Propsからの初期化をモーダル開封時の1回だけに制限する
    useEffect(() => {
        if (isOpen && !isInitializedRef.current) {
            // IDがない関係性に一律IDを付与して安定させる
            const sanitizedRelations = (relations || []).map(r => ({
                ...r,
                id: r.id || uuidv4()
            }));

            setLocalRelations(sanitizedRelations);

            const chartWidth = 800;
            const chartHeight = 600;
            const updatedNodes = characters.map((char, index) => {
                const existingPos = nodePositions.find(p => p.characterId === char.id);
                if (existingPos) return { ...char, ...existingPos };
                const angle = (index / characters.length) * 2 * Math.PI;
                const radius = 200;
                return {
                    ...char,
                    characterId: char.id,
                    x: chartWidth / 2 + radius * Math.cos(angle),
                    y: chartHeight / 2 + radius * Math.sin(angle),
                };
            });
            setLocalNodes(updatedNodes);
            
            // 初期の比較用状態を保存
            setInitialStateString(JSON.stringify({ 
                relations: sanitizedRelations, 
                nodePositions: updatedNodes.map(n => ({ characterId: n.id, x: n.x, y: n.y })) 
            }));
            
            // ロックをかける
            isInitializedRef.current = true;

            if (!hasCompletedGlobalChartTutorial && !isMobile) {
                setTimeout(startChartTutorial, 300);
            }
        }

        // 閉じる際にロックを解除する
        if (!isOpen) {
            isInitializedRef.current = false;
        }
    }, [isOpen]); 
    // 依存配列から relations, characters などを除外。これらが外で変わっても、モーダル内は上書きしない。

    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        const initial = JSON.parse(initialStateString);
        
        // 関係性の比較
        if (JSON.stringify(localRelations) !== JSON.stringify(initial.relations)) return true;
        
        // ノード位置の比較（浮動小数点誤差を考慮）
        for (const node of localNodes) {
            const initialNode = initial.nodePositions.find(p => p.characterId === node.id);
            if (!initialNode) return true; // 新規ノード
            if (Math.abs(node.x - initialNode.x) > 1 || Math.abs(node.y - initialNode.y) > 1) return true;
        }
        
        return false;
    }, [localNodes, localRelations, initialStateString]);

    const handleCloseRequest = () => {
        console.log('--- handleCloseRequest called ---');
        console.log('isDirty:', isDirty);
        console.log('localNodes:', localNodes);
        console.log('localRelations:', localRelations);
        console.log('initialStateString:', initialStateString);
        
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };

    const handleSaveAction = () => {
        onSave(localRelations, localNodes.map(({ id, x, y }) => ({ characterId: id, x, y })));
        onClose();
    };

    const handleSaveAndClose = () => {
        handleSaveAction();
        setIsConfirmCloseOpen(false);
    };

    const handleDeleteRelation = (relToDelete: Relation) => {
        const id = getRelId(relToDelete);
        setLocalRelations(prev => prev.filter(r => getRelId(r) !== id));
    };

    const handleNodeClick = (e, node) => {
        e.stopPropagation();
        if (mode === 'add_relation') {
            if (!firstSelectionForAdd) {
                setFirstSelectionForAdd(node.id);
            } else if (firstSelectionForAdd !== node.id) {
                const newRel: Relation = { id: uuidv4(), source: firstSelectionForAdd, target: node.id, label: "関係", color: "#6b7280", callName: "" };
                setLocalRelations(prev => [...prev, newRel]);
                setIsEditingRelation(newRel);
                setFirstSelectionForAdd(null);
                setMode('navigate');
            }
        } else if (mode === 'delete_relation') {
            if (!firstSelectionForAdd) {
                setFirstSelectionForAdd(node.id);
            } else {
                const sId = firstSelectionForAdd;
                const tId = node.id;
                const matches = localRelations.filter(r => (r.source === sId && r.target === tId) || (r.source === tId && r.target === sId));
                
                if (matches.length > 0) {
                    if (window.confirm(`${matches.length}件の関係をすべて削除しますか？`)) {
                        setLocalRelations(prev => prev.filter(r => !((r.source === sId && r.target === tId) || (r.source === tId && r.target === sId))));
                    }
                }
                setFirstSelectionForAdd(null);
            }
        }
    };

    const relationsWithCurveData = useMemo(() => {
        const pairs = new Map<string, Relation[]>();
        localRelations.forEach(rel => {
            const key = [rel.source, rel.target].sort().join('--');
            if (!pairs.has(key)) pairs.set(key, []);
            pairs.get(key)!.push(rel);
        });

        return localRelations.map(rel => {
            const key = [rel.source, rel.target].sort().join('--');
            const pair = pairs.get(key)!;
            const isBidirectional = pair.length > 1 && pair.some(p => p.source === rel.target && p.target === rel.source);
            return { ...rel, curve: isBidirectional ? 30 : 0 };
        });
    }, [localRelations]);

    const getSVGPoint = (e) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const screenCTM = svg.getScreenCTM();
        return screenCTM ? pt.matrixTransform(screenCTM.inverse()) : { x: 0, y: 0 };
    };

    if (!isOpen) return null;

    const nodesById = localNodes.reduce((acc, node) => ({ ...acc, [node.id]: node }), {});

    return createPortal(
        <div className="fixed inset-0 bg-red-500/80 backdrop-blur-sm flex justify-center items-center z-[70] p-4">
            {!isMobile && <ChartTutorial />}
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col border border-gray-700 relative overflow-hidden">
                <UnsavedChangesPopover isOpen={isConfirmCloseOpen} targetRef={closeButtonRef} onCancel={() => setIsConfirmCloseOpen(false)} onCloseWithoutSaving={onClose} onSaveAndClose={handleSaveAndClose} />
                
                <div className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
                    <h2 className="text-xl font-bold text-violet-400 flex items-center gap-2"><Icons.UserCogIcon />キャラクター相関図</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center p-1 bg-gray-900 rounded-lg shadow-inner">
                            {(['navigate', 'add_relation', 'delete_relation'] as const).map(m => (
                                <button key={m} onClick={() => { setMode(m); setFirstSelectionForAdd(null); }} className={`px-4 py-1.5 text-xs rounded transition-all ${mode === m ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'} btn-pressable`}>
                                    {m === 'navigate' ? '移動' : m === 'add_relation' ? '追加' : '削除'}
                                </button>
                            ))}
                        </div>
                        <div className="w-px h-6 bg-gray-700 mx-2" />
                        <button onClick={() => onHelpClick('characterChart')} className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition btn-pressable"><Icons.HelpCircleIcon className="h-5 w-5"/></button>
                        <button ref={closeButtonRef} onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition btn-pressable"><Icons.XIcon className="h-5 w-5 text-white" /></button>
                    </div>
                </div>

                <div className="flex-grow relative overflow-auto bg-gray-900/50" onClick={() => setFirstSelectionForAdd(null)}>
                    <svg ref={svgRef} width="800" height="600" viewBox="0 0 800 600" className={`mx-auto ${mode === 'add_relation' ? 'cursor-crosshair' : ''}`}
                         onMouseMove={(e) => {
                             if (!activeDrag) return;
                             const p = getSVGPoint(e);
                             setLocalNodes(prev => prev.map(n => n.id === activeDrag.nodeId ? { ...n, x: p.x - activeDrag.offsetX, y: p.y - activeDrag.offsetY } : n));
                         }}
                         onMouseUp={() => setActiveDrag(null)}>
                        
                        <g>
                            {relationsWithCurveData.map((rel, i) => {
                                const s = nodesById[rel.source], t = nodesById[rel.target];
                                if (!s || !t) return null;
                                const color = rel.color || "#6b7280";
                                const dx = t.x - s.x, dy = t.y - s.y, dist = Math.max(1, Math.sqrt(dx*dx + dy*dy));
                                const tx = t.x - (dx/dist)*35, ty = t.y - (dy/dist)*35;
                                const midX = (s.x + t.x)/2, midY = (s.y + t.y)/2;
                                const cx = midX - (dy/dist)*rel.curve, cy = midY + (dx/dist)*rel.curve;
                                const path = rel.curve ? `M ${s.x} ${s.y} Q ${cx} ${cy} ${tx} ${ty}` : `M ${s.x} ${s.y} L ${tx} ${ty}`;
                                
                                const handleClick = (e) => {
                                    e.stopPropagation();
                                    if (mode === 'delete_relation') {
                                        handleDeleteRelation(rel);
                                    } else if (mode === 'navigate') {
                                        setIsEditingRelation(rel);
                                    }
                                };

                                return (
                                    <g key={`${getRelId(rel)}-${i}`} className="cursor-pointer group" onClick={handleClick}>
                                        <path d={path} stroke="transparent" strokeWidth="25" fill="none" />
                                        <path d={path} stroke={color} strokeWidth={mode === 'delete_relation' ? "4" : "2"} fill="none" markerEnd={`url(#arrow-${rel.id})`} className="transition-all duration-200 group-hover:stroke-white" />
                                        <rect x={cx-25} y={cy-10} width="50" height="20" fill="#1f2937" rx="4" className="stroke-gray-600 border" />
                                        <text x={cx} y={cy} fill="white" fontSize="10" textAnchor="middle" dy=".3em" pointerEvents="none">{rel.label}</text>
                                        <defs>
                                            <marker id={`arrow-${rel.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                                            </marker>
                                        </defs>
                                    </g>
                                );
                            })}
                        </g>

                        <g>
                            {localNodes.map(node => (
                                <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer"
                                   onMouseDown={(e) => {
                                       if(mode!=='navigate') return;
                                       const p = getSVGPoint(e);
                                       setActiveDrag({ nodeId: node.id, offsetX: p.x - node.x, offsetY: p.y - node.y });
                                   }}
                                   onClick={(e) => handleNodeClick(e, node)}>
                                    <circle r="32" fill="#1a202c" stroke={firstSelectionForAdd === node.id ? "#3b82f6" : (node.themeColor || "#4b5563")} strokeWidth={firstSelectionForAdd === node.id ? "4" : "2"} className="transition-all" />
                                    <text fill="white" textAnchor="middle" dy=".3em" fontSize="11" pointerEvents="none" className="font-bold">{node.name}</text>
                                </g>
                            ))}
                        </g>
                    </svg>
                </div>

                {isEditingRelation && (
                    <RelationEditor 
                        relation={isEditingRelation} 
                        characters={characters} 
                        onClose={() => setIsEditingRelation(null)}
                        onDelete={(rel) => { handleDeleteRelation(rel); setIsEditingRelation(null); }}
                        onSave={(saved) => {
                            setLocalRelations(prev => prev.map(r => getRelId(r) === getRelId(saved) ? saved : r));
                            setIsEditingRelation(null);
                        }} 
                    />
                )}

                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                    <button onClick={handleCloseRequest} className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition btn-pressable">キャンセル</button>
                    <button onClick={handleSaveAction} className="px-8 py-2 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-500 transition shadow-lg btn-pressable">保存</button>
                </div>
            </div>
        </div>,
        document.body
    );
};