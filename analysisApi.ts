import { useStore } from './store/index';
import { AnalysisResult, SettingItem, KnowledgeItem } from './types';
import { apiCall } from './apiClient';

export const analyzeTextForImport = async (
    importedText: string,
    existingCharacters: SettingItem[],
    existingWorldSettings: SettingItem[],
    existingKnowledge: KnowledgeItem[]
): Promise<{ success: true; data: AnalysisResult } | { success: false; error: Error }> => {
    const result = await apiCall<AnalysisResult>('/analysis/import', {
        importedText,
        existingCharacters,
        existingWorldSettings,
        existingKnowledge,
    });

    if (result.success) {
        const enriched: AnalysisResult = { ...result.data, sourceText: importedText };
        useStore.getState().saveAnalysisHistory(enriched);
        return { success: true, data: enriched };
    }

    return result;
};
