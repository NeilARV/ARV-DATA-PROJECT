import { useEffect, useRef, type RefObject } from "react";

export type UseInfiniteScrollOptions = {
  /** Ref for the sentinel element at the bottom of the list */
  ref: RefObject<HTMLDivElement | null>;
  /** Whether more data is available */
  hasMore: boolean;
  /** Whether we are currently loading the next page (prevents duplicate requests) */
  loading: boolean;
  /** Optional: also block when a fetch is in progress (e.g. react-query isFetching) */
  isFetching?: boolean;
  /** Called when the sentinel becomes visible; typically increments page and sets loading true */
  onLoadMore: () => void;
  /** When false, the observer is not attached (e.g. wrong view mode) */
  enabled: boolean;
  /** When true, use the closest .overflow-y-auto ancestor as the scroll root instead of the viewport */
  useScrollableRoot?: boolean;
  /** Extra dependencies that trigger re-attaching the observer (e.g. list length when content changes) */
  deps?: React.DependencyList;
};

/**
 * Sets up an IntersectionObserver on a sentinel element to trigger onLoadMore when it enters view.
 * Use for infinite scroll in grid/table/list views.
 */
export function useInfiniteScroll({
  ref,
  hasMore,
  loading,
  isFetching = false,
  onLoadMore,
  enabled,
  useScrollableRoot = false,
  deps = [],
}: UseInfiniteScrollOptions): void {
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const isFetchingRef = useRef(isFetching);
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;
  isFetchingRef.current = isFetching;

  useEffect(() => {
    if (!enabled) return;
    if (!hasMore || loading || isFetching) return;
    if (!ref.current) return;

    const scrollRoot = useScrollableRoot
      ? (ref.current.closest(".overflow-y-auto") as HTMLElement | null)
      : null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          hasMoreRef.current &&
          !loadingRef.current &&
          !isFetchingRef.current
        ) {
          onLoadMoreRef.current();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px",
        root: scrollRoot ?? null,
      }
    );

    const currentRef = ref.current;
    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [
    enabled,
    hasMore,
    loading,
    isFetching,
    useScrollableRoot,
    ...deps,
  ]);
}
