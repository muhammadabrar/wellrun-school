/** A page of a longer list, as every paginated console endpoint returns it. */
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 1-based page and size from a raw query string, kept inside sane bounds. */
export function pageParams(query: { page?: unknown; pageSize?: unknown } = {}, defaultSize = DEFAULT_PAGE_SIZE) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(query.pageSize)) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Slice an already-loaded, already-sorted list into a page. */
export function paginate<T>(rows: T[], query: { page?: unknown; pageSize?: unknown } = {}, defaultSize = DEFAULT_PAGE_SIZE): Paged<T> {
  const { page, pageSize, skip, take } = pageParams(query, defaultSize);
  return { items: rows.slice(skip, skip + take), total: rows.length, page, pageSize };
}
