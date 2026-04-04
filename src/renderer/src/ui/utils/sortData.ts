import type { SortState } from "../components/DataTable";

export function sortData<T>(data: T[], sortState: SortState | null, getField: (row: T, key: string) => unknown): T[] {
  if (!sortState) return data;
  const { key, dir } = sortState;
  return [...data].sort((a, b) => {
    const av = getField(a, key);
    const bv = getField(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export function sortDataByKey<T extends Record<string, unknown>>(
  data: T[],
  sortState: SortState | null,
): T[] {
  return sortData(data, sortState, (r, k) => r[k]);
}
