import { BrandLogo } from "@wellrun/ui";
import type { ComponentProps } from "react";
import {
  BarChart3Icon,
  BookOpenIcon,
  BriefcaseIcon,
  FilePenLineIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  NotebookPenIcon,
  SettingsIcon,
  TrophyIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  GlobeIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  SunIcon,
  UserXIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { currentUser } from "@/lib/api";
import { CampusSwitcher } from "@/components/campus-switcher";
import { YearSwitcher } from "@/components/year-switcher";
import { NavMain, type NavItem } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";

const peopleItems: NavItem[] = [
  {
    title: "Students",
    url: "/students",
    icon: <GraduationCapIcon />,
    items: [
      { title: "New application", url: "/admissions/new", end: true },
      { title: "Admissions", url: "/admissions" },
      { title: "Quick admission", url: "/admission", end: true },
      { title: "Students", url: "/students" },
    ],
  },
];

const dayItems: NavItem[] = [
  { title: "Today", url: "/", icon: <CalendarDaysIcon />, end: true },
  {
    title: "Attendance",
    url: "/attendance",
    icon: <ClipboardCheckIcon />,
    items: [
      { title: "Overview", url: "/attendance", end: true },
      { title: "Mark attendance", url: "/attendance/mark" },
      { title: "Month register", url: "/attendance/register" },
      { title: "Reports", url: "/attendance/reports" },
      { title: "Settings", url: "/attendance/settings" },
    ],
  },
  { title: "Absent list", url: "/absent", icon: <UserXIcon /> },
  { title: "Timetable", url: "/timetable", icon: <CalendarClockIcon /> },
];

/** Teachers mark from their first period; no overview or settings. */
const teacherDayItems: NavItem[] = dayItems
  .filter((item) => item.url !== "/")
  .map((item) =>
    item.url === "/attendance"
      ? { ...item, url: "/attendance/mark", items: item.items?.filter((sub) => sub.url !== "/attendance" && sub.url !== "/attendance/settings") }
      : item,
  );

const examItems: NavItem[] = [
  { title: "Dashboard", url: "/exams", icon: <LayoutDashboardIcon />, end: true },
  {
    title: "Examinations",
    url: "/exams/list",
    icon: <NotebookPenIcon />,
    items: [
      { title: "All exams", url: "/exams/list" },
      { title: "Create exam", url: "/exams/new", end: true },
      { title: "Exam calendar", url: "/exams/calendar" },
    ],
  },
  {
    title: "Assessments",
    url: "/exams/assessments",
    icon: <ListChecksIcon />,
    items: [
      { title: "Quizzes", url: "/exams/assessments/quizzes" },
      { title: "Assignments", url: "/exams/assessments/assignments" },
      { title: "Practicals", url: "/exams/assessments/practicals" },
      { title: "Viva", url: "/exams/assessments/viva" },
    ],
  },
  {
    title: "Marks",
    url: "/exams/marks",
    icon: <FilePenLineIcon />,
    items: [
      { title: "Enter marks", url: "/exams/marks", end: true },
      { title: "Pending verification", url: "/exams/marks/pending" },
      { title: "Approved", url: "/exams/marks/approved" },
      { title: "Corrections", url: "/exams/marks/corrections" },
    ],
  },
  {
    title: "Results",
    url: "/exams/results",
    icon: <TrophyIcon />,
    items: [
      { title: "Class results", url: "/exams/results/class" },
      { title: "Student results", url: "/exams/results/student" },
      { title: "Result sheets", url: "/exams/results/sheets" },
      { title: "Report cards", url: "/exams/results/report-cards" },
    ],
  },
  {
    title: "Analytics",
    url: "/exams/analytics",
    icon: <BarChart3Icon />,
    items: [
      { title: "Class performance", url: "/exams/analytics/class" },
      { title: "Subject performance", url: "/exams/analytics/subject" },
      { title: "Student performance", url: "/exams/analytics/student" },
    ],
  },
  {
    title: "Settings",
    url: "/exams/settings",
    icon: <SettingsIcon />,
    items: [
      { title: "Terms", url: "/exams/settings/terms" },
      { title: "Grading systems", url: "/exams/settings/grading" },
      { title: "Result rules", url: "/exams/settings/result-rules" },
      { title: "Ranking rules", url: "/exams/settings/ranking" },
      { title: "Report card templates", url: "/exams/settings/report-cards" },
    ],
  },
];

/** Teachers mark their own subjects: no verification queue, exam creation or settings. */
const teacherExamItems: NavItem[] = examItems
  .filter((item) => item.title !== "Settings")
  .map((item) =>
    item.items
      ? {
          ...item,
          items: item.items.filter((sub) => !["/exams/new", "/exams/marks/pending", "/exams/results/sheets"].includes(sub.url)),
        }
      : item,
  );

const schoolItems: NavItem[] = [
  {
    title: "Staff",
    url: "/staff",
    icon: <BriefcaseIcon />,
    items: [
      { title: "Staff directory", url: "/staff", end: true },
      { title: "Add staff", url: "/staff/new", end: true },
      { title: "Payroll", url: "/payroll" },
    ],
  },
  { title: "Campuses", url: "/campuses", icon: <Building2Icon /> },
  { title: "Classes & subjects", url: "/academics", icon: <BookOpenIcon /> },
  {
    title: "Fees",
    url: "/fees",
    icon: <WalletIcon />,
    items: [
      { title: "Overview", url: "/fees", end: true },
      { title: "Generate monthly fees", url: "/fees/generate" },
      { title: "Invoices", url: "/fees/invoices" },
      { title: "Payments", url: "/fees/payments" },
      { title: "Fee structures", url: "/fees/structures" },
      { title: "Fee Heads", url: "/fees/heads" },
      { title: "Discounts", url: "/fees/discounts" },
      { title: "Reports", url: "/fees/reports" },
      { title: "Settings", url: "/fees/settings" },
    ],
  },
  { title: "Public profile", url: "/profile", icon: <GlobeIcon /> },
];

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const user = currentUser();
  const groups =
    user?.role === "PLATFORM_ADMIN"
      ? [
          {
            label: "Platform",
            items: [{ title: "Claims & schools", url: "/admin", icon: <ShieldCheckIcon /> }],
          },
        ]
      : user?.role === "TEACHER"
        ? [
            { label: "Me", items: [{ title: "My portal", url: "/me", icon: <SunIcon /> }] },
            { label: "People", items: [{ title: "Students", url: "/students", icon: <UsersIcon /> }] },
            { label: "Day", items: teacherDayItems },
            { label: "Exams", items: teacherExamItems },
          ]
        : [
            { label: "People", items: peopleItems },
            { label: "Day", items: dayItems },
            { label: "Exams", items: examItems },
            { label: "School", items: schoolItems },
          ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
          <BrandLogo />
        </div>
        {user?.role === "SCHOOL_ADMIN" || user?.role === "TEACHER" ? (
          <>
            <CampusSwitcher />
            <YearSwitcher />
          </>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
