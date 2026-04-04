import React, { useState, useEffect, useRef } from 'react';
import * as Icons from '../icons';
import { NovelChunk, SettingItem, KnowledgeItem, AiSettings } from '../types';
import { parseMarkdown } from '../utils';

export const PreviewModal = ({ isOpen, onClose, title, content, characters, knowledgeBase, aiSettings }) => {
    
    if (!isOpen) return null;
    const characterCount = content.reduce((acc, chunk) => acc + chunk.text.length, 0);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                     <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2"><Icons.EyeIcon className="h-5 w-5" /> {title} - プレビュー</h2>
                        <span className="text-sm text-gray-400">(総文字数: {characterCount.toLocaleString()})</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition">
                            <Icons.XIcon />
                        </button>
                    </div>
                </div>
                <div className={`flex-grow overflow-y-auto p-6`}>
                    <div className={`prose prose-invert prose-lg max-w-full`}>
                        {content.map(chunk => (
                             <div key={chunk.id} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: parseMarkdown(chunk.text, characters, knowledgeBase, aiSettings) }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};