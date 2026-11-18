"use client";

import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Toast = { id: number; message: string };
type ToastApi = { show: (message: string) => void };

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const DISMISS_AFTER_MS = 4000;

/** Success messages: short, past tense, no exclamation marks ("Document deleted"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string) => {
      const id = Date.now() + Math.random();
      setToasts((all) => [...all, { id, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:items-end">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-panel border border-stone bg-paper px-4 py-3 text-sm text-ink shadow-md">
            <CheckCircle2 size={16} strokeWidth={1.75} className="shrink-0 text-success" aria-hidden="true" />
            <span>{toast.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)} className="-mr-1 ml-1 rounded-md p-1 text-ink-2 hover:bg-stone-100">
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
