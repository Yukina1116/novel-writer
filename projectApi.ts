import { Project } from './types';

const BASE = '/api/projects';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
        throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json.data;
}

export const listProjects = () =>
    request<Array<{ id: string; name: string; lastModified: string; isSimpleMode?: boolean }>>(`${BASE}`);

export const getProject = (id: string) =>
    request<Project>(`${BASE}/${id}`);

export const createProjectApi = (project: Project) =>
    request<void>(`${BASE}`, { method: 'POST', body: JSON.stringify(project) });

export const updateProjectApi = (id: string, project: Project) =>
    request<void>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(project) });

export const deleteProjectApi = (id: string) =>
    request<void>(`${BASE}/${id}`, { method: 'DELETE' });
