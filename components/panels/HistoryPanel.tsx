import React, { useMemo } from 'react';
import * as Icons from '../../icons';
import { useStore } from '../../store/index';
// FIX: HistoryNode is needed for type annotation.
import { HistoryType, HistoryNode } from '../../types';

const typeToIcon: Record<HistoryType, React.ReactNode> = {
    editor: <Icons.PenSquareIcon className="h-4 w-4" />,
    character: <Icons.UserIcon className="h-4 w-4" />,
    world: <Icons.GlobeIcon className="h-4 w-4" />,
    knowledge: <Icons.LightbulbIcon className="h-4 w-4" />,
    plot: <Icons.ClipboardListIcon className="h-4 w-4" />,
    timeline: <Icons.ClockIcon className="h-4 w-4" />,
    chart: <Icons.UserCogIcon className="h-4 w-4" />,
    ai: <Icons.BotIcon className="h-4 w-4" />,
    settings: <Icons.SettingsIcon className="h-4 w-4" />,
    outline: <Icons.ListOrderedIcon className="h-4 w-4" />,
};

// FIX: Corrected typo in viewBox attribute from "0 0 24" 24" to "0 0 24 24". This was causing multiple parsing errors.
export const GitBranchIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>;

export const HistoryPanel: React.FC<{ isFloating?: boolean }> = ({ isFloating = false }) => {
    const historyTree = useStore(state => state.historyTree);
    const jumpToHistory = useStore(state => state.jumpToHistory);
    const addFloatingWindow = useStore(state => state.addFloatingWindow);
    
    const { nodes = {}, currentNodeId = null, rootId = null } = historyTree || {};

    const { sortedNodes, layout, activePath, lanes } = useMemo(() => {
        if (!rootId || Object.keys(nodes).length === 0) {
            // FIX: Add `lanes` to the return object for the empty case.
            return { sortedNodes: [], layout: { nodes: {}, paths: [] }, activePath: new Set(), lanes: [] };
        }

        // FIX: Explicitly type `allNodes` to prevent TypeScript from inferring it as `unknown[]`.
        const allNodes: HistoryNode[] = Object.values(nodes);
        const sorted = allNodes.sort((a, b) => a.timestamp - b.timestamp);
        
        // FIX: Explicitly type `nodeLayout` and `pathLayout` for type safety.
        const nodeLayout: Record<string, { index: number, lane: number }> = {};
        const pathLayout: { id: string, source: { x: number, y: number }, target: { x: number, y: number } }[] = [];
        const lanes: (string | null)[] = [];

        const getNodeIdAt = (index: number): string | undefined => sorted[index]?.id;

        const getLane = (nodeId: string): number => {
            let laneIndex = lanes.indexOf(nodeId);
            if (laneIndex !== -1) return laneIndex;
            laneIndex = lanes.indexOf(null);
            if (laneIndex !== -1) {
                lanes[laneIndex] = nodeId;
                return laneIndex;
            }
            lanes.push(nodeId);
            return lanes.length - 1;
        };

        sorted.forEach((node, index) => {
            let laneIndex = -1;
            const parent = node.parentId ? nodes[node.parentId] : null;

            if (parent) {
                const parentIndex = sorted.findIndex(n => n.id === parent.id);
                const parentLane = nodeLayout[parent.id].lane;

                if (parent.childrenIds.length > 1 && parent.childrenIds[0] !== node.id) {
                    laneIndex = getLane(node.id);
                } else {
                    laneIndex = parentLane;
                    for (let i = parentIndex + 1; i < index; i++) {
                        const betweenNodeId = getNodeIdAt(i);
                        if (betweenNodeId && nodeLayout[betweenNodeId]?.lane === laneIndex) {
                            laneIndex = getLane(node.id);
                            break;
                        }
                    }
                }
            } else {
                laneIndex = getLane(node.id);
            }
            
            nodeLayout[node.id] = { index, lane: laneIndex };

            if (parent) {
                const parentLayout = nodeLayout[parent.id];
                pathLayout.push({
                    id: `${parent.id}-${node.id}`,
                    source: { x: parentLayout.lane, y: parentLayout.index },
                    target: { x: laneIndex, y: index }
                });
            }
        });

        const newActivePath = new Set<string>();
        let current = currentNodeId;
        while(current) {
            newActivePath.add(current);
            const parentId = nodes[current]?.parentId;
            if (parentId) {
                 newActivePath.add(`${parentId}-${current}`);
            }
            current = parentId;
        }

        // FIX: Return `lanes` so it can be used to calculate SVG width.
        return { 
            sortedNodes: sorted, 
            layout: { nodes: nodeLayout, paths: pathLayout },
            activePath: newActivePath,
            lanes,
        };
    }, [nodes, rootId, currentNodeId]);

    const handleWindowize = () => {
        addFloatingWindow('history');
    };

    const ROW_HEIGHT = 50;
    const COL_WIDTH = 20;
    const NODE_RADIUS = 4;

    return (
        <div className="flex flex-col h-full bg-gray-900/50">
            {!isFloating && (
                 <div className="p-2 border-b border-gray-700/50 flex-shrink-0 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <GitBranchIcon className="h-4 w-4" />
                        タイムトラベル (プロモード)
                    </h3>
                     <button
                        onClick={handleWindowize}
                        className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 btn-pressable"
                        title="ウィンドウ化"
                    >
                        <Icons.ExternalLinkIcon className="h-4 w-4" />
                    </button>
                </div>
            )}
            <div className="flex-grow overflow-auto p-2">
                <svg width={lanes.length * COL_WIDTH + 200} height={sortedNodes.length * ROW_HEIGHT + 20}>
                    <g transform="translate(10, 20)">
                        {layout.paths.map(path => {
                            const isActive = activePath.has(path.id);
                            const startX = path.source.x * COL_WIDTH + COL_WIDTH / 2;
                            const startY = path.source.y * ROW_HEIGHT + ROW_HEIGHT / 2;
                            const endX = path.target.x * COL_WIDTH + COL_WIDTH / 2;
                            const endY = path.target.y * ROW_HEIGHT + ROW_HEIGHT / 2;
                            
                            const d = (path.source.x === path.target.x) 
                                ? `M ${startX} ${startY} L ${endX} ${endY}`
                                : `M ${startX} ${startY} C ${startX} ${startY + ROW_HEIGHT/2}, ${endX} ${endY-ROW_HEIGHT/2}, ${endX} ${endY}`;

                            return <path key={path.id} d={d} stroke={isActive ? '#4f46e5' : '#4b5568'} strokeWidth="2" fill="none" />;
                        })}

                        {sortedNodes.map(node => {
                            const nodeLayout = layout.nodes[node.id];
                            if (!nodeLayout) return null;
                            const isCurrent = node.id === currentNodeId;
                            const isActive = activePath.has(node.id);
                            
                            const cx = nodeLayout.lane * COL_WIDTH + COL_WIDTH / 2;
                            const cy = nodeLayout.index * ROW_HEIGHT + ROW_HEIGHT / 2;
                            
                            return (
                                <g key={node.id} onClick={() => jumpToHistory(node.id)} className="cursor-pointer group">
                                    <circle cx={cx} cy={cy} r={NODE_RADIUS + (isCurrent ? 3 : 0)} fill={isActive ? (isCurrent ? '#a5b4fc' : '#6366f1') : '#6b7280'} stroke={isCurrent ? '#6366f1' : 'none'} strokeWidth="2" />
                                    <foreignObject x={cx + 15} y={cy - ROW_HEIGHT/2 + 5} width="200" height={ROW_HEIGHT - 10}>
                                        <div className={`flex items-center gap-2 h-full ${isCurrent ? 'bg-indigo-600/20' : ''} p-1 rounded-md`}>
                                            <div className={isActive ? 'text-indigo-300' : 'text-gray-500'}>{typeToIcon[node.type]}</div>
                                            <div>
                                                <p className={`text-xs truncate ${isActive ? 'text-white' : 'text-gray-400'}`}>{node.label}</p>
                                                <p className="text-xs text-gray-500">{new Date(node.timestamp).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                    </foreignObject>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
};