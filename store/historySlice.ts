import { v4 as uuidv4 } from 'uuid';
import { Project, HistoryNode, HistoryType, HistoryTree } from '../types';

const initialHistoryTree: HistoryTree = {
    nodes: {},
    currentNodeId: null,
    rootId: null,
};

// localStorageの制限を考慮し、保存する履歴の数を大幅に削減
const MAX_HISTORY_NODES = 10;

const setProjectDataWithoutHistory = (set, get, projectData: Project) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    set(state => ({
        allProjectsData: {
            ...state.allProjectsData,
            [activeProjectId]: { ...projectData, historyTree: state.historyTree }
        }
    }));
};

const scopeMatches = (scope: string, type: HistoryType) => {
    if (scope === 'all') return true;
    if (scope === 'text-only') return type === 'editor';
    if (scope === 'ai-only') return type === 'ai';
    if (scope === 'data-only') return ['character', 'world', 'knowledge', 'plot', 'timeline', 'chart', 'settings', 'outline'].includes(type);
    return false;
};

// 指定したノードとその子孫をすべて削除するヘルパー
const deleteRecursive = (nodes: Record<string, HistoryNode>, id: string) => {
    const node = nodes[id];
    if (!node) return;
    node.childrenIds.forEach(childId => deleteRecursive(nodes, childId));
    delete nodes[id];
};

export interface HistorySlice {
    historyTree: HistoryTree;
    addHistory: (projectData: Project, label: { type: HistoryType, label: string }) => void;
    undo: () => void;
    redo: () => void;
    jumpToHistory: (nodeId: string) => void;
}

export const createHistorySlice = (set, get): HistorySlice => ({
    historyTree: initialHistoryTree,
    addHistory: (projectData, label) => {
        set(state => {
            const { historyTree } = state;
            const { nodes, currentNodeId, rootId } = historyTree;

            const newNodeId = uuidv4();
            const newNode: HistoryNode = {
                id: newNodeId,
                parentId: currentNodeId,
                childrenIds: [],
                timestamp: Date.now(),
                type: label.type,
                label: label.label,
                payload: { ...projectData, historyTree: undefined }, 
            };
            
            const newNodes = { ...nodes, [newNodeId]: newNode };

            if (currentNodeId) {
                const parentNode = newNodes[currentNodeId];
                if (parentNode) {
                    newNodes[currentNodeId] = {
                        ...parentNode,
                        childrenIds: [...parentNode.childrenIds, newNodeId],
                    };
                }
            } else if (!rootId) {
                // ルートがない場合はこれがルートになる
                return {
                    historyTree: {
                        nodes: newNodes,
                        currentNodeId: newNodeId,
                        rootId: newNodeId,
                    }
                };
            }
            
            // 履歴が上限を超えた場合、古いブランチを削除してストレージを節約
            const nodeCount = Object.keys(newNodes).length;
            if (nodeCount > MAX_HISTORY_NODES && rootId) {
                const root = newNodes[rootId];
                if (root && root.childrenIds.length > 1) {
                    // 枝分かれしている場合、一番古い（現在のパスではない）枝を優先的に削除
                    // ここでは簡易的に、最も古い子ノードとその子孫を削除
                    const oldestChildId = root.childrenIds[0];
                    deleteRecursive(newNodes, oldestChildId);
                    newNodes[rootId] = {
                        ...root,
                        childrenIds: root.childrenIds.slice(1),
                    };
                } else if (root && root.childrenIds.length === 1) {
                    // 単一のパスの場合、ルートを一つ進める
                    const oldRootId = rootId;
                    const newRootId = root.childrenIds[0];
                    const newRoot = newNodes[newRootId];
                    if (newRoot) {
                        newRoot.parentId = null;
                        delete newNodes[oldRootId];
                        return {
                            historyTree: {
                                ...historyTree,
                                nodes: newNodes,
                                currentNodeId: newNodeId,
                                rootId: newRootId,
                            }
                        };
                    }
                }
            }

            return {
                historyTree: {
                    ...historyTree,
                    nodes: newNodes,
                    currentNodeId: newNodeId,
                }
            };
        });
    },
    undo: () => {
        const { historyTree, activeProjectId, undoScope, allProjectsData, showToast, addHistory } = get();
        if (!activeProjectId || !historyTree.currentNodeId) return;

        const { nodes, currentNodeId } = historyTree;
        const currentNode = nodes[currentNodeId];

        if (undoScope === 'all') {
            const parentId = currentNode.parentId;
            if (parentId) {
                const parentNode = nodes[parentId];
                setProjectDataWithoutHistory(set, get, parentNode.payload);
                set(state => ({
                    historyTree: { ...state.historyTree, currentNodeId: parentId }
                }));
                showToast(`「${currentNode.label}」を元に戻しました`);
            } else {
                showToast("これ以上元に戻せません");
            }
            return;
        }

        // 選択的なUndo
        let actionNodeId = currentNodeId;
        while (actionNodeId && !scopeMatches(undoScope, nodes[actionNodeId].type)) {
            actionNodeId = nodes[actionNodeId].parentId;
        }
        
        if (!actionNodeId) {
            showToast("元に戻せる操作が見つかりませんでした");
            return;
        }
        
        const actionNode = nodes[actionNodeId];
        const sourceNodeId = actionNode.parentId;
        if (!sourceNodeId) return;
        
        const sourceProject = nodes[sourceNodeId].payload;
        const currentProject = allProjectsData[activeProjectId];
        
        let newProject = { ...currentProject };
        let label = "";
        let historyType: HistoryType = 'settings';
        
        if (undoScope === 'text-only') {
            newProject.novelContent = sourceProject.novelContent;
            label = "本文のみ元に戻す";
            historyType = 'editor';
        } else if (undoScope === 'ai-only') {
            newProject.chatHistory = sourceProject.chatHistory;
            label = "AIチャットのみ元に戻す";
            historyType = 'ai';
        } else if (undoScope === 'data-only') {
            newProject.settings = sourceProject.settings;
            newProject.knowledgeBase = sourceProject.knowledgeBase;
            newProject.plotBoard = sourceProject.plotBoard;
            newProject.timeline = sourceProject.timeline;
            label = "データのみ元に戻す";
        }
        
        newProject.lastModified = new Date().toISOString();
        setProjectDataWithoutHistory(set, get, newProject);
        addHistory(newProject, { type: historyType, label: label });
        showToast(label);
    },
    redo: () => {
        const { historyTree, activeProjectId, showToast } = get();
        if (!activeProjectId || !historyTree.currentNodeId) return;

        const { nodes, currentNodeId } = historyTree;
        const currentNode = nodes[currentNodeId];
        
        if (currentNode.childrenIds.length === 0) {
            showToast("これ以上やり直せません");
            return;
        }

        // 簡易的に最初の子ノードに進む
        const nextNodeId = currentNode.childrenIds[0];
        const nextNode = nodes[nextNodeId];
        
        setProjectDataWithoutHistory(set, get, nextNode.payload);
        set(state => ({
            historyTree: { ...state.historyTree, currentNodeId: nextNodeId }
        }));
        showToast(`「${nextNode.label}」をやり直しました`);
    },
    jumpToHistory: (nodeId) => {
        const { historyTree, activeProjectId, showToast } = get();
        if (!activeProjectId || !historyTree.nodes[nodeId]) return;

        const targetNode = historyTree.nodes[nodeId];
        setProjectDataWithoutHistory(set, get, targetNode.payload);
        set(state => ({
            historyTree: { ...state.historyTree, currentNodeId: nodeId }
        }));
        showToast(`履歴「${targetNode.label}」に戻りました`);
    },
});