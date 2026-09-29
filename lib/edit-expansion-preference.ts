const STORAGE_KEY = "pi-edit-expanded";

export const EDIT_EXPANDED_EVENT = "pi-edit-expanded-changed";

export function isEditExpandedByDefault(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setEditExpandedByDefault(expanded: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, String(expanded));
  window.dispatchEvent(new Event(EDIT_EXPANDED_EVENT));
}
