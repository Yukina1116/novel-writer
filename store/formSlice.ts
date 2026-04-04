import { SettingItem } from '../types';

const initialState = {
    characterFormData: {},
    worldFormData: {},
};

export interface FormSlice {
    characterFormData: Partial<SettingItem>;
    worldFormData: Partial<SettingItem>;
    setFormData: (form: 'character' | 'world', data: any) => void;
    resetFormData: (form: 'character' | 'world') => void;
    getCharacterDescriptionForImageGen: () => string;
}

export const createFormSlice = (set, get): FormSlice => ({
    ...initialState,
    setFormData: (form, data) => {
        if (form === 'character') {
            set(state => ({
                characterFormData: { ...state.characterFormData, ...data }
            }));
        } else if (form === 'world') {
            set(state => ({
                worldFormData: { ...state.worldFormData, ...data }
            }));
        }
    },
    resetFormData: (form) => {
        if (form === 'character') {
            set({ characterFormData: {} });
        } else if (form === 'world') {
            set({ worldFormData: {} });
        }
    },
    getCharacterDescriptionForImageGen: () => {
        const formData = get().characterFormData;
        if (!formData) return '';

        const parts = [];
        if (formData.gender) parts.push(`gender: ${formData.gender}`);
        if (formData.age) parts.push(`age: ${formData.age}`);
        if (formData.species) parts.push(`species: ${formData.species}`);

        if (formData.appearance?.traits && formData.appearance.traits.length > 0) {
            formData.appearance.traits.forEach(trait => {
                if (trait.key && trait.value) {
                    parts.push(`${trait.key}: ${trait.value}`);
                }
            });
        }
        if (formData.personality) parts.push(`personality: ${formData.personality}`);

        return parts.join('\n');
    }
});