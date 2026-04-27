// AI 月間利用量クォータの集計サービス（PR-F）。
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
});

// snap → UsageDoc 正規化を transaction 経路と非 transaction 経路で共有する純関数。
// raw データが Firestore で部分破損していても全フィールドが安全な default に
// 落ちるよう型ガードで防御する（Vertex AI 障害時の partial write 等への耐性）。
const parseUsageDoc = (snap: { exists: boolean; data: () => unknown }): UsageDoc => {
    if (!snap.exists) return emptyDoc();
    const raw = snap.data() as Partial<UsageDoc> | undefined;
    return {
        usedCost: typeof raw?.usedCost === 'number' ? raw.usedCost : 0,
        reservedCost: typeof raw?.reservedCost === 'number' ? raw.reservedCost : 0,
        reservations: raw?.reservations && typeof raw.reservations === 'object' ? { ...raw.reservations } : {},
        processedIds: Array.isArray(raw?.processedIds) ? [...raw.processedIds] : [],
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
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
    return { reservedAt };
}

// commit: AI 実行成功後に actualCost を確定加算し、reservation を解除。
// PR-F の制約: actualCost === reservedAmount (= estimatedCost at reserve time) を前提とする。
// 将来 actual metadata 精算（actualCost ≠ reservedAmount）を導入する場合は、
// 「reservedCost からは reservedAmount を差し引き、usedCost には actualCost を加算する」
// 現在の式が引き続き正しい（reservation 単位で予約解除、課金は実コスト）。
//
// handle: reserve の戻り値で受け取った ReservationHandle を渡す。これにより
// reserve→AI→commit の間に UTC 月境界を跨いでも、必ず reserve 時と同じ doc を
// 操作する。省略時は現在時刻ベースで docId を決定する（互換用）。
export async function commit(
    uid: string,
    requestId: string,
    actualCost: number,
    handle: ReservationHandle | undefined = undefined,
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

        tx.update(docRef, {
            usedCost: data.usedCost + actualCost,
            reservedCost: data.reservedCost - reservedAmount,
            reservations: remaining,
            processedIds,
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

// テスト・PR-G で usage 残量を取得する read API（admin SDK 経由）。
export async function getUsage(
    uid: string,
    db: Firestore = getFirebaseFirestore(),
): Promise<UsageDoc> {
    const docRef = db.collection(COLLECTION).doc(getUsageDocId(uid));
    const snap = await docRef.get();
    return parseUsageDoc(snap);
}
