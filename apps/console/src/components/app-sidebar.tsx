import { BrandLogo } from "@wellrun/ui";
import type { ComponentProps } from "react";
import {
  BookOpenIcon,
  BriefcaseIcon,
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
  { title: "Attendance", url: "/attendance", icon: <ClipboardCheckIcon /> },
  { title: "Absent list", url: "/absent", icon: <UserXIcon /> },
  { title: "Timetable", url: "/timetable", icon: <CalendarClockIcon /> },
];

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
            { label: "Day", items: dayItems.filter((item) => item.url !== "/") },
          ]
        : [
            { label: "People", items: peopleItems },
            { label: "Day", items: dayItems },
            { label: "School", items: schoolItems },
          ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
          <BrandLogo />
        </div>
        {user?.role === "SCHOOL_ADMIN" || user?.role === "TEACHER" ? <CampusSwitcher /> : null}
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
