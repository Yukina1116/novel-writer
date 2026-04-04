import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from '../../icons';
import { TimelineEvent, TimelineLane, SettingItem } from '../../types';
import { useStore } from '../../store/index';
import { UnsavedChangesPopover } from '../UnsavedChangesPopover';

interface EventFormProps {
    event?: TimelineEvent | null;
    onSave: (event: TimelineEvent) => void;
    onCancel: () => void;
    lanes: TimelineLane[];
    allSettings: SettingItem[];
}

export const EventForm: React.FC<EventFormProps> = ({ event, onSave, onCancel, lanes, allSettings }) => {
    const [title, setTitle] = useState(event ? event.title : '');
    const [timestamp, setTimestamp] = useState(event ? event.timestamp : '');
    const [description, setDescription] = useState(event ? event.description : '');
    const [laneId, setLaneId] = useState(event ? event.laneId : (lanes[0]?.id || ''));
    const [locationId, setLocationId] = useState(event ? event.locationId : '');
    const [customLocationName, setCustomLocationName] = useState(event ? event.customLocationName || '' : '');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const closeButtonRef = React.useRef(null);

    const isDirty = useMemo(() => {
        return title !== (event?.title || '') ||
            timestamp !== (event?.timestamp || '') ||
            description !== (event?.description || '') ||
            laneId !== (event?.laneId || (lanes[0]?.id || '')) ||
            locationId !== (event?.locationId || '') ||
            customLocationName !== (event?.customLocationName || '');
    }, [title, timestamp, description, laneId, locationId, customLocationName, event, lanes]);

    const handleCancel = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onCancel();
        }
    };

    const createPlotFromEvent = useStore(state => state.createPlotFromEvent);
    const navigateToPlot = useStore(state => state.navigateToPlot);
    const plotBoard = useStore(state => state.allProjectsData[state.activeProjectId]?.plotBoard || []);

    const locationOptions = useMemo(() => {
        if (!allSettings) return [];
        const organizationTypes = ['国家', 'ギルド', '秘密結社', '企業'];
        const organizationIds = new Set(
            allSettings
                .filter(item => 
                    item.type === 'world' &&
                    item.fields?.some(f => f.key === '種別' && organizationTypes.includes(f.value))
                )
                .map(item => item.id)
        );
        return allSettings.filter(item => item.type === 'world' && !organizationIds.has(item.id));
    }, [allSettings]);

    const handleAddLocation = () => {
        const name = customLocationName.trim();
        if (!name) return;
        const { setActiveProjectData, allProjectsData, activeProjectId } = useStore.getState();
        const settings = allProjectsData[activeProjectId].settings;
        const alreadyExists = settings.some(s => s.type === 'world' && s.name === name);
    
        if (alreadyExists) {
            alert('この名前の世界観設定は既に存在します。');
            const existing = settings.find(s => s.type === 'world' && s.name === name);
            if(existing) setLocationId(existing.id);
            return;
        }
    
        const newWorldSetting: SettingItem = { id: uuidv4(), name, type: 'world', fields: [] };
        setActiveProjectData(d => ({...d, settings: [...d.settings, newWorldSetting]}));
        setLocationId(newWorldSetting.id);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !timestamp.trim()) return;
        
        let finalLocationId = locationId;
        let finalCustomLocationName = customLocationName;

        if (locationId === 'その他') {
            finalLocationId = '';
        } else {
            finalCustomLocationName = '';
        }

        onSave({ ...event, id: event?.id || uuidv4(), title, timestamp, description, laneId, locationId: finalLocationId, customLocationName: finalCustomLocationName, lastModified: Date.now() } as TimelineEvent);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
        }
    };
    
    const handleLocationSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setLocationId(value);
        if (value !== 'その他') {
            setCustomLocationName('');
        }
    };

    const locationSelectValue = (customLocationName && !locationId) || locationId === 'その他' ? 'その他' : (locationId || '');

    return (
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="bg-gray-700/80 p-4 rounded-lg space-y-4 my-2 max-h-[90vh] overflow-y-auto relative">
            <UnsavedChangesPopover isOpen={isConfirmCloseOpen} targetRef={closeButtonRef} onCancel={() => setIsConfirmCloseOpen(false)} onCloseWithoutSaving={onCancel} onSaveAndClose={() => { handleSubmit({ preventDefault: () => {} } as any); }} />
            <h3 className="text-lg font-semibold text-white">{event?.id ? 'イベントを編集' : '新しいイベントを追加'}</h3>
            <div><label className="block text-sm text-gray-300 mb-1">タイトル <span className="text-red-500">*</span></label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-900 border-gray-600 rounded px-3 py-2 text-sm" required /></div>
            <div><label className="block text-sm text-gray-300 mb-1">時期 <span className="text-red-500">*</span></label><input type="text" value={timestamp} onChange={e => setTimestamp(e.target.value)} className="w-full bg-gray-900 border-gray-600 rounded px-3 py-2 text-sm" required /></div>
            <div>
                <label className="block text-sm text-gray-300 mb-1">発生場所</label>
                <div className="flex gap-2">
                    <select value={locationSelectValue} onChange={handleLocationSelectChange} className={`bg-gray-900 border-gray-600 rounded px-3 py-2 text-sm text-white ${locationSelectValue === 'その他' ? 'flex-grow' : 'w-full'}`}>
                        <option value="">未設定</option>
                        {locationOptions.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                        <option value="その他">その他（自由記入）</option>
                    </select>
                    {locationSelectValue === 'その他' && (
                        <div className="flex-grow flex gap-2">
                             <input
                                type="text"
                                value={customLocationName || ''}
                                onChange={e => {
                                    setCustomLocationName(e.target.value);
                                    if (locationId !== 'その他') {
                                        setLocationId('その他');
                                    }
                                }}
                                placeholder="発生場所を自由入力"
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                                autoFocus
                            />
                            <button type="button" onClick={handleAddLocation} className="p-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition btn-pressable flex-shrink-0" title="この場所を世界観設定に追加">
                                <Icons.PlusCircleIcon className="h-5 w-5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div><label className="block text-sm text-gray-300 mb-1">レーン</label><select value={laneId} onChange={e => setLaneId(e.target.value)} className="w-full bg-gray-900 border-gray-600 rounded px-3 py-2 text-sm">{lanes.map(lane => <option key={lane.id} value={lane.id}>{lane.name}</option>)}</select></div>
            <div><label className="block text-sm text-gray-300 mb-1">詳細</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full bg-gray-900 border-gray-600 rounded px-3 py-2 text-sm resize-y"></textarea></div>
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-600">
                <div>
                    {event?.id && !event.linkedPlotId && (
                        <button type="button" onClick={() => { createPlotFromEvent(event.id); onCancel(); }} className="px-3 py-2 text-sm rounded-md btn-pressable btn-invert-cyan">
                            プロットカードを作成
                        </button>
                    )}
                    {event?.linkedPlotId && (
                        <button type="button" onClick={() => {
                            const plot = plotBoard.find(p => p.id === event.linkedPlotId);
                            if (plot) {
                                navigateToPlot(plot);
                                onCancel();
                            }
                        }} className="px-3 py-2 text-sm rounded-md btn-pressable btn-invert-gray flex items-center gap-2">
                            <Icons.ExternalLinkIcon className="h-4 w-4" />
                            関連プロットを開く
                        </button>
                    )}
                </div>
                <div className="flex gap-3">
                    <button type="button" ref={closeButtonRef} onClick={handleCancel} className="flex items-center gap-2 px-4 py-2 bg-gray-600 rounded hover:bg-gray-500 text-sm btn-pressable">
                        <Icons.XIcon className="h-4 w-4" />
                        キャンセル
                    </button>
                    <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-500 text-sm btn-pressable">
                        <Icons.CheckIcon className="h-4 w-4" />
                        保存
                    </button>
                </div>
            </div>
        </form>
    );
};
