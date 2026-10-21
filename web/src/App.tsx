import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { NodeType } from '@wand/shared'
import { Canvas } from './components/Canvas.tsx'
import { Header } from './components/Header.tsx'
import { Palette } from './components/Palette.tsx'
import { RunBanner } from './components/RunBanner.tsx'
import { SidePanel } from './components/SidePanel.tsx'
import { exampleWorkflow, isContentEdit, isDocumentChange, type EditorAction } from './state/editor.ts'
import { isEditingLocked } from './state/run.ts'
import { useEditor } from './state/useEditor.ts'
import { useRun } from './state/useRun.ts'
import './App.css'

// Approximate node footprint, used to centre new nodes on the viewport.
const NEW_NODE_OFFSET = { x: 100, y: 40 }
const CASCADE_STEP = 24

function App() {
  const editor = useEditor()
  const { state: run, start, cancel, clear } = useRun()
  const { workflow, selection } = editor.state
  const canvasRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const locked = isEditingLocked(run)
  const hasRunPresentation = run.phase === 'active' || (run.phase === 'idle' && run.startError !== undefined)

  // Every editor action goes through here so the run rules apply in one place:
  // document changes are dropped while locked, and the first content edit after a
  // finished run clears its presentation (DECISIONS #11, #12).
  const editorDispatch = editor.dispatch
  const dispatch = useCallback(
    (action: EditorAction) => {
      if (locked && isDocumentChange(action)) return
      if (hasRunPresentation && isContentEdit(action)) clear()
      editorDispatch(action)
    },
    [locked, hasRunPresentation, clear, editorDispatch],
  )

  const addNode = useCallback(
    (nodeType: NodeType) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 }
      // Cascade consecutive additions so they don't stack exactly on top of each other.
      const cascade = (workflow.nodes.length % 5) * CASCADE_STEP
      dispatch({
        type: 'addNode',
        id: `${nodeType}-${crypto.randomUUID().slice(0, 8)}`,
        nodeType,
        position: { x: center.x - NEW_NODE_OFFSET.x + cascade, y: center.y - NEW_NODE_OFFSET.y + cascade },
      })
    },
    [dispatch, screenToFlowPosition, workflow.nodes.length],
  )

  const canRun = !locked && editor.issues.all.length === 0

  // Escape deselects from anywhere, including while typing in the side panel.
  // Cmd/Ctrl+Enter runs the workflow when it is runnable.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        dispatch({ type: 'select', selection: null })
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canRun) {
        event.preventDefault()
        start(workflow)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, canRun, start, workflow])

  return (
    <div className="app">
      <Header
        workflowName={workflow.name}
        saveStatus={editor.saveStatus}
        run={run}
        issueCount={editor.issues.all.length}
        onRun={() => start(workflow)}
        onCancel={cancel}
      />
      <div className="app__body">
        <Palette onAdd={addNode} disabled={locked} />
        <main className="canvas" ref={canvasRef}>
          <Canvas
            workflow={workflow}
            selection={selection}
            issues={editor.issues}
            dispatch={dispatch}
            onStartFromExample={() => dispatch({ type: 'replaceWorkflow', workflow: exampleWorkflow() })}
            locked={locked}
            runNodes={run.phase === 'active' ? run.snapshot?.nodes : undefined}
          />
          <RunBanner run={run} onDismiss={clear} />
        </main>
        <SidePanel
          workflow={workflow}
          selection={selection}
          issues={editor.issues}
          dispatch={dispatch}
          run={run}
          locked={locked}
        />
      </div>
    </div>
  )
}

export default App
