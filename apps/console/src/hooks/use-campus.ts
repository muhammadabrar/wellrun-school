import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, currentUser } from "@/lib/api";
import { ALL_CAMPUSES, readCampusId, writeCampusId } from "@/lib/campus";
import { queryKeys } from "@/lib/query";

export function useCampus() {
  const user = currentUser();
  const enabled = user?.role === "SCHOOL_ADMIN" || user?.role === "TEACHER";
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useQuery({
    queryKey: queryKeys.campuses,
    queryFn: api.campuses,
    enabled,
    staleTime: 5 * 60_000,
  });
  const [campusId, setCampusIdState] = useState(readCampusId);

  useEffect(() => {
    const sync = () => setCampusIdState(readCampusId());
    window.addEventListener("wellrun-campus", sync);
    return () => window.removeEventListener("wellrun-campus", sync);
  }, []);

  useEffect(() => {
    if (!enabled || campusId || !data?.campuses.length) return;
    const main = data.campuses.find((campus) => campus.isMain) ?? data.campuses[0];
    if (main) writeCampusId(main.id);
  }, [campusId, data, enabled]);

  function setCampusId(id: string) {
    writeCampusId(id);
    if (location.pathname === "/students" || location.pathname === "/admissions") {
      const next = new URLSearchParams(location.search);
      if (id) next.set("campusId", id);
      else next.delete("campusId");
      next.delete("page");
      navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
    }
  }

  const campuses = data?.campuses ?? [];
  const active = campuses.find((campus) => campus.id === campusId) ?? null;

  return {
    campuses,
    campusId,
    active,
    setCampusId,
    allSelected: campusId === ALL_CAMPUSES,
  };
}
