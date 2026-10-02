import { BrandLogo } from "@wellrun/ui";
import type { ComponentProps } from "react";
import {
  BanknoteIcon,
  BookMarkedIcon,
  FileTextIcon,
  FileChartColumnIcon as FileBarChartIcon,
  ListTreeIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarRangeIcon,
  BriefcaseIcon,
  FilePenLineIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MegaphoneIcon,
  NotebookTextIcon,
  PlaneIcon,
  NotebookPenIcon,
  SettingsIcon,
  TrophyIcon,
  Building2Icon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  GlobeIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  SunIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { currentUser } from "@/lib/api";
import { CampusSwitcher } from "@/components/campus-switcher";
import { YearSwitcher } from "@/components/year-switcher";
import { NavMain, type NavItem } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";

/**
 * Sidebar order follows how an admin works, not how the database is laid out:
 * look at the school (Overview), deal with people, run the school day, examine, handle money,
 * and touch one-off setup last. Things used daily sit above things configured once.
 */
const overviewItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: <LayoutDashboardIcon />, end: true },
  {
    title: "Reports",
    url: "/reports",
    icon: <FileBarChartIcon />,
    items: [
      { title: "All reports", url: "/reports", end: true },
      { title: "Ratio analysis", url: "/reports/ratios" },
    ],
  },
];

const peopleItems: NavItem[] = [
  {
    title: "Admissions",
    url: "/admissions",
    icon: <UserPlusIcon />,
    items: [
      { title: "Applications", url: "/admissions" },
      { title: "New application", url: "/admissions/new", end: true },
      { title: "Quick admission", url: "/admission", end: true },
    ],
  },
  { title: "Students", url: "/students", icon: <GraduationCapIcon /> },
  {
    title: "Staff",
    url: "/staff",
    icon: <BriefcaseIcon />,
    items: [
      { title: "All staff", url: "/staff", end: true },
      { title: "Attendance", url: "/staff/attendance" },
      { title: "Leave requests", url: "/staff/leave" },
    ],
  },
];

const classroomItems: NavItem[] = [
  {
    title: "Attendance",
    url: "/attendance",
    icon: <ClipboardCheckIcon />,
    items: [
      { title: "Overview", url: "/attendance", end: true },
      { title: "Mark attendance", url: "/attendance/mark" },
      { title: "Absent list", url: "/attendance/absent" },
      { title: "Month register", url: "/attendance/register" },
      { title: "Reports", url: "/attendance/reports" },
      { title: "Settings", url: "/attendance/settings" },
    ],
  },
  { title: "Timetable", url: "/timetable", icon: <CalendarClockIcon /> },
  { title: "Diary", url: "/diary", icon: <NotebookTextIcon /> },
  { title: "Notices", url: "/notices", icon: <MegaphoneIcon /> },
];

/** Teachers mark from their first period; no overview or settings. */
const teacherClassroomItems: NavItem[] = classroomItems.map((item) =>
  item.url === "/attendance"
    ? { ...item, url: "/attendance/mark", items: item.items?.filter((sub) => sub.url !== "/attendance" && sub.url !== "/attendance/settings") }
    : item,
);

/** Annual scheme of work per class and subject. Teachers and admins both edit it; exams lock the topics they cover. */
const syllabusItems: NavItem[] = [
  { title: "Overview", url: "/syllabus", icon: <BookMarkedIcon />, end: true },
  { title: "Scheme of work", url: "/syllabus/list", icon: <ListTreeIcon /> },
];

const examItems: NavItem[] = [
  { title: "Overview", url: "/exams", icon: <LayoutDashboardIcon />, end: true },
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
  { title: "Question papers", url: "/exams/question-papers", icon: <FileTextIcon /> },
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

/** Money in, money out. Fees: day-to-day collection first, then reports, then one-time setup. */
const financeItems: NavItem[] = [
  {
    title: "Fees",
    url: "/fees",
    icon: <WalletIcon />,
    items: [
      { title: "Overview", url: "/fees", end: true },
      { title: "Invoices", url: "/fees/invoices" },
      { title: "Payments", url: "/fees/payments" },
      { title: "Generate monthly fees", url: "/fees/generate" },
      { title: "Reports", url: "/fees/reports" },
      { title: "Fee structures", url: "/fees/structures" },
      { title: "Fee Heads", url: "/fees/heads" },
      { title: "Discounts", url: "/fees/discounts" },
      { title: "Settings", url: "/fees/settings" },
    ],
  },
  { title: "Payroll", url: "/payroll", icon: <BanknoteIcon /> },
];

/** Configured once per year or campus, so it sits last. Ordered the way setup happens. */
const schoolItems: NavItem[] = [
  { title: "Campuses", url: "/campuses", icon: <Building2Icon /> },
  { title: "Academic years", url: "/academics/years", icon: <CalendarRangeIcon /> },
  { title: "Classes & subjects", url: "/academics", icon: <BookOpenIcon />, end: true },
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
            {
              label: "Me",
              items: [
                { title: "My portal", url: "/me", icon: <SunIcon />, end: true },
                { title: "My leave", url: "/me/leave", icon: <PlaneIcon /> },
              ],
            },
            { label: "People", items: [{ title: "Students", url: "/students", icon: <UsersIcon /> }] },
            { label: "Classroom", items: teacherClassroomItems },
            { label: "Syllabus", items: syllabusItems },
            { label: "Exams", items: teacherExamItems },
          ]
        : [
            { label: "Overview", items: overviewItems },
            { label: "People", items: peopleItems },
            { label: "Classroom", items: classroomItems },
            { label: "Syllabus", items: syllabusItems },
            { label: "Exams", items: examItems },
            { label: "Finance", items: financeItems },
            { label: "School setup", items: schoolItems },
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
