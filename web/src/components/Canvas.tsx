import { useCallback, useEffect, useMemo, useState, type Dispatch } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Dimensions,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type NodeTypes,
  type OnConnectEnd,
} from '@xyflow/react'
import { canConnect, type NodeRunState, type Workflow } from '@wand/shared'
import type { EditorAction, Selection } from '../state/editor.ts'
import type { WorkflowIssues } from '../state/useEditor.ts'
import type { FlowNode } from './flowTypes.ts'
import { WorkflowNodeView } from './WorkflowNodeView.tsx'

const nodeTypes: NodeTypes = { workflow: WorkflowNodeView }

const REJECTION_TIMEOUT_MS = 3500

interface CanvasProps {
  workflow: Workflow
  selection: Selection
  issues: WorkflowIssues
  dispatch: Dispatch<EditorAction>
  onStartFromExample: () => void
  /** Graph editing is locked while a run is starting or running; pan, zoom and selection stay available. */
  locked: boolean
  /** Per-node run state while a run is presented. */
  runNodes?: Record<string, NodeRunState>
}

const DELETE_KEYS = ['Backspace', 'Delete']

export function Canvas({ workflow, selection, issues, dispatch, onStartFromExample, locked, runNodes }: CanvasProps) {
  // React Flow rebuilds a node's internals whenever the node object changes, and it only
  // keeps measured size if we pass it back. Nodes are rebuilt from the workflow on every
  // change, so we hold their measured sizes here (UI-only, never persisted).
  const [measured, setMeasured] = useState<Record<string, Dimensions>>({})
  const [rejection, setRejection] = useState<string | null>(null)

  useEffect(() => {
    if (!rejection) return
    const timer = setTimeout(() => setRejection(null), REJECTION_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [rejection])

  const nodes = useMemo<FlowNode[]>(
    () =>
      workflow.nodes.map((node) => ({
        id: node.id,
        type: 'workflow',
        position: node.position,
        data: { node, issues: issues.byNode.get(node.id) ?? [], run: runNodes?.[node.id] },
        selected: selection?.kind === 'node' && selection.id === node.id,
        measured: measured[node.id],
      })),
    [workflow.nodes, issues, selection, measured, runNodes],
  )

  const edges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((edge) => {
        // An edge "carries" data into its target: animate it while the target runs.
        const targetStatus = runNodes?.[edge.target]?.status
        return {
          ...edge,
          selected: selection?.kind === 'edge' && selection.id === edge.id,
          animated: targetStatus === 'running',
          className: targetStatus ? `edge--${targetStatus}` : undefined,
        }
      }),
    [workflow.edges, selection, runNodes],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const sizes: Record<string, Dimensions> = {}
      for (const change of changes) {
        switch (change.type) {
          case 'position':
            if (change.position) dispatch({ type: 'moveNode', id: change.id, position: change.position })
            break
          case 'dimensions':
            if (change.dimensions) sizes[change.id] = change.dimensions
            break
          case 'select':
            dispatch(
              change.selected
                ? { type: 'select', selection: { kind: 'node', id: change.id } }
                : { type: 'unselect', kind: 'node', id: change.id },
            )
            break
          case 'remove':
            dispatch({ type: 'removeNode', id: change.id })
            break
        }
      }
      if (Object.keys(sizes).length > 0) setMeasured((prev) => ({ ...prev, ...sizes }))
    },
    [dispatch],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'select') {
          dispatch(
            change.selected
              ? { type: 'select', selection: { kind: 'edge', id: change.id } }
              : { type: 'unselect', kind: 'edge', id: change.id },
          )
        } else if (change.type === 'remove') {
          dispatch({ type: 'removeEdge', id: change.id })
        }
      }
    },
    [dispatch],
  )

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => canConnect(workflow, connection.source, connection.target).ok,
    [workflow],
  )

  const onConnect = useCallback(
    (connection: Connection) => dispatch({ type: 'connect', source: connection.source, target: connection.target }),
    [dispatch],
  )

  // Explain why a drop onto a handle was refused; React Flow only marks it invalid.
  const onConnectEnd = useCallback<OnConnectEnd>(
    (_event, state) => {
      if (state.isValid !== false || !state.fromNode || !state.toNode) return
      const fromTarget = state.fromHandle?.type === 'target'
      const source = fromTarget ? state.toNode.id : state.fromNode.id
      const target = fromTarget ? state.fromNode.id : state.toNode.id
      const check = canConnect(workflow, source, target)
      if (!check.ok) setRejection(check.message)
    },
    [workflow],
  )

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        edgesReconnectable={false}
        deleteKeyCode={locked ? null : DELETE_KEYS}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.25}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {rejection && (
        <div className="canvas__toast" role="status">
          {rejection}
        </div>
      )}

      {workflow.nodes.length === 0 && (
        <div className="canvas__empty">
          <p className="canvas__empty-title">Your canvas is empty</p>
          <p>Add an Input, a Transform and an Output from the left, then connect them.</p>
          <button type="button" className="button" onClick={onStartFromExample}>
            Start from example
          </button>
        </div>
      )}
    </>
  )
}
