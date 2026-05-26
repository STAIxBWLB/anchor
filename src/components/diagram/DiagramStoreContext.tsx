import {
  createContext,
  useCallback,
  useContext,
  useRef,
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

export interface DiagramStoreProviderProps {
  initial?: Partial<DiagramStateRoot>;
  children: ReactNode;
}

export function DiagramStoreProvider({ initial, children }: DiagramStoreProviderProps) {
  const valueRef = useRef<DiagramStoreContextValue | null>(null);
  if (valueRef.current === null) {
    valueRef.current = {
      store: createDiagramStore(initial),
      coalescer: defaultCoalescer(),
    };
  }
  return <Ctx.Provider value={valueRef.current}>{children}</Ctx.Provider>;
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
