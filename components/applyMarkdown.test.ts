import { describe, it, expect } from 'vitest';
import { applyMarkdown } from './applyMarkdown';

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

describe('applyMarkdown — color tag (opt-in placeholder)', () => {
  const COLOR_PREFIX = '<c:#ef4444>';
  const COLOR_SUFFIX = '</c>';

  it('color with no selection inserts placeholder and collapses cursor to the end', () => {
    const r = applyMarkdown({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      prefix: COLOR_PREFIX,
      suffix: COLOR_SUFFIX,
      placeholder: 'テキスト',
      shouldClearSelection: true,
    });
    expect(r.newText).toBe('<c:#ef4444>テキスト</c>');
    expect(r.newSelectionStart).toBe(r.newText.length);
    expect(r.newSelectionEnd).toBe(r.newText.length);
  });

  it('color with selection wraps and collapses cursor to the end', () => {
    const r = applyMarkdown({
      text: 'hello',
      selectionStart: 0,
      selectionEnd: 5,
      prefix: COLOR_PREFIX,
      suffix: COLOR_SUFFIX,
      placeholder: 'テキスト',
      shouldClearSelection: true,
    });
    expect(r.newText).toBe('<c:#ef4444>hello</c>');
    expect(r.newSelectionStart).toBe(r.newText.length);
    expect(r.newSelectionEnd).toBe(r.newText.length);
  });

  it('placeholder without shouldClearSelection pre-selects the placeholder for overwrite', () => {
    const r = applyMarkdown({
      text: 'a',
      selectionStart: 1,
      selectionEnd: 1,
      prefix: '[',
      suffix: ']',
      placeholder: 'X',
    });
    expect(r.newText).toBe('a[X]');
    expect(r.newSelectionStart).toBe(2);
    expect(r.newSelectionEnd).toBe(3);
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
