import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export type PaginatedResponse<T> = {
  properties: T[];
  hasMore: boolean;
};

export type UseAccumulatePaginatedListOptions<T> = {
  /** Response from the paginated API (properties + hasMore) */
  response: PaginatedResponse<T> | undefined;
  /** Current page (1-based). Page 1 replaces the list; page > 1 appends and dedupes. */
  page: number;
  /** When false, the effect does nothing (e.g. wrong view mode) */
  enabled: boolean;
  /** Setter for the accumulated list */
  setList: Dispatch<SetStateAction<T[]>>;
  /** Setter for hasMore from the response */
  setHasMore: Dispatch<SetStateAction<boolean>>;
  /** Setter for loading flag (set to false when response is applied) */
  setLoading: Dispatch<SetStateAction<boolean>>;
  /** Extract id for deduplication when appending. Default: (item) => (item as { id: string }).id */
  getItemId?: (item: T) => string;
};

/**
 * Accumulates paginated list results: page 1 replaces the list, page > 1 appends and dedupes by id.
 * Call with the response from your paginated API and your state setters; the effect updates list, hasMore, and loading.
 */
export function useAccumulatePaginatedList<T>({
  response,
  page,
  enabled,
  setList,
  setHasMore,
  setLoading,
  getItemId = (item) => (item as { id: string }).id,
}: UseAccumulatePaginatedListOptions<T>): void {
  const getItemIdRef = useRef(getItemId);
  getItemIdRef.current = getItemId;

  useEffect(() => {
    if (!response || !enabled) return;

    const getId = getItemIdRef.current;
    if (page === 1) {
      setList(response.properties);
    } else {
      setList((prev) => {
        const existingIds = new Set(prev.map(getId));
        const newItems = response.properties.filter(
          (p) => !existingIds.has(getId(p))
        );
        return [...prev, ...newItems];
      });
    }
    setHasMore(response.hasMore);
    setLoading(false);
  }, [response, page, enabled, setList, setHasMore, setLoading]);
}
