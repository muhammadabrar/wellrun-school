import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState } from "@wellrun/ui";
import { Shell } from "./components/Shell";
import { currentUser, token } from "./lib/api";
import { LoginPage } from "./pages/Login";

function lazyPage<M extends Record<string, ComponentType>>(loader: () => Promise<M>, name: keyof M & string) {
  return lazy(() => loader().then((mod) => ({ default: mod[name] as ComponentType })));
}

const RegisterSchoolPage = lazyPage(() => import("./pages/RegisterSchool"), "RegisterSchoolPage");
const ForgotPage = lazyPage(() => import("./pages/Forgot"), "ForgotPage");
const ResetPage = lazyPage(() => import("./pages/Reset"), "ResetPage");
const InvitePage = lazyPage(() => import("./pages/Invite"), "InvitePage");
const SetupPage = lazyPage(() => import("./pages/Setup"), "SetupPage");
const DashboardPage = lazyPage(() => import("./pages/Dashboard"), "DashboardPage");
const AdmissionsPage = lazyPage(() => import("./pages/Admissions"), "AdmissionsPage");
const AdmissionWizardPage = lazyPage(() => import("./pages/AdmissionWizard"), "AdmissionWizardPage");
const AdmissionPage = lazyPage(() => import("./pages/Admission"), "AdmissionPage");
const StudentsPage = lazyPage(() => import("./pages/Students"), "StudentsPage");
const StudentPage = lazyPage(() => import("./pages/Student"), "StudentPage");
const StudentEditPage = lazyPage(() => import("./pages/StudentEdit"), "StudentEditPage");
const AttendanceOverviewPage = lazyPage(() => import("./pages/attendance/Overview"), "AttendanceOverviewPage");
const MarkAttendancePage = lazyPage(() => import("./pages/attendance/Mark"), "MarkAttendancePage");
const AttendanceRegisterPage = lazyPage(() => import("./pages/attendance/Register"), "RegisterPage");
const AttendanceReportsPage = lazyPage(() => import("./pages/attendance/Reports"), "AttendanceReportsPage");
const AttendanceSettingsPage = lazyPage(() => import("./pages/attendance/Settings"), "AttendanceSettingsPage");
const AbsentPage = lazyPage(() => import("./pages/attendance/Absent"), "AbsentPage");
const DiaryPage = lazyPage(() => import("./pages/diary/Diary"), "DiaryPage");
const NoticesPage = lazyPage(() => import("./pages/notices/Notices"), "NoticesPage");
const TimetablePage = lazyPage(() => import("./pages/Timetable"), "TimetablePage");
const StaffListPage = lazyPage(() => import("./pages/staff/List"), "StaffListPage");
const StaffNewPage = lazyPage(() => import("./pages/staff/New"), "StaffNewPage");
const StaffDetailPage = lazyPage(() => import("./pages/staff/Detail"), "StaffDetailPage");
const PayrollPage = lazyPage(() => import("./pages/payroll/Month"), "PayrollPage");
const PayslipPage = lazyPage(() => import("./pages/payroll/Payslip"), "PayslipPage");
const MyPayslipPage = lazyPage(() => import("./pages/payroll/Payslip"), "MyPayslipPage");
const PortalPage = lazyPage(() => import("./pages/Portal"), "PortalPage");
const CampusesPage = lazyPage(() => import("./pages/Campuses"), "CampusesPage");
const AcademicsPage = lazyPage(() => import("./pages/Academics"), "AcademicsPage");
const AcademicYearsPage = lazyPage(() => import("./pages/academics/Years"), "AcademicYearsPage");
const NewYearPage = lazyPage(() => import("./pages/academics/NewYear"), "NewYearPage");
const FeeStructurePage = lazyPage(() => import("./pages/FeeStructure"), "FeeStructurePage");
const ProfilePage = lazyPage(() => import("./pages/Profile"), "ProfilePage");
const FeesPage = lazyPage(() => import("./pages/fees/Dashboard"), "FeesDashboardPage");
const FeeHeadsPage = lazyPage(() => import("./pages/fees/Heads"), "FeeHeadsPage");
const FeeStructuresPage = lazyPage(() => import("./pages/fees/Structures"), "FeeStructuresPage");
const FeeStructureEditPage = lazyPage(() => import("./pages/fees/StructureEdit"), "FeeStructureEditPage");
const FeeGeneratePage = lazyPage(() => import("./pages/fees/Generate"), "FeeGeneratePage");
const FeeInvoicesPage = lazyPage(() => import("./pages/fees/Invoices"), "FeeInvoicesPage");
const FeeInvoicePage = lazyPage(() => import("./pages/fees/Invoice"), "FeeInvoicePage");
const FeePaymentsPage = lazyPage(() => import("./pages/fees/Payments"), "FeePaymentsPage");
const FeeDiscountsPage = lazyPage(() => import("./pages/fees/Discounts"), "FeeDiscountsPage");
const FeeReportsPage = lazyPage(() => import("./pages/fees/Reports"), "FeeReportsPage");
const FeeSettingsPage = lazyPage(() => import("./pages/fees/Settings"), "FeeSettingsPage");
const SyllabusOverviewPage = lazyPage(() => import("./pages/syllabus/Overview"), "SyllabusOverviewPage");
const SyllabusListPage = lazyPage(() => import("./pages/syllabus/List"), "SyllabusListPage");
const SyllabusEditorPage = lazyPage(() => import("./pages/syllabus/Editor"), "SyllabusEditorPage");
const QuestionPapersPage = lazyPage(() => import("./pages/exams/QuestionPapers"), "QuestionPapersPage");
const QuestionPaperEditorPage = lazyPage(() => import("./pages/exams/QuestionPaperEditor"), "QuestionPaperEditorPage");
const QuestionPaperPrintPage = lazyPage(() => import("./pages/exams/QuestionPaperPrint"), "QuestionPaperPrintPage");
const ExamsDashboardPage = lazyPage(() => import("./pages/exams/Dashboard"), "ExamsDashboardPage");
const ExamsListPage = lazyPage(() => import("./pages/exams/List"), "ExamsListPage");
const ExamCreatePage = lazyPage(() => import("./pages/exams/New"), "ExamCreatePage");
const ExamDetailPage = lazyPage(() => import("./pages/exams/Detail"), "ExamDetailPage");
const ExamCalendarPage = lazyPage(() => import("./pages/exams/Calendar"), "ExamCalendarPage");
const AssessmentsPage = lazyPage(() => import("./pages/exams/Assessments"), "AssessmentsPage");
const MarksPapersPage = lazyPage(() => import("./pages/exams/Marks"), "MarksPapersPage");
const PendingVerificationPage = lazyPage(() => import("./pages/exams/Marks"), "PendingVerificationPage");
const ApprovedMarksPage = lazyPage(() => import("./pages/exams/Marks"), "ApprovedMarksPage");
const MarksEntryPage = lazyPage(() => import("./pages/exams/MarksEntry"), "MarksEntryPage");
const CorrectionsPage = lazyPage(() => import("./pages/exams/Corrections"), "CorrectionsPage");
const ClassResultsPage = lazyPage(() => import("./pages/exams/Results"), "ClassResultsPage");
const StudentResultsPage = lazyPage(() => import("./pages/exams/Results"), "StudentResultsPage");
const ResultSheetsPage = lazyPage(() => import("./pages/exams/Results"), "ResultSheetsPage");
const ReportCardsPage = lazyPage(() => import("./pages/exams/Results"), "ReportCardsPage");
const ClassPerformancePage = lazyPage(() => import("./pages/exams/Analytics"), "ClassPerformancePage");
const SubjectPerformancePage = lazyPage(() => import("./pages/exams/Analytics"), "SubjectPerformancePage");
const StudentPerformancePage = lazyPage(() => import("./pages/exams/Analytics"), "StudentPerformancePage");
const ExamTermsPage = lazyPage(() => import("./pages/exams/Settings"), "ExamTermsPage");
const GradingScalesPage = lazyPage(() => import("./pages/exams/Settings"), "GradingScalesPage");
const ResultRulesPage = lazyPage(() => import("./pages/exams/Settings"), "ResultRulesPage");
const RankingRulesPage = lazyPage(() => import("./pages/exams/Settings"), "RankingRulesPage");
const ReportTemplatesPage = lazyPage(() => import("./pages/exams/Settings"), "ReportTemplatesPage");
const ReceiptPage = lazyPage(() => import("./pages/Receipt"), "ReceiptPage");
const AdminPage = lazyPage(() => import("./pages/Admin"), "AdminPage");

