/**
 * useLeadsFilters — manages lead filters with URL state synchronization.
 * Filters survive page reloads and can be shared via URL.
 */
import { useCallback, useMemo } from "react";
import { useSearch, useLocation } from "wouter";

export type LeadsView = "cards" | "table";

export interface LeadsFilters {
  search: string;
  status: string;
  projectId: string;
  corretorId: string;
  origem: string;
  temperatura: string;
  datePreset: string;
  view: LeadsView;
  page: number;
}

const DEFAULT_FILTERS: LeadsFilters = {
  search: "",
  status: "",
  projectId: "",
  corretorId: "",
  origem: "",
  temperatura: "",
  datePreset: "",
  view: "cards",
  page: 1,
};

function parseFiltersFromSearch(search: string): LeadsFilters {
  const params = new URLSearchParams(search);
  return {
    search: params.get("q") ?? DEFAULT_FILTERS.search,
    status: params.get("status") ?? DEFAULT_FILTERS.status,
    projectId: params.get("projeto") ?? DEFAULT_FILTERS.projectId,
    corretorId: params.get("corretor") ?? DEFAULT_FILTERS.corretorId,
    origem: params.get("origem") ?? DEFAULT_FILTERS.origem,
    temperatura: params.get("temp") ?? DEFAULT_FILTERS.temperatura,
    datePreset: params.get("periodo") ?? DEFAULT_FILTERS.datePreset,
    view: (params.get("view") as LeadsView) ?? DEFAULT_FILTERS.view,
    page: Number(params.get("pagina") ?? DEFAULT_FILTERS.page),
  };
}

function filtersToSearch(filters: LeadsFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.projectId) params.set("projeto", filters.projectId);
  if (filters.corretorId) params.set("corretor", filters.corretorId);
  if (filters.origem) params.set("origem", filters.origem);
  if (filters.temperatura) params.set("temp", filters.temperatura);
  if (filters.datePreset) params.set("periodo", filters.datePreset);
  if (filters.view !== "cards") params.set("view", filters.view);
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useLeadsFilters() {
  const search = useSearch();
  const [, setLocation] = useLocation();

  const filters = useMemo(() => parseFiltersFromSearch(search), [search]);

  const setFilters = useCallback(
    (update: Partial<LeadsFilters>) => {
      const next = { ...filters, ...update };
      // Reset to page 1 when any filter (other than page/view) changes
      if (Object.keys(update).some((k) => k !== "page" && k !== "view")) {
        next.page = 1;
      }
      setLocation(`/leads${filtersToSearch(next)}`, { replace: true });
    },
    [filters, setLocation],
  );

  const resetFilters = useCallback(() => {
    setLocation("/leads", { replace: true });
  }, [setLocation]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.search ||
          filters.status ||
          filters.projectId ||
          filters.corretorId ||
          filters.origem ||
          filters.temperatura ||
          filters.datePreset,
      ),
    [filters],
  );

  return { filters, setFilters, resetFilters, hasActiveFilters };
}
