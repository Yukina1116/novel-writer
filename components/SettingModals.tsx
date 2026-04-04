
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';
import { SettingItem } from '../types';
import * as characterApi from '../characterApi';
import * as utilityApi from '../utilityApi';
import * as imageApi from '../imageApi';
import { NameGenerator } from './NameGenerator';
import { UnsavedChangesPopover } from './UnsavedChangesPopover';
import { useStore } from '../store/index';
import { CharacterGenerationModal } from './CharacterGenerationModal';
import { ImageGenerationModal } from './ImageGenerationModal';
import { WorldGenerationModal } from './WorldGenerationModal';
import { CharacterHelpModal } from './CharacterHelpModal';
import { WorldHelpModal } from './WorldHelpModal';
import { CharacterForm } from './modals/CharacterForm';
import { WorldForm } from './modals/WorldForm';


interface SettingItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: any) => void;
  itemToEdit: SettingItem | null;
  itemType: 'character' | 'world';
  allSettings: SettingItem[];
  isMobile?: boolean;
}

export const SettingItemModal = ({ isOpen, onClose, onSave, itemToEdit, itemType, allSettings, isMobile = false }: SettingItemModalProps) => {
    const [isCharacterGenModalOpen, setIsCharacterGenModalOpen] = useState(false);
    const [isImageGenModalOpen, setIsImageGenModalOpen] = useState(false);
    const [initialCharacterDataForGen, setInitialCharacterDataForGen] = useState(null);
    const [isWorldGenModalOpen, setIsWorldGenModalOpen] = useState(false);
    const [initialWorldDataForGen, setInitialWorldDataForGen] = useState(null);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isWorldHelpOpen, setIsWorldHelpOpen] = useState(false);

    const isImageGenerating = useStore(state => state.isImageGenerating);

    const handleGenerateImage = async (prompt: string): Promise<string[] | null> => {
        const { setIsImageGenerating, showToast } = useStore.getState();
        setIsImageGenerating(true);
        const result = await imageApi.generateImage({ prompt });
        setIsImageGenerating(false);
        if (result.success === false) {
            if (result.error.message.includes('permission') || result.error.message.includes('PERMISSION_DENIED')) {
                showToast('画像生成の権限がありません。APIキーの設定や課金設定を確認してください。', 'error');
            } else {
                showToast(`画像の生成に失敗しました: ${result.error.message}`, 'error');
            }
            return null;
        }
        return result.data;
    };
    
    if (!isOpen) return null;

    return createPortal(
        <>
            {itemType === 'character' && (
                <CharacterForm
                    isOpen={isOpen}
                    onClose={onClose}
                    onSave={onSave}
                    itemToEdit={itemToEdit}
                    allSettings={allSettings}
                    onOpenCharacterGenModal={(data) => {
                        setInitialCharacterDataForGen(data);
                        setIsCharacterGenModalOpen(true);
                    }}
                    onOpenImageGenModal={() => setIsImageGenModalOpen(true)}
                    onShowHelp={() => setIsHelpOpen(true)}
                    isMobile={isMobile}
                />
            )}
            {itemType === 'world' && (
                <WorldForm
                    isOpen={isOpen}
                    onClose={onClose}
                    onSave={onSave}
                    itemToEdit={itemToEdit}
                    allSettings={allSettings}
                    onOpenWorldGenModal={(data) => {
                        setInitialWorldDataForGen(data);
                        setIsWorldGenModalOpen(true);
                    }}
                    onShowHelp={() => setIsWorldHelpOpen(true)}
                    isMobile={isMobile}
                />
            )}
            {isCharacterGenModalOpen && (
                <CharacterGenerationModal
                    isOpen={isCharacterGenModalOpen}
                    onClose={() => setIsCharacterGenModalOpen(false)}
                    onApply={(data) => useStore.getState().setFormData('character', data)}
                    initialData={initialCharacterDataForGen}
                />
            )}
            {isImageGenModalOpen && (
                <ImageGenerationModal
                    isOpen={isImageGenModalOpen}
                    onClose={() => setIsImageGenModalOpen(false)}
                    onGenerate={handleGenerateImage}
                    onGeneratePrompt={characterApi.generateCharacterImagePrompt}
                    onApplyImage={(imageUrl) => useStore.getState().setFormData('character', { appearance: { imageUrl } })}
                    characterDescription={useStore.getState().getCharacterDescriptionForImageGen()}
                    isGenerating={isImageGenerating}
                />
            )}
            {isWorldGenModalOpen && (
                <WorldGenerationModal
                    isOpen={isWorldGenModalOpen}
                    onClose={() => setIsWorldGenModalOpen(false)}
                    onApply={(data) => useStore.getState().setFormData('world', data)}
                    initialData={initialWorldDataForGen}
                />
            )}
            <CharacterHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <WorldHelpModal isOpen={isWorldHelpOpen} onClose={() => setIsWorldHelpOpen(false)} />
        </>,
        document.body
    );
};
