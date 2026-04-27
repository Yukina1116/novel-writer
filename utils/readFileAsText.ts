// Promise wrapper around FileReader for utf-8 text payloads. Used by both
// SettingsPanel (full-data import) and projectSlice.importProject (legacy
// single-project import) so the reader/error handling stays in one place.
export const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsText(file);
    });
