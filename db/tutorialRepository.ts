import { db, TUTORIAL_STATE_VERSION, TutorialStateRecord } from './dexie';

export type TutorialFlags = Omit<TutorialStateRecord, 'version'>;

export const loadTutorialState = async (): Promise<TutorialFlags> => {
    const record = await db.tutorialState.get(TUTORIAL_STATE_VERSION);
    if (!record) return {};
    const { version: _omitted, ...flags } = record;
    return flags;
};

export const saveTutorialState = async (flags: TutorialFlags): Promise<void> => {
    await db.tutorialState.put({ version: TUTORIAL_STATE_VERSION, ...flags });
};
