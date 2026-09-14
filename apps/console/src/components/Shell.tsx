import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Globe,
  GraduationCap,
  Layers,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, currentUser, setSession } from "../lib/api";
import { queryKeys } from "../lib/query";
import { PageSlide } from "./motion";

const studentLinks: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/admission", label: "Admission", icon: UserPlus },
  { to: "/students", label: "Students", icon: Users },
  { to: "/admission/settings", label: "Admission settings", icon: SlidersHorizontal },
];

const schoolLinks: { to: string; label: string; icon: LucideIcon; roles: string[] }[] = [
  { to: "/", label: "Today", icon: CalendarDays, roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck, roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/absent", label: "Absent list", icon: UserX, roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/timetable", label: "Timetable", icon: CalendarClock, roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/staff", label: "Staff", icon: Briefcase, roles: ["SCHOOL_ADMIN"] },
  { to: "/campuses", label: "Campuses", icon: Building2, roles: ["SCHOOL_ADMIN"] },
  { to: "/academics", label: "Classes & subjects", icon: BookOpen, roles: ["SCHOOL_ADMIN"] },
  { to: "/fee-structure", label: "Fee structure", icon: Layers, roles: ["SCHOOL_ADMIN"] },
  { to: "/fees", label: "Fees", icon: Wallet, roles: ["SCHOOL_ADMIN"] },
  { to: "/profile", label: "Public profile", icon: Globe, roles: ["SCHOOL_ADMIN"] },
];

const adminLinks: { to: string; label: string; icon: LucideIcon; roles: string[] }[] = [
  { to: "/admin", label: "Claims & schools", icon: ShieldCheck, roles: ["PLATFORM_ADMIN"] },
];

function navClass(isActive: boolean, compact = false) {
  return `flex items-center gap-2.5 rounded-xl px-3 ${compact ? "py-2 text-[14px]" : "py-2.5 text-[15px]"} ${
    isActive ? "bg-indigo text-white" : "text-ink hover:bg-paper"
  }`;
}

export function Shell() {
  const user = currentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const studentsOpen = ["/students", "/admission", "/admission/settings"].some(
    (path) => location.pathname === path || location.pathname.startsWith("/students/"),
  );
  const [openStudents, setOpenStudents] = useState(studentsOpen);
  const showStudentLinks = openStudents || studentsOpen;
  const links = user?.role === "PLATFORM_ADMIN" ? adminLinks : schoolLinks.filter((l) => l.roles.includes(user?.role ?? ""));
  const { data: setupStatus } = useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: api.setupStatus,
    enabled: user?.role === "SCHOOL_ADMIN",
    staleTime: 5 * 60_000,
  });

  if (user?.role === "SCHOOL_ADMIN" && setupStatus && !setupStatus.setupCompleted) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-5 py-6">
        <p className="font-display text-xs font-semibold tracking-[0.18em] text-indigo uppercase">
          Wellrun
        </p>
        <p className="mt-1 font-display text-xl">
          {user?.role === "PLATFORM_ADMIN" ? "Platform" : "School console"}
        </p>
        <nav className="mt-10 flex flex-col gap-1">
          {user?.role === "SCHOOL_ADMIN" ? (
            <>
              <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
                <CalendarDays size={18} />
                Today
              </NavLink>
              <div>
                <button
                  type="button"
                  onClick={() => setOpenStudents((value) => !value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] ${studentsOpen ? "bg-paper" : "text-ink hover:bg-paper"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <GraduationCap size={18} />
                    Students
                  </span>
                  <ChevronDown size={16} className={showStudentLinks ? "rotate-180" : ""} />
                </button>
                {showStudentLinks ? (
                  <div className="mt-1 ml-2 flex flex-col gap-1 border-l border-line pl-2">
                    {studentLinks.map((link) => (
                      <NavLink key={link.to} to={link.to} end className={({ isActive }) => navClass(isActive, true)}>
                        <link.icon size={16} />
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {(user?.role === "SCHOOL_ADMIN" ? links.filter((link) => link.to !== "/") : links).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) => navClass(isActive)}
            >
              <link.icon size={18} />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-sm">
          <p className="font-medium">{user?.name}</p>
          <p className="text-muted">{user?.email}</p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 text-indigo"
            onClick={async () => {
              await api.logout().catch(() => undefined);
              setSession(null);
              navigate("/login");
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-8">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-3xl bg-surface" />}>
          <PageSlide pageKey={location.pathname}>
            <Outlet />
          </PageSlide>
        </Suspense>
      </main>
    </div>
  );
}
