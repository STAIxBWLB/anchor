import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";

import {
  defaultCoalescer,
  moveNodes,
  setSelection,
  setViewport,
  withSnapshot,
} from "../../../lib/diagram/actions";
import {
  clamp,
  rectsIntersect,
  screenToCanvas,
  snap,
  type Rect,
} from "../../../lib/diagram/geometry";
import type { Coalescer } from "../../../lib/diagram/history";
import type { DiagramNode, NodeId, Viewport } from "../../../lib/diagram/types";
import { useDiagram, useDiagramCoalescer, useDiagramStore } from "../DiagramStoreContext";
import { Marquee } from "./Marquee";
import { NodeView } from "./NodeView";

interface DragState {
  kind: "node";
  startCanvasX: number;
  startCanvasY: number;
  lastDx: number;
  lastDy: number;
  ids: NodeId[];
  coalescer: Coalescer;
}

interface PanState {
  kind: "pan";
  startScreenX: number;
  startScreenY: number;
  startPx: number;
  startPy: number;
}

interface MarqueeState {
  kind: "marquee";
  startCanvasX: number;
  startCanvasY: number;
  currentCanvasX: number;
  currentCanvasY: number;
  additive: boolean;
}

type Gesture = DragState | PanState | MarqueeState | null;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

function marqueeRect(g: MarqueeState): Rect {
  const x = Math.min(g.startCanvasX, g.currentCanvasX);
  const y = Math.min(g.startCanvasY, g.currentCanvasY);
  return {
    x,
    y,
    w: Math.abs(g.currentCanvasX - g.startCanvasX),
    h: Math.abs(g.currentCanvasY - g.startCanvasY),
  };
}

function nodesInsideRect(nodes: DiagramNode[], rect: Rect): NodeId[] {
  const out: NodeId[] = [];
  for (const n of nodes) {
    if (rectsIntersect({ x: n.x, y: n.y, w: n.w, h: n.h }, rect)) {
      out.push(n.id);
    }
  }
  return out;
}

