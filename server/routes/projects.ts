import { Router } from 'express';
import * as projectService from '../services/projectService';
import { handleApiError } from '../middleware/errorHandler';

const router = Router();

router.get('/', async (_req, res) => {
    try {
        const projects = await projectService.listProjects();
        res.json({ success: true, data: projects });
    } catch (error) {
        const { status, message } = handleApiError(error, 'listProjects');
        res.status(status).json({ success: false, error: message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const project = await projectService.getProject(req.params.id);
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: project });
    } catch (error) {
        const { status, message } = handleApiError(error, 'getProject');
        res.status(status).json({ success: false, error: message });
    }
});

router.post('/', async (req, res) => {
    try {
        await projectService.createProject(req.body);
        res.status(201).json({ success: true });
    } catch (error) {
        const { status, message } = handleApiError(error, 'createProject');
        res.status(status).json({ success: false, error: message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        await projectService.updateProject(req.params.id, req.body);
        res.json({ success: true });
    } catch (error) {
        const { status, message } = handleApiError(error, 'updateProject');
        res.status(status).json({ success: false, error: message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await projectService.deleteProject(req.params.id);
        res.json({ success: true });
    } catch (error) {
        const { status, message } = handleApiError(error, 'deleteProject');
        res.status(status).json({ success: false, error: message });
    }
});

export default router;
