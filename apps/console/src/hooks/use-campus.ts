import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { currentUser } from "@/lib/api";
import { defaultCampusId, readCampusId, writeCampusId } from "@/lib/campus";
import { classesForCampus, readSchoolContext } from "@/lib/school-context";
import { queryClient, queryKeys } from "@/lib/query";

const listKeys = [
  queryKeys.studentsRoot,
  queryKeys.dashboard,
  ["admissions"],
  ["attendance"],
  ["absent"],
  queryKeys.invoices,
  ["timetable"],
] as const;

export function useCampus() {
  const user = currentUser();
  const enabled = user?.role === "SCHOOL_ADMIN" || user?.role === "TEACHER";
  const navigate = useNavigate();
  const location = useLocation();
  const [tick, setTick] = useState(0);
  const context = readSchoolContext();
  const campuses = context?.campuses ?? [];
  const [campusId, setCampusIdState] = useState(() => defaultCampusId(campuses));

  useEffect(() => {
    const syncCampus = () => setCampusIdState(readCampusId() || defaultCampusId(readSchoolContext()?.campuses ?? []));
    const syncContext = () => setTick((value) => value + 1);
    window.addEventListener("wellrun-campus", syncCampus);
    window.addEventListener("wellrun-context", syncContext);
    window.addEventListener("storage", syncCampus);
    return () => {
      window.removeEventListener("wellrun-campus", syncCampus);
      window.removeEventListener("wellrun-context", syncContext);
      window.removeEventListener("storage", syncCampus);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !campuses.length) return;
    const next = defaultCampusId(campuses);
    if (next && next !== campusId) writeCampusId(next);
  }, [campusId, campuses, enabled]);

  function setCampusId(id: string) {
    if (!id) return;
    writeCampusId(id);
    for (const key of listKeys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    if (location.pathname === "/students" || location.pathname === "/admissions") {
      const next = new URLSearchParams(location.search);
      next.set("campusId", id);
      next.delete("page");
      navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
    }
  }

  const active = campuses.find((campus) => campus.id === campusId) ?? null;
  const classes = useMemo(() => classesForCampus(campusId), [campusId, tick]);

  return {
    campuses,
    campusId,
    active,
    setCampusId,
    classes,
    years: context?.years ?? [],
    currentYear: context?.currentYear ?? null,
  };
}
