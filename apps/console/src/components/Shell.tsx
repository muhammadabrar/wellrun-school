import { LoadingState } from "@wellrun/ui";
import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { ClosedYearBanner } from "@/components/closed-year-banner";
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
  ["/syllabus/list", "Scheme of work"],
  ["/syllabus/", "Syllabus"],
  ["/syllabus", "Syllabus"],
  ["/exams/question-bank", "Question bank"],
  ["/exams/question-papers/", "Question paper"],
  ["/exams/question-papers", "Question papers"],
  ["/exams/new", "Create exam"],
  ["/exams/list", "All exams"],
  ["/exams/calendar", "Exam calendar"],
  ["/exams/assessments", "Assessments"],
  ["/exams/marks/pending", "Pending verification"],
  ["/exams/marks/approved", "Approved marks"],
  ["/exams/marks/corrections", "Corrections"],
  ["/exams/marks/", "Marks entry"],
  ["/exams/marks", "Enter marks"],
  ["/exams/results/class", "Class results"],
  ["/exams/results/student", "Student results"],
  ["/exams/results/sheets", "Result sheets"],
  ["/exams/results/report-cards", "Report cards"],
  ["/exams/analytics/class", "Class performance"],
  ["/exams/analytics/subject", "Subject performance"],
  ["/exams/analytics/student", "Student performance"],
  ["/exams/settings", "Exam settings"],
  ["/exams/", "Exam"],
  ["/exams", "Exams"],
  ["/fees/receipt", "Receipt"],
  ["/fees/structures", "Fee structures"],
  ["/fees/heads", "Fee Heads"],
  ["/fees/generate", "Generate monthly fees"],
  ["/fees/invoices/", "Invoice"],
  ["/fees/invoices", "Invoices"],
  ["/fees/payments", "Payments"],
  ["/fees/discounts", "Discounts"],
  ["/fees/reports", "Fee reports"],
  ["/fees/settings", "Fee settings"],
  ["/admissions/", "Application"],
  ["/admissions", "Admissions"],
  ["/admission", "Quick admission"],
  ["/students/", "Student"],
  ["/students", "Students"],
  ["/attendance/absent", "Absent list"],
  ["/attendance/mark", "Mark attendance"],
  ["/attendance/register", "Month register"],
  ["/attendance/reports", "Attendance reports"],
  ["/attendance/settings", "Attendance settings"],
  ["/attendance", "Attendance"],
  ["/absent", "Absent list"],
  ["/timetable", "Timetable"],
  ["/finance/vouchers/new", "New voucher"],
  ["/finance/vouchers/", "Voucher"],
  ["/finance/vouchers", "Vouchers"],
  ["/finance/ledger", "Ledger"],
  ["/finance/settings", "Accounts and categories"],
  ["/finance", "Accounts"],
  ["/inventory/", "Inventory item"],
  ["/inventory", "Inventory"],
  ["/reports/ratios", "Ratio analysis"],
  ["/reports/", "Report"],
  ["/reports", "Reports"],
  ["/diary", "Diary"],
  ["/notices", "Notices"],
  ["/staff/attendance", "Staff attendance"],
  ["/staff/leave", "Leave requests"],
  ["/staff/new", "Add staff"],
  ["/staff/", "Staff member"],
  ["/staff", "Staff"],
  ["/teachers", "Staff"],
  ["/payroll/payslips/", "Payslip"],
  ["/payroll", "Payroll"],
  ["/me/payslips/", "Payslip"],
  ["/me/leave", "My leave"],
  ["/me", "My portal"],
  ["/campuses", "Campuses"],
  ["/academics/years/new", "New academic year"],
  ["/academics/years", "Academic years"],
  ["/academics", "Classes & subjects"],
  ["/fee-structure", "Fee structure"],
  ["/profile", "Public profile"],
  ["/fees", "Fees"],
  ["/admin", "Claims & schools"],
  ["/", "Dashboard"],
];

function pageTitle(pathname: string) {
  if (/\/students\/[^/]+\/edit$/.test(pathname)) return "Edit student";
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
          <ClosedYearBanner />
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
