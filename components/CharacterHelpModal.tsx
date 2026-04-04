import React, { useState } from 'react';
import * as Icons from '../icons';

const helpData = {
    profile: [
        { icon: <Icons.UserIcon className="h-5 w-5 text-blue-300"/>, title: '名前', description: 'キャラクターの名前です。この項目は必須です。' },
        { icon: <Icons.TypeIcon className="h-5 w-5 text-gray-300"/>, title: 'ふりがな', description: 'キャラクターの名前の読み方をひらがなまたはカタカナで入力します。' },
        { icon: <Icons.UserIcon className="h-5 w-5 text-gray-300"/>, title: '性別', description: 'キャラクターの性別を自由形式で入力できます。（例：男性、女性、不明）' },
        { icon: <Icons.LayersIcon className="h-5 w-5 text-gray-300"/>, title: '種族', description: 'キャラクターの種族です。（例：人間、エルフ、ドラゴン、AI）' },
        { icon: <Icons.MapPinIcon className="h-5 w-5 text-gray-300"/>, title: '出身地・所属組織', description: '世界観設定で作成した「場所」や「組織」から選択、または自由入力します。' },
        { icon: <Icons.PaletteIcon className="h-5 w-5 text-gray-300"/>, title: 'テーマカラー', description: 'キャラクターを象徴する色です。本文中のセリフの色や相関図の枠線の色として反映されます。' },
        { icon: <Icons.ImageIcon className="h-5 w-5 text-gray-300"/>, title: '画像', description: 'キャラクターの参考画像をURLで指定するか、ローカルからファイルをアップロードできます。' },
        { icon: <Icons.ListOrderedIcon className="h-5 w-5 text-gray-300"/>, title: '容姿特徴リスト', description: '「髪の色：赤」のように、外見的特徴を「項目名」と「内容」のペアで自由に追加できます。' },
    ],
    personality: [
        { icon: <Icons.UserCogIcon className="h-5 w-5 text-lime-300"/>, title: '性格', description: 'キャラクターの性格や価値観などを詳しく記述します。AIはここからキャラクターの行動原理を読み取ります。' },
        { icon: <Icons.PenSquareIcon className="h-5 w-5 text-gray-300"/>, title: '一人称', description: 'キャラクターが自身を指す言葉を設定します。（例：私、僕、俺、わし）' },
        { icon: <Icons.PenSquareIcon className="h-5 w-5 text-gray-300"/>, title: '話し方', description: 'キャラクターの口調やよく使う言葉、セリフのサンプルを設定します。（例：丁寧語、乱暴な口調、「〜ですわ」）' },
        { icon: <Icons.LockIcon className="h-5 w-5 text-gray-300"/>, title: '秘密', description: 'キャラクターが抱える秘密や、物語の重要な伏線となる情報を記述します。' },
    ],
    ai_settings: [
        { icon: <Icons.BotIcon className="h-5 w-5 text-indigo-300"/>, title: '詳細設定 (AIが参照)', description: 'ここに書かれた内容は、AIが物語を生成する際に、キャラクターの詳細設定として参照します。物語の背景や、キャラクターの過去など、AIに記憶させておきたい情報を入力してください。' },
        { icon: <Icons.PenSquareIcon className="h-5 w-5 text-gray-300"/>, title: 'メモ (AIは非参照)', description: 'あなた専用のメモ欄です。今後の展開案など、AIに知られたくない情報を書き込めます。' },
        { icon: <Icons.BookIcon className="h-5 w-5 text-orange-300"/>, title: '書き出し用説明文', description: 'HTML書き出し時に「登場人物」として表示される説明文です。空の場合は、ふりがな・性別・年齢・性格などから自動生成されます。' },
    ]
};


export const CharacterHelpModal = ({ isOpen, onClose }) => {
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
                    <h2 className="text-xl font-bold text-indigo-400 flex items-center"><Icons.HelpCircleIcon className="h-5 w-5 mr-2" />キャラクター設定ヘルプ</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition"><Icons.XIcon /></button>
                </div>

                <div className="flex border-b border-gray-700 mb-6 flex-shrink-0">
                    <TabButton tabId="profile" label="プロフィール・外見" />
                    <TabButton tabId="personality" label="性格・内面" />
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
