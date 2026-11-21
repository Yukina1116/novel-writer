// Pure markdown-application helpers extracted from EditableParagraph.
//
// applyMarkdown: when there is no selection, insert just `${prefix}${suffix}` and place a
// collapsed cursor between them. When there is a selection, wrap it
// (`${prefix}${selected}${suffix}`) and keep the inner text selected for further typing.
//
// applyColorTag: color tags are applied ONLY to a selection. With no selection it returns
// `null` (no edit at all) instead of injecting placeholder text — a placeholder such as
// 「テキスト」 would be silently saved into the paragraph (same rationale as issue #102, which
// removed the placeholder for B/U/H/ruby; the color path was the remaining holdout).

export interface ApplyMarkdownInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  prefix: string;
  suffix?: string;
  shouldClearSelection?: boolean;
}

export interface ApplyMarkdownResult {
  newText: string;
  newSelectionStart: number;
  newSelectionEnd: number;
}

export function applyMarkdown(input: ApplyMarkdownInput): ApplyMarkdownResult {
  const {
    text,
    selectionStart,
    selectionEnd,
    prefix,
    suffix = prefix,
    shouldClearSelection = false,
  } = input;

  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const hasSelection = end > start;
  const selectedText = text.substring(start, end);

  const inner = hasSelection ? selectedText : '';
  const replacement = `${prefix}${inner}${suffix}`;
  const newText = text.substring(0, start) + replacement + text.substring(end);

  let newSelectionStart: number;
  let newSelectionEnd: number;

  if (shouldClearSelection) {
    const cursor = start + replacement.length;
    newSelectionStart = cursor;
    newSelectionEnd = cursor;
  } else if (hasSelection) {
    newSelectionStart = start + prefix.length;
    newSelectionEnd = newSelectionStart + selectedText.length;
  } else {
    const cursor = start + prefix.length;
    newSelectionStart = cursor;
    newSelectionEnd = cursor;
  }

  return { newText, newSelectionStart, newSelectionEnd };
}

/** 範囲が選択されているか（カーソルだけ=選択なし）。逆向きの選択(start > end)も正規化して判定する */
export function hasSelection(selectionStart: number, selectionEnd: number): boolean {
  return Math.max(selectionStart, selectionEnd) > Math.min(selectionStart, selectionEnd);
}

export interface ApplyColorTagInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  color: string;
}

/**
 * 選択範囲を `<c:色>…</c>` で包む。範囲が選択されていないときは `null`（本文を変更しない）を返す。
 * 適用後はカーソルをタグの末尾に置く。
 */
export function applyColorTag(input: ApplyColorTagInput): ApplyMarkdownResult | null {
  const { text, selectionStart, selectionEnd, color } = input;
  if (!hasSelection(selectionStart, selectionEnd)) return null;
  return applyMarkdown({
    text,
    selectionStart,
    selectionEnd,
    prefix: `<c:${color}>`,
    suffix: '</c>',
    shouldClearSelection: true,
  });
}
