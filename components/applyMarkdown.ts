// Pure markdown-application helper extracted from EditableParagraph.
//
// Default behaviour (no `placeholder`): when there is no selection, insert just
// `${prefix}${suffix}` and place a collapsed cursor between them. When there is
// a selection, wrap it (`${prefix}${selected}${suffix}`) and keep the inner
// text selected for further typing.
//
// `placeholder` is opt-in (color tag legacy): when supplied AND there is no
// selection, the placeholder text is inserted between prefix/suffix and either
// pre-selected for overwrite (default) or replaced by a collapsed cursor at the
// end of the replacement (when `shouldClearSelection` is true).

export interface ApplyMarkdownInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  prefix: string;
  suffix?: string;
  placeholder?: string;
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
    placeholder,
    shouldClearSelection = false,
  } = input;

  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const hasSelection = end > start;
  const selectedText = text.substring(start, end);

  const inner = hasSelection ? selectedText : (placeholder ?? '');
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
  } else if (placeholder) {
    newSelectionStart = start + prefix.length;
    newSelectionEnd = newSelectionStart + placeholder.length;
  } else {
    const cursor = start + prefix.length;
    newSelectionStart = cursor;
    newSelectionEnd = cursor;
  }

  return { newText, newSelectionStart, newSelectionEnd };
}
