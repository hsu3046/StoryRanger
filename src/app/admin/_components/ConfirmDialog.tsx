"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface ConfirmOptions {
  /** Optional heading shown above the message. */
  title?: string;
  /** Body text. `\n` is rendered as line breaks (whitespace-pre-line). */
  message: string;
  /** Confirm button label. Defaults to "Delete". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Visual tone of the confirm button. `danger` (red) is the default
   *  since this is mostly used for destructive deletes. */
  tone?: "danger" | "default";
}

interface AlertOptions {
  /** Optional heading shown above the message. */
  title?: string;
  /** Body text. `\n` is rendered as line breaks (whitespace-pre-line). */
  message: string;
  /** Dismiss button label. Defaults to "OK". */
  okLabel?: string;
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;
type AlertFn = (opts: AlertOptions | string) => Promise<void>;

interface ConfirmApi {
  confirm: ConfirmFn;
  alert: AlertFn;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

/**
 * Promise-based replacement for the native `window.confirm`. Returns a
 * function that opens a styled in-app modal and resolves to `true`
 * (confirmed) or `false` (cancelled / dismissed). Must be used under
 * `<ConfirmDialogProvider>` (mounted in the admin layout).
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmDialogProvider>");
  }
  return ctx.confirm;
}

/**
 * Promise-based replacement for the native `window.alert`. Opens a styled
 * modal with a single dismiss button and resolves once dismissed.
 */
export function useAlert(): AlertFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useAlert must be used within <ConfirmDialogProvider>");
  }
  return ctx.alert;
}

interface DialogState {
  mode: "confirm" | "alert";
  opts: ConfirmOptions & AlertOptions;
  resolve: (result: boolean) => void;
}

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DialogState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs document; flip after mount to avoid SSR hydration mismatch
    setMounted(true);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized: ConfirmOptions =
      typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      // Resolve any dialog already pending (false) before replacing it, so
      // a stacked open never strands the prior promise unsettled.
      setState((prev) => {
        prev?.resolve(false);
        return { mode: "confirm", opts: normalized, resolve };
      });
    });
  }, []);

  const alert = useCallback<AlertFn>((opts) => {
    const normalized: AlertOptions =
      typeof opts === "string" ? { message: opts } : opts;
    return new Promise<void>((resolve) => {
      setState((prev) => {
        prev?.resolve(false);
        return { mode: "alert", opts: normalized, resolve: () => resolve() };
      });
    });
  }, []);

  const api = useMemo<ConfirmApi>(() => ({ confirm, alert }), [confirm, alert]);

  const close = useCallback((result: boolean) => {
    setState((prev) => {
      prev?.resolve(result);
      return null;
    });
  }, []);

  // ESC dismisses the dialog while it's open (cancel for confirm).
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const tone = state?.opts.tone ?? "danger";
  const isAlert = state?.mode === "alert";

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {mounted &&
        state &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop — tap-to-dismiss via React onClick (the iOS-safe
                pattern; never a document-level listener). */}
            <div
              className="absolute inset-0 bg-ink/50"
              onClick={() => close(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-sm rounded-card-lg bg-paper p-5 shadow-button ring-1 ring-ink-soft/15"
            >
              {state.opts.title && (
                <h2 className="mb-1.5 font-handwritten text-lg text-accent-deep">
                  {state.opts.title}
                </h2>
              )}
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                {state.opts.message}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                {!isAlert && (
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="rounded-pill bg-paper-deep/60 px-4 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                  >
                    {state.opts.cancelLabel ?? "Cancel"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`rounded-pill px-4 py-1.5 text-sm font-medium text-paper hover:opacity-90 ${
                    isAlert || tone === "default" ? "bg-emerald" : "bg-ruby"
                  }`}
                >
                  {isAlert
                    ? (state.opts.okLabel ?? "OK")
                    : (state.opts.confirmLabel ?? "Delete")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}
