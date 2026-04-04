
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from '../icons';
import { TimelineEvent, TimelineLane, SettingItem, PlotItem } from '../types';
import { getContrastingTextColor } from '../utils';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';
import { useStore } from '../store/index';
import { TimelineTutorial } from './TimelineTutorial';
import { EventForm } from './modals/EventForm';
import { LaneForm } from './modals/LaneForm';


// --- Event Editor Form ---

export const TimelineModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    timeline: TimelineEvent[];
    lanes: TimelineLane[];
    allSettings: SettingItem[];
    plotBoard: PlotItem[];
    onSave: (timeline: TimelineEvent[], lanes: TimelineLane[]) => void;
    isMobile?: boolean;
}> = ({ isOpen, onClose, timeline, lanes, allSettings, plotBoard, onSave, isMobile = false }) => {
    const [localTimeline, setLocalTimeline] = useState<TimelineEvent[]>([]);
    const [localLanes, setLocalLanes] = useState<TimelineLane[]>([]);
    const [editingEvent, setEditingEvent] = useState<Partial<TimelineEvent> | null>(null);
    const [editingLane, setEditingLane] = useState<TimelineLane | null>(null);
    const [isAddingLane, setIsAddingLane] = useState(false);
    const [draggedItem, setDraggedItem] = useState<{ eventId: string; sourceLaneId: string } | null>(null);
    const [dragOverInfo, setDragOverInfo] = useState<{ eventId: string; position: 'top' | 'bottom' } | null>(null);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    const closeButtonRef = useRef(null);
    const setHelpTopic = useStore(state => state.setHelpTopic);
    const highlightedEventId = useStore(state => state.highlightedEventId);
    const setHighlightedEventId = useStore(state => state.setHighlightedEventId);
    const navigateToPlot = useStore(state => state.navigateToPlot);
    const eventsContainerRef = useRef<HTMLDivElement>(null);


    const hasCompletedGlobalTimelineTutorial = useStore(state => state.hasCompletedGlobalTimelineTutorial);
    const startTimelineTutorial = useStore(state => state.startTimelineTutorial);

    useEffect(() => {
        if (isOpen && !hasCompletedGlobalTimelineTutorial && !isMobile) {
            const timer = setTimeout(() => {
                startTimelineTutorial();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, hasCompletedGlobalTimelineTutorial, startTimelineTutorial, isMobile]);

    useEffect(() => {
        if (highlightedEventId && eventsContainerRef.current) {
            const eventElement = eventsContainerRef.current.querySelector(`#event-${highlightedEventId}`);
            if (eventElement) {
                eventElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                // ハイライトはCSSアニメーションで対応し、IDリセットで再トリガー
                setTimeout(() => {
                    setHighlightedEventId(null);
                }, 2500); // アニメーション時間より少し長く
            } else {
                setHighlightedEventId(null); // 見つからなかったらクリア
            }
        }
    }, [highlightedEventId, isOpen]);


    useEffect(() => {
        if (isOpen) {
            const initialLanes = lanes?.length > 0 ? [...lanes] : [{ id: uuidv4(), name: 'メインストーリー', color: '#6b7280' }];
            const initialTimeline = timeline || [];
            setLocalTimeline([...initialTimeline]);
            setLocalLanes(initialLanes);
            setInitialStateString(JSON.stringify({ timeline: initialTimeline, lanes: initialLanes }));
        }
    }, [isOpen, timeline, lanes]);

    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        const currentState = {
            timeline: localTimeline,
            lanes: localLanes,
        };
        return JSON.stringify(currentState) !== initialStateString;
    }, [localTimeline, localLanes, initialStateString]);

    const locationMap = useMemo(() => {
        if (!allSettings) return new Map();
        return new Map(allSettings.map(item => [item.id, item.name]));
    }, [allSettings]);

    const handleSave = () => {
        onSave(localTimeline, localLanes);
        onClose();
    };
    
    const handleCloseRequest = () => {
        if (isDirty && !isMobile) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };

    const handleSaveAndClose = () => {
        handleSave();
        setIsConfirmCloseOpen(false);
    };
    
    // Lane handlers
    const handleSaveLane = (laneToSave: TimelineLane) => {
        const exists = localLanes.some(l => l.id === laneToSave.id);
        if (exists) {
            setLocalLanes(localLanes.map(l => l.id === laneToSave.id ? laneToSave : l));
        } else {
            setLocalLanes([...localLanes, laneToSave]);
        }
        setEditingLane(null);
        setIsAddingLane(false);
    };

    const handleDeleteLane = (laneId: string) => {
        if (window.confirm('このレーンを削除しますか？レーン内のすべてのイベントも削除されます。')) {
            setLocalLanes(localLanes.filter(l => l.id !== laneId));
            setLocalTimeline(localTimeline.filter(e => e.laneId !== laneId));
        }
    };
    
    // Event handlers
    const handleSaveEvent = (eventToSave: TimelineEvent) => {
        const exists = localTimeline.some(e => e.id === eventToSave.id);
        if (exists) {
            setLocalTimeline(localTimeline.map(e => e.id === eventToSave.id ? eventToSave : e));
        } else {
            setLocalTimeline([...localTimeline, eventToSave]);
        }
        setEditingEvent(null);
    };

    const handleDeleteEvent = (eventId: string) => {
        setLocalTimeline(localTimeline.filter(e => e.id !== eventId));
    };

    // Drag and Drop handlers
    const handleDragStart = (e: React.DragEvent, eventId: string, sourceLaneId: string) => {
        if (isMobile) return;
        setDraggedItem({ eventId, sourceLaneId });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (isMobile) return;
        e.preventDefault();
    };
    
    const handleDragEnter = (e: React.DragEvent, targetEventId: string) => {
        if (isMobile) return;
        e.preventDefault();
        e.stopPropagation();
        if (!draggedItem || draggedItem.eventId === targetEventId) return;
        const targetElement = (e.currentTarget as HTMLElement);
        if (!targetElement) return;
        const rect = targetElement.getBoundingClientRect();
        const isTopHalf = e.clientY < rect.top + rect.height / 2;
        setDragOverInfo({ eventId: targetEventId, position: isTopHalf ? 'top' : 'bottom' });
    };
    
    const handleDragLeave = (e: React.DragEvent) => {
        if (isMobile) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOverInfo(null);
    };

    const handleDragEnd = () => {
        if (isMobile) return;
        setDraggedItem(null);
        setDragOverInfo(null);
    };

    const handleDrop = (e: React.DragEvent, targetLaneId: string) => {
        if (isMobile) return;
        e.preventDefault();
        e.stopPropagation();

        if (!draggedItem) return;

        const { eventId: draggedEventId } = draggedItem;
        const draggedEvent = localTimeline.find(event => event.id === draggedEventId);
        if (!draggedEvent) return;

        const newTimeline = localTimeline.filter(event => event.id !== draggedEventId);
        const updatedDraggedEvent = { ...draggedEvent, laneId: targetLaneId };

        if (dragOverInfo) {
            const targetIndex = newTimeline.findIndex(event => event.id === dragOverInfo.eventId);
            if (targetIndex !== -1) {
                const insertIndex = dragOverInfo.position === 'top' ? targetIndex : targetIndex + 1;
                newTimeline.splice(insertIndex, 0, updatedDraggedEvent);
            } else {
                newTimeline.push(updatedDraggedEvent);
            }
        } else {
            let lastEventInLaneIndex = -1;
            for (let i = newTimeline.length - 1; i >= 0; i--) {
                if (newTimeline[i].laneId === targetLaneId) {
                    lastEventInLaneIndex = i;
                    break;
                }
            }
            newTimeline.splice(lastEventInLaneIndex + 1, 0, updatedDraggedEvent);
        }
        setLocalTimeline(newTimeline);
        handleDragEnd(); // Reset dragging state
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[70] p-4">
            {!isMobile && <TimelineTutorial />}
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col border border-gray-700">
                <UnsavedChangesPopover
                    isOpen={isConfirmCloseOpen}
                    targetRef={closeButtonRef}
                    onCancel={() => setIsConfirmCloseOpen(false)}
                    onCloseWithoutSaving={() => { setIsConfirmCloseOpen(false); onClose(); }}
                    onSaveAndClose={handleSaveAndClose}
                />
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-orange-400 flex items-center gap-2"><Icons.ClockIcon />タイムライン</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setHelpTopic('timeline')} className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition btn-pressable" title="ヘルプ">
                            <Icons.HelpCircleIcon className="h-5 w-5" />
                        </button>
                        <button ref={closeButtonRef} type="button" onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition btn-pressable"><Icons.XIcon /></button>
                    </div>
                </div>
                <div id="tutorial-timeline-board" ref={eventsContainerRef} className="flex-grow p-4 overflow-x-auto overflow-y-hidden min-h-0">
                    <div className="flex gap-4 min-h-full">
                        {localLanes.map((lane, laneIndex) => (
                            <div key={lane.id} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, lane.id)} className="w-72 bg-gray-900/50 rounded-lg flex-shrink-0 flex flex-col">
                                <div className="p-2 border-b border-gray-700 flex justify-between items-center" style={{ backgroundColor: lane.color }}>
                                    <h3 className="font-bold text-sm" style={{ color: getContrastingTextColor(lane.color) }}>{lane.name}</h3>
                                    {!isMobile && (
                                        <div className="flex gap-1">
                                            <button onClick={() => setEditingLane(lane)} className="p-1 rounded hover:bg-black/20 btn-pressable" style={{ color: getContrastingTextColor(lane.color) }}><Icons.EditIcon className="h-3 w-3"/></button>
                                            <button onClick={() => handleDeleteLane(lane.id)} className="p-1 rounded hover:bg-black/20 btn-pressable" style={{ color: getContrastingTextColor(lane.color) }}><Icons.TrashIcon className="h-3 w-3"/></button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-grow p-2 overflow-y-auto">
                                    {localTimeline.filter(e => e.laneId === lane.id).map(event => (
                                        <div 
                                            id={`event-${event.id}`}
                                            key={event.id}
                                            draggable={!isMobile}
                                            onDragStart={(e) => handleDragStart(e, event.id, lane.id)}
                                            onDragEnter={(e) => handleDragEnter(e, event.id)}
                                            onDragLeave={handleDragLeave}
                                            onDragEnd={handleDragEnd}
                                            className={`timeline-event-wrapper my-1 ${draggedItem?.eventId === event.id ? 'dragging' : ''} ${dragOverInfo?.eventId === event.id ? (dragOverInfo.position === 'top' ? 'drag-over-top' : 'drag-over-bottom') : ''} ${highlightedEventId === event.id ? 'highlight-chunk' : ''} ${isMobile ? '' : 'cursor-grab'}`}
                                        >
                                            <div className={`bg-gray-800 p-3 rounded-md ${isMobile ? '' : 'cursor-grab'}`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-semibold text-sm text-white">{event.title}</p>
                                                        <p className="text-xs text-gray-400">{event.timestamp}</p>
                                                    </div>
                                                    {!isMobile && (
                                                        <div className="flex gap-1">
                                                            {event.linkedPlotId && plotBoard.find(p => p.id === event.linkedPlotId) && (
                                                                <button onClick={() => {
                                                                    const plot = plotBoard.find(p => p.id === event.linkedPlotId);
                                                                    if (plot) navigateToPlot(plot);
                                                                }} className="p-1 text-gray-400 hover:text-cyan-400 btn-pressable" title="プロットへ移動">
                                                                    <Icons.ExternalLinkIcon className="h-3 w-3"/>
                                                                </button>
                                                            )}
                                                            <button onClick={() => setEditingEvent(event)} className="p-1 text-gray-400 hover:text-yellow-400 btn-pressable"><Icons.EditIcon className="h-3 w-3"/></button>
                                                            <button onClick={() => handleDeleteEvent(event.id)} className="p-1 text-gray-400 hover:text-red-400 btn-pressable"><Icons.TrashIcon className="h-3 w-3"/></button>
                                                        </div>
                                                    )}
                                                </div>
                                                {(event.locationId || event.customLocationName) && (
                                                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                        <Icons.MapPinIcon className="h-3 w-3" />
                                                        {locationMap.get(event.locationId) || event.customLocationName || '不明な場所'}
                                                    </p>
                                                )}
                                                <p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap">{event.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {editingLane?.id === lane.id && <LaneForm lane={editingLane} onSave={handleSaveLane} onCancel={() => setEditingLane(null)} />}
                                     {!isMobile && (
                                         <button 
                                            id={laneIndex === 0 ? 'tutorial-timeline-add-event-btn' : undefined}
                                            onClick={() => setEditingEvent({ laneId: lane.id })}
                                            className="w-full mt-2 text-center text-sm text-gray-400 hover:text-white border-2 border-dashed border-gray-600 rounded-lg py-2 transition btn-pressable"
                                        >
                                            + 新規イベントを作成
                                        </button>
                                     )}
                                </div>
                            </div>
                        ))}
                         {!isMobile && (
                             <div className="w-72 flex-shrink-0">
                                {isAddingLane || editingLane ? (
                                    <LaneForm lane={editingLane} onSave={handleSaveLane} onCancel={() => { setIsAddingLane(false); setEditingLane(null); }} />
                                ) : (
                                    <button id="tutorial-timeline-add-lane-btn" onClick={() => setIsAddingLane(true)} className="w-full h-10 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:bg-gray-700/50 hover:text-white transition btn-pressable">
                                        + 新しいレーンを追加
                                    </button>
                                )}
                            </div>
                         )}
                    </div>
                </div>
                <div className="flex justify-between items-center p-4 border-t border-gray-700">
                    <div>
                        {isMobile && <span className="text-xs text-orange-400 font-bold px-2 py-0.5 border border-orange-400 rounded">閲覧専用モード</span>}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={handleCloseRequest} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition btn-pressable">
                            <Icons.XIcon className="h-4 w-4" />
                            {isMobile ? '閉じる' : 'キャンセル'}
                        </button>
                        {!isMobile && <button id="tutorial-timeline-save-btn" type="button" onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition btn-pressable">
                            <Icons.CheckIcon className="h-4 w-4" />
                            保存
                        </button>}
                    </div>
                </div>
                {(!!editingEvent) && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[80]">
                        <EventForm event={editingEvent as TimelineEvent} onSave={handleSaveEvent} onCancel={() => { setEditingEvent(null); }} lanes={localLanes} allSettings={allSettings} />
                    </div>
                )}
            </div>
        </div>
    );
};
