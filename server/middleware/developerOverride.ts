// 開発者アカウントの Tier 1 月間予算免除。
//
// 課金プラン (usageConfig.ts の Tier) とは意図的に分離した「運用上の例外」として
// 実装する。将来 users.plan から Tier を取得する経路に切り替わった際、この例外が
// 誤って課金プランの一種として扱われる事故を構造的に防ぐ (Codex セカンドオピニオン
// 2026-07-13 反映)。
//
// DEVELOPER_UIDS 環境変数 (カンマ区切り) に含まれる uid は withUsageQuota.reserve()
// の limit を undefined (= 上限なし) として扱う。

const parseDeveloperUids = (raw: string | undefined): Set<string> => {
    if (!raw) return new Set();
    return new Set(
        raw
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
    );
};

// uid が DEVELOPER_UIDS に完全一致で含まれるか判定する。
// includes による部分一致ではなく Set による完全一致を用いる
// ("abc" が "abc123" に誤ってマッチしないようにするため)。
export const isDeveloperOverrideUid = (uid: string): boolean => {
    return parseDeveloperUids(process.env.DEVELOPER_UIDS).has(uid);
};
