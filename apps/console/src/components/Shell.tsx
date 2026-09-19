import { LoadingState } from "@wellrun/ui";
import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { PageSlide } from "@/components/motion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { currentUser, api, token } from "@/lib/api";
import { ApiError, queryKeys } from "@/lib/query";
import { defaultCampusId, writeCampusId } from "@/lib/campus";
import { readSchoolContext, writeSchoolContext } from "@/lib/school-context";

const titles: [string, string][] = [
  ["/admissions/new", "New application"],
  ["/fees/receipt", "Receipt"],
  ["/admissions/", "Application"],
  ["/admissions", "Admissions"],
  ["/admission", "Quick admission"],
  ["/students/", "Student"],
  ["/students", "Students"],
  ["/attendance", "Attendance"],
  ["/absent", "Absent list"],
  ["/timetable", "Timetable"],
  ["/staff", "Staff"],
  ["/teachers", "Staff"],
  ["/campuses", "Campuses"],
  ["/academics", "Classes & subjects"],
  ["/fee-structure", "Fee structure"],
  ["/profile", "Public profile"],
  ["/fees", "Fees"],
  ["/admin", "Claims & schools"],
  ["/", "Today"],
];

function pageTitle(pathname: string) {
  return titles.find(([path]) => {
    if (path.endsWith("/") && path !== "/") return pathname.startsWith(path);
    return pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
  })?.[1] ?? "Console";
}

export function Shell() {
  const user = currentUser();
  const location = useLocation();
  const stored = readSchoolContext();
  const { data: session, error: setupError } = useQuery({
    queryKey: queryKeys.schoolSession,
    queryFn: async () => {
      const next = await api.schoolSession();
      writeSchoolContext(next);
      const campusId = defaultCampusId(next.campuses);
      if (campusId) writeCampusId(campusId);
      return next;
    },
    enabled: Boolean(user?.role === "SCHOOL_ADMIN" || user?.role === "TEACHER") && !stored,
    staleTime: Infinity,
  });
  const setupStatus = stored ?? session;

  if (!token() || (setupError instanceof ApiError && setupError.status === 401)) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "SCHOOL_ADMIN" && setupStatus && !setupStatus.setupCompleted) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle(location.pathname)}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:px-8 md:pb-8">
          <Suspense fallback={<LoadingState variant="page" />}>
            <PageSlide pageKey={location.pathname}>
              <Outlet />
            </PageSlide>
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
