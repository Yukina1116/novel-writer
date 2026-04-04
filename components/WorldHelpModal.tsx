import React, { useState } from 'react';
import * as Icons from '../icons';

const helpData = {
    profile: [
        { icon: <Icons.GlobeIcon className="h-5 w-5 text-green-300"/>, title: '名前', description: '世界観設定の項目名です。（例：アストリア王国、古代魔法体系）この項目は必須です。' },
        { icon: <Icons.LayersIcon className="h-5 w-5 text-gray-300"/>, title: 'テンプレート', description: '「場所」や「組織」、「魔法・技術」など、よく使われる設定項目をボタン一つで簡単に追加できます。' },
        { icon: <Icons.ListOrderedIcon className="h-5 w-5 text-gray-300"/>, title: 'カスタム項目', description: 'テンプレートにない独自の設定を追加できます。（例：通貨単位、特定の法律）' },
    ],
    visual: [
        { icon: <Icons.ImageIcon className="h-5 w-5 text-cyan-300"/>, title: '地図・イメージ画像', description: '世界地図などの画像をURLで指定するか、ローカルからファイルをアップロードできます。アップロードした画像はプレビューされ、拡大表示も可能です。' },
    ],
    ai_settings: [
        { icon: <Icons.BotIcon className="h-5 w-5 text-indigo-300"/>, title: '詳細設定 (AIが参照)', description: 'ここに書かれた内容は、AIが物語を生成する際に、世界の詳細設定として参照します。物語の歴史、文化、地理、物理法則など、AIに記憶させておきたい情報を入力してください。' },
        { icon: <Icons.PenSquareIcon className="h-5 w-5 text-gray-300"/>, title: 'メモ (AIは非参照)', description: 'このメモはあなた専用です。AIはこの内容を見ることができないため、プロットのアイデアや今後の展開など、ネタバレを含む情報も安心して書き込めます。' },
        { icon: <Icons.BookIcon className="h-5 w-5 text-orange-300"/>, title: '書き出し用説明文', description: 'HTML書き出し時に「世界観・用語集」として表示される説明文です。空の場合は、「詳細設定」の内容が使用されます。' },
    ]
};

export const WorldHelpModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('profile');

    if (!isOpen) return null;

    const TabButton = ({ tabId, label }: { tabId: string; label: React.ReactNode }) => (
        <button type="button" onClick={() => setActiveTab(tabId)} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tabId ? 'border-b-2 border-indigo-400 text-indigo-400' : 'border-b-2 border-transparent text-gray-400 hover:text-gray-200'}`}>
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[80]">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-indigo-400 flex items-center"><Icons.HelpCircleIcon className="h-5 w-5 mr-2" />世界観設定ヘルプ</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                </div>

                <div className="flex border-b border-gray-700 mb-6 flex-shrink-0">
                    <TabButton tabId="profile" label="基本設定" />
                    <TabButton tabId="visual" label="ビジュアル" />
                    <TabButton tabId="ai_settings" label="AI・書き出し設定" />
                </div>

                <div className="flex-grow overflow-y-auto pr-2 space-y-4 text-gray-300">
                    {helpData[activeTab].map(section => (
                         <div key={section.title} className="bg-gray-900/50 p-4 rounded-lg flex items-start gap-4">
                            <div className="flex-shrink-0 mt-1">
                                {section.icon}
                            </div>
                            <div>
                                <h3 className="font-semibold text-md text-lime-400">{section.title}</h3>
                                <p className="mt-1 text-sm">{section.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
