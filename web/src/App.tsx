import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { NodeType } from '@wand/shared'
import { Canvas } from './components/Canvas.tsx'
import { Header } from './components/Header.tsx'
import { Palette } from './components/Palette.tsx'
import { SidePanel } from './components/SidePanel.tsx'
import { exampleWorkflow } from './state/editor.ts'
import { useEditor } from './state/useEditor.ts'
import './App.css'

// Approximate node footprint, used to centre new nodes on the viewport.
const NEW_NODE_OFFSET = { x: 100, y: 40 }
const CASCADE_STEP = 24

function App() {
  const { state, dispatch, saveStatus, issues } = useEditor()
  const canvasRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const addNode = useCallback(
    (nodeType: NodeType) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 }
      // Cascade consecutive additions so they don't stack exactly on top of each other.
      const cascade = (state.workflow.nodes.length % 5) * CASCADE_STEP
      dispatch({
        type: 'addNode',
        id: `${nodeType}-${crypto.randomUUID().slice(0, 8)}`,
        nodeType,
        position: { x: center.x - NEW_NODE_OFFSET.x + cascade, y: center.y - NEW_NODE_OFFSET.y + cascade },
      })
    },
    [dispatch, screenToFlowPosition, state.workflow.nodes.length],
  )

  // Escape deselects from anywhere, including while typing in the side panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      dispatch({ type: 'select', selection: null })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  return (
    <div className="app">
      <Header workflowName={state.workflow.name} saveStatus={saveStatus} />
      <div className="app__body">
        <Palette onAdd={addNode} />
        <main className="canvas" ref={canvasRef}>
          <Canvas
            workflow={state.workflow}
            selection={state.selection}
            issues={issues}
            dispatch={dispatch}
            onStartFromExample={() => dispatch({ type: 'replaceWorkflow', workflow: exampleWorkflow() })}
          />
        </main>
        <SidePanel workflow={state.workflow} selection={state.selection} issues={issues} dispatch={dispatch} />
      </div>
    </div>
  )
}

export default App
