import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from '../../icons';
import { TimelineLane } from '../../types';
import { UnsavedChangesPopover } from '../UnsavedChangesPopover';

interface LaneFormProps {
    lane?: TimelineLane | null;
    onSave: (lane: TimelineLane) => void;
    onCancel: () => void;
}

export const LaneForm: React.FC<LaneFormProps> = ({ lane, onSave, onCancel }) => {
    const [name, setName] = useState(lane ? lane.name : '');
    const [color, setColor] = useState(lane ? lane.color : '#6b7280');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const closeButtonRef = React.useRef(null);

    const isDirty = useMemo(() => {
        return name !== (lane?.name || '') || color !== (lane?.color || '#6b7280');
    }, [name, color, lane]);
    
    const handleCancel = () => {
        if (isDirty) {
            setIsConfirmCloseOpen(true);
        } else {
            onCancel();
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!name.trim()) return;
        onSave({ ...lane, id: lane?.id || uuidv4(), name, color } as TimelineLane);
    };

    return (
        <form onSubmit={handleSubmit} className="p-3 bg-gray-700/50 rounded-lg space-y-3 relative">
            <UnsavedChangesPopover isOpen={isConfirmCloseOpen} targetRef={closeButtonRef} onCancel={() => setIsConfirmCloseOpen(false)} onCloseWithoutSaving={onCancel} onSaveAndClose={() => { handleSubmit({ preventDefault: () => {} } as any); }} />
            <h4 className="text-sm font-semibold">{lane ? 'レーンを編集' : '新しいレーンを追加'}</h4>
            <div>
                <label className="block text-xs text-gray-300 mb-1">レーン名 <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例: 主人公の視点" className="w-full bg-gray-900 border-gray-600 rounded px-2 py-1 text-sm" required />
            </div>
            <div className="flex items-center gap-2">
                <label className="text-xs">色:</label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 p-0 border-none rounded bg-transparent cursor-pointer" />
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" ref={closeButtonRef} onClick={handleCancel} className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 rounded btn-pressable">
                    <Icons.XIcon className="h-3 w-3" />
                    キャンセル
                </button>
                <button type="submit" className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 rounded btn-pressable">
                    <Icons.CheckIcon className="h-3 w-3" />
                    保存
                </button>
            </div>
        </form>
    );
};
