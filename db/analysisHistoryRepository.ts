import { AnalysisResult } from '../types';
import { ANALYSIS_HISTORY_KEY, getDb } from './dexie';

export const loadAnalysisHistory = async (): Promise<AnalysisResult[]> => {
    const record = await getDb().analysisHistory.get(ANALYSIS_HISTORY_KEY);
    if (!record) return [];
    return (record.history as AnalysisResult[]) ?? [];
};

export const saveAnalysisHistory = async (history: AnalysisResult[]): Promise<void> => {
    await getDb().analysisHistory.put({ key: ANALYSIS_HISTORY_KEY, history });
};
