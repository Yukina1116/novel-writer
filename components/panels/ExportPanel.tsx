import React from 'react';
import * as Icons from '../../icons';
import { useStore } from '../../store/index';

interface ExportPanelProps {
    onExportProject: () => void;
    onExportTxt: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ onExportProject, onExportTxt }) => {
    const openModal = useStore(state => state.openModal);

    const exports = [
        { label: 'プロジェクト(.json)', icon: <Icons.FileCodeIcon />, action: onExportProject },
        { label: 'テキスト(.txt)', icon: <Icons.FileTextIcon />, action: onExportTxt },
        { label: '装飾付き(.html)', icon: <Icons.ImageIcon />, action: () => openModal('htmlExport') },
    ];

    return (
        <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2">エクスポート</h3>
            <div className="space-y-2">
                {exports.map(exp => (
                    <button key={exp.label} onClick={exp.action} className="w-full text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition flex items-center gap-2 btn-pressable text-gray-300">
                            {React.cloneElement<any>(exp.icon as React.ReactElement, { className: 'h-4 w-4 mr-1 flex-shrink-0' })}
                        <span>{exp.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
