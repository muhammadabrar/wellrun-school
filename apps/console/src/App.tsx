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
const AttendancePage = lazyPage(() => import("./pages/Attendance"), "AttendancePage");
const AbsentPage = lazyPage(() => import("./pages/Absent"), "AbsentPage");
const TimetablePage = lazyPage(() => import("./pages/Timetable"), "TimetablePage");
const TeachersPage = lazyPage(() => import("./pages/Teachers"), "TeachersPage");
const CampusesPage = lazyPage(() => import("./pages/Campuses"), "CampusesPage");
const AcademicsPage = lazyPage(() => import("./pages/Academics"), "AcademicsPage");
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
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/absent" element={<AbsentPage />} />
        <Route path="/timetable" element={<TimetablePage />} />
        <Route path="/staff" element={<TeachersPage />} />
        <Route path="/teachers" element={<TeachersPage />} />
        <Route path="/campuses" element={<CampusesPage />} />
        <Route path="/academics" element={<AcademicsPage />} />
        <Route path="/fee-structure" element={<FeeStructurePage />} />
        <Route path="/profile" element={<ProfilePage />} />
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
