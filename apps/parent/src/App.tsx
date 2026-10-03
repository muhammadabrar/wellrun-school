import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { SIGNED_OUT_EVENT, getToken } from "@/lib/api";
import { AttendancePage } from "@/pages/Attendance";
import { ChildHomePage } from "@/pages/ChildHome";
import { DiaryPage } from "@/pages/Diary";
import { FeesPage } from "@/pages/Fees";
import { HomePage } from "@/pages/Home";
import { LoginPage } from "@/pages/Login";
import { MorePage } from "@/pages/More";
import { NoticesPage } from "@/pages/Notices";
import { ResultsPage } from "@/pages/Results";
import { TimetablePage } from "@/pages/Timetable";
import { CalendarPage } from "@/pages/Calendar";

function RequireSignIn({ children }: { children: ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // The server said this phone is no longer signed in (for example, it was signed out from another phone).
  useEffect(() => {
    const onSignedOut = () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [navigate, queryClient]);

  return (
    <Routes>
      <Route path="/login" element={getToken() ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<RequireSignIn><HomePage /></RequireSignIn>} />
      <Route path="/more" element={<RequireSignIn><MorePage /></RequireSignIn>} />
      <Route path="/child/:id" element={<RequireSignIn><ChildHomePage /></RequireSignIn>} />
      <Route path="/child/:id/attendance" element={<RequireSignIn><AttendancePage /></RequireSignIn>} />
      <Route path="/child/:id/homework" element={<RequireSignIn><DiaryPage /></RequireSignIn>} />
      <Route path="/child/:id/fees" element={<RequireSignIn><FeesPage /></RequireSignIn>} />
      <Route path="/child/:id/results" element={<RequireSignIn><ResultsPage /></RequireSignIn>} />
      <Route path="/child/:id/notices" element={<RequireSignIn><NoticesPage /></RequireSignIn>} />
      <Route path="/child/:id/timetable" element={<RequireSignIn><TimetablePage /></RequireSignIn>} />
      <Route path="/child/:id/calendar" element={<RequireSignIn><CalendarPage /></RequireSignIn>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
