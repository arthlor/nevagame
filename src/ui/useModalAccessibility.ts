import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * Gives small, self-contained overlays the same keyboard and focus contract.
 * The callbacks are refs because GameApp re-renders the React tree every frame.
 */
export function useModalAccessibility<T extends HTMLElement>(
  dialogRef: RefObject<T>,
  onClose: () => void
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
      ? document.activeElement
      : null;

    const focusInitialControl = () => {
      if (!dialog) return;
      const firstControl = focusableElements(dialog)[0];
      (firstControl ?? dialog).focus();
    };

    focusInitialControl();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const controls = focusableElements(dialog);
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const restoreFocus = () => {
        if (previouslyFocused?.isConnected) {
          previouslyFocused.focus({ preventScroll: true });
          return;
        }
        // A child overlay can close into a still-active parent (for example
        // Map back to Pause). Let the newly mounted parent claim focus instead
        // of stealing it with the page-level fallback.
        if (document.querySelector(".modal-overlay.interactive")) return;
        document.querySelector<HTMLElement>("#ui-container")?.focus({ preventScroll: true });
      };
      restoreFocus();
      window.requestAnimationFrame(restoreFocus);
    };
  }, [dialogRef]);
}