function PageFallback() {
  return <LoadingState variant="page" />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (!token()) return <Navigate to="/login" replace />;
  const user = currentUser();
  if (user?.role === "PARENT") return <Navigate to="/login" replace />;
  return children;
}

function Screen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Screen><RegisterSchoolPage /></Screen>} />
      <Route path="/forgot-password" element={<Screen><ForgotPage /></Screen>} />
      <Route path="/reset-password" element={<Screen><ResetPage /></Screen>} />
      <Route path="/invite" element={<Screen><InvitePage /></Screen>} />
      <Route
        path="/setup"
        element={
          <RequireAuth>
            <Screen>
              <SetupPage />
            </Screen>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/admissions" element={<AdmissionsPage />} />
        <Route path="/admissions/new" element={<AdmissionWizardPage />} />
        <Route path="/admissions/:id" element={<AdmissionWizardPage />} />
        <Route path="/admission" element={<AdmissionPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:id/edit" element={<StudentEditPage />} />
        <Route path="/students/:id" element={<StudentPage />} />
        <Route path="/attendance" element={<AttendanceOverviewPage />} />
        <Route path="/attendance/mark" element={<MarkAttendancePage />} />
        <Route path="/attendance/register" element={<AttendanceRegisterPage />} />
        <Route path="/attendance/reports" element={<AttendanceReportsPage />} />
        <Route path="/attendance/settings" element={<AttendanceSettingsPage />} />
        <Route path="/attendance/absent" element={<AbsentPage />} />
        <Route path="/absent" element={<Navigate to="/attendance/absent" replace />} />
        <Route path="/timetable" element={<TimetablePage />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/notices" element={<NoticesPage />} />
        <Route path="/staff" element={<StaffListPage />} />
        <Route path="/staff/new" element={<StaffNewPage />} />
        <Route path="/staff/:id" element={<StaffDetailPage />} />
        <Route path="/teachers" element={<Navigate to="/staff" replace />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/payroll/payslips/:id" element={<PayslipPage />} />
        <Route path="/me" element={<PortalPage />} />
        <Route path="/me/payslips/:id" element={<MyPayslipPage />} />
        <Route path="/campuses" element={<CampusesPage />} />
        <Route path="/academics" element={<AcademicsPage />} />
        <Route path="/academics/years" element={<AcademicYearsPage />} />
        <Route path="/academics/years/new" element={<NewYearPage />} />
        <Route path="/fee-structure" element={<FeeStructurePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/syllabus" element={<SyllabusOverviewPage />} />
        <Route path="/syllabus/list" element={<SyllabusListPage />} />
        <Route path="/syllabus/:id" element={<SyllabusEditorPage />} />
        <Route path="/exams" element={<ExamsDashboardPage />} />
        <Route path="/exams/list" element={<ExamsListPage />} />
        <Route path="/exams/new" element={<ExamCreatePage />} />
        <Route path="/exams/question-papers" element={<QuestionPapersPage />} />
        <Route path="/exams/question-papers/:id" element={<QuestionPaperEditorPage />} />
        <Route path="/exams/question-papers/:id/print" element={<QuestionPaperPrintPage />} />
        <Route path="/exams/calendar" element={<ExamCalendarPage />} />
        <Route path="/exams/assessments" element={<Navigate to="/exams/assessments/quizzes" replace />} />
        <Route path="/exams/assessments/:kind" element={<AssessmentsPage />} />
        <Route path="/exams/marks" element={<MarksPapersPage />} />
        <Route path="/exams/marks/pending" element={<PendingVerificationPage />} />
        <Route path="/exams/marks/approved" element={<ApprovedMarksPage />} />
        <Route path="/exams/marks/corrections" element={<CorrectionsPage />} />
        <Route path="/exams/marks/:paperId" element={<MarksEntryPage />} />
        <Route path="/exams/results" element={<Navigate to="/exams/results/class" replace />} />
        <Route path="/exams/results/class" element={<ClassResultsPage />} />
        <Route path="/exams/results/student" element={<StudentResultsPage />} />
        <Route path="/exams/results/sheets" element={<ResultSheetsPage />} />
        <Route path="/exams/results/report-cards" element={<ReportCardsPage />} />
        <Route path="/exams/analytics" element={<Navigate to="/exams/analytics/class" replace />} />
        <Route path="/exams/analytics/class" element={<ClassPerformancePage />} />
        <Route path="/exams/analytics/subject" element={<SubjectPerformancePage />} />
        <Route path="/exams/analytics/student" element={<StudentPerformancePage />} />
        <Route path="/exams/settings" element={<Navigate to="/exams/settings/terms" replace />} />
        <Route path="/exams/settings/terms" element={<ExamTermsPage />} />
        <Route path="/exams/settings/grading" element={<GradingScalesPage />} />
        <Route path="/exams/settings/result-rules" element={<ResultRulesPage />} />
        <Route path="/exams/settings/ranking" element={<RankingRulesPage />} />
        <Route path="/exams/settings/report-cards" element={<ReportTemplatesPage />} />
        <Route path="/exams/:id" element={<ExamDetailPage />} />
        <Route path="/fees" element={<FeesPage />} />
        <Route path="/fees/heads" element={<FeeHeadsPage />} />
        <Route path="/fees/structures/:id" element={<FeeStructureEditPage />} />
        <Route path="/fees/structures" element={<FeeStructuresPage />} />
        <Route path="/fees/generate" element={<FeeGeneratePage />} />
        <Route path="/fees/invoices" element={<FeeInvoicesPage />} />
        <Route path="/fees/invoices/:id" element={<FeeInvoicePage />} />
        <Route path="/fees/payments" element={<FeePaymentsPage />} />
        <Route path="/fees/workspace" element={<Navigate to="/fees/invoices" replace />} />
        <Route path="/fees/outstanding" element={<Navigate to="/fees/invoices" replace />} />
        <Route path="/fees/credits" element={<Navigate to="/fees/payments" replace />} />
        <Route path="/fees/discounts" element={<FeeDiscountsPage />} />
        <Route path="/fees/reports" element={<FeeReportsPage />} />
        <Route path="/fees/settings" element={<FeeSettingsPage />} />
        <Route path="/fees/receipt/:id" element={<ReceiptPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
