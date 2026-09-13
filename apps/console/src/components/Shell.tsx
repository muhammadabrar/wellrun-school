import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, currentUser, setSession } from "../lib/api";
import { PageSlide } from "./motion";

const schoolLinks = [
  { to: "/", label: "Today", roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/students", label: "Students", roles: ["SCHOOL_ADMIN"] },
  { to: "/attendance", label: "Attendance", roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/absent", label: "Absent list", roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/timetable", label: "Timetable", roles: ["SCHOOL_ADMIN", "TEACHER"] },
  { to: "/staff", label: "Staff", roles: ["SCHOOL_ADMIN"] },
  { to: "/campuses", label: "Campuses", roles: ["SCHOOL_ADMIN"] },
  { to: "/academics", label: "Classes & subjects", roles: ["SCHOOL_ADMIN"] },
  { to: "/fee-structure", label: "Fee structure", roles: ["SCHOOL_ADMIN"] },
  { to: "/fees", label: "Fees", roles: ["SCHOOL_ADMIN"] },
  { to: "/profile", label: "Public profile", roles: ["SCHOOL_ADMIN"] },
];

const adminLinks = [{ to: "/admin", label: "Claims & schools", roles: ["PLATFORM_ADMIN"] }];

export function Shell() {
  const user = currentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const links = user?.role === "PLATFORM_ADMIN" ? adminLinks : schoolLinks.filter((l) => l.roles.includes(user?.role ?? ""));

  useEffect(() => {
    if (user?.role !== "SCHOOL_ADMIN" || location.pathname === "/setup") return;
    api
      .setup()
      .then((overview) => {
        if (!overview.school.setupCompleted) navigate("/setup", { replace: true });
      })
      .catch(() => undefined);
  }, [location.pathname, navigate, user?.role]);

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
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2.5 text-[15px] ${isActive ? "bg-indigo text-white" : "text-ink hover:bg-paper"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-sm">
          <p className="font-medium">{user?.name}</p>
          <p className="text-muted">{user?.email}</p>
          <button
            type="button"
            className="mt-3 text-indigo"
            onClick={async () => {
              await api.logout().catch(() => undefined);
              setSession(null);
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-8">
        <PageSlide pageKey={location.pathname}>
          <Outlet />
        </PageSlide>
      </main>
    </div>
  );
}
