import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Arrow-key navigation for a `role="tablist"`.
 *
 * The modals all render tab strips with correct roles but no keyboard model,
 * so a keyboard player had to Tab through every tab to reach the panel. This
 * moves focus with the arrow keys and activates on move, which is the expected
 * behaviour for tabs whose panels are cheap to render.
 */
export function handleTabListKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
  const { key } = event;
  if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;

  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
    (tab) => !tab.hasAttribute("disabled") && tab.getAttribute("aria-disabled") !== "true"
  );
  if (tabs.length === 0) return;

  const activeIndex = tabs.findIndex((tab) => tab === document.activeElement);
  // Falling back to the selected tab lets the arrows work right after a click.
  const currentIndex = activeIndex >= 0
    ? activeIndex
    : Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"));

  let nextIndex = currentIndex;
  if (key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  else if (key === "Home") nextIndex = 0;
  else nextIndex = tabs.length - 1;

  if (nextIndex === activeIndex) return;
  event.preventDefault();
  event.stopPropagation();
  const next = tabs[nextIndex];
  next.focus();
  next.click();
}

/** Settings radios select on arrow movement and expose one Tab stop per group. */
export function handleRadioGroupKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
    .filter((radio) => !radio.disabled && radio.getAttribute("aria-disabled") !== "true");
  if (radios.length === 0) return;
  const focused = radios.findIndex((radio) => radio === document.activeElement);
  const current = focused >= 0 ? focused : Math.max(0, radios.findIndex((radio) => radio.getAttribute("aria-checked") === "true"));
  const next = event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1
    : (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + radios.length) % radios.length;
  event.preventDefault();
  event.stopPropagation();
  radios[next].focus();
  radios[next].click();
}
