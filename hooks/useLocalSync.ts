import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { setBlockedHandler } from '../db/dexie';
import { refreshFromIndexedDb } from './refreshFromIndexedDb';

export type { RefreshFromIndexedDbResult } from './refreshFromIndexedDb';
export { refreshFromIndexedDb } from './refreshFromIndexedDb';

const LOCAL_DB_INIT_FAILED_MESSAGE =
    'ローカルデータの読み込みに失敗しました。プライベートモードや容量不足で IndexedDB が利用できない場合、データはメモリ上のみ保持され、リロードで失われます。';

const DB_BLOCKED_MESSAGE =
    '他のタブで古いバージョンのアプリが開いたままです。データベースの更新が完了できません。古いタブを閉じてからリロードしてください。';

export const useLocalSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Wire the Dexie `blocked` event to a user-visible toast before the
        // first DB call. Without this, a stale tab pinning the schema would
        // silently stall import/upgrade with no UI feedback.
        setBlockedHandler(() => {
            useStore.getState().showToast(DB_BLOCKED_MESSAGE, 'error');
        });
        const init = async () => {
            try {
                const result = await refreshFromIndexedDb();
                if (result.failureCount > 0) {
                    useStore.getState().showToast(
                        `プロジェクト ${result.failureCount} 件の読み込みに失敗しました（破損データを除外、または一時的エラーの可能性）`,
                        'error',
                    );
                }
            } catch (e: unknown) {
                console.error('Local persistence init failed:', e);
                const detail = e instanceof Error ? e.message : String(e);
                const message = `${LOCAL_DB_INIT_FAILED_MESSAGE}（詳細: ${detail}）`;
                setError(message);
                useStore.getState().showToast(message, 'error');
            } finally {
                setIsInitializing(false);
            }
        };
        init();
        return () => {
            // Detach the handler on unmount so React Strict Mode double-mount
            // (or a future hot-reload) doesn't leave stale closures registered.
            setBlockedHandler(null);
        };
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const { saveStatus, flushSave } = useStore.getState();
            if (saveStatus === 'dirty' || saveStatus === 'saving') {
                flushSave();
                e.preventDefault();
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                useStore.getState().flushSave();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return { isInitializing, error };
};
