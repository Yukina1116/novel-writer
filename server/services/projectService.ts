import { projectsCollection, getFirestore } from '../firestoreClient';
import { Project } from '../../types';

function stripUndefined(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                result[key] = stripUndefined(value);
            }
        }
        return result;
    }
    return obj;
}

function splitProject(project: any) {
    const { historyTree, novelContent, chatHistory, ...meta } = project;
    return {
        meta: stripUndefined(meta),
        novelContent: (novelContent || []).map(stripUndefined),
        chatHistory: (chatHistory || []).map(stripUndefined),
    };
}

export const listProjects = async (): Promise<Array<{ id: string; name: string; lastModified: string; isSimpleMode?: boolean }>> => {
    const snapshot = await projectsCollection()
        .select('id', 'name', 'lastModified', 'isSimpleMode')
        .get();
    return snapshot.docs.map(doc => doc.data() as any);
};

export const getProject = async (id: string): Promise<Project | null> => {
    const docRef = projectsCollection().doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const meta = doc.data() as any;

    // Read subcollections
    const [chunksSnap, chatSnap] = await Promise.all([
        docRef.collection('chunks').orderBy('_order').get(),
        docRef.collection('chatHistory').orderBy('_order').get(),
    ]);

    meta.novelContent = chunksSnap.docs.map(d => {
        const { _order, ...rest } = d.data();
        return rest;
    });
    meta.chatHistory = chatSnap.docs.map(d => {
        const { _order, ...rest } = d.data();
        return rest;
    });

    return meta as Project;
};

export const createProject = async (project: Project): Promise<void> => {
    await saveProject(project);
};

export const updateProject = async (id: string, project: Project): Promise<void> => {
    await saveProject(project);
};

async function saveProject(project: Project): Promise<void> {
    const { meta, novelContent, chatHistory } = splitProject(project);
    const db = getFirestore();
    const docRef = projectsCollection().doc(project.id);

    // Write main document (without novelContent/chatHistory)
    await docRef.set(meta);

    // Write subcollections (delete old, write new)
    await replaceSubcollection(docRef, 'chunks', novelContent);
    await replaceSubcollection(docRef, 'chatHistory', chatHistory);
}

async function replaceSubcollection(
    docRef: FirebaseFirestore.DocumentReference,
    name: string,
    items: any[]
): Promise<void> {
    const db = getFirestore();
    const collRef = docRef.collection(name);

    // Delete existing docs
    const existing = await collRef.listDocuments();
    if (existing.length > 0) {
        const deleteBatch = db.batch();
        for (const doc of existing) {
            deleteBatch.delete(doc);
        }
        await deleteBatch.commit();
    }

    // Write new docs in batches of 400 (Firestore limit is 500 per batch)
    for (let i = 0; i < items.length; i += 400) {
        const writeBatch = db.batch();
        const slice = items.slice(i, i + 400);
        for (let j = 0; j < slice.length; j++) {
            const docId = String(i + j).padStart(6, '0');
            writeBatch.set(collRef.doc(docId), { ...slice[j], _order: i + j });
        }
        await writeBatch.commit();
    }
}

export const deleteProject = async (id: string): Promise<void> => {
    const db = getFirestore();
    const docRef = projectsCollection().doc(id);

    // Delete subcollections first
    for (const subName of ['chunks', 'chatHistory']) {
        const docs = await docRef.collection(subName).listDocuments();
        if (docs.length > 0) {
            const batch = db.batch();
            for (const doc of docs) {
                batch.delete(doc);
            }
            await batch.commit();
        }
    }

    await docRef.delete();
};
