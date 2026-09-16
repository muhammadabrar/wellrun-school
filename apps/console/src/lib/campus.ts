export const CAMPUS_STORAGE_KEY = "wellrun-campus-id";
export const ALL_CAMPUSES = "";

export function readCampusId() {
  return localStorage.getItem(CAMPUS_STORAGE_KEY) ?? ALL_CAMPUSES;
}

export function writeCampusId(id: string) {
  if (id) localStorage.setItem(CAMPUS_STORAGE_KEY, id);
  else localStorage.removeItem(CAMPUS_STORAGE_KEY);
  window.dispatchEvent(new Event("wellrun-campus"));
}
