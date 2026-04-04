
import { UserMode } from './types';

export interface HelpContent {
    title: string;
    desc: string;
    shortcut?: string;
    tech?: string;
}

export const helpTexts: Record<string, Record<UserMode, HelpContent>> = {
    // --- エディタ本体 ---
    editor_main: {
        simple: { title: '原稿用紙', desc: 'ここに物語を書いていきます。' },
        standard: { title: 'エディタ', desc: '本文の執筆エリアです。' },
        pro: { title: 'Text Area', desc: '原稿の執筆に集中するエリアです。', tech: 'NovelEditor' }
    },
    direct_input_open: {
        simple: { title: '入力欄をだす', desc: '自分で書く場所を開きます。' },
        standard: { title: '直接入力を表示', desc: '本文入力エリアを開閉。', shortcut: 'Alt+I' },
        pro: { title: 'Toggle Direct Input', desc: 'Ctrl+Alt+I で開閉。', shortcut: 'Alt+I', tech: 'Inline Editor' }
    },

    // --- エディタ装飾 ---
    bold: {
        simple: { title: '太字', desc: '文字を太くして目立たせます。' },
        standard: { title: '太字にする', desc: '選択した文字を強調します。', shortcut: 'B' },
        pro: { title: '太字タグの挿入', desc: 'Markdown記法 (**) で囲みます。', shortcut: 'B', tech: 'strong要素に変換' }
    },
    underline: {
        simple: { title: '下線', desc: '文字の下に線を引きます。' },
        standard: { title: '下線を引く', desc: '重要な箇所に線を引きます。', shortcut: 'U' },
        pro: { title: '下線タグの挿入', desc: 'Markdown記法 (__) を適用。', shortcut: 'U', tech: 'u要素に変換' }
    },
    heading: {
        simple: { title: '大きな文字', desc: '文字を大きくしてタイトルにします。' },
        standard: { title: '見出しにする', desc: '章のタイトルなどに使います。', shortcut: 'H' },
        pro: { title: '見出しタグ (#)', desc: '行頭に # を挿入します。', shortcut: 'H', tech: 'h1要素に変換' }
    },
    ruby: {
        simple: { title: 'ふりがな', desc: '漢字の上に読みがなをつけます。' },
        standard: { title: 'ルビを振る', desc: '選択範囲にふりがなを設定。', shortcut: 'R' },
        pro: { title: 'ルビ構文の挿入', desc: '{漢字|よみ} 形式を挿入。', shortcut: 'R', tech: 'ruby要素として描画' }
    },
    palette: {
        simple: { title: '色をぬる', desc: '文字に色をつけます。' },
        standard: { title: '文字色を適用', desc: '選んでいるブラシの色で塗ります。', shortcut: 'Shift+C' },
        pro: { title: 'カラータグの挿入', desc: '独自拡張タグ (<c:#hex>) を挿入。', shortcut: 'Shift+C', tech: 'Inline Style Injection' }
    },
    palette_select: {
        simple: { title: '色をえらぶ', desc: 'ぬる色を変えます。' },
        standard: { title: 'カラーパレット', desc: 'ブラシの色を選択します。' },
        pro: { title: 'Color Picker', desc: 'Hex/Presetによる色指定。' }
    },

    // --- アクティビティバー / パネルフォーカス ---
    settings: {
        simple: { title: '設定', desc: 'アプリの調整をします。' },
        standard: { title: 'プロジェクト設定', desc: 'AIの性格や表示を細かく設定。', shortcut: 'Alt+S' },
        pro: { title: 'Project Config', desc: 'Ctrl+Alt+S で設定を開く。', shortcut: 'Alt+S', tech: 'Zustand Store' }
    },
    characters: {
        simple: { title: 'キャラ', desc: '登場人物の名簿です。' },
        standard: { title: 'キャラクター設定', desc: '登場人物を管理。' },
        pro: { title: 'Characters', desc: '登場人物のステータスや立ち絵を管理します。', tech: 'Entity Management' }
    },
    worlds: {
        simple: { title: '世界', desc: '舞台設定のメモです。' },
        standard: { title: '世界観設定', desc: '場所や組織を管理。' },
        pro: { title: 'World Settings', desc: '物語の舞台や固有の法則を管理します。', tech: 'World Building' }
    },
    knowledge: {
        simple: { title: '辞書', desc: '特別な言葉をまとめます。' },
        standard: { title: 'ナレッジベース', desc: '作中用語やルールを管理。' },
        pro: { title: 'Knowledge Base', desc: 'AIが参照する作中事典を管理します。', tech: 'RAG Context' }
    },
    plots: {
        simple: { title: 'おはなし', desc: '物語の流れを考えます。' },
        standard: { title: 'プロットボード', desc: '構成を視覚的に整理します。' },
        pro: { title: 'Plot Board', desc: 'カード形式で物語の構造を設計します。', tech: 'Graph Editor' }
    },
    outline: {
        simple: { title: 'もくじ', desc: '章の進み具合を見ます。' },
        standard: { title: 'アウトライン', desc: '章の移動ができます。' },
        pro: { title: 'Outline', desc: '章構成の管理とナビゲーションを行います。', tech: 'Navigation' }
    },

    // --- ヘッダー機能 ---
    search: {
        simple: { title: 'さがす', desc: '物語の中の言葉をさがします。', shortcut: 'F' },
        standard: { title: '全体検索', desc: 'キャラも本文も一発検索。', shortcut: 'F' },
        pro: { title: 'Global Search', desc: 'Ctrl+K でコマンドパレット。', shortcut: 'F', tech: 'Search Engine' }
    },
    sidebar_left: {
        simple: { title: '資料を隠す', desc: '画面を広くします。', shortcut: '[' },
        standard: { title: '左パネル開閉', desc: '資料棚を表示/非表示。', shortcut: '[' },
        pro: { title: 'Toggle Left', desc: 'Layout Control.', shortcut: '[' }
  },
    sidebar_right: {
        simple: { title: 'AIを隠す', desc: '執筆に集中します。', shortcut: ']' },
        standard: { title: '右パネル開閉', desc: 'AIアシスタントを表示/非表示。', shortcut: ']' },
        pro: { title: 'Toggle Right', desc: 'AI Control.', shortcut: ']' }
    },

    // --- AI操作 ---
    undo: {
        simple: { title: 'もとに戻す', desc: '失敗しても大丈夫！', shortcut: 'Z' },
        standard: { title: '元に戻す', desc: '直前の操作を取り消します。', shortcut: 'Z' },
        pro: { title: 'Undo', desc: '操作を一段階ロールバックします。', shortcut: 'Z', tech: 'History Tree Back' }
    },
    redo: {
        simple: { title: 'やり直し', desc: 'やっぱり今のままで！', shortcut: 'Y' },
        standard: { title: 'やり直す', desc: '元に戻した操作を復元します。', shortcut: 'Y' },
        pro: { title: 'Redo', desc: 'ロールバックした操作を再適用. ', shortcut: 'Y', tech: 'History Tree Forward' }
    },
    general_help: {
        simple: { title: 'ヘルプ', desc: '使いかたを教えます。' },
        standard: { title: '説明書を開く', desc: 'アプリの機能や使いかたを確認。' },
        pro: { title: 'Documentation', desc: '詳細なマニュアルと仕様を表示。' }
    },
    mode_switch: {
        simple: { title: 'モード切替', desc: 'AIの役割を変えます。' },
        standard: { title: '相談/執筆モード', desc: '役割を切り替えます。', shortcut: 'Shift+M' },
        pro: { title: 'Intent Switch', desc: 'Consult vs Write.', shortcut: 'Shift+M' }
    },
    multiple_suggestions: {
        simple: { title: 'いっぱい出す', desc: 'AIがいくつかのお話を考えてくれます。' },
        standard: { title: '複数提案モード', desc: 'AIが一度に3パターンの展開を提案。' },
        pro: { title: 'Multi-Generation', desc: '複数のパスを生成して選択可能に。' }
    },
    suggestion_history: {
        simple: { title: 'まえの提案', desc: 'さっきAIがいってくれたことを見ます。' },
        standard: { title: '提案履歴', desc: '一度断ったAIのアイデアを読み直せます。' },
        pro: { title: 'Archive', desc: '過去の全提案にアクセス。' }
    },
    ai_support_menu: {
        simple: { title: 'おたすけ', desc: 'AIに頼むメニューをだします。' },
        standard: { title: 'AI支援メニュー', desc: '執筆やアイデア出しの雛形を使えます。' },
        pro: { title: 'Support Context', desc: 'Template & Utils Injection.' }
    },
    focus_ai: {
        simple: { title: 'AIにお願い', desc: 'ここに頼みごとを書きます。' },
        standard: { title: 'AI入力欄', desc: '指示を入力します。', shortcut: '/' },
        pro: { title: 'AI Input', desc: 'AIアシスタントへの対話プロンプトを入力します。', shortcut: '/', tech: 'Prompt Engineering' }
    },
    send_ai: {
        simple: { title: 'おくる', desc: 'AIに話しかけます。' },
        standard: { title: 'メッセージ送信', desc: '執筆を開始します。', shortcut: 'Enter' },
        pro: { title: 'Submit', desc: 'Ctrl+Enter で送信。', shortcut: 'Enter', tech: 'API Call' }
    },
    apply_ai: {
        simple: { title: 'おまかせ', desc: 'AIの提案を反映します。' },
        standard: { title: '設定に反映', desc: '提案をデータに入れます。', shortcut: 'Alt+Enter' },
        pro: { title: 'Apply', desc: 'Alt+Enter で即座に反映。', shortcut: 'Alt+Enter', tech: 'State Update' }
    },

    // --- クイック作成 ---
    new_char: {
        simple: { title: '新キャラ', desc: '新しい人物を作ります。' },
        standard: { title: 'キャラ新規作成', desc: '新しい登場人物を追加。', shortcut: 'Alt+C' },
        pro: { title: 'Create Character', desc: 'Entity: Char.', shortcut: 'Alt+C' }
    },
    new_world: {
        simple: { title: '新世界', desc: '新しい場所を作ります。' },
        standard: { title: '世界観新規作成', desc: '新しい場所や組織を追加。', shortcut: 'Alt+W' },
        pro: { title: 'Create World', desc: 'Entity: World.', shortcut: 'Alt+W' }
    },
    new_knowledge: {
        simple: { title: '新辞書', desc: '新しい言葉を作ります。' },
        standard: { title: 'ナレッジ新規作成', desc: '新しい用語を追加。', shortcut: 'Alt+K' },
        pro: { title: 'Create Knowledge', desc: 'Entity: Fact.', shortcut: 'Alt+K' }
    },
    knowledge_base_all: {
        simple: { title: 'すべて見る', desc: '辞書を全部ひらきます。' },
        standard: { title: 'ナレッジ一覧', desc: '登録した全ての用語を検索・管理。', shortcut: 'Shift+K' },
        pro: { title: 'KB Manager', desc: 'Full-text search & entity grid.', shortcut: 'Shift+K' }
    },
    knowledgeBase: {
        simple: { title: 'ナレッジの使い方', desc: '物語の設定や用語を管理する方法です。' },
        standard: { title: 'ナレッジベースのヘルプ', desc: '用語の登録、カテゴリ分け、AIへの参照方法を解説します。' },
        pro: { title: 'Knowledge Base Guide', desc: 'AIコンテキスト管理ガイド。' }
    },
    
    // --- ツール ---
    chart_open: {
        simple: { title: '相関図', desc: '関係を見ます。' },
        standard: { title: '相関図を表示', desc: '人物の関係を可視化。', shortcut: 'Shift+C' },
        pro: { title: 'Relation Chart', desc: 'Ctrl+Shift+C', shortcut: 'Shift+C' }
    },
    timeline_open: {
        simple: { title: '年表', desc: '出来事の順序を見ます。' },
        standard: { title: 'タイムラインを表示', desc: '物語の時系列を管理。', shortcut: 'Shift+T' },
        pro: { title: 'Timeline Board', desc: 'Ctrl+Shift+T', shortcut: 'Shift+T' }
    },
    name_gen_open: {
        simple: { title: '名前づけ', desc: 'いい名前を考えます。' },
        standard: { title: '固有名詞生成', desc: '名前や用語を自動作成。', shortcut: 'Shift+G' },
        pro: { title: 'Name Generator', desc: 'Ctrl+Shift+G', shortcut: 'Shift+G' }
    },
    plot_plus: {
        simple: { title: 'プロット追加', desc: '話を足します。' },
        standard: { title: '新規カード作成', desc: 'プロットを追加。', shortcut: 'Shift+P' },
        pro: { title: 'New Plot Card', desc: 'Ctrl+Shift+P', shortcut: 'Shift+P' }
    },
    plotBoard: {
        simple: { title: 'プロットボードの使い方', desc: '物語の構成をカードで整理する方法です。' },
        standard: { title: 'プロットボードのヘルプ', desc: 'カードの作成、移動、関係性の設定方法を解説します。' },
        pro: { title: 'Plot Board Guide', desc: 'ノードベースのストーリー設計ガイド。' }
    },
    import_text_open: {
        simple: { title: '解析して', desc: 'お話を読み取って、設定を自動で作ります。' },
        standard: { title: 'テキスト解析', desc: '貼り付けた文章から、キャラや用語を自動で抽出します。', shortcut: 'Alt+A' },
        pro: { title: 'Text Analysis', desc: 'LLMによるエンティティ抽出と設定の自動構築。', shortcut: 'Alt+A', tech: 'Gemini Pro / analysisApi' }
    }
};
