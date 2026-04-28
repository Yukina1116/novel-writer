import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { setBlockedHandler } from '../db/dexie';
import { refreshFromIndexedDb } from './refreshFromIndexedDb';

export type { RefreshFromIndexedDbResult } from './refreshFromIndexedDb';
export { refreshFromIndexedDb } from './refreshFromIndexedDb';

const LOCAL_DB_INIT_FAILED_MESSAGE =
    'ローカルデータの読み込みに失敗しました。プライベートモードや容量不足で IndexedDB が利用できない場合、データはメモリ上のみ保持され、リロードで失われます。';

// Exported for the contract test to assert the canonical toast payload —
// keep in sync with wireBlockedHandler. Sibling LOCAL_DB_INIT_FAILED_MESSAGE
// is module-private because no test currently asserts against it.
export const DB_BLOCKED_MESSAGE =
    '他のタブで古いバージョンのアプリが開いたままです。データベースの更新が完了できません。古いタブを閉じてからリロードしてください。';

// Pure factory for the Dexie blocked-event wiring. Extracted so the contract
// (install handler → invoke surfaces a toast → cleanup detaches) can be
// unit-tested without spinning up a React renderer. The wiring effect
// below adds no behavior beyond install/detach symmetry; the separate
// init/flush effects (refreshFromIndexedDb, beforeunload/visibilitychange)
// are tested elsewhere.
//
// `useStore.getState()` (not `useStore(...)` subscription) is intentional:
// reading showToast at call time means a future store reset doesn't leave
// a stale closure pointing at an old action.
export const wireBlockedHandler = (): (() => void) => {
    setBlockedHandler(() => {
        useStore.getState().showToast(DB_BLOCKED_MESSAGE, 'error');
    });
    return () => {
        setBlockedHandler(null);
    };
};

export const useLocalSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Install the Dexie blocked-event handler before any IndexedDB
        // access this hook may trigger, so a stale tab pinning the schema
        // produces a toast instead of an indefinite stall.
        const detachBlocked = wireBlockedHandler();
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
        return detachBlocked;
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
