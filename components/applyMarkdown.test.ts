import { describe, it, expect } from 'vitest';
import { applyMarkdown, applyColorTag, hasSelection } from './applyMarkdown';

describe('applyMarkdown — no selection (collapsed cursor)', () => {
  it('B with no selection inserts **** and places cursor between markers', () => {
    const r = applyMarkdown({ text: 'hello', selectionStart: 5, selectionEnd: 5, prefix: '**' });
    expect(r.newText).toBe('hello****');
    expect(r.newSelectionStart).toBe(7);
    expect(r.newSelectionEnd).toBe(7);
  });

  it('U with no selection inserts ____ and places cursor between markers', () => {
    const r = applyMarkdown({ text: '', selectionStart: 0, selectionEnd: 0, prefix: '__' });
    expect(r.newText).toBe('____');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(2);
  });

  it('H with no selection inserts "# " and places cursor after the marker', () => {
    const r = applyMarkdown({ text: 'foo', selectionStart: 0, selectionEnd: 0, prefix: '# ', suffix: '' });
    expect(r.newText).toBe('# foo');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(2);
  });

  it('R (ruby) with no selection inserts {|ふりがな} and places cursor after {', () => {
    const r = applyMarkdown({ text: '', selectionStart: 0, selectionEnd: 0, prefix: '{', suffix: '|ふりがな}' });
    expect(r.newText).toBe('{|ふりがな}');
    expect(r.newSelectionStart).toBe(1);
    expect(r.newSelectionEnd).toBe(1);
  });
});

describe('applyMarkdown — with selection (wrap, preserve inner)', () => {
  it('B with a range selection wraps and keeps the inner text selected', () => {
    const r = applyMarkdown({ text: 'hello world', selectionStart: 6, selectionEnd: 11, prefix: '**' });
    expect(r.newText).toBe('hello **world**');
    expect(r.newSelectionStart).toBe(8);
    expect(r.newSelectionEnd).toBe(13);
  });

  it('B with full-text selection does not inject placeholder (regression for issue #102)', () => {
    const r = applyMarkdown({ text: 'あいうえお', selectionStart: 0, selectionEnd: 5, prefix: '**' });
    expect(r.newText).toBe('**あいうえお**');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(7);
  });

  it('H with a selection prepends "# " and keeps the inner selection', () => {
    const r = applyMarkdown({ text: 'foo', selectionStart: 0, selectionEnd: 3, prefix: '# ', suffix: '' });
    expect(r.newText).toBe('# foo');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(5);
  });

  it('R with a selection wraps the kanji with ruby brackets', () => {
    const r = applyMarkdown({ text: '漢字テスト', selectionStart: 0, selectionEnd: 2, prefix: '{', suffix: '|ふりがな}' });
    expect(r.newText).toBe('{漢字|ふりがな}テスト');
    expect(r.newSelectionStart).toBe(1);
    expect(r.newSelectionEnd).toBe(3);
  });

  it('normalizes reversed selectionStart > selectionEnd inputs', () => {
    const r = applyMarkdown({ text: 'abc', selectionStart: 3, selectionEnd: 0, prefix: '**' });
    expect(r.newText).toBe('**abc**');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(5);
  });
});

describe('hasSelection', () => {
  it('カーソルのみ(start === end)は選択なし', () => {
    expect(hasSelection(0, 0)).toBe(false);
    expect(hasSelection(5, 5)).toBe(false);
  });

  it('境界: 1 文字の選択は選択あり。逆向き(start > end)も選択あり', () => {
    expect(hasSelection(0, 1)).toBe(true);
    expect(hasSelection(1, 0)).toBe(true);
  });
});

describe('applyColorTag — 範囲未選択では本文を一切変更しない', () => {
  const COLOR = '#ef4444';

  it('REGRESSION: 選択なし(カーソルのみ)は null を返す（旧実装は先頭に「テキスト」入りのタグ 19 文字を挿入していた）', () => {
    // 編集モードに入った直後はカーソルが先頭(0,0)。この状態で色ボタンを押しても何も挿入されない
    expect(applyColorTag({ text: 'これは本文です。', selectionStart: 0, selectionEnd: 0, color: COLOR })).toBeNull();
  });

  it('選択なし: カーソルが途中/末尾でも null', () => {
    expect(applyColorTag({ text: 'abc', selectionStart: 1, selectionEnd: 1, color: COLOR })).toBeNull();
    expect(applyColorTag({ text: 'abc', selectionStart: 3, selectionEnd: 3, color: COLOR })).toBeNull();
  });

  it('境界: 空文字 + カーソル 0 でも null（空のタグ対も作らない）', () => {
    expect(applyColorTag({ text: '', selectionStart: 0, selectionEnd: 0, color: COLOR })).toBeNull();
  });

  it('選択あり: <c:色>選択文字</c> で包み、カーソルをタグ末尾に置く', () => {
    const r = applyColorTag({ text: 'hello', selectionStart: 0, selectionEnd: 5, color: COLOR });
    expect(r).not.toBeNull();
    expect(r!.newText).toBe('<c:#ef4444>hello</c>');
    expect(r!.newSelectionStart).toBe(r!.newText.length);
    expect(r!.newSelectionEnd).toBe(r!.newText.length);
  });

  it('選択あり: 本文の途中の一部だけを包み、前後は変えない', () => {
    const r = applyColorTag({ text: '前の文。強調。後の文。', selectionStart: 4, selectionEnd: 7, color: '#3b82f6' });
    expect(r!.newText).toBe('前の文。<c:#3b82f6>強調。</c>後の文。');
  });

  it('境界: 1 文字だけの選択でも包む（最小の範囲）', () => {
    const r = applyColorTag({ text: 'abc', selectionStart: 1, selectionEnd: 2, color: COLOR });
    expect(r!.newText).toBe('a<c:#ef4444>b</c>c');
  });

  it('境界: 逆向きの選択(start > end)も正規化して包む', () => {
    const r = applyColorTag({ text: 'abc', selectionStart: 3, selectionEnd: 0, color: COLOR });
    expect(r!.newText).toBe('<c:#ef4444>abc</c>');
  });

  it('日本語の選択を正しく包む', () => {
    const r = applyColorTag({ text: '日本語テスト', selectionStart: 3, selectionEnd: 6, color: COLOR });
    expect(r!.newText).toBe('日本語<c:#ef4444>テスト</c>');
  });
});

describe('applyMarkdown — boundary conditions', () => {
  it('empty text + collapsed selection at 0 inserts at the start', () => {
    const r = applyMarkdown({ text: '', selectionStart: 0, selectionEnd: 0, prefix: '**' });
    expect(r.newText).toBe('****');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(2);
  });

  it('selection at the very end of text inserts at the tail', () => {
    const r = applyMarkdown({ text: 'abc', selectionStart: 3, selectionEnd: 3, prefix: '**' });
    expect(r.newText).toBe('abc****');
    expect(r.newSelectionStart).toBe(5);
    expect(r.newSelectionEnd).toBe(5);
  });

  it('multi-byte (Japanese) selection wraps correctly', () => {
    const r = applyMarkdown({ text: '日本語テスト', selectionStart: 0, selectionEnd: 3, prefix: '__' });
    expect(r.newText).toBe('__日本語__テスト');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(5);
  });
});
