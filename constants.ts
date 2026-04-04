import { AiSettings, DisplaySettings, UserMode } from './types';

export const defaultAiSettings: AiSettings = { perspective: 'third_person_limited', length: 700, tone: '', creativity: '普通', knowledgeAdherence: '普通', suggestionFrequency: '普通', memoryScope: 'summary', assistantPersona: 'polite', markdownFrequency: 'しない', showSpeakerInDialogue: false, writingStyleMimicry: true, generateMultipleContinuations: false, applySpeakerColorToDialogue: false };
export const defaultDisplaySettings: DisplaySettings = { theme: 'light', fontFamily: 'sans', fontSize: 17, swapSidebars: false };

export const simpleModeAiSettings: AiSettings = { ...defaultAiSettings, creativity: '普通', knowledgeAdherence: '普通', suggestionFrequency: '少ない' };
export const simpleModeDisplaySettings: DisplaySettings = { ...defaultDisplaySettings, theme: 'light', fontFamily: 'sans', fontSize: 17, swapSidebars: false };

export const FONT_MAP = {
    'sans': "'Noto Sans JP', sans-serif",
    'serif': "'Noto Serif JP', serif",
    'rounded-sans': "'M PLUS Rounded 1c', sans-serif",
    'handwriting': "'Yuji Syuku', cursive",
    'sawarabi-serif': "'Sawarabi Mincho', serif",
    'kiwi-maru': "'Kiwi Maru', serif"
};

export const EMPTY_ARRAY = [];
export const EMPTY_OBJECT = {};


