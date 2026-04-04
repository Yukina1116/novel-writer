import { StateCreator } from 'zustand';
import { AnalysisResult } from '../types';

export interface AnalysisHistorySlice {
    analysisHistory: AnalysisResult[];
    loadAnalysisHistory: () => Promise<void>;
    saveAnalysisHistory: (newResult: AnalysisResult) => Promise<void>;
}

export const createAnalysisHistorySlice = (set, get): AnalysisHistorySlice => ({
    analysisHistory: [],
    loadAnalysisHistory: async () => {
        try {
            const response = await fetch('/api/analysis-history');
            if (response.ok) {
                const data = await response.json();
                set({ analysisHistory: data.history || [] });
            }
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
            await fetch('/api/analysis-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: updatedHistory }),
            });
        } catch (error) {
            console.error('Failed to save analysis history:', error);
        }
    },
});
