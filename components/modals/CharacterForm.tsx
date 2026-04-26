import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Icons from '../../icons';
import { SettingItem } from '../../types';
import { NameGenerator } from '../NameGenerator';
import * as utilityApi from '../../utilityApi';
import { UnsavedChangesPopover } from '../UnsavedChangesPopover';
import { HelpPopover } from '../HelpPopover';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/index';
import { compressImage } from '../../utils';
import { useRequiresAuth } from '../../hooks/useRequiresAuth';

interface CharacterFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: any) => void;
    itemToEdit: SettingItem | null;
    allSettings: SettingItem[];
    onOpenCharacterGenModal: (data: Partial<SettingItem> | null) => void;
    onOpenImageGenModal: () => void;
    onShowHelp: () => void;
    isMobile?: boolean;
}

export const CharacterForm: React.FC<CharacterFormProps> = ({
    isOpen,
    onClose,
    onSave,
    itemToEdit,
    allSettings,
    onOpenCharacterGenModal,
    onOpenImageGenModal,
    onShowHelp,
    isMobile = false,
}) => {
    const { canUseAi, reason: aiBlockedReason } = useRequiresAuth();
    // Local form state
    const [name, setName] = useState('');
    const [appearance, setAppearance] = useState<{ imageUrl: string; traits: { key: string; value: string }[] }>({ imageUrl: '', traits: [] });
    const [furigana, setFurigana] = useState('');
    const [gender, setGender] = useState('');
    const [age, setAge] = useState('');
    const [species, setSpecies] = useState('');
    const [firstPersonPronoun, setFirstPersonPronoun] = useState('');
    const [personality, setPersonality] = useState('');
    const [speechPattern, setSpeechPattern] = useState('');
    const [secret, setSecret] = useState('');
    const [themeColor, setThemeColor] = useState('');
    const [longDescription, setLongDescription] = useState('');
    const [memo, setMemo] = useState('');
    const [exportDescription, setExportDescription] = useState('');
    const [originSelection, setOriginSelection] = useState('');
    const [customOriginValue, setCustomOriginValue] = useState('');
    const [affiliationSelection, setAffiliationSelection] = useState('');
    const [customAffiliationValue, setCustomAffiliationValue] = useState('');

    const [activeTab, setActiveTab] = useState('profile');
    const [isNameGeneratorOpen, setIsNameGeneratorOpen] = useState(false);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [initialStateString, setInitialStateString] = useState('');
    const closeButtonRef = useRef(null);
    const originHelpRef = useRef(null);
    const [isOriginHelpOpen, setIsOriginHelpOpen] = useState(false);
    const affiliationHelpRef = useRef(null);
    const [isAffiliationHelpOpen, setIsAffiliationHelpOpen] = useState(false);
    
    // フィールドごとの変更済みフラグ
    const [editedFields, setEditedFields] = useState<Set<string>>(new Set());

    // Subscribe to external form data changes from AI modal
    const characterFormData = useStore(useShallow(state => state.characterFormData));
    const resetFormData = useStore(state => state.resetFormData);

    const organizationOptions = useMemo(() => {
        if (!allSettings) return [];
        return allSettings.filter(item =>
            item.type === 'world' &&
            item.fields?.some(f => f.key === '種別' && ['国家', 'ギルド', '秘密結社', '企業'].includes(f.value))
        );
    }, [allSettings]);

    const locationOptions = useMemo(() => {
        if (!allSettings) return [];
        const organizationIds = new Set(organizationOptions.map(org => org.id));
        return allSettings.filter(item => item.type === 'world' && !organizationIds.has(item.id));
    }, [allSettings, organizationOptions]);

    // データの正規化を行う関数（比較とスナップショット用）
    const getNormalizedData = useCallback((data: any) => {
        return {
            name: data?.name || '',
            furigana: data?.furigana || '',
            gender: data?.gender || '',
            age: data?.age || '',
            species: data?.species || '',
            firstPersonPronoun: data?.firstPersonPronoun || '',
            personality: data?.personality || '',
            origin: data?.origin || '',
            affiliation: data?.affiliation || '',
            speechPattern: data?.speechPattern || '',
            secret: data?.secret || '',
            themeColor: data?.themeColor || '',
            longDescription: data?.longDescription || '',
            memo: data?.memo || '',
            exportDescription: data?.exportDescription || '',
            appearance: {
                imageUrl: data?.appearance?.imageUrl || '',
                traits: (data?.appearance?.traits || []).map((t: any) => ({
                    key: t.key || '',
                    value: t.value || ''
                }))
            }
        };
    }, []);

    const populateState = (data) => {
        if (!data) return;

        setName(data.name || '');
        setAppearance(data.appearance || { imageUrl: '', traits: [] });
        setFurigana(data.furigana || '');
        setGender(data.gender || '');
        setAge(data.age || '');
        setSpecies(data.species || '');
        setFirstPersonPronoun(data.firstPersonPronoun || '');
        setPersonality(data.personality || '');
        setSpeechPattern(data.speechPattern || '');
        setSecret(data.secret || '');
        setThemeColor(data.themeColor || '');
        setLongDescription(data.longDescription || '');
        setMemo(data.memo || '');
        setExportDescription(data.exportDescription || '');
        
        const initialOrigin = data.origin || '';
        const isStandardOrigin = locationOptions.some(o => o.name === initialOrigin);
        if (isStandardOrigin) {
            setOriginSelection(initialOrigin);
            setCustomOriginValue('');
        } else if (initialOrigin) {
            setOriginSelection('その他');
            setCustomOriginValue(initialOrigin);
        } else {
            setOriginSelection('');
            setCustomOriginValue('');
        }

        const initialAffiliation = data.affiliation || '';
        const isStandardAffiliation = organizationOptions.some(o => o.name === initialAffiliation);
        if (isStandardAffiliation) {
            setAffiliationSelection(initialAffiliation);
            setCustomAffiliationValue('');
        } else if (initialAffiliation) {
            setAffiliationSelection('その他');
            setCustomAffiliationValue(initialAffiliation);
        } else {
            setAffiliationSelection('');
            setCustomAffiliationValue('');
        }
    };
    
    useEffect(() => {
        if (Object.keys(characterFormData).length > 0) {
            const currentData = getCurrentState();
            const mergedData = { ...currentData, ...characterFormData };
            populateState(mergedData);
        }
    }, [characterFormData]);

    const getCurrentState = useCallback(() => {
        const finalOrigin = originSelection === 'その他' ? customOriginValue : originSelection;
        const finalAffiliation = affiliationSelection === 'その他' ? customAffiliationValue : affiliationSelection;
        return getNormalizedData({
            name, furigana, gender, age, species, firstPersonPronoun, personality, 
            origin: finalOrigin, affiliation: finalAffiliation, 
            speechPattern, secret, themeColor, longDescription, memo, exportDescription, 
            appearance
        });
    }, [name, furigana, gender, age, species, firstPersonPronoun, personality, originSelection, customOriginValue, affiliationSelection, customAffiliationValue, speechPattern, secret, themeColor, longDescription, memo, exportDescription, appearance, getNormalizedData]);
    
    const isDirty = useMemo(() => {
        if (!initialStateString) return false;
        return JSON.stringify(getCurrentState()) !== initialStateString;
    }, [getCurrentState, initialStateString]);

    useEffect(() => {
        if (isOpen) {
            // itemToEditがnullまたは空オブジェクト（初期状態）の場合は新規作成とみなす
            const hasDataToEdit = itemToEdit && (itemToEdit.id || Object.keys(itemToEdit).length > 0);

            if (hasDataToEdit) {
                populateState(itemToEdit);
                useStore.getState().setFormData('character', itemToEdit);
                setInitialStateString(JSON.stringify(getNormalizedData(itemToEdit)));
            } else {
                resetFormData('character'); // ストアにある前回の残骸を消す
                const initialData = {
                    name: '',
                    appearance: { imageUrl: '', traits: [] },
                    furigana: '',
                    gender: '',
                    age: '',
                    species: '',
                    firstPersonPronoun: '',
                    personality: '',
                    origin: '',
                    affiliation: '',
                    speechPattern: '',
                    secret: '',
                    themeColor: '',
                    longDescription: '',
                    memo: '',
                    exportDescription: '',
                };
                populateState(initialData);
                setInitialStateString(JSON.stringify(getNormalizedData(initialData)));
            }
            
            setEditedFields(new Set());
            setActiveTab('profile');
        }
    }, [isOpen, itemToEdit, resetFormData, getNormalizedData]);

    useEffect(() => {
      if (!isMobile) return;
      const setVh = () => {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
      };
      setVh();
      window.addEventListener('resize', setVh);
      return () => window.removeEventListener('resize', setVh);
    }, [isMobile]);

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const result = reader.result as string;
                const compressed = await compressImage(result);
                setAppearance(prev => ({ ...prev, imageUrl: compressed }));
                markEdited('imageUrl');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAddTrait = () => setAppearance(prev => ({ ...prev, traits: [...(prev?.traits || []), { key: '', value: '' }] }));
    const handleRemoveTrait = (index) => setAppearance(prev => ({ ...prev, traits: (prev?.traits || []).filter((_, i) => i !== index) }));
    const handleTraitChange = (index, prop, value) => { 
        const newTraits = [...(appearance?.traits || [])]; 
        newTraits[index][prop] = value; 
        setAppearance(prev => ({ ...prev, traits: newTraits })); 
        markEdited('traits');
    };

    const markEdited = (fieldName: string) => {
        setEditedFields(prev => new Set(prev).add(fieldName));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        
        const characterData = {
            ...itemToEdit,
            ...getCurrentState(),
            type: 'character',
            appearance: { ...(appearance || {}), traits: (appearance?.traits || []).filter(t => (t.key || '').trim() !== '') },
        };
        onSave(characterData);
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
        (document.getElementById('character-form') as HTMLFormElement)?.requestSubmit();
        setIsConfirmCloseOpen(false);
    };
    
    const handleOpenCharacterGen = () => {
        const currentData = getCurrentState();
         const cleanedData: Partial<SettingItem> = Object.fromEntries(
            Object.entries(currentData).filter(([_, v]) => {
                if (typeof v === 'string') return v.trim() !== '';
                if (Array.isArray(v)) return v.length > 0;
                // FIX: Cast v to a specific object type to fix TypeScript error "Property 'imageUrl' does not exist on type 'object'".
                if (typeof v === 'object' && v !== null) { // for appearance
                    const app = v as { imageUrl?: string; traits?: any[] };
                    return (app.imageUrl && app.imageUrl.trim() !== '') || (app.traits && app.traits.length > 0);
                }
                return false;
            })
        );
        onOpenCharacterGenModal(Object.keys(cleanedData).length > 0 ? cleanedData : null);
    };
    
    const characterKeywords = useMemo(() => {
        const keywords = [
            species,
            personality,
            gender,
            ...(appearance?.traits || []).map(t => t.value)
        ];
        return keywords.filter(Boolean).join(', ');
    }, [species, personality, gender, appearance?.traits]);

    const handleGenerateNames = async (category: string, keywords: string): Promise<string[]> => {
        const result = await utilityApi.generateNames({ category, keywords });
        if (result.success === false) {
            alert(`名前の生成に失敗しました: ${result.error.message}`);
            return [];
        }
        return result.data;
    };

    const TabButton = ({ tabId, label }: { tabId: string; label: React.ReactNode }) => (
        <button type="button" onClick={() => setActiveTab(tabId)} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tabId ? 'border-b-2 border-indigo-400 text-indigo-400' : 'border-b-2 border-transparent text-gray-400 hover:text-gray-200'}`}>
            {label}
        </button>
    );

    const handleOriginSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setOriginSelection(e.target.value);
        if (e.target.value !== 'その他') setCustomOriginValue('');
        markEdited('origin');
    };

    const handleAffiliationSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setAffiliationSelection(e.target.value);
        if (e.target.value !== 'その他') setCustomAffiliationValue('');
        markEdited('affiliation');
    };

    const renderLabel = (label: string, fieldKey?: string, helpNode?: React.ReactNode) => {
        const isAuto = itemToEdit?.isAutoFilled && fieldKey && !editedFields.has(fieldKey);
        return (
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-400">{label}</label>
                    {helpNode}
                    {isAuto && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 px-1.5 py-0.5 rounded font-bold animate-pulse">補完済み</span>
                    )}
                </div>
            </div>
        );
    };

    const modalTitle = itemToEdit && (itemToEdit.id || Object.keys(itemToEdit).length > 0) ? 'キャラクターを編集' : 'キャラクターを新規作成';
    const imageUrlValue = appearance?.imageUrl ?? '';

    // Styles for mobile optimization
    const modalContainerClass = isMobile 
    ? "bg-gray-900 w-full h-[100dvh] flex flex-col min-h-0 z-[60]" 
    : "bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl border border-gray-700 max-h-[90vh] flex flex-col min-h-0 overflow-hidden";

    const inputClass = `w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white ${isMobile ? 'text-base' : 'text-sm'}`;
    const buttonClass = (colorClass: string) => `${colorClass} text-white rounded-md transition btn-pressable flex items-center justify-center gap-2 ${isMobile ? 'p-3 text-base w-full' : 'px-4 py-2 text-sm'}`;

    return (
        <div className={isMobile ? "fixed inset-0 z-[60]" : "fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50"}>
            <div className={modalContainerClass}>
                <UnsavedChangesPopover isOpen={isConfirmCloseOpen} targetRef={closeButtonRef} onCancel={() => setIsConfirmCloseOpen(false)} onCloseWithoutSaving={onClose} onSaveAndClose={handleSaveAndClose} />
                
                <div className={`flex justify-between items-center flex-shrink-0 ${isMobile ? 'p-4 border-b border-gray-700' : 'p-6 pb-0 mb-4'}`}>
                    <h2 className={`font-bold text-indigo-400 flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}><Icons.UserPlusIcon />{modalTitle}</h2>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onShowHelp} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.HelpCircleIcon className="h-5 w-5 text-white" /></button>
                        <button ref={closeButtonRef} type="button" onClick={handleCloseRequest} className="p-2 rounded-full hover:bg-gray-700 transition text-white"><Icons.XIcon /></button>
                    </div>
                </div>

                <div className={`flex border-b border-gray-700 mb-6 flex-shrink-0 ${isMobile ? 'overflow-x-auto' : 'px-6'}`}>
                    <TabButton tabId="profile" label="プロフィール" />
                    <TabButton tabId="personality" label="性格・内面" />
                    <TabButton tabId="ai_settings" label="AI設定" />
                </div>

                <form id="character-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={`flex-grow overflow-y-auto min-h-0 ${isMobile ? 'px-4 pb-4' : 'px-6 py-2'}`}>
                    <div className="space-y-6">
                        {activeTab === 'profile' && (
                            <div className={`grid ${isMobile ? 'grid-cols-1 gap-6' : 'grid-cols-1 md:grid-cols-3 gap-6'}`}>
                                <div className={`space-y-4 ${isMobile ? 'order-first' : 'md:col-span-1'}`}>
                                    <div>
                                        {renderLabel("画像", "imageUrl")}
                                        {imageUrlValue ? (
                                            <div className="w-[60%] aspect-square rounded-md overflow-hidden mx-auto border border-gray-600">
                                                <img src={imageUrlValue} alt="Character" className="object-cover object-top w-full h-full" />
                                            </div>
                                        ) : (
                                            <div className="w-[60%] aspect-square flex items-center justify-center bg-gray-700 text-gray-500 text-sm font-bold rounded-md mx-auto border border-gray-600">
                                                NO IMAGE
                                            </div>
                                        )}
                                    </div>
                                    <input type="text" value={imageUrlValue.startsWith('data:') ? '' : imageUrlValue} onChange={e => { setAppearance(prev => ({ ...prev, imageUrl: e.target.value })); markEdited('imageUrl'); }} placeholder="画像URL..." className={inputClass} />
                                    <div className="space-y-3">
                                        <label className={`w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700/50 hover:border-indigo-500 cursor-pointer transition btn-pressable text-indigo-300 ${isMobile ? 'py-3' : 'py-1.5 text-sm'}`}>
                                            <input type="file" onChange={handleImageUpload} accept="image/*" className="hidden" />
                                            <Icons.UploadCloudIcon className="h-5 w-5" />
                                            <span>ファイルを選択</span>
                                        </label>
                                        <button type="button" onClick={onOpenImageGenModal} disabled={!canUseAi} title={!canUseAi ? aiBlockedReason : undefined} className={`w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-600 rounded-lg transition btn-pressable text-teal-300 hover:bg-gray-700/50 hover:border-teal-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${isMobile ? 'py-3' : 'py-1.5 text-sm'}`}>
                                            <Icons.MoonIcon className="h-5 w-5" />
                                            <span className="text-teal-400">AIで立ち絵を生成</span>
                                        </button>
                                    </div>
                                    <div>
                                        {renderLabel("テーマカラー", "themeColor")}
                                        <div className="flex items-center gap-2">
                                            <input type="color" value={themeColor || '#ffffff'} onChange={e => { setThemeColor(e.target.value); markEdited('themeColor'); }} className="w-full h-10 p-1 bg-gray-900 border border-gray-600 rounded-md cursor-pointer flex-grow" />
                                            <button type="button" onClick={() => { setThemeColor(''); markEdited('themeColor'); }} className="w-12 h-10 flex items-center justify-center bg-gray-700 text-gray-400 rounded-md hover:opacity-75 transition btn-pressable flex-shrink-0"><Icons.EraserIcon className="h-5 w-5" /></button>
                                        </div>
                                    </div>
                                </div>

                                <div className={`space-y-6 ${isMobile ? '' : 'md:col-span-2'}`}>
                                    <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4'}`}>
                                         <div className={isMobile ? "" : "md:col-span-2"}>
                                            {renderLabel("名前 *", "name")}
                                            <div className="flex items-center gap-2">
                                                <input type="text" value={name} onChange={e => { setName(e.target.value); markEdited('name'); }} className={inputClass} required />
                                                <button type="button" onClick={() => setIsNameGeneratorOpen(true)} disabled={!canUseAi} title={!canUseAi ? aiBlockedReason : undefined} className={`flex-shrink-0 text-gray-400 hover:text-indigo-400 bg-gray-900 border border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${isMobile ? 'p-3' : 'p-2'}`}><Icons.DiceIcon className="h-5 w-5"/></button>
                                            </div>
                                        </div>
                                        <div>{renderLabel("ふりがな", "furigana")}<input type="text" value={furigana} onChange={e => { setFurigana(e.target.value); markEdited('furigana'); }} className={inputClass}/></div>
                                        <div>{renderLabel("性別", "gender")}<input type="text" value={gender} onChange={e => { setGender(e.target.value); markEdited('gender'); }} className={inputClass}/></div>
                                        <div>{renderLabel("年齢", "age")}<input type="text" value={age} onChange={e => { setAge(e.target.value); markEdited('age'); }} className={inputClass}/></div>
                                        <div>{renderLabel("種族", "species")}<input type="text" value={species} onChange={e => { setSpecies(e.target.value); markEdited('species'); }} className={inputClass}/></div>
                                         <div className={isMobile ? "" : "md:col-span-1"}>
                                            {renderLabel("出身地", "origin", <button type="button" ref={originHelpRef} onMouseEnter={() => setIsOriginHelpOpen(true)} onMouseLeave={() => setIsOriginHelpOpen(false)} className="focus:outline-none"><Icons.HelpCircleIcon className="h-4 w-4 text-gray-500 hover:text-white" /></button>)}
                                            <select value={originSelection} onChange={handleOriginSelectChange} className={inputClass}>
                                                <option value="">未設定</option>
                                                {locationOptions.map(loc => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
                                                <option value="その他">その他（自由記入）</option>
                                            </select>
                                            {originSelection === 'その他' && <input type="text" value={customOriginValue} onChange={e => { setCustomOriginValue(e.target.value); markEdited('origin'); }} placeholder="内容..." className={`${inputClass} mt-2`} autoFocus />}
                                        </div>
                                        <div className={isMobile ? "" : "md:col-span-1"}>
                                            {renderLabel("所属組織", "affiliation", <button type="button" ref={affiliationHelpRef} onMouseEnter={() => setIsAffiliationHelpOpen(true)} onMouseLeave={() => setIsAffiliationHelpOpen(false)} className="focus:outline-none"><Icons.HelpCircleIcon className="h-4 w-4 text-gray-500 hover:text-white" /></button>)}
                                            <select value={affiliationSelection} onChange={handleAffiliationSelectChange} className={inputClass}>
                                                <option value="">未設定</option>
                                                {organizationOptions.map(org => (<option key={org.id} value={org.name}>{org.name}</option>))}
                                                <option value="その他">その他（自由記入）</option>
                                            </select>
                                            {affiliationSelection === 'その他' && <input type="text" value={customAffiliationValue} onChange={e => { setCustomAffiliationValue(e.target.value); markEdited('affiliation'); }} placeholder="内容..." className={`${inputClass} mt-2`} autoFocus />}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {renderLabel("容姿特徴リスト", "traits")}
                                        {(appearance?.traits || []).map((trait, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <input type="text" value={trait.key || ''} onChange={e => handleTraitChange(index, 'key', e.target.value)} placeholder="項目" className={`w-1/3 ${inputClass}`}/>
                                                <input type="text" value={trait.value || ''} onChange={e => handleTraitChange(index, 'value', e.target.value)} placeholder="内容" className={`flex-grow ${inputClass}`}/>
                                                <button type="button" onClick={() => handleRemoveTrait(index)} className={`text-gray-500 hover:text-red-400 transition flex-shrink-0 ${isMobile ? 'p-3' : 'p-2'}`}><Icons.TrashIcon/></button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={handleAddTrait} className={`w-full text-indigo-400 border-2 border-dashed border-gray-600 rounded-md hover:bg-gray-700/50 ${isMobile ? 'py-3 text-base' : 'py-1 text-sm'}`}>特徴を追加</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'personality' && ( 
                            <div className="space-y-6">
                                <div>{renderLabel("一人称", "firstPersonPronoun")}<input type="text" value={firstPersonPronoun} onChange={e => { setFirstPersonPronoun(e.target.value); markEdited('firstPersonPronoun'); }} placeholder="例：私、僕" className={inputClass}/></div>
                                <div>{renderLabel("性格", "personality")}<textarea value={personality} onChange={e => { setPersonality(e.target.value); markEdited('personality'); }} rows={6} className={`${inputClass} resize-y`} /></div>
                                <div>{renderLabel("話し方", "speechPattern")}<textarea value={speechPattern} onChange={e => { setSpeechPattern(e.target.value); markEdited('speechPattern'); }} rows={4} className={`${inputClass} resize-y`} /></div>
                                <div>{renderLabel("秘密", "secret")}<textarea value={secret} onChange={e => { setSecret(e.target.value); markEdited('secret'); }} rows={4} className={`${inputClass} resize-y`} /></div>
                            </div>
                        )}
                        {activeTab === 'ai_settings' && (
                            <div className="space-y-6">
                                <div>{renderLabel("詳細設定 (AIが参照)", "longDescription", <Icons.BotIcon className="h-4 w-4 text-indigo-400" />)}<textarea value={longDescription} onChange={e => { setLongDescription(e.target.value); markEdited('longDescription'); }} rows={8} className={`${inputClass} resize-y`} /></div>
                                <div>{renderLabel("メモ (AIは非参照)", "memo", <Icons.PenSquareIcon className="h-4 w-4 text-lime-400" />)}<textarea value={memo} onChange={e => { setMemo(e.target.value); markEdited('memo'); }} rows={5} className={`${inputClass} resize-y`} /></div>
                                <div>{renderLabel("書き出し用説明文", "exportDescription", <Icons.BookIcon className="h-4 w-4 text-orange-400" />)}<textarea value={exportDescription} onChange={e => { setExportDescription(e.target.value); markEdited('exportDescription'); }} rows={5} className={`${inputClass} resize-y`} /></div>
                            </div>
                        )}
                    </div>
                </form>

                <div className={`border-t border-gray-700 bg-gray-900/50 flex-shrink-0 ${isMobile ? 'flex flex-col gap-3 px-4 pt-4' : 'flex justify-between items-center px-6 py-4'}`} style={isMobile ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : {}}>
                    <button type="button" onClick={handleOpenCharacterGen} className={`flex items-center justify-center gap-2 font-semibold btn-pressable bg-teal-600 text-white hover:bg-teal-500 ${isMobile ? 'w-full py-3 rounded-md text-base order-1' : 'px-4 py-2 text-sm rounded-md transition'}`}><Icons.MoonIcon className={isMobile ? "h-5 w-5" : "h-4 w-4"} /><span>AIアシスタント</span></button>
                    <div className={`flex gap-3 ${isMobile ? 'flex-col w-full order-2' : ''}`}>
                        <button type="button" onClick={handleCloseRequest} className={buttonClass('bg-gray-600 hover:bg-gray-500')}><Icons.XIcon className="h-4 w-4" />キャンセル</button>
                        <button type="submit" form="character-form" data-testid="modal-save-button" className={buttonClass('bg-indigo-600 hover:bg-indigo-500 font-bold')}><Icons.CheckIcon className="h-4 w-4" />保存</button>
                    </div>
                </div>
            </div>
            {isNameGeneratorOpen && (
                <NameGenerator
                    isOpen={isNameGeneratorOpen}
                    onClose={() => setIsNameGeneratorOpen(false)}
                    onGenerate={handleGenerateNames}
                    onApply={(name) => { setName(name); setIsNameGeneratorOpen(false); markEdited('name'); }}
                    applyButtonText="これに決める"
                    initialCategory="ファンタジー風"
                    initialKeywords={characterKeywords}
                />
            )}
            <HelpPopover isOpen={isOriginHelpOpen} targetRef={originHelpRef} onClose={() => setIsOriginHelpOpen(false)}>世界観設定で作成した「場所」が候補に表示されます。候補にない場合は「その他」で自由入力できます。</HelpPopover>
            <HelpPopover isOpen={isAffiliationHelpOpen} targetRef={affiliationHelpRef} onClose={() => setIsAffiliationHelpOpen(false)}>世界観設定で作成した「組織」が候補に表示されます。候補にない場合は「その他」で自由入力できます。</HelpPopover>
        </div>
    );
};