export const helpContent = {
    // ...existing content
    plotBoard: {
        title: "プロットボードの使い方",
        description: "物語の構成をカード形式で視覚的に整理する機能です。物語の骨組みを設計するのに役立ちます。",
        sections: [
            { heading: "カードの作成", body: "「＋」ボタンを押すと新しいプロットカードが作成されます。物語の重要な出来事やシーンを書き込みましょう。", useCase: "物語のあらすじを整理したい時。" },
            { heading: "カードの移動", body: "カードをドラッグ＆ドロップすることで、物語の順序を自由に入れ替えることができます。", useCase: "物語の構成を練り直したい時。" },
            { heading: "関係性の設定", body: "カード同士を線でつなぐことで、出来事の因果関係や伏線を可視化できます。", useCase: "伏線を整理したい時。" },
            { heading: "タイムラインへの反映", body: "作成したプロットをタイムラインに送ることで、時系列順に並べ替えて確認することができます。", useCase: "物語の時系列を確認したい時。" }
        ]
    },
    knowledgeBase: {
        title: "ナレッジベースの使い方",
        description: "物語に登場する用語や設定を管理する機能です。AIが物語の文脈を理解するのに役立ちます。",
        sections: [
            { heading: "用語の登録", body: "「＋」ボタンを押すと新しい用語を登録できます。物語の設定やルールを書き込みましょう。", useCase: "専門用語や魔法のルールを登録したい時。" },
            { heading: "カテゴリ分け", body: "カテゴリを設定することで、用語を整理して管理できます。", useCase: "用語が多くなってきた時に整理したい時。" },
            { heading: "AIへの参照", body: "登録した用語は、AIが物語を書く際に自動的に参照されます。特に重要な設定はピン留めしましょう。", useCase: "AIに設定を厳守させたい時。" },
            { heading: "非参照", body: "用語を「非参照」にすると、AIが物語を書く際にその用語を無視するようになります。設定を一時的に無効化したい時に便利です。", useCase: "物語の途中で設定が変わった時や、一時的に使わない設定を隠したい時。" }
        ]
    },
    knowledge: {
        title: "ナレッジの使い方",
        description: "物語の設定や用語を管理する方法です。",
        sections: [
            { heading: "カテゴリ", body: "用語を大きなグループに分けるために使います。例えば「キャラクター」「場所」「アイテム」などで分類すると整理しやすくなります。" },
            { heading: "タグ", body: "用語に複数のキーワードを付与して、横断的に検索しやすくします。例えば「重要」「伏線」「未確定」などの状態や属性を付与します。" },
            { heading: "カテゴリとタグの使い分け", body: "カテゴリは「分類（どこにあるか）」、タグは「属性（どんな特徴があるか）」として使い分けるのがおすすめです。" },
            { heading: "内容", body: "用語の詳細な説明や設定を記述します。AIが物語を書く際にここを参照するので、具体的かつ分かりやすく書きましょう。" }
        ]
    },
    assistantPersona: {
        title: "AIアシスタントの口調",
        description: "相談モードの時のAIの話し方（ペルソナ）を設定します。あなたの気分や相談内容に合わせて、AIの性格を切り替えることができます。",
        sections: [
            { heading: "丁寧な編集者", body: "「〜です」「〜ます」を基本とした、礼儀正しく的確なアドバイスをくれるパートナーです。", example: "「その設定は素晴らしいですね。物語の深みを増すために、彼の過去にもう一つエピソードを加えてみてはいかがでしょうか？」", useCase: "プロットの矛盾点チェックや、客観的な意見が欲しい時におすすめです。" },
            { heading: "親しい友人", body: "「〜だね！」「〜だよ」といった、親しい友人のようにフランクにアイデア出しを手伝ってくれます。", example: "「めっちゃいいね！そのキャラ、絶対人気出るよ！次はどんな活躍させようか？」", useCase: "行き詰まった時に、気軽に壁打ち相手が欲しい時や、モチベーションを上げたい時に。" },
            { heading: "分析的な批評家", body: "物語の構造や設定の甘さを冷静に、かつ論理的に指摘してくれます。厳しいですが、作品のクオリティ向上に大きく貢献します。", example: "「その展開は感情的ですが、伏線が不足しているため読者には唐突に映る危険性があります。Aの出来事との関連性をより明確に描写すべきです。」", useCase: "推敲の段階や、より完成度の高い物語を目指したい時に最適です。" },
            { heading: "創造的な詩人", body: "詩的で、常識にとらわれれないアーティスティックな提案をしてくれます。発想の飛躍を促します。", example: "「彼の悲しみを、ただ涙で表現するのではなく、『街から色が失われた』といった比喩で描いてみては？世界が彼の心象風景を映す鏡となるのです。」", useCase: "斬新な表現や、アーティスティックなインスピレーションが欲しい時に。" },
            { heading: "熱狂的なファン", body: "あなたのアイデアを全面的に肯定し、とにかく褒めてくれます。創作の楽しさを再確認させてくれる存在です。", example: "「最高です！先生！そのアイデアは天才のそれですよ！早く続きが読みたいです！読者を代表して言わせてください、あなたは神です！」", useCase: "とにかくモチベーションが欲しい時、自分を信じられなくなった時に。" }
        ]
    },
    writingStyleMimicry: {
        title: "ユーザーの文体を模倣する",
        description: "AIがあなたの書き癖を学習し、文体を模倣します。",
        sections: [
            { heading: "使い方", body: "このスイッチをONにすると、AIがあなたの過去の文章を分析し、書き癖を学習します。執筆モードでAIが続きを書く際、あなたの文体に合わせた文章を生成します。", useCase: "AIが書いた文章が自分の文体と違って浮いてしまうと感じた時。" },
            { heading: "項目別の説明", body: "AIはあなたの過去の段落を読み込み、語尾や言葉選びの傾向を抽出します。物語の序盤よりも、ある程度文章が溜まってからONにすると効果的です。" }
        ]
    },
    showSpeakerInDialogue: {
        title: "セリフの話者名表示",
        description: "セリフの前に話者名を表示します。",
        sections: [
            { heading: "使い方", body: "このスイッチをONにすると、セリフの前に「話者名」を表示します。脚本形式のような読みやすさを重視する場合に便利です。", useCase: "登場人物が多く、誰が喋っているか混乱しやすい会話劇を書く時。" },
            { heading: "項目別の説明", body: "脚本形式で書きたい場合や、プロット段階でセリフのやり取りを整理したい時に役立ちます。" }
        ]
    },
    applySpeakerColorToDialogue: {
        title: "セリフに話者カラーを適用",
        description: "キャラクターごとにセリフの色を変えます。",
        sections: [
            { heading: "使い方", body: "このスイッチをONにすると、キャラクターごとにセリフの色が自動的に変わります。誰が喋っているか視覚的に一目でわかります。", useCase: "会話劇がメインの物語や、登場人物が多いシーンを書く時。" },
            { heading: "項目別の説明", body: "キャラクター設定で色を設定しておくと、その色がセリフに反映されます。" }
        ]
    },
    perspective: {
        title: "文体・視点",
        description: "物語の語り口を設定します。",
        sections: [
            { heading: "使い方", body: "三人称か一人称か、あるいは全知視点かを選択できます。物語の雰囲気や、読者との距離感を決めたい時に設定します。", useCase: "物語の語り口を統一したい時。" },
            { heading: "三人称限定", body: "特定のキャラクターの視点に寄り添って描写します。" },
            { heading: "一人称", body: "主人公の心情を深く描写するのに適しています。" },
            { heading: "全知視点", body: "神のような視点で物語全体を俯瞰して描きます。" }
        ]
    },
    tone: {
        title: "トーン＆マナー",
        description: "文章の雰囲気や口調をAIに指示します。",
        sections: [
            { heading: "使い方", body: "文章の雰囲気や口調をAIに指示します。自由入力で具体的な雰囲気を指定できます。", useCase: "シリアス、コミカル、詩的など、物語の空気感を統一したい時。" },
            { heading: "項目別の説明", body: "「軽快で」「重厚な」など、形容詞を使うとAIが理解しやすいです。複数の要素を組み合わせることも可能です。" }
        ]
    },
    length: {
        title: "生成する文章量",
        description: "AIが一度に生成する文章の長さを設定します。",
        sections: [
            { heading: "使い方", body: "AIが一度に生成する文章の長さを設定します。", useCase: "会話のテンポを上げたい時は短く、情景描写を細かくしたい時は長くします。" }
        ]
    },
    creativity: {
        title: "創造性のレベル",
        description: "AIのアイデアの飛躍度合いを設定します。",
        sections: [
            { heading: "使い方", body: "AIのアイデアの飛躍度合いを設定します。", useCase: "設定を忠実に守ってほしい時は控えめに、予想外の展開が欲しい時は大胆にします。" }
        ]
    },
    memoryScope: {
        title: "記憶の範囲",
        description: "AIが物語の文脈をどこまで参照するかを設定します。",
        sections: [
            { heading: "使い方", body: "AIが物語の文脈をどこまで参照するかを設定します。", useCase: "長編小説で過去の設定を忘れてほしくない時は、広い範囲を参照させます。" },
            { heading: "現在のシーンのみ", body: "局所的な整合性を重視します。" },
            { heading: "現在の章全体", body: "章内の流れを重視します。" },
            { heading: "物語全体の文脈", body: "全体の整合性を重視します（高精度）。" }
        ]
    },
    knowledgeAdherence: {
        title: "ナレッジの参照強度",
        description: "設定資料をどれくらい厳密に守るかを設定します。",
        sections: [
            { heading: "使い方", body: "左パネルで設定したナレッジ（設定資料）をどれくらい厳密に守るかを設定します。", useCase: "設定資料の内容をAIに厳守させたい時は「厳格」にします。" }
        ]
    },
    suggestionFrequency: {
        title: "ナレッジ提案の頻度",
        description: "AIがナレッジの追加や修正を提案する頻度を設定します。",
        sections: [
            { heading: "使い方", body: "AIがナレッジ（設定資料）の追加や修正を提案する頻度を設定します。", useCase: "物語の序盤で設定を固めたい時は多めに、執筆に集中したい時は少なめにします。" }
        ]
    },
    markdownFrequency: {
        title: "マークダウンの使用頻度",
        description: "AIが生成する文章に、マークダウン装飾をどれくらい使うかを設定します。",
        sections: [
            { heading: "使い方", body: "AIが生成する文章に、太字や見出しなどのマークダウン装飾をどれくらい使うかを設定します。", useCase: "読みやすさを重視する時は多めに、プレーンテキストで書きたい時は「しない」にします。" }
        ]
    },
    undoScope: {
        title: "Undo/Redoの対象設定",
        description: "「元に戻す」「やり直す」操作の対象範囲を設定します。",
        sections: [
            { heading: "使い方", body: "操作をどこまで遡れるかを設定できます。本文の修正だけを戻したいのか、AIとの会話も戻したいのかを選択します。", useCase: "誤ってAIとの会話を消してしまった時や、本文の修正だけをやり直したい時に。" },
            { heading: "すべての操作", body: "本文、チャット、データ編集すべてを対象にします。" },
            { heading: "本文だけ", body: "本文の修正のみを対象にします。" },
            { heading: "AIチャットだけ", body: "AIとの会話履歴のみを対象にします。" },
            { heading: "データ編集のみ", body: "キャラクターや世界観などのデータ編集のみを対象にします。" }
        ]
    },
    userMode: {
        title: "ユーザーモード",
        description: "アプリの機能制限や表示モードを設定します。",
        sections: [
            { heading: "使い方", body: "あなたの習熟度に合わせて、アプリの表示や機能の複雑さを切り替えます。", useCase: "初心者の方は「かんたん」から始め、慣れてきたら「標準」「プロ」へ切り替えるのがおすすめです。" },
            { heading: "かんたん", body: "初心者・子供向け。機能を絞り込み、迷わないようにします。" },
            { heading: "標準", body: "かんたんモードに加え、以下の機能が追加されます。\n・詳細なAI設定（創造性、記憶範囲など）\n・プロットボードの高度な編集\n・タイムラインの管理" },
            { heading: "プロ", body: "標準モードに加え、以下の機能が追加されます。\n・すべての設定項目のピン止め\n・全機能のカスタマイズ\n・高度なエクスポートオプション" }
        ]
    },
    aiSettingsHelp: {
        title: "AI設定について",
        description: "AIの挙動やアプリの表示設定を変更するための設定項目です。",
        sections: [
            { heading: "設定項目", body: "AIの文章生成スタイルや、アプリの表示設定などを細かくカスタマイズできます。各項目のヘルプボタンから詳細を確認できます。" },
            { heading: "ピン止め", body: "よく使う設定項目を「クイック設定」に登録できます。ピン止めした項目は、設定画面を開かなくても素早くアクセスできるようになります。" }
        ]
    }
};