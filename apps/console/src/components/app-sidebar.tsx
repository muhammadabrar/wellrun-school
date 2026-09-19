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
  LayersIcon,
  ShieldCheckIcon,
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
  { title: "Staff", url: "/staff", icon: <BriefcaseIcon /> },
  { title: "Campuses", url: "/campuses", icon: <Building2Icon /> },
  { title: "Classes & subjects", url: "/academics", icon: <BookOpenIcon /> },
  { title: "Fee structure", url: "/fee-structure", icon: <LayersIcon /> },
  { title: "Fees", url: "/fees", icon: <WalletIcon /> },
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
            { label: "People", items: [{ title: "Students", url: "/students", icon: <UsersIcon /> }] },
            { label: "Day", items: dayItems },
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
