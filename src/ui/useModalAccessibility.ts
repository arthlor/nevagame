import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "area[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]"
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
    // Roving-tabindex groups (the satchel grid, tab strips) park their inactive
    // members at -1. Counting them made the wrap-around land on a control the
    // browser would never tab to.
    if (element.getAttribute("tabindex") === "-1") return false;
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  });
}

/**
 * Every mount pushes its connected opener so a remount chain (Pause ->
 * Journal -> Pause) never loses the true return target: a remount captures
 * only a doomed node from the same commit, while the original opener (for
 * example the HUD menu button) stays connected underneath. Stale entries
 * are pruned when consumed.
 */
const openerStack: HTMLElement[] = [];
const modalStack: HTMLElement[] = [];

function pushOpener(): void {
  for (let index = openerStack.length - 1; index >= 0; index -= 1) {
    if (!openerStack[index].isConnected) openerStack.splice(index, 1);
  }
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    active !== document.documentElement &&
    active.isConnected &&
    openerStack.at(-1) !== active
  ) {
    openerStack.push(active);
  }
}

function restoreNearestOpener(): void {
  while (openerStack.length > 0) {
    const candidate = openerStack.pop();
    if (candidate?.isConnected && !candidate.closest("[inert]")) {
      candidate.focus({ preventScroll: true });
      return;
    }
  }
  document.querySelector<HTMLElement>("#ui-container")?.focus({ preventScroll: true });
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
    if (!dialog) return;
    pushOpener();
    modalStack.push(dialog);

    const focusInitialControl = () => {
      if (!dialog) return;
      const firstControl = focusableElements(dialog)[0];
      (firstControl ?? dialog).focus();
    };

    focusInitialControl();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== dialog || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
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
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
      const index = modalStack.lastIndexOf(dialog);
      if (index >= 0) modalStack.splice(index, 1);
      // Defer the restore decision one frame. Opening a stacked child
      // (Pause -> Map) unmounts the parent in the same commit the child
      // mounts in, so a synchronous restore would yank focus back to the
      // parent's opener (for example the HUD menu button) before the child
      // claims it. By the next frame the newly mounted overlay is present
      // and owns initial focus. A close back to the world restores the nearest connected
      // opener, falling back to the UI root.
      window.requestAnimationFrame(() => {
        const parent = modalStack.at(-1);
        if (parent) {
          if (!parent.contains(document.activeElement)) {
            (focusableElements(parent)[0] ?? parent).focus({ preventScroll: true });
          }
          return;
        }
        restoreNearestOpener();
      });
    };
  }, [dialogRef]);
}
