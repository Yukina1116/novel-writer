import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from '../icons';
import { getContrastingTextColor } from '../utils';
import { PlotItem, PlotRelation, PlotNodePosition } from '../types';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';
// FIX: The file 'store.ts' does not exist, changed import to 'store/index.ts'.
import { useStore } from '../store/index';
import { PlotBoardTutorial } from './PlotBoardTutorial';

// --- Card Editor Modal ---
const CardEditorModal = ({ card, onSave, onDelete, onClose, plotTypeColors, onUpdateColor, readOnly = false }) => {
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [selectedDropdownType, setSelectedDropdownType] = useState('');
    const [customType, setCustomType] = useState('');
    const [color, setColor] = useState('#22d3ee');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');

    const presetTypes = ['章のまとめ', '物語の構成', 'キャラクターアーク', 'サブプロット'];
    const OTHER_OPTION = 'その他（自由記入）';

    const presetTypeColors = {
        '章のまとめ': '#22d3ee', // cyan-400
        '物語の構成': '#2dd4bf', // teal-400
        'キャラクターアーク': '#a855f7', // purple-500
        'サブプロット': '#22c55e', // green-500
    };

    useEffect(() => {
        let initialState = { title: '', summary: '', selectedDropdownType: presetTypes[0], customType: '', color: '#22d3ee' };
        if (card) {
            setTitle(card.title || '');
            setSummary(card.summary || '');
            const currentType = card.type || presetTypes[0];
            if (presetTypes.includes(currentType)) {
                setSelectedDropdownType(currentType);
                setCustomType('');
                setColor(plotTypeColors[currentType] || presetTypeColors[currentType] || '#6b7280');
                initialState = { title: card.title || '', summary: card.summary || '', selectedDropdownType: currentType, customType: '', color: plotTypeColors[currentType] || presetTypeColors[currentType] || '#6b7280' };
            } else {
                setSelectedDropdownType(OTHER_OPTION);
                setCustomType(currentType);
                setColor(plotTypeColors[currentType] || '#6b7280');
                initialState = { title: card.title || '', summary: card.summary || '', selectedDropdownType: OTHER_OPTION, customType: currentType, color: plotTypeColors[currentType] || '#6b7280' };
            }
        } else { // New card
            setTitle('');
            setSummary('');
            const defaultType = presetTypes[0];
            setSelectedDropdownType(defaultType);
            setCustomType('');
            setColor(plotTypeColors[defaultType] || presetTypeColors[defaultType] || '#22d3ee');
            initialState = { title: '', summary: '', selectedDropdownType: defaultType, customType: '', color: plotTypeColors[defaultType] || presetTypeColors[defaultType] || '#22d3ee' };
        }
        setInitialStateString(JSON.stringify(initialState));
    }, [card, plotTypeColors]);
    
    const isDirty = useMemo(() => {
        const currentState = { title, summary, selectedDropdownType, customType, color };
        return JSON.stringify(currentState) !== initialStateString;
    }, [title, summary, selectedDropdownType, customType, color, initialStateString]);

    const handleCloseRequest = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const finalType = selectedDropdownType === OTHER_OPTION ? customType.trim() : selectedDropdownType;
        if (!title.trim() || !finalType) return;
        const newCard = { ...card, id: card?.id || uuidv4(), title, summary, type: finalType, lastModified: Date.now() };
        onSave(newCard);
        if (selectedDropdownType === OTHER_OPTION) {
            onUpdateColor(finalType, color);
        }
    };
    
    const handleDeleteConfirm = () => {
        onDelete(card.id);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
        }
    };

    const handleTypeChange = (e) => {
        const newType = e.target.value;
        setSelectedDropdownType(newType);
        if (newType !== OTHER_OPTION) {
            setColor(plotTypeColors[newType] || presetTypeColors[newType] || '#6b7280');
        }
    };
    
    const isCustomColorAllowed = selectedDropdownType === OTHER_OPTION;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[80]">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col h-full min-h-0">
                    <UnsavedChangesPopover
                        isOpen={isConfirmCloseOpen}
                        targetRef={null}
                        onCancel={() => setIsConfirmCloseOpen(false)}
                        onCloseWithoutSaving={() => { setIsConfirmCloseOpen(false); onClose(); }}
                        onSaveAndClose={() => {
                            const e = { preventDefault: () => {} } as any;
                            handleSubmit(e);
                            setIsConfirmCloseOpen(false);
                            onClose();
                        }}
                    />
                    <h2 className="text-xl font-bold mb-4 text-cyan-400 flex-shrink-0">{readOnly ? 'プロット詳細' : (card?.id ? 'プロットを編集' : 'プロットを新規作成')}</h2>
                    <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">タイトル <span className="text-red-500">*</span></label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" required disabled={readOnly} />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2 space-y-2">
                                <label className="block text-sm font-medium text-gray-300">種別 <span className="text-red-500">*</span></label>
                                <select value={selectedDropdownType} onChange={handleTypeChange} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" disabled={readOnly}>
                                    {presetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    <option value={OTHER_OPTION}>{OTHER_OPTION}</option>
                                </select>
                                {selectedDropdownType === OTHER_OPTION && (
                                    <input type="text" value={customType} onChange={e => setCustomType(e.target.value)} placeholder="種別名を自由に入力..." className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" required disabled={readOnly} />
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">色</label>
                                <input
                                    type="color"
                                    value={color}
                                    onChange={e => setColor(e.target.value)}
                                    className="w-full h-10 p-1 bg-gray-900 border border-gray-600 rounded-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={readOnly || !isCustomColorAllowed}
                                    readOnly={readOnly}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">要約・説明</label>
                            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={5} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white resize-y" disabled={readOnly}></textarea>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-between items-center border-t border-gray-700 pt-4 flex-shrink-0">
                        <div>
                            {!readOnly && card?.id && (
                                isDeleting ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-red-300 font-bold">本当に削除？</span>
                                        <button type="button" onClick={handleDeleteConfirm} className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-500">はい</button>
                                        <button type="button" onClick={() => setIsDeleting(false)} className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-500">いいえ</button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setIsDeleting(true)} className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded hover:bg-red-900/30 transition">
                                        <Icons.TrashIcon className="h-4 w-4" />
                                        削除
                                    </button>
                                )
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={handleCloseRequest} className="flex items-center gap-2 px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500 transition text-white btn-pressable">
                                <Icons.XIcon className="h-4 w-4" />
                                {readOnly ? '閉じる' : 'キャンセル'}
                            </button>
                            {!readOnly && <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-cyan-600 rounded-md hover:bg-cyan-500 transition text-white btn-pressable">
                                <Icons.CheckIcon className="h-4 w-4" />
                                保存
                            </button>}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Relation Editor Drawer ---
const RelationEditorDrawer = ({ relation, plotItems, onSave, onClose, plotTypeColors }) => {
    const [label, setLabel] = useState('');
    const [customLabel, setCustomLabel] = useState('');
    const [memo, setMemo] = useState('');
    const [color, setColor] = useState('#6b7280');

    const presetRelations = {
        '原因': '#3b82f6', // blue-500
        '結果': '#22c55e', // green-500
        '伏線': '#8b5cf6', // violet-500
        '回収': '#a855f7', // purple-500
        '対立': '#ef4444', // red-500
        'その他': '#6b7280', // gray-500
    };
    const OTHER_OPTION = 'その他';

    useEffect(() => {
        if (relation) {
            const currentLabel = relation.label || '原因';
            if (presetRelations[currentLabel]) {
                setLabel(currentLabel);
                setCustomLabel('');
            } else {
                setLabel(OTHER_OPTION);
                setCustomLabel(currentLabel);
            }
            setMemo(relation.memo || '');
            setColor(relation.color || presetRelations[currentLabel] || '#6b7280');
        }
    }, [relation]);

    useEffect(() => {
        if (label !== OTHER_OPTION) {
            const newColor = presetRelations[label] || '#6b7280';
            setColor(newColor);
        }
    }, [label]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const finalLabel = label === OTHER_OPTION ? customLabel.trim() : label;
        if (!finalLabel) return;
        onSave({ ...relation, label: finalLabel, memo, color });
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
        }
    };

    const sourceItem = plotItems.find(i => i.id === relation?.source);
    const targetItem = plotItems.find(i => i.id === relation?.target);

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm border-t border-gray-700 p-4 z-10">
             <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-cyan-400">関係を編集</h2>
                    <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 btn-pressable"><Icons.XIcon className="h-5 w-5 text-white"/></button>
                </div>
                <div className="space-y-4">
                    <p className="text-sm bg-gray-900 p-3 rounded-md text-center">
                        <span className="font-semibold" style={{color: plotTypeColors[sourceItem?.type] || '#fff'}}>{sourceItem?.title}</span>
                        <span className="text-gray-400 mx-2 font-sans">→</span>
                        <span className="font-semibold" style={{color: plotTypeColors[targetItem?.type] || '#fff'}}>{targetItem?.title}</span>
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">関係性</label>
                            <select value={label} onChange={e => setLabel(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white h-10">
                                {Object.keys(presetRelations).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">線の色</label>
                            <input 
                                type="color" 
                                value={color} 
                                onChange={e => setColor(e.target.value)} 
                                className="w-full h-10 p-1 bg-gray-900 border border-gray-600 rounded-md cursor-pointer" 
                            />
                        </div>
                    </div>

                    {label === OTHER_OPTION && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">関係性を自由入力</label>
                            <input type="text" value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="関係性を入力..." className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" required />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">メモ (任意)</label>
                        <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white resize-y"></textarea>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500 transition text-white btn-pressable">
                        <Icons.XIcon className="h-4 w-4" />
                        キャンセル
                    </button>
                    <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-md hover:bg-indigo-500 transition text-white btn-pressable">
                        <Icons.CheckIcon className="h-4 w-4" />
                        保存
                    </button>
                </div>
            </form>
        </div>
    );
};


// --- Main Plot Board Modal ---
export const PlotBoardModal = ({ isOpen, onClose, onSave, plotItems, relations, nodePositions, plotTypeColors: initialColors, itemToEdit, isMobile = false }) => {
    const [items, setItems] = useState<PlotItem[]>([]);
    const [localRelations, setLocalRelations] = useState<PlotRelation[]>([]);
    const [positions, setPositions] = useState<{ [key: string]: { x: number, y: number } }>({});
    const [plotTypeColors, setPlotTypeColors] = useState({});
    const [editingCard, setEditingCard] = useState<PlotItem | {} | null>(null);
    const [editingRelation, setEditingRelation] = useState<PlotRelation | null>(null);
    const [mode, setMode] = useState<'navigate' | 'add_relation' | 'delete_relation'>('navigate');
    const [relationStart, setRelationStart] = useState<string | null>(null);
    const [activeDrag, setActiveDrag] = useState<{ nodeId: string, offsetX: number, offsetY: number } | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    const closeButtonRef = useRef(null);
    const [deletingCardId, setDeletingCardId] = useState<string | null>(null);

    const setHelpTopic = useStore(state => state.setHelpTopic);
    const createEventFromPlot = useStore(state => state.createEventFromPlot);
    const navigateToEvent = useStore(state => state.navigateToEvent);
    const userMode = useStore(state => state.userMode);

    const hasCompletedGlobalPlotBoardTutorial = useStore(state => state.hasCompletedGlobalPlotBoardTutorial);
    const startPlotBoardTutorial = useStore(state => state.startPlotBoardTutorial);

    useEffect(() => {
        if (isOpen && !hasCompletedGlobalPlotBoardTutorial) {
            const timer = setTimeout(() => {
                startPlotBoardTutorial();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, hasCompletedGlobalPlotBoardTutorial, startPlotBoardTutorial]);

    useEffect(() => {
        if (isOpen) {
            setItems(plotItems);
            setLocalRelations(relations || []);
            setPlotTypeColors(initialColors || {});

            const initialPositions = (nodePositions || []).reduce((acc, pos) => {
                acc[pos.plotId] = { x: pos.x, y: pos.y };
                return acc;
            }, {} as { [key: string]: { x: number, y: number } });
            
            plotItems.forEach((item, index) => {
                if (!initialPositions[item.id]) {
                    initialPositions[item.id] = { x: 100 + (index % 5) * 220, y: 100 + Math.floor(index / 5) * 160 };
                }
            });
            setPositions(initialPositions);
            setInitialStateString(JSON.stringify({
                items: plotItems,
                relations: relations || [],
                positions: initialPositions,
                colors: initialColors || {}
            }));

            if(itemToEdit) {
                 const card = plotItems.find(p => p.id === itemToEdit.id);
                 if (card) setEditingCard(card);
            }
        }
    }, [isOpen, plotItems, relations, nodePositions, initialColors, itemToEdit]);

    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        
        const initialData = JSON.parse(initialStateString);
        
        const normalizedCurrentState = {
            items,
            relations: localRelations,
            positions: Object.entries(positions).map(([plotId, pos]) => ({ plotId, x: (pos as any).x, y: (pos as any).y })),
            colors: plotTypeColors,
        };
        
        const normalizedInitialState = {
            items: initialData.items,
            relations: initialData.relations,
            positions: Object.entries(initialData.positions).map(([plotId, pos]) => ({ plotId, x: (pos as any).x, y: (pos as any).y })),
            colors: initialData.colors,
        };
        
        return JSON.stringify(normalizedCurrentState) !== JSON.stringify(normalizedInitialState);
    }, [items, localRelations, positions, plotTypeColors, initialStateString]);

    const handleSave = () => {
        const finalPositions = Object.entries(positions).map(([plotId, pos]) => ({ plotId, x: (pos as any).x, y: (pos as any).y }));
        onSave({ items, relations: localRelations, positions: finalPositions, colors: plotTypeColors });
        onClose();
    };

    const handleCloseRequest = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };
    
    const handleSaveAndClose = () => {
        handleSave();
        setIsConfirmCloseOpen(false);
    };

    const handleSaveCard = (card) => {
        const exists = items.some(i => i.id === card.id);
        if (exists) {
            setItems(items.map(i => i.id === card.id ? card : i));
        } else {
            setItems([...items, card]);
            setPositions(prev => ({...prev, [card.id]: {x: 120, y: 120}}));
        }
        setEditingCard(null);
    };
    
    const confirmDeleteCard = (cardId) => {
        setItems(items.filter(i => i.id !== cardId));
        setLocalRelations(localRelations.filter(r => r.source !== cardId && r.target !== cardId));
        setPositions(prev => {
            const newPositions = { ...prev };
            delete newPositions[cardId];
            return newPositions;
        });
        setDeletingCardId(null);
        if (editingCard && (editingCard as PlotItem).id === cardId) {
            setEditingCard(null);
        }
    };
    
    const handleDeleteClick = (e: React.MouseEvent, cardId: string) => {
        e.stopPropagation();
        setDeletingCardId(cardId);
    };

    const handleCancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeletingCardId(null);
    };
    
    const getSVGPoint = (e: React.MouseEvent) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const screenCTM = svg.getScreenCTM();
        if (screenCTM) {
            return pt.matrixTransform(screenCTM.inverse());
        }
        return { x: 0, y: 0 };
    };
    const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.preventDefault();
        if (mode !== 'navigate' || isMobile) return;
        const point = getSVGPoint(e);
        const nodePos = positions[nodeId];
        if (point && nodePos) {
            setActiveDrag({
                nodeId,
                offsetX: point.x - nodePos.x,
                offsetY: point.y - nodePos.y,
            });
        }
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!activeDrag) return;
        e.preventDefault();
        const point = getSVGPoint(e);
        if (point) {
            setPositions(prev => ({
                ...prev,
                [activeDrag.nodeId]: {
                    x: point.x - activeDrag.offsetX,
                    y: point.y - activeDrag.offsetY,
                }
            }));
        }
    };
    const handleMouseUp = (e: React.MouseEvent) => {
        setActiveDrag(null);
    };

    const handleCardClick = (card) => {
        if (mode === 'add_relation') {
            if (!relationStart) {
                setRelationStart(card.id);
            } else if (relationStart !== card.id) {
                const newRelation = {
                    id: uuidv4(),
                    source: relationStart,
                    target: card.id,
                    label: '原因',
                    memo: '',
                    color: '#3b82f6'
                };
                setLocalRelations(prev => [...prev, newRelation]);
                setEditingRelation(newRelation);
                setRelationStart(null);
                setMode('navigate');
            }
        }
    };
    
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[70] p-4">
            <PlotBoardTutorial />
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-gray-700 relative">
                <UnsavedChangesPopover
                    isOpen={isConfirmCloseOpen}
                    targetRef={closeButtonRef}
                    onCancel={() => setIsConfirmCloseOpen(false)}
                    onCloseWithoutSaving={() => { setIsConfirmCloseOpen(false); onClose(); }}
                    onSaveAndClose={handleSaveAndClose}
                />
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2"><Icons.ClipboardListIcon />プロットボード</h2>
                    <div className="flex items-center gap-4">
                        {!isMobile && (
                            <button id="tutorial-plotboard-add-card-btn" onClick={() => setEditingCard({})} className="px-4 py-2 text-sm bg-cyan-600 text-white rounded hover:bg-cyan-500 btn-pressable">新規カード作成</button>
                        )}
                        {!isMobile && (
                            <div className="flex items-center p-1 bg-gray-900 rounded-lg">
                                <button onClick={() => setMode('navigate')} className={`px-3 py-1 text-xs rounded ${mode === 'navigate' ? 'bg-indigo-600' : ''} text-white btn-pressable`}>移動</button>
                                <button id="tutorial-plotboard-add-relation-btn" onClick={() => setMode('add_relation')} className={`px-3 py-1 text-xs rounded ${mode === 'add_relation' ? 'bg-indigo-600' : ''} text-white btn-pressable`}>関係を追加</button>
                                <button onClick={() => setMode('delete_relation')} className={`px-3 py-1 text-xs rounded ${mode === 'delete_relation' ? 'bg-indigo-600' : ''} text-white btn-pressable`}>関係を削除</button>
                            </div>
                        )}
                        <button onClick={() => setHelpTopic('plotBoard')} className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition btn-pressable" title="ヘルプ">
                            <Icons.HelpCircleIcon className="h-5 w-5" />
                        </button>
                        <button ref={closeButtonRef} onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition text-white"><Icons.XIcon /></button>
                    </div>
                </div>
                <div 
                    id="tutorial-plotboard-canvas"
                    className="flex-grow p-4 relative bg-gray-900/50 overflow-auto min-h-0"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <svg ref={svgRef} width="2000" height="1500" style={{ position: 'absolute', top: 0, left: 0 }}>
                        {/* Render relations (lines) */}
                        {localRelations.map(rel => {
                             const sourcePos = positions[rel.source];
                             const targetPos = positions[rel.target];
                             if(!sourcePos || !targetPos) return null;
                             
                             const midX = (sourcePos.x + targetPos.x) / 2;
                             const midY = (sourcePos.y + targetPos.y) / 2;
                             const labelWidth = rel.label.length * 12 + 10;
                             const color = rel.color || '#6b7280';
                             const textColor = getContrastingTextColor(color);
                             
                             return (
                                 <g key={rel.id} 
                                    onClick={() => {
                                        if (isMobile) return;
                                        mode === 'delete_relation' ? setLocalRelations(prev => prev.filter(r => r.id !== rel.id)) : setEditingRelation(rel)
                                    }} 
                                    className={isMobile ? "" : "cursor-pointer"}
                                 >
                                     <line x1={sourcePos.x} y1={sourcePos.y} x2={targetPos.x} y2={targetPos.y} stroke={color} strokeWidth="2" />
                                     <rect x={midX - labelWidth/2} y={midY - 10} width={labelWidth} height={20} fill={color} rx="4" />
                                     <text x={midX} y={midY} fill={textColor} fontSize="12" textAnchor="middle" dy=".3em">{rel.label}</text>
                                 </g>
                             )
                        })}
                    </svg>
                     {/* Render items (cards) */}
                    {items.map(item => {
                        const pos = positions[item.id] || {x: 50, y: 50};
                        const color = plotTypeColors[item.type] || '#6b7280';
                        return (
                            <div key={item.id}
                                 style={{ 
                                     position: 'absolute', 
                                     top: `${pos.y}px`, 
                                     left: `${pos.x}px`, 
                                     transform: 'translate(-50%, -50%)',
                                     borderTop: `4px solid ${color}` 
                                 }}
                                 className={`w-48 bg-gray-800 rounded-lg shadow-lg p-3 ${(mode === 'navigate' && !isMobile) ? 'cursor-grab' : 'cursor-pointer'} ${relationStart === item.id ? 'ring-2 ring-blue-500' : ''} ${deletingCardId === item.id ? 'bg-red-900/30 border border-red-500' : ''}`}
                                 onMouseDown={(e) => handleMouseDown(e, item.id)}
                                 onClick={() => handleCardClick(item)}
                            >
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-sm mb-1 truncate" style={{color}}>{item.title}</h4>
                                    <div className="flex gap-1 items-center flex-shrink-0">
                                        {deletingCardId === item.id ? (
                                            <div className="flex gap-1 bg-gray-900/90 rounded p-1 absolute top-0 right-0 z-10 shadow-xl">
                                                <button onClick={(e) => { e.stopPropagation(); confirmDeleteCard(item.id); }} className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-500">はい</button>
                                                <button onClick={handleCancelDelete} className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500">いいえ</button>
                                            </div>
                                        ) : (
                                            <>
                                                {!isMobile && !item.linkedEventId && userMode !== 'simple' && (
                                                    <button onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        const finalPositions = Object.entries(positions).map(([plotId, pos]) => ({ plotId, x: (pos as any).x, y: (pos as any).y }));
                                                        createEventFromPlot(item.id, { items, relations: localRelations, positions: finalPositions, colors: plotTypeColors }); 
                                                    }} className="p-1 text-gray-400 hover:text-green-400 btn-pressable" title="タイムラインへ送る">
                                                        <Icons.GitBranchIcon className="h-4 w-4 transform -rotate-90" />
                                                    </button>
                                                )}
                                                {item.linkedEventId && (
                                                    <button onClick={(e) => { e.stopPropagation(); navigateToEvent(item.linkedEventId); }} className="p-1 text-gray-400 hover:text-blue-400 btn-pressable" title="関連イベントへ移動">
                                                        <Icons.ExternalLinkIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                                <button onClick={(e)=>{e.stopPropagation(); setEditingCard(item)}} className="p-1 text-gray-400 hover:text-yellow-400 btn-pressable" title="編集"><Icons.EditIcon className="h-3 w-3"/></button>
                                                {!isMobile && <button onClick={(e) => handleDeleteClick(e, item.id)} className="p-1 text-gray-400 hover:text-red-400 btn-pressable" title="削除"><Icons.TrashIcon className="h-3 w-3"/></button>}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 line-clamp-3">{item.summary}</p>
                            </div>
                        )
                    })}
                </div>
                <div className="flex justify-between items-center p-4 border-t border-gray-700 flex-shrink-0">
                    <div>
                        {isMobile && <span className="text-xs text-orange-400 font-bold px-2 py-0.5 border border-orange-400 rounded">閲覧専用モード</span>}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={handleCloseRequest} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition btn-pressable">
                            <Icons.XIcon className="h-4 w-4" />
                            {isMobile ? '閉じる' : 'キャンセル'}
                        </button>
                        {!isMobile && <button id="tutorial-plotboard-save-btn" type="button" onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition btn-pressable">
                            <Icons.CheckIcon className="h-4 w-4" />
                            保存
                        </button>}
                    </div>
                </div>
                {editingRelation && <RelationEditorDrawer relation={editingRelation} plotItems={items} plotTypeColors={plotTypeColors} onClose={() => setEditingRelation(null)} onSave={(rel) => { setLocalRelations(prev => prev.map(r => r.id === rel.id ? rel : r)); setEditingRelation(null); }} />}
            </div>
            {editingCard && <CardEditorModal card={editingCard as PlotItem} onSave={handleSaveCard} onDelete={confirmDeleteCard} onClose={() => setEditingCard(null)} plotTypeColors={plotTypeColors} onUpdateColor={(type, color) => setPlotTypeColors(prev => ({...prev, [type]: color}))} readOnly={isMobile} />}
        </div>,
        document.body
    );
};
