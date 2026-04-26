import { AnalysisResult } from '../types';
import {
    loadAnalysisHistory as loadAnalysisHistoryFromDb,
    saveAnalysisHistory as saveAnalysisHistoryToDb,
} from '../db/analysisHistoryRepository';

export interface AnalysisHistorySlice {
    analysisHistory: AnalysisResult[];
    loadAnalysisHistory: () => Promise<void>;
    saveAnalysisHistory: (newResult: AnalysisResult) => Promise<void>;
}

export const createAnalysisHistorySlice = (set, get): AnalysisHistorySlice => ({
    analysisHistory: [],
    loadAnalysisHistory: async () => {
        try {
            const history = await loadAnalysisHistoryFromDb();
            set({ analysisHistory: history });
        } catch (error) {
            console.error('Failed to load analysis history:', error);
        }
    },
    saveAnalysisHistory: async (newResult: AnalysisResult) => {
        const { analysisHistory } = get();
        // Add new result to the start, limit to 2
        const updatedHistory = [newResult, ...analysisHistory].slice(0, 2);

        set({ analysisHistory: updatedHistory });

        try {
            await saveAnalysisHistoryToDb(updatedHistory);
        } catch (error) {
            console.error('Failed to save analysis history:', error);
        }
    },
});
