import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from '../../icons';
import { SettingItem } from '../../types';
import { UnsavedChangesPopover } from '../UnsavedChangesPopover';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/index';
import { HelpPopover } from '../HelpPopover';
import { compressImage } from '../../utils';

const worldTemplates = {
    place: { 
        name: '場所', 
        fields: [
            { key: '種別', value: '都市', type: 'select', options: ['都市', '国', '森', '遺跡', '建物', 'その他'] },
            { key: '所属地域', value: '', type: 'text', placeholder: '例：〇〇大陸、△△王国' },
            { key: '気候・風土', value: '', type: 'text', placeholder: '例：標高の高い地域で、寒冷な気候' },
            { key: '主要な産業・文化', value: '', type: 'textarea', placeholder: '例：魔法具の生産が盛ん、芸術の都' },
            { key: '主要な人物', value: '', type: 'text', placeholder: '例：市長、長老' },
        ] 
    },
    organization: { 
        name: '組織', 
        fields: [
            { key: '種別', value: 'ギルド', type: 'select', options: ['国家', 'ギルド', '秘密結社', '企業', 'その他'] },
            { key: '本拠地', value: '', type: 'text', placeholder: '例：王都アストリア' },
            { key: 'リーダー', value: '', type: 'text', placeholder: '例：ギルドマスター・ゴードン' },
            { key: '目的・理念', value: '', type: 'textarea', placeholder: '例：世界の平和維持、利益の追求' },
            { key: '活動内容', value: '', type: 'textarea', placeholder: '例：冒険者への依頼仲介、古代遺物の研究' },
        ] 
    },
    magic_tech: {
        name: '魔法・技術',
        fields: [
            { key: '種別', value: '魔法', type: 'select', options: ['魔法', '科学技術', '超能力', 'その他'] },
            { key: '原理・法則', value: '', type: 'textarea', placeholder: '例：マナを消費する、古代文明の遺物を利用' },
            { key: '使用者', value: '', type: 'text', placeholder: '例：王家の血筋のみ、訓練を受けた者' },
            { key: '制約・代償', value: '', type: 'textarea', placeholder: '例：生命力を削る、暴走の危険がある' },
            { key: '主な効果', value: '', type: 'textarea', placeholder: '例：元素操作、時間跳躍' },
        ] 
    },
    event: {
        name: '歴史上の出来事',
        fields: [
            { key: '種別', value: '戦争', type: 'select', options: ['戦争', '大災害', '革命', '重大な発見', 'その他'] },
            { key: '発生時期', value: '', type: 'text', placeholder: '例：王国歴345年、約1000年前' },
            { key: '主要な関係者', value: '', type: 'text', placeholder: '例：光の勇者と闇の魔王、〇〇帝国' },
            { key: '後世への影響', value: '', type: 'textarea', placeholder: '例：王家が交代した、禁断の技術として封印された' },
        ] 
    },
    item: {
        name: '重要アイテム',
        fields: [
            { key: '種別', value: '武器', type: 'select', options: ['武器', '防具', '道具', '秘宝', 'その他'] },
            { key: '由来・来歴', value: '', type: 'textarea', placeholder: '例：古代の鍛冶師が作った、神から授かった' },
            { key: '所有者', value: '', type: 'text', placeholder: '例：主人公、王家、敵のボス' },
            { key: '能力・効果', value: '', type: 'textarea', placeholder: '例：あらゆるものを切り裂く、持ち主の願いを叶える' },
        ] 
    }
};

type Field = { id: string; key: string; value: string; groupKey: string; groupName: string };

const MapViewerModal = ({ imageUrl, onClose }) => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex justify-center items-center z-[90]" onClick={onClose}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/80 z-10">
            <Icons.XIcon />
        </button>
        <img src={imageUrl} alt="Map full view" className="max-w-full max-h-full object-contain" />
    </div>
);


interface WorldFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: any) => void;
    itemToEdit: SettingItem | null;
    allSettings: SettingItem[];
    onOpenWorldGenModal: (data: Partial<SettingItem> | null) => void;
    onShowHelp: () => void;
    isMobile?: boolean;
}

