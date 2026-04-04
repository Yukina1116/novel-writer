import { Firestore } from '@google-cloud/firestore';

let db: Firestore | null = null;

export const getFirestore = (): Firestore => {
    if (db) return db;
    db = new Firestore({
        projectId: process.env.GCP_PROJECT || 'novel-writer-dev',
    });
    return db;
};

export const projectsCollection = () => getFirestore().collection('projects');
