import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { currentUser, token } from "./lib/api";
import { AbsentPage } from "./pages/Absent";
import { AdminPage } from "./pages/Admin";
import { AttendancePage } from "./pages/Attendance";
import { DashboardPage } from "./pages/Dashboard";
import { FeesPage } from "./pages/Fees";
import { ForgotPage } from "./pages/Forgot";
import { InvitePage } from "./pages/Invite";
import { LoginPage } from "./pages/Login";
import { RegisterSchoolPage } from "./pages/RegisterSchool";
import { ProfilePage } from "./pages/Profile";
import { ReceiptPage } from "./pages/Receipt";
import { ResetPage } from "./pages/Reset";
import { AcademicsPage } from "./pages/Academics";
import { CampusesPage } from "./pages/Campuses";
import { FeeStructurePage } from "./pages/FeeStructure";
import { SetupPage } from "./pages/Setup";
import { StudentPage } from "./pages/Student";
import { StudentsPage } from "./pages/Students";
import { TeachersPage } from "./pages/Teachers";
import { TimetablePage } from "./pages/Timetable";

function RequireAuth({ children }: { children: ReactNode }) {
  if (!token()) return <Navigate to="/login" replace />;
  const user = currentUser();
  if (user?.role === "PARENT") return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterSchoolPage />} />
      <Route path="/forgot-password" element={<ForgotPage />} />
      <Route path="/reset-password" element={<ResetPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route
        path="/setup"
        element={
          <RequireAuth>
            <SetupPage />
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
        <Route path="/students" element={<StudentsPage />} />
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
        <Route path="/fees/receipt/:id" element={<ReceiptPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
