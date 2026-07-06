// AI 月間利用量クォータの集計サービス。
//
// 設計原則:
// - reserve → AI 実行 → commit / cancel の 3 phase で二重課金を排除
// - requestId 冪等: 同一 requestId の連続 reserve は DuplicateRequestError を throw
// - transaction 内で `usedCost + reservedCost + estimatedCost > limit` を検査し、
//   並列リクエストでも上限突破を許さない
// - usage/{uid_yyyymm} は admin SDK 経由のみ書込み（client は firestore.rules で全拒否）

import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getFirebaseFirestore } from '../firebaseAdmin';
import { MAX_PROCESSED_IDS } from './usageConfig';

const COLLECTION = 'usage';

export interface UsageDoc {
    usedCost: number;
    reservedCost: number;
    reservations: Record<string, number>;
    processedIds: string[];
    // 以下 3 フィールドは Issue #232（コンバージョン最適化検討）向けの計測専用。
    // 課金判定（usedCost/reservedCost）には一切関与しない。
    routeCounts: Record<string, number>;
    quotaExceededCounts: Record<string, number>;
    imageGenerationCounts: { initial: number; additional: number };
}

export class QuotaExceededError extends Error {
    constructor(
        public readonly used: number,
        public readonly reserved: number,
        public readonly limit: number,
    ) {
        super(`QUOTA_EXCEEDED: used=${used} reserved=${reserved} limit=${limit}`);
        this.name = 'QuotaExceededError';
    }
}

export class DuplicateRequestError extends Error {
    constructor(public readonly requestId: string) {
        super(`DUPLICATE_REQUEST: ${requestId}`);
        this.name = 'DuplicateRequestError';
    }
}

export class ReservationNotFoundError extends Error {
    constructor(
        public readonly uid: string,
        public readonly requestId: string,
        public readonly phase: 'commit' | 'cancel',
    ) {
        super(`reservation not found: uid=${uid} requestId=${requestId} phase=${phase}`);
        this.name = 'ReservationNotFoundError';
    }
}

// handler が「一部の並列サブタスクだけ成功したまま失敗扱いにする」ケース
// (例: image/generate の並列呼び出しで一部のみ成功) 向けの汎用エラー。
// withUsageQuota はこれを検知すると、成功比率分だけ actualCost を commit し、
// 実際には発生していないコストまで cancel で握りつぶさないようにする。
// successRatio は (0, 1) の半開区間（0 なら通常の cancel で十分、1 なら本来 throw しない）。
export class PartialSuccessError extends Error {
    constructor(
        message: string,
        public readonly successRatio: number,
    ) {
        super(message);
        this.name = 'PartialSuccessError';
    }
}

