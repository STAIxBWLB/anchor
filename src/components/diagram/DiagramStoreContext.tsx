import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { defaultCoalescer } from "../../lib/diagram/actions";
import { createDiagramStore, type DiagramStore } from "../../lib/diagram/state";
import { type DiagramStateRoot } from "../../lib/diagram/types";
import { type Coalescer } from "../../lib/diagram/history";

interface DiagramStoreContextValue {
  store: DiagramStore;
  coalescer: Coalescer;
}

const Ctx = createContext<DiagramStoreContextValue | null>(null);

// ---------------------------------------------------------------------------
// Module-level singletons.
//
// `DiagramMode` is mounted and unmounted whenever the user clicks an activity-
// rail icon. If the store lives in a `useRef` inside the provider, every
// remount wipes the in-flight document — losing any unsaved work. Hoisting
// the store + coalescer to module scope keeps them alive for the lifetime
// of the JS module (i.e. the running app), so switching to Docs/Inbox/etc.
// and coming back to Diagram restores the previous canvas state exactly.
// Tests still create their own isolated stores via `createDiagramStore()`.
// ---------------------------------------------------------------------------

let sharedStore: DiagramStore | null = null;
let sharedCoalescer: Coalescer | null = null;

function getSharedStore(): DiagramStore {
  if (!sharedStore) sharedStore = createDiagramStore();
  return sharedStore;
}

function getSharedCoalescer(): Coalescer {
  if (!sharedCoalescer) sharedCoalescer = defaultCoalescer();
  return sharedCoalescer;
}

/** Test-only escape hatch — drop the singleton so each unit test starts fresh. */
export function _resetDiagramSharedStoreForTests(): void {
  sharedStore = null;
  sharedCoalescer = null;
}

export interface DiagramStoreProviderProps {
  initial?: Partial<DiagramStateRoot>;
  children: ReactNode;
}

export function DiagramStoreProvider({ initial, children }: DiagramStoreProviderProps) {
  // First-time hydration only — if a caller passes `initial` and the shared
  // store is still pristine (empty doc, untouched ephemeral), apply it.
  // Subsequent mounts ignore `initial` so we don't clobber in-flight work.
  const value = useMemo(() => {
    const store = getSharedStore();
    if (initial && store.getState().doc.nodes.length === 0 && store.getState().doc.edges.length === 0) {
      store.setState((current) => ({
        doc: initial.doc ?? current.doc,
        ephemeral: initial.ephemeral ?? current.ephemeral,
      }));
    }
    return { store, coalescer: getSharedCoalescer() };
  }, [initial]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDiagramStore(): DiagramStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDiagramStore must be used inside <DiagramStoreProvider>");
  return ctx.store;
}

export function useDiagramCoalescer(): Coalescer {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDiagramCoalescer must be used inside <DiagramStoreProvider>");
  return ctx.coalescer;
}

/**
 * Subscribe to a slice of the diagram store. Re-renders only when the
 * selected value changes (Object.is by default).
 */
export function useDiagram<T>(selector: (state: DiagramStateRoot) => T): T {
  const store = useDiagramStore();
  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

// ---------------------------------------------------------------------------
// Session-only DiagramMode shell state.
//
// The store handles `doc` + `ephemeral`. The DiagramShell carries additional
// per-mount state — currently-open filename, last-saved body hash — that also
// must survive activity-rail switches. We keep them in a tiny module-level
// object that `useDiagramSession` reads/writes via React state with manual
// sync.
// ---------------------------------------------------------------------------

export interface DiagramSession {
  activeName: string | null;
  lastSavedBody: string | null;
}

const sharedSession: DiagramSession = {
  activeName: null,
  lastSavedBody: null,
};

export function getDiagramSession(): DiagramSession {
  return sharedSession;
}

export function setDiagramSession(patch: Partial<DiagramSession>): void {
  if (patch.activeName !== undefined) sharedSession.activeName = patch.activeName;
  if (patch.lastSavedBody !== undefined) sharedSession.lastSavedBody = patch.lastSavedBody;
}

export function _resetDiagramSessionForTests(): void {
  sharedSession.activeName = null;
  sharedSession.lastSavedBody = null;
}
