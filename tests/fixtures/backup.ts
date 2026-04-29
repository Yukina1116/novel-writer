// Test fixtures for M6 backup tests (AC-1, AC-7, AC-10).
// Centralizing here prevents drift between backupCrypto.test.ts /
// backupSchema.test.ts / backupSlice.test.ts.

import { defaultAiSettings, defaultDisplaySettings } from '../../constants';
import { BackupV1, Project } from '../../types';
import { fromBase64, toBase64 } from '../../utils/backupCrypto';
import { buildBackupV1 } from '../../utils/backupSchema';

export const buildSampleProject = (overrides: Partial<Project> = {}): Project => ({
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'テスト物語',
    lastModified: overrides.lastModified ?? '2026-04-29T00:00:00.000Z',
    isSimpleMode: false,
    settings: [],
    novelContent: [],
    chatHistory: [],
    knowledgeBase: [],
    plotBoard: [],
    plotTypeColors: {},
    plotRelations: [],
    plotNodePositions: [],
    timeline: [],
    timelineLanes: [],
    characterRelations: [],
    nodePositions: [],
    aiSettings: defaultAiSettings,
    displaySettings: defaultDisplaySettings,
    ...overrides,
});

// Built via buildBackupV1 so BACKUP_SCHEMA_VERSION stays the single source
// of truth — bumping the schema constant must not silently drift through
// hand-rolled fixtures.
export const buildSampleBackup = (): BackupV1 => buildBackupV1({
    projects: [buildSampleProject({ id: 'p-1' })],
    tutorialState: { hasCompletedGlobalTutorial: true },
    analysisHistory: [
        {
            characters: { match: [], similar: [], new: [], extractedDetails: [] },
            worldContext: { worldKeywords: [], genre: '', tone: '' },
            worldTerms: { match: [], similar: [], new: [] },
            dialogues: [],
            notes: [],
        },
    ],
    appVersion: '1.0.0',
    now: new Date('2026-04-29T01:23:45.000Z'),
});

// Build a payload approximating `numProjects` projects each with `perProjectBytes`
// of dummy text. Used by AC-10 performance test.
export const buildLargeBackup = (numProjects: number, perProjectBytes: number): BackupV1 => {
    const filler = 'あ'.repeat(Math.floor(perProjectBytes / 3)); // 3 bytes/UTF-8 char
    return {
        schemaVersion: 1,
        exportedAt: '2026-04-29T00:00:00.000Z',
        appVersion: '1.0.0',
        projects: Array.from({ length: numProjects }, (_, i) =>
            buildSampleProject({
                id: `p-${i}`,
                novelContent: [{ id: `c-${i}`, text: filler }],
            }),
        ),
        tutorialState: {},
        analysisHistory: [],
    };
};

// AC-7: flip the last byte of a base64 ciphertext to simulate tampering.
// The XOR keeps the byte length stable so the envelope still parses.
export const tamperLastByte = (b64: string): string => {
    const bytes = fromBase64(b64);
    bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0xff;
    return toBase64(bytes);
};