const fieldKeyToTemplateMap = new Map<string, { key: string, name: string }>();
Object.entries(worldTemplates).forEach(([templateKey, template]) => {
    template.fields.forEach(field => {
        fieldKeyToTemplateMap.set(field.key, { key: templateKey, name: template.name });
    });
});

const initialEmptyWorldState: Partial<SettingItem> = {
    name: '',
    fields: [],
    longDescription: '',
    memo: '',
    exportDescription: '',
    mapImageUrl: '',
};

export const WorldForm: React.FC<WorldFormProps> = ({
    isOpen,
    onClose,
    onSave,
    itemToEdit,
    onOpenWorldGenModal,
    onShowHelp,
    isMobile = false,
}) => {
    const [name, setName] = useState('');
    const [fields, setFields] = useState<Field[]>([]);
    const [longDescription, setLongDescription] = useState('');
    const [memo, setMemo] = useState('');
    const [exportDescription, setExportDescription] = useState('');
    const [mapImageUrl, setMapImageUrl] = useState('');

    const [activeTab, setActiveTab] = useState('profile');
    const [isMapViewerOpen, setIsMapViewerOpen] = useState(false);
    
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    const closeButtonRef = useRef(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    
    const [isAiAssistantHelpOpen, setIsAiAssistantHelpOpen] = useState(false);
    const aiAssistantHelpRef = useRef(null);

    // 編集済みフラグ管理
    const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
    
    const worldFormData = useStore(useShallow(state => state.worldFormData));
    const resetFormData = useStore(state => state.resetFormData);

    // データの正規化を行う関数（比較とスナップショット用）
    const getNormalizedData = useCallback((data: any) => {
        return {
            name: data?.name || '',
            fields: (data?.fields || []).map((f: any) => ({
                key: f.key || '',
                value: f.value || ''
            })),
            longDescription: data?.longDescription || '',
            memo: data?.memo || '',
            exportDescription: data?.exportDescription || '',
            mapImageUrl: data?.mapImageUrl || '',
        };
    }, []);

    const populateState = (data) => {
        const safeData = data || initialEmptyWorldState;
        setName(safeData.name || '');
        setLongDescription(safeData.longDescription || '');
        setMemo(safeData.memo || '');
        setExportDescription(safeData.exportDescription || '');
        setMapImageUrl(safeData.mapImageUrl || '');

        if (safeData.fields) {
            const initialFields = (safeData.fields || []).map(f => {
                const templateInfo = fieldKeyToTemplateMap.get(f.key);
                return { 
                    ...f, 
                    id: uuidv4(),
                    groupKey: templateInfo?.key || 'custom',
                    groupName: templateInfo?.name || 'カスタム項目'
                };
            });
            setFields(initialFields);

            const initialExpanded = initialFields.reduce((acc, field) => {
                acc[field.groupKey] = true;
                return acc;
            }, {});
            setExpandedGroups(initialExpanded);
        } else {
            setFields([]);
            setExpandedGroups({});
        }
    };

    useEffect(() => {
        if (Object.keys(worldFormData).length > 0) {
            const currentData = getCurrentState();
            const mergedData = { ...currentData, ...worldFormData };
            populateState(mergedData);
        }
    }, [worldFormData]);
    
    const getCurrentState = useCallback(() => {
        return getNormalizedData({
            name,
            fields,
            longDescription,
            memo,
            exportDescription,
            mapImageUrl
        });
    }, [name, fields, longDescription, memo, exportDescription, mapImageUrl, getNormalizedData]);
    
    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        const currentStateString = JSON.stringify(getCurrentState());
        return currentStateString !== initialStateString;
    }, [getCurrentState, initialStateString]);

    useEffect(() => {
        if (isOpen) {
            // itemToEditがnullまたは空オブジェクト（初期状態）の場合は新規作成とみなす
            const hasDataToEdit = itemToEdit && (itemToEdit.id || Object.keys(itemToEdit).length > 0);
            
            if (hasDataToEdit) {
                populateState(itemToEdit);
                useStore.getState().setFormData('world', itemToEdit);
                setInitialStateString(JSON.stringify(getNormalizedData(itemToEdit)));
            } else {
                resetFormData('world'); // ストアにある前回の残骸を消す
                populateState(initialEmptyWorldState);
                setInitialStateString(JSON.stringify(getNormalizedData(initialEmptyWorldState)));
            }
            
            setEditedFields(new Set());
            setActiveTab('profile');
        }
    }, [isOpen, itemToEdit, resetFormData, getNormalizedData]);
    
    const handleAddField = (groupKey = 'custom', groupName = 'カスタム項目') => {
        const newField: Field = { id: uuidv4(), key: '', value: '', groupKey, groupName };
        setFields([...fields, newField]);
    };

    const handleRemoveField = (id: string) => setFields(fields.filter(f => f.id !== id));
    const handleFieldChange = (id: string, prop: 'key' | 'value', value: string) => {
        setFields(fields.map(f => f.id === id ? { ...f, [prop]: value } : f));
        markEdited('fields');
    };

    const markEdited = (fieldKey: string) => {
        setEditedFields(prev => new Set(prev).add(fieldKey));
    };

    const handleApplyTemplate = (templateKey: keyof typeof worldTemplates) => {
        const templateExists = fields.some(f => f.groupKey === templateKey);
        if (templateExists) return; 

        const template = worldTemplates[templateKey];
        const newFields: Field[] = template.fields.map(f => ({
            id: uuidv4(),
            key: f.key,
            value: f.value || '',
            groupKey: templateKey,
            groupName: template.name
        }));
        setFields(prev => [...newFields, ...prev]);
        setExpandedGroups(prev => ({ ...prev, [templateKey]: true }));
        markEdited('fields');
    };

    const handleRemoveGroup = (groupKey: string) => {
        setFields(prev => prev.filter(f => f.groupKey !== groupKey));
        setExpandedGroups(prev => {
            const newExpanded = { ...prev };
            delete newExpanded[groupKey];
            return newExpanded;
        });
        markEdited('fields');
    };
    
    const handleMapImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const result = reader.result as string;
                const compressed = await compressImage(result);
                setMapImageUrl(compressed);
                markEdited('mapImageUrl');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const stateToSave = getCurrentState();
        const finalFields = (stateToSave.fields || []).filter(f => (f.key || '').trim() !== '');
        onSave({ ...itemToEdit, ...stateToSave, fields: finalFields, type: 'world' });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (e.currentTarget as HTMLFormElement).requestSubmit();
        }
    };
    
    const handleCloseRequest = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };
    
    const handleSaveAndClose = () => {
        (document.getElementById('world-form') as HTMLFormElement)?.requestSubmit();
        setIsConfirmCloseOpen(false);
    };
    
    const handleOpenWorldGen = () => {
        const currentData = { name, fields: fields.filter(f => f.key.trim() || f.value.trim()) };
        const cleanedData: any = {};
        if (currentData.name.trim()) cleanedData.name = currentData.name.trim();
        const cleanedFields = currentData.fields.map(({id, groupKey, groupName, ...rest}) => rest).filter(f => f.key.trim() || f.value.trim());
        if(cleanedFields.length > 0) cleanedData.fields = cleanedFields;
        onOpenWorldGenModal(Object.keys(cleanedData).length > 0 ? cleanedData : null);
    };
    
    const TabButton = ({ tabId, label }: { tabId: string; label: React.ReactNode }) => (
        <button type="button" onClick={() => setActiveTab(tabId)} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tabId ? 'border-b-2 border-indigo-400 text-indigo-400' : 'border-b-2 border-transparent text-gray-400 hover:text-gray-200'}`}>
            {label}
        </button>
    );

    const renderLabel = (label: string, fieldKey?: string, helpNode?: React.ReactNode) => {
        const isAuto = itemToEdit?.isAutoFilled && fieldKey && !editedFields.has(fieldKey);
        return (
            <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-gray-400">{label}</label>
                {helpNode}
                {isAuto && (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 px-1.5 py-0.5 rounded font-bold animate-pulse">補完済み</span>
                )}
            </div>
        );
    };

    const modalTitle = itemToEdit && (itemToEdit.id || Object.keys(itemToEdit).length > 0) ? '世界観を編集' : '世界観を新規作成';

    // Styles for mobile optimization
    const modalContainerClass = isMobile 
        ? "fixed inset-0 bg-gray-900 w-full h-[100dvh] flex flex-col z-[60]" 
        : "bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl border border-gray-700 max-h-[90vh] flex flex-col overflow-hidden";
    
    const inputClass = `w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white ${isMobile ? 'text-base' : 'text-sm'}`;
    const buttonClass = (colorClass: string) => `${colorClass} text-white rounded-md transition btn-pressable flex items-center justify-center gap-2 ${isMobile ? 'p-3 text-base w-full' : 'px-4 py-2 text-sm'}`;

    const renderFieldInput = (field: Field) => {
        const allTemplateFields = Object.values(worldTemplates).flatMap(t => t.fields);
        const templateField = allTemplateFields.find(f => f.key === field.key);

        if (templateField && templateField.type === 'select') {
            const isCustom = !templateField.options.includes(field.value);
            return (
                 <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'items-center'}`}>
                    <select 
                        value={isCustom ? 'その他' : field.value}
                        onChange={e => handleFieldChange(field.id, 'value', e.target.value)}
                        className={`${isMobile ? 'w-full' : 'w-1/2'} ${inputClass}`}
                    >
                        {templateField.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {(isCustom || field.value === 'その他') && (
                        <input
                            type="text"
                            value={isCustom ? field.value : ''}
                            onChange={e => handleFieldChange(field.id, 'value', e.target.value)}
                            placeholder="内容を自由入力"
                            className={`${isMobile ? 'w-full' : 'w-1/2'} ${inputClass}`}
                            autoFocus
                        />
                    )}
                 </div>
            );
        }
        if (templateField && templateField.type === 'textarea') {
            return <textarea value={field.value || ''} onChange={e => handleFieldChange(field.id, 'value', e.target.value)} placeholder={templateField.placeholder} rows={3} className={`${inputClass} resize-y`}/>
        }
        return <input type="text" value={field.value || ''} onChange={e => handleFieldChange(field.id, 'value', e.target.value)} placeholder={templateField?.placeholder || '内容（例：ギル）'} className={inputClass}/>;
    };
    
    const groupedFields = useMemo(() => {
        return fields.reduce((acc, field) => {
            const key = field.groupKey || 'custom';
            if (!acc[key]) {
                acc[key] = { name: field.groupName || 'カスタム項目', items: [] };
            }
            acc[key].items.push(field);
            return acc;
        }, {} as Record<string, { name: string; items: Field[] }>);
    }, [fields]);

    const groupOrder = ['place', 'organization', 'magic_tech', 'event', 'item'];
    const isAiAssistantDisabled = fields.length === 0;

    return (
        <div className={isMobile ? "fixed inset-0 z-[60]" : "fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50"}>
             <div className={modalContainerClass}>
                <UnsavedChangesPopover isOpen={isConfirmCloseOpen} targetRef={closeButtonRef} onCancel={() => setIsConfirmCloseOpen(false)} onCloseWithoutSaving={onClose} onSaveAndClose={handleSaveAndClose} />
                
                <div className={`flex justify-between items-center flex-shrink-0 ${isMobile ? 'p-4 border-b border-gray-700' : 'p-6 pb-4 border-b border-gray-700'}`}>
                    <h2 className={`font-bold text-indigo-400 flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}><Icons.GlobeIcon />{modalTitle}</h2>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onShowHelp} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.HelpCircleIcon className="h-5 w-5 text-white" /></button>
                        <button ref={closeButtonRef} type="button" onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition text-white"><Icons.XIcon /></button>
                    </div>
                </div>

                <div className={`flex border-b border-gray-700 mb-2 flex-shrink-0 ${isMobile ? 'overflow-x-auto' : 'px-6 pt-2'}`}>
                    <TabButton tabId="profile" label="基本設定" />
                    <TabButton tabId="visual" label="ビジュアル" />
                    <TabButton tabId="ai_settings" label="AI設定" />
                </div>
                
                <form id="world-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={`flex-grow overflow-y-auto min-h-0 ${isMobile ? 'px-4 pb-24' : 'px-6 py-4'}`}>
                    <div className="space-y-6">
                         {activeTab === 'profile' && (
                             <div className="space-y-6">
                                <div>
                                    {renderLabel("名前 *", "name")}
                                    <input type="text" value={name} onChange={e => { setName(e.target.value); markEdited('name'); }} className={inputClass} required />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-400 mb-2 block">テンプレートから項目を選択</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {Object.entries(worldTemplates).map(([key, template]) => (
                                            <button 
                                                key={key}
                                                type="button" 
                                                onClick={() => handleApplyTemplate(key as keyof typeof worldTemplates)} 
                                                className={`text-sm bg-gray-700 text-white rounded-md hover:bg-gray-600 transition disabled:opacity-50 ${isMobile ? 'py-2 px-4' : 'px-3 py-1'}`}
                                                disabled={!!groupedFields[key]}
                                            >
                                                {template.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {groupOrder.map(key => {
                                        const group = groupedFields[key];
                                        if (!group) return null;
                                        const isExpanded = expandedGroups[key];
                                        return (
                                            <div key={key} className="bg-gray-900/50 rounded-lg">
                                                <div className="flex justify-between items-center p-2 cursor-pointer" onClick={() => setExpandedGroups(p => ({ ...p, [key]: !p[key] }))}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <h3 className="text-md font-semibold text-gray-300 whitespace-nowrap">{group.name}</h3>
                                                        </div>
                                                        {!isExpanded && (
                                                            <div className="text-xs text-gray-400 truncate">
                                                                {group.items.map(f => f.key).join(' / ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveGroup(key); }} className="p-1 text-gray-500 hover:text-red-400 flex-shrink-0 ml-2"><Icons.TrashIcon /></button>
                                                </div>
                                                {isExpanded && (
                                                    <div className="p-4 pt-2 border-t border-gray-700/50 space-y-3">
                                                        {group.items.map((field) => (
                                                            <div key={field.id}>
                                                                <label className="text-sm font-medium text-gray-400 mb-1 block">{field.key}</label>
                                                                {renderFieldInput(field)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="space-y-3 pt-4 border-t border-gray-700/50">
                                    <h3 className="text-lg font-semibold text-gray-300">カスタム項目</h3>
                                    {(groupedFields['custom']?.items || []).map((field) => (
                                        <div key={field.id} className="flex flex-col gap-2 pb-4 border-b border-gray-700/30 last:border-0">
                                            <div className="flex items-center gap-2">
                                                <input type="text" value={field.key || ''} onChange={e => handleFieldChange(field.id, 'key', e.target.value)} placeholder="項目名（例：通貨）" className={`flex-1 ${inputClass}`}/>
                                                <button type="button" onClick={() => handleRemoveField(field.id)} className={`text-gray-500 hover:text-red-400 transition flex-shrink-0 ${isMobile ? 'p-3' : 'p-2'}`}><Icons.TrashIcon/></button>
                                            </div>
                                            {renderFieldInput(field)}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => handleAddField()} className={`w-full text-indigo-400 border-2 border-dashed border-gray-600 rounded-md hover:bg-gray-700/50 ${isMobile ? 'py-3 text-base' : 'py-1 text-sm'}`}>項目を追加</button>
                                </div>
                            </div>
                         )}

                         {activeTab === 'visual' && (
                             <div className="space-y-6">
                                <h3 className="text-lg font-semibold text-gray-300">地図・イメージ画像</h3>
                                <div>
                                    {renderLabel("画像URL", "mapImageUrl")}
                                    <input type="text" value={(mapImageUrl || '').startsWith('data:') ? '' : (mapImageUrl || '')} onChange={e => { setMapImageUrl(e.target.value); markEdited('mapImageUrl'); }} placeholder="https://..." className={inputClass}/>
                                </div>
                                
                                <label className={`w-full flex items-center justify-center gap-2 text-indigo-300 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700/50 hover:border-indigo-500 cursor-pointer transition btn-pressable ${isMobile ? 'py-4 text-base' : 'py-2 text-sm'}`}>
                                    <input type="file" onChange={handleMapImageUpload} accept="image/*" className="hidden" />
                                    <Icons.UploadCloudIcon className="h-5 w-5" />
                                    <span>またはファイルを選択</span>
                                </label>
                                <div className="w-full aspect-video rounded-md bg-gray-900/50 flex items-center justify-center overflow-hidden relative">
                                    {mapImageUrl ? (
                                        <>
                                            <img src={mapImageUrl} alt="Map preview" className="object-contain w-full h-full" />
                                            <div className="absolute top-2 right-2 flex flex-col space-y-2">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setIsMapViewerOpen(true); }} className="p-2 bg-black/50 rounded-md text-white hover:bg-black/75 transition" title="拡大表示"><Icons.ExpandIcon className="h-5 w-5" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setMapImageUrl(''); markEdited('mapImageUrl'); }} className="p-2 bg-black/50 rounded-md text-white hover:bg-red-500/75 transition" title="画像を削除"><Icons.TrashIcon className="h-5 w-5" /></button>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-gray-500">画像がありません</p>
                                    )}
                                </div>
                            </div>
                         )}

                         {activeTab === 'ai_settings' && (
                             <div className="space-y-6">
                                <div>
                                    {renderLabel("詳細設定 (AIが参照)", "longDescription", <Icons.BotIcon className="h-4 w-4 text-indigo-400" />)}
                                    <p className="text-xs text-gray-400 mb-2">物語の歴史、文化、地理、物理法則など、AIに記憶させておきたい情報を入力してください。</p>
                                    <textarea value={longDescription} onChange={e => { setLongDescription(e.target.value); markEdited('longDescription'); }} rows={8} className={`${inputClass} resize-y`}/>
                                </div>
                                <div>
                                    {renderLabel("メモ (AIは非参照)", "memo", <Icons.PenSquareIcon className="h-4 w-4 text-lime-400" />)}
                                    <p className="text-xs text-gray-400 mb-2">あなた専用のメモ欄です。</p>
                                    <textarea value={memo} onChange={e => { setMemo(e.target.value); markEdited('memo'); }} rows={5} className={`${inputClass} resize-y`}/>
                                </div>
                                <div>
                                    {renderLabel("書き出し用説明文", "exportDescription", <Icons.BookIcon className="h-4 w-4 text-orange-400" />)}
                                    <p className="text-xs text-gray-400 mb-2">HTML書き出し時に表示される説明文です。</p>
                                    <textarea value={exportDescription} onChange={e => { setExportDescription(e.target.value); markEdited('exportDescription'); }} rows={5} className={`${inputClass} resize-y`}/>
                                </div>
                            </div>
                         )}
                    </div>
                </form>

                <div className={`flex-shrink-0 border-t border-gray-700 bg-gray-900/50 ${isMobile ? 'flex flex-col gap-3 px-4 py-4' : 'flex justify-between items-center px-6 py-4'}`} style={isMobile ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : {}}>
                    <div ref={aiAssistantHelpRef} onMouseEnter={() => isAiAssistantDisabled && setIsAiAssistantHelpOpen(true)} onMouseLeave={() => setIsAiAssistantHelpOpen(false)} className={isMobile ? 'w-full order-1' : ''}>
                        <button type="button" onClick={handleOpenWorldGen} disabled={isAiAssistantDisabled} className={`flex items-center justify-center gap-2 font-semibold btn-pressable bg-teal-600 text-white hover:bg-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed ${isMobile ? 'w-full py-3 rounded-md text-base' : 'px-4 py-2 text-sm rounded-md transition'}`}><Icons.MoonIcon className={isMobile ? "h-5 w-5" : "h-4 w-4"} /><span>AIアシスタント</span></button>
                    </div>
                    <div className={`flex gap-3 ${isMobile ? 'flex-col w-full order-2' : ''}`}>
                        <button type="button" onClick={handleCloseRequest} className={buttonClass('bg-gray-600 hover:bg-gray-500')}><Icons.XIcon className="h-4 w-4" />キャンセル</button>
                        <button type="submit" form="world-form" data-testid="modal-save-button" className={buttonClass('bg-indigo-600 hover:bg-indigo-500 font-bold')}><Icons.CheckIcon className="h-4 w-4" />保存</button>
                    </div>
                </div>
            </div>
            {isMapViewerOpen && <MapViewerModal imageUrl={mapImageUrl} onClose={() => setIsMapViewerOpen(false)} />}
        </div>
    );
};