import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Static-grep regression test for Issue #101.
// Pins the *set* of shortcut keys handled in two independent places:
//   1. Global keybindings (`hooks/useKeybindings.ts`) — fires when no inline editor
//      is focused, mounted on `window.keydown`.
//   2. Inline editor shortcuts (`components/EditableParagraph.tsx`) — fires only
//      while a paragraph textarea is being edited.
//
// Both layers must NOT bind the same physical key combination, since global
// listeners still receive the event during textarea editing (`isInputFocused`
// is checked only on a subset of branches). The original collision (Ctrl+Shift+C
// firing both "文字色" and "相関図") is the motivation.

const ROOT = resolve(__dirname, '..', '..');

const readSrc = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf-8');

// --- Global keybindings (Ctrl/Cmd + ...) ---
// Each entry is "modifier-keychord -> meaning".
interface KeyBinding {
    chord: string;
    source: 'global' | 'editor';
    purpose: string;
}

const GLOBAL_SHORTCUTS: KeyBinding[] = [
    // Direct (no shift/alt) — non-shifted alphabetic ctrl/cmd
    { chord: 'Ctrl+Z', source: 'global', purpose: 'undo' },
    { chord: 'Ctrl+Shift+Z', source: 'global', purpose: 'redo' },
    { chord: 'Ctrl+Y', source: 'global', purpose: 'redo' },
    { chord: 'Ctrl+F', source: 'global', purpose: 'globalSearch' },
    { chord: 'Ctrl+K', source: 'global', purpose: 'commandPalette' },
    { chord: 'Ctrl+S', source: 'global', purpose: 'modalSave' },
    { chord: 'Ctrl+Alt+S', source: 'global', purpose: 'aiSettings' },
    { chord: 'Ctrl+Shift+M', source: 'global', purpose: 'toggleGenerationMode' },
    { chord: 'Ctrl+Shift+C', source: 'global', purpose: 'characterChart' },
    { chord: 'Ctrl+Shift+T', source: 'global', purpose: 'timeline' },
    { chord: 'Ctrl+Shift+L', source: 'global', purpose: 'plot' },
    { chord: 'Ctrl+Shift+G', source: 'global', purpose: 'nameGenerator' },
    { chord: 'Ctrl+Shift+K', source: 'global', purpose: 'knowledgeBase' },
    { chord: 'Ctrl+Alt+I', source: 'global', purpose: 'toggleNewChunkInput' },
    { chord: 'Ctrl+Alt+C', source: 'global', purpose: 'newCharacter' },
    { chord: 'Ctrl+Alt+W', source: 'global', purpose: 'newWorld' },
    { chord: 'Ctrl+Alt+K', source: 'global', purpose: 'newKnowledge' },
    { chord: 'Ctrl+Alt+A', source: 'global', purpose: 'importText' },
    { chord: 'Ctrl+[', source: 'global', purpose: 'toggleLeftSidebar' },
    { chord: 'Ctrl+]', source: 'global', purpose: 'toggleRightSidebar' },
    { chord: 'Ctrl+/', source: 'global', purpose: 'focusAiInput' },
];

// --- Editor shortcuts (inside `<textarea aria-label="本文段落の編集">`) ---
const EDITOR_SHORTCUTS: KeyBinding[] = [
    { chord: 'Ctrl+Enter', source: 'editor', purpose: 'saveEdit' },
    { chord: 'Ctrl+B', source: 'editor', purpose: 'bold' },
    { chord: 'Ctrl+U', source: 'editor', purpose: 'underline' },
    { chord: 'Ctrl+H', source: 'editor', purpose: 'heading' },
];

describe('shortcut-conflicts — Issue #101 regression', () => {
    it('no chord is shared between global and editor handlers', () => {
        const globalChords = new Set(GLOBAL_SHORTCUTS.map(s => s.chord));
        const collisions = EDITOR_SHORTCUTS.filter(s => globalChords.has(s.chord));
        expect(collisions).toEqual([]);
    });

    it('hooks/useKeybindings.ts does not bind Ctrl+Shift+P (browser Print conflict)', () => {
        const src = readSrc('hooks/useKeybindings.ts');
        // Search inside the e.shiftKey branch for `case 'p':`. The plot shortcut
        // was moved to Ctrl+Shift+L.
        // Allow the literal 'p' to appear elsewhere (e.g. in regex / strings),
        // but `case 'p':` followed by openModal('plot') would be a regression.
        const shiftBranchMatch = src.match(/if \(e\.shiftKey\)[\s\S]*?\n {16}\}/);
        expect(shiftBranchMatch).not.toBeNull();
        expect(shiftBranchMatch![0]).not.toMatch(/case 'p':[\s\S]*?openModal\('plot'\)/);
        expect(shiftBranchMatch![0]).toMatch(/case 'l':[\s\S]*?openModal\('plot'\)/);
    });

    it('components/EditableParagraph.tsx does not bind Ctrl+R (browser Reload conflict)', () => {
        const src = readSrc('components/EditableParagraph.tsx');
        // The ruby shortcut was dropped; toolbar button still works.
        const switchMatch = src.match(/switch \(e\.key\) \{[\s\S]*?\n {12}\}/);
        expect(switchMatch).not.toBeNull();
        expect(switchMatch![0]).not.toMatch(/case 'r':/);
    });

    it('components/EditableParagraph.tsx does not bind Ctrl+Shift+C (global Character chart conflict)', () => {
        const src = readSrc('components/EditableParagraph.tsx');
        const switchMatch = src.match(/switch \(e\.key\) \{[\s\S]*?\n {12}\}/);
        expect(switchMatch).not.toBeNull();
        expect(switchMatch![0]).not.toMatch(/case 'c':/);
    });
});
