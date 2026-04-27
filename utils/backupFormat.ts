// Threshold beyond which the warning banner kicks in. Mirrored as the cutoff
// for `isBackupStale` in store/backupSlice.ts; keep them in lock-step here.
export const STALE_BACKUP_DAYS = 30;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const daysSince = (iso: string | null): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / MS_PER_DAY);
};

export const formatLastExportedAt = (iso: string | null): string => {
    const days = daysSince(iso);
    if (days === null) return '未実施';
    if (days <= 0) return '本日';
    return `${days}日前`;
};