export function CanvasSurface() {
  const store = useDiagramStore();
  const persistentCoalescer = useDiagramCoalescer();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gestureRef = useRef<Gesture>(null);
  const [, forceUpdate] = useState(0);

  const nodes = useDiagram((s) => s.doc.nodes);
  const viewport = useDiagram((s) => s.ephemeral.viewport);
  const selection = useDiagram((s) => s.ephemeral.selection.nodes);
  const snapOn = useDiagram((s) => s.ephemeral.ui.snapOn);
  const snapSize = useDiagram((s) => s.ephemeral.ui.snapSize);
  const tool = useDiagram((s) => s.ephemeral.tool);

  const [marquee, setMarquee] = useState<Rect | null>(null);

  // Maintain transform string locally for perf (single repaint per pan).
  const transform = `translate(${viewport.px}, ${viewport.py}) scale(${viewport.zoom})`;

  const updateViewport = useCallback(
    (next: Viewport) => store.setState(setViewport(next)),
    [store],
  );

  const beginNodeDrag = useCallback(
    (event: PointerEvent<SVGGElement>, nodeId: NodeId) => {
      event.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;
      svg.setPointerCapture(event.pointerId);
      const rect = svg.getBoundingClientRect();
      const canvas = screenToCanvas(event.clientX - rect.left, event.clientY - rect.top, viewport);

      const state = store.getState();
      const currentSelection = state.ephemeral.selection.nodes;
      const ids = currentSelection.has(nodeId)
        ? [...currentSelection]
        : (() => {
            store.setState(setSelection([nodeId]));
            return [nodeId];
          })();
      gestureRef.current = {
        kind: "node",
        startCanvasX: canvas.x,
        startCanvasY: canvas.y,
        lastDx: 0,
        lastDy: 0,
        ids,
        coalescer: defaultCoalescer(),
      };
    },
    [store, viewport],
  );

  const onSurfacePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      const svg = svgRef.current;
      if (!svg) return;
      svg.setPointerCapture(event.pointerId);
      const rect = svg.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      if (event.shiftKey || tool === "pan") {
        gestureRef.current = {
          kind: "pan",
          startScreenX: screenX,
          startScreenY: screenY,
          startPx: viewport.px,
          startPy: viewport.py,
        };
        return;
      }

      const canvas = screenToCanvas(screenX, screenY, viewport);
      gestureRef.current = {
        kind: "marquee",
        startCanvasX: canvas.x,
        startCanvasY: canvas.y,
        currentCanvasX: canvas.x,
        currentCanvasY: canvas.y,
        additive: event.metaKey || event.ctrlKey,
      };
      setMarquee({ x: canvas.x, y: canvas.y, w: 0, h: 0 });

      if (!event.metaKey && !event.ctrlKey) {
        store.setState(setSelection([]));
      }
    },
    [store, tool, viewport],
  );

  const onSurfacePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      if (gesture.kind === "pan") {
        updateViewport({
          ...viewport,
          px: gesture.startPx + (screenX - gesture.startScreenX),
          py: gesture.startPy + (screenY - gesture.startScreenY),
        });
        return;
      }

      if (gesture.kind === "marquee") {
        const canvas = screenToCanvas(screenX, screenY, viewport);
        gesture.currentCanvasX = canvas.x;
        gesture.currentCanvasY = canvas.y;
        setMarquee(marqueeRect(gesture));
        return;
      }

      if (gesture.kind === "node") {
        const canvas = screenToCanvas(screenX, screenY, viewport);
        let dx = canvas.x - gesture.startCanvasX;
        let dy = canvas.y - gesture.startCanvasY;
        if (snapOn) {
          dx = snap(dx, snapSize);
          dy = snap(dy, snapSize);
        }
        const stepDx = dx - gesture.lastDx;
        const stepDy = dy - gesture.lastDy;
        if (stepDx === 0 && stepDy === 0) return;
        gesture.lastDx = dx;
        gesture.lastDy = dy;
        store.setState(
          withSnapshot(moveNodes(gesture.ids, stepDx, stepDy), gesture.coalescer, {
            coalesce: true,
          }),
        );
      }
    },
    [snapOn, snapSize, store, updateViewport, viewport],
  );

  const onSurfacePointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (svg && svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (gesture.kind === "marquee") {
        const rect = marqueeRect(gesture);
        if (rect.w > 1 || rect.h > 1) {
          const hits = nodesInsideRect(store.getState().doc.nodes, rect);
          if (gesture.additive) {
            const existing = [...store.getState().ephemeral.selection.nodes];
            store.setState(setSelection([...new Set([...existing, ...hits])]));
          } else {
            store.setState(setSelection(hits));
          }
        }
        setMarquee(null);
      }
      if (gesture.kind === "node") {
        // Commit one consolidated history entry by resetting the per-drag coalescer
        // to "now - windowMs" so the next non-drag mutation snapshots fresh.
        persistentCoalescer.reset(Date.now());
      }
      gestureRef.current = null;
    },
    [persistentCoalescer, store],
  );

  const onWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const canvasBefore = screenToCanvas(screenX, screenY, viewport);
      const factor = Math.pow(1.0015, -event.deltaY);
      const zoom = clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const px = screenX - canvasBefore.x * zoom;
      const py = screenY - canvasBefore.y * zoom;
      updateViewport({ zoom, px, py });
    },
    [updateViewport, viewport],
  );

  // Force a redraw of the marquee when gesture state mutates (refs don't trigger React).
  useLayoutEffect(() => {
    forceUpdate((n) => n + 1);
  }, [marquee]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        gestureRef.current = null;
        setMarquee(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <svg
      ref={svgRef}
      className="anchor-diagram-canvas"
      role="application"
      aria-label="Diagram canvas"
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onPointerCancel={onSurfacePointerUp}
      onWheel={onWheel}
    >
      <g transform={transform}>
        {nodes.map((n) => (
          <NodeView
            key={n.id}
            node={n}
            selected={selection.has(n.id)}
            onPointerDown={beginNodeDrag}
          />
        ))}
        <Marquee rect={marquee} />
      </g>
    </svg>
  );
}
