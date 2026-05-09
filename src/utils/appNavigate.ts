import type { NavigateFunction } from "react-router-dom";

let navigateRef: NavigateFunction | null = null;

/** Called once from a component under `<BrowserRouter>` so toasts can jump routes. */
export function registerAppNavigate(navigate: NavigateFunction): void {
  navigateRef = navigate;
}

export function appNavigate(to: string): void {
  navigateRef?.(to);
}
