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
        // Install the Dexie blocked-event handler before any getDb() call in
        // this hook so a stale tab pinning the schema produces a toast
        // instead of an indefinite stall. `useStore.getState()` (not
        // `useStore(...)` subscription) is intentional: the handler reads
        // showToast at call time, so swapping in a fresh store reference
        // without re-registering still works.
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
            // Strict Mode double-mount and hot-reload otherwise leave a stale
            // closure registered on the singleton; null on unmount makes
            // re-mount install the fresh handler cleanly.
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
