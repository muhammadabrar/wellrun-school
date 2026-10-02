import { pageCount } from "@wellrun/shared";
import { useEffect } from "react";

/**
 * After deleting or filtering, a saved page number can point past the end. When the server says the
 * page is empty but rows exist, jump to the last page that has some.
 */
export function useClampPage(data: { items: unknown[]; total: number; page: number; pageSize: number } | undefined, setPage: (page: number) => void) {
  useEffect(() => {
    if (data && data.page > 1 && data.items.length === 0 && data.total > 0) setPage(pageCount(data.total, data.pageSize));
  }, [data, setPage]);
}
