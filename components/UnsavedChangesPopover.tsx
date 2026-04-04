import React from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../icons';

export const UnsavedChangesPopover = ({
  isOpen,
  targetRef, // Kept for compatibility but ignored
  onSaveAndClose,
  onCloseWithoutSaving,
  onCancel,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-6 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center space-y-2">
          <div className="mx-auto bg-yellow-500/20 w-12 h-12 rounded-full flex items-center justify-center mb-4">
             <Icons.InfoIcon className="h-6 w-6 text-yellow-400" />
          </div>
          <h3 className="text-lg font-bold text-white">未保存の変更があります</h3>
          <p className="text-sm text-gray-300">
            編集中の内容を保存して閉じますか？
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <button
            onClick={onSaveAndClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition font-semibold btn-pressable"
          >
            <Icons.CheckIcon className="h-5 w-5" />
            保存して閉じる
          </button>
          
          <button
            onClick={onCloseWithoutSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/90 hover:bg-red-500 text-white rounded-lg transition font-semibold btn-pressable"
          >
            <Icons.TrashIcon className="h-5 w-5" />
            保存せずに閉じる
          </button>
          
          <button
            onClick={onCancel}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition btn-pressable"
          >
            <Icons.XIcon className="h-5 w-5" />
            キャンセル
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