// uid_yyyymm 形式の docId（UTC で月境界を判定。タイムゾーン依存を排除）。
export function getUsageDocId(uid: string, date: Date = new Date()): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${uid}_${yyyy}${mm}`;
}

const emptyDoc = (): UsageDoc => ({
    usedCost: 0,
    reservedCost: 0,
    reservations: {},
    processedIds: [],
    routeCounts: {},
    quotaExceededCounts: {},
    imageGenerationCounts: { initial: 0, additional: 0 },
});

// 値ごとに number 検証し、不正値（string, NaN, Infinity, 負値）を drop する。
// reservations の検証ロジック（parseUsageDoc 内）と同じ契約を計測用カウンタにも適用する。
const sanitizeCountRecord = (raw: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                out[key] = value;
            }
        }
    }
    return out;
};

const sanitizeNonNegativeInt = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

// snap → UsageDoc 正規化を transaction 経路と非 transaction 経路で共有する純関数。
// raw データが Firestore で部分破損していても全フィールドが安全な default に
// 落ちるよう型ガードで防御する（Vertex AI 障害時の partial write 等への耐性）。
// reservations は値ごとに number 検証し、不正値（string, NaN, Infinity）を drop。
// 検証なしで spread すると `reservedCost - reservedAmount` が NaN を返し、
// 以降の reserve で `projected > limit` が常に false になる silent failure 経路ができる。
const parseUsageDoc = (snap: { exists: boolean; data: () => unknown }): UsageDoc => {
    if (!snap.exists) return emptyDoc();
    const raw = snap.data() as Partial<UsageDoc> | undefined;
    const sanitizedReservations: Record<string, number> = {};
    if (raw?.reservations && typeof raw.reservations === 'object') {
        for (const [key, value] of Object.entries(raw.reservations)) {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                sanitizedReservations[key] = value;
            }
        }
    }
    const rawImageCounts = raw?.imageGenerationCounts as Partial<UsageDoc['imageGenerationCounts']> | undefined;

    return {
        usedCost: typeof raw?.usedCost === 'number' && Number.isFinite(raw.usedCost) ? raw.usedCost : 0,
        reservedCost: typeof raw?.reservedCost === 'number' && Number.isFinite(raw.reservedCost) ? raw.reservedCost : 0,
        reservations: sanitizedReservations,
        processedIds: Array.isArray(raw?.processedIds) ? raw.processedIds.filter((id): id is string => typeof id === 'string') : [],
        routeCounts: sanitizeCountRecord(raw?.routeCounts),
        quotaExceededCounts: sanitizeCountRecord(raw?.quotaExceededCounts),
        imageGenerationCounts: {
            initial: sanitizeNonNegativeInt(rawImageCounts?.initial),
            additional: sanitizeNonNegativeInt(rawImageCounts?.additional),
        },
    };
};

const readDoc = async (tx: Transaction, docRef: FirebaseFirestore.DocumentReference): Promise<UsageDoc> => {
    const snap = await tx.get(docRef);
    return parseUsageDoc(snap);
};

// reserve / commit / cancel が「同じ usage doc」を確実に操作するための
// アンカー。reserve 時の Date から決定した docId を呼出元が保持し、
// commit/cancel に持ち回ることで UTC 月境界を跨いだケース
// (reserve@4/30 23:59:59 → commit@5/1 00:00:01) で別 doc を参照して
// reservation が永久に残る silent failure を排除する。
export interface ReservationHandle {
    reservedAt: Date;
}

// reserve: estimatedCost を予約する。
// - 同一 requestId が processedIds に存在 or reservations に存在 → DuplicateRequestError
// - usedCost + reservedCost + estimatedCost > limit → QuotaExceededError
export async function reserve(
    uid: string,
    requestId: string,
    estimatedCost: number,
    limit: number,
    db: Firestore = getFirebaseFirestore(),
): Promise<ReservationHandle> {
    if (estimatedCost < 0) throw new Error('estimatedCost must be non-negative');
    if (limit < 0) throw new Error('limit must be non-negative');

    const reservedAt = new Date();
    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid, reservedAt));
    await db.runTransaction(async (tx) => {
        const data = await readDoc(tx, docRef);

        if (data.processedIds.includes(requestId) || data.reservations[requestId] !== undefined) {
            throw new DuplicateRequestError(requestId);
        }

        const projected = data.usedCost + data.reservedCost + estimatedCost;
        if (projected > limit) {
            throw new QuotaExceededError(data.usedCost, data.reservedCost, limit);
        }

        tx.set(docRef, {
            usedCost: data.usedCost,
            reservedCost: data.reservedCost + estimatedCost,
            reservations: { ...data.reservations, [requestId]: estimatedCost },
            processedIds: data.processedIds,
            routeCounts: data.routeCounts,
            quotaExceededCounts: data.quotaExceededCounts,
            imageGenerationCounts: data.imageGenerationCounts,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
    return { reservedAt };
}

// commit: AI 実行成功後に actualCost を確定加算し、reservation を解除。
// 呼出元 (withUsageQuota) は actualCost === reservedAmount (= estimatedCost at reserve time)
// で渡す。将来 actual metadata 精算（actualCost ≠ reservedAmount）を導入しても、
// 「reservedCost からは reservedAmount を差し引き、usedCost には actualCost を加算する」
// 現在の式が引き続き正しい（reservation 単位で予約解除、課金は実コスト）。
//
// handle: reserve の戻り値で受け取った ReservationHandle を渡す。これにより
// reserve→AI→commit の間に UTC 月境界を跨いでも、必ず reserve 時と同じ doc を
// 操作する。省略時は現在時刻ベースで docId を決定する（互換用）。
//
// routeKey: Issue #232（コンバージョン最適化検討）向けの計測専用。渡された場合のみ
// routeCounts をインクリメントする。省略しても課金ロジック（usedCost/reservedCost）
// には一切影響しない。
export async function commit(
    uid: string,
    requestId: string,
    actualCost: number,
    handle: ReservationHandle | undefined = undefined,
    routeKey: string | undefined = undefined,
    db: Firestore = getFirebaseFirestore(),
): Promise<void> {
    if (actualCost < 0) throw new Error('actualCost must be non-negative');

    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid, handle?.reservedAt));
    await db.runTransaction(async (tx) => {
        const data = await readDoc(tx, docRef);
        const reservedAmount = data.reservations[requestId];
        if (reservedAmount === undefined) {
            throw new ReservationNotFoundError(uid, requestId, 'commit');
        }
        const { [requestId]: _removed, ...remaining } = data.reservations;
        const processedIds = [...data.processedIds, requestId].slice(-MAX_PROCESSED_IDS);
        const routeCounts = routeKey
            ? { ...data.routeCounts, [routeKey]: (data.routeCounts[routeKey] ?? 0) + 1 }
            : data.routeCounts;

        tx.update(docRef, {
            usedCost: data.usedCost + actualCost,
            reservedCost: data.reservedCost - reservedAmount,
            reservations: remaining,
            processedIds,
            routeCounts,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

// cancel: AI 実行失敗時に reservation を解除（usedCost は加算しない）。
// 既に commit/cancel 済 or doc 不在は no-op（idempotent）。
// 不在判定は readDoc 経由の `reservations[requestId] === undefined` で十分なため
// `tx.get` を 1 回に統一する（snap.exists の追加 round-trip を排除）。
//
// handle: 月境界耐性は commit と同じく ReservationHandle 経由で保証する。
export async function cancel(
    uid: string,
    requestId: string,
    handle: ReservationHandle | undefined = undefined,
    db: Firestore = getFirebaseFirestore(),
): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid, handle?.reservedAt));
    await db.runTransaction(async (tx) => {
        const data = await readDoc(tx, docRef);
        const reservedAmount = data.reservations[requestId];
        if (reservedAmount === undefined) return;
        const { [requestId]: _removed, ...remaining } = data.reservations;

        tx.update(docRef, {
            reservedCost: data.reservedCost - reservedAmount,
            reservations: remaining,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

// usage 残量を取得する read API（admin SDK 経由）。FE 残量バー表示や test で使用。
export async function getUsage(
    uid: string,
    db: Firestore = getFirebaseFirestore(),
): Promise<UsageDoc> {
    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid));
    const snap = await docRef.get();
    return parseUsageDoc(snap);
}

// Issue #232（コンバージョン最適化検討）向けの計測専用 best-effort 記録。
// quota 超過（429）はレスポンスに直結する重要フローのため、記録自体が失敗しても
// 呼出元 (withUsageQuota) は catch して 429 レスポンスに影響させない設計とする
// （rules/error-handling.md の「状態復旧 > ログ記録」原則、ここでは応答確定が最優先）。
export async function recordQuotaExceeded(
    uid: string,
    routeKey: string,
    db: Firestore = getFirebaseFirestore(),
): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid));
    await db.runTransaction(async (tx) => {
        const data = await readDoc(tx, docRef);
        tx.set(docRef, {
            ...data,
            quotaExceededCounts: {
                ...data.quotaExceededCounts,
                [routeKey]: (data.quotaExceededCounts[routeKey] ?? 0) + 1,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

// Issue #232 向け。画像生成の「初回」と「追加生成ボタン」呼び出しの内訳を計測する
// best-effort 記録。呼出元 (image route) は成功後に fire し、失敗しても画像生成の
// レスポンス自体には影響させない。
//
// handle: generateImage（AI 呼出、数秒〜十数秒かかりうる）の完了後に呼ばれるため、
// commit と同じく reserve 時の docId を引き継がないと UTC 月境界を跨いだケースで
// 別月の doc に計測が分裂する（commit の月境界耐性と同じ理由、契約を揃える）。
export async function recordImageGenerationKind(
    uid: string,
    isAdditional: boolean,
    handle: ReservationHandle | undefined = undefined,
    db: Firestore = getFirebaseFirestore(),
): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid, handle?.reservedAt));
    const key = isAdditional ? 'additional' : 'initial';
    await db.runTransaction(async (tx) => {
        const data = await readDoc(tx, docRef);
        tx.set(docRef, {
            ...data,
            imageGenerationCounts: {
                ...data.imageGenerationCounts,
                [key]: data.imageGenerationCounts[key] + 1,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}
