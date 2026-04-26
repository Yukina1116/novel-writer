import { AnalysisResult } from '../types';
import { ANALYSIS_HISTORY_KEY, db } from './dexie';

export const loadAnalysisHistory = async (): Promise<AnalysisResult[]> => {
    const record = await db.analysisHistory.get(ANALYSIS_HISTORY_KEY);
    return record?.history ?? [];
};

export const saveAnalysisHistory = async (history: AnalysisResult[]): Promise<void> => {
    await db.analysisHistory.put({ key: ANALYSIS_HISTORY_KEY, history });
};
