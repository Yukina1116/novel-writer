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

// Fields stored as subcollections to avoid 1MB doc limit
const SUBCOLLECTION_FIELDS = ['novelContent', 'chatHistory', 'settings', 'knowledgeBase', 'plotBoard', 'timeline'] as const;

function splitProject(project: any) {
    const { historyTree, ...rest } = project;
    const meta: any = {};
    const subcollections: Record<string, any[]> = {};

    for (const [key, value] of Object.entries(rest)) {
        if ((SUBCOLLECTION_FIELDS as readonly string[]).includes(key)) {
            subcollections[key] = (Array.isArray(value) ? value : []).map(stripUndefined);
        } else {
            meta[key] = value;
        }
    }

    return { meta: stripUndefined(meta), subcollections };
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

    const project = doc.data() as any;

    // Read all subcollections in parallel
    const snapshots = await Promise.all(
        SUBCOLLECTION_FIELDS.map(name => docRef.collection(name).orderBy('_order').get())
    );

    SUBCOLLECTION_FIELDS.forEach((name, i) => {
        project[name] = snapshots[i].docs.map(d => {
            const { _order, ...rest } = d.data();
            return rest;
        });
    });

    return project as Project;
};

export const createProject = async (project: Project): Promise<void> => {
    await saveProject(project);
};

export const updateProject = async (id: string, project: Project): Promise<void> => {
    await saveProject(project);
};

async function saveProject(project: Project): Promise<void> {
    const { meta, subcollections } = splitProject(project);
    const docRef = projectsCollection().doc(project.id);

    // Write main document (small metadata only)
    await docRef.set(meta);

    // Write all subcollections
    for (const [name, items] of Object.entries(subcollections)) {
        await replaceSubcollection(docRef, name, items);
    }
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
    for (const subName of SUBCOLLECTION_FIELDS) {
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
