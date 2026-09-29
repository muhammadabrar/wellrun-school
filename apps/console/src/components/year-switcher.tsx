import { CalendarRangeIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { queryClient } from "@/lib/query";
import { readSchoolContext, readYearId, writeYearId } from "@/lib/school-context";

/** Academic year the console is looking at. Every year-scoped page (exams, fees, classes) follows it. */
export function YearSwitcher() {
  const { isMobile } = useSidebar();
  const [yearId, setYearId] = useState(readYearId());
  const [years, setYears] = useState(readSchoolContext()?.years ?? []);

  useEffect(() => {
    const sync = () => {
      setYearId(readYearId());
      setYears(readSchoolContext()?.years ?? []);
    };
    window.addEventListener("wellrun-context", sync);
    return () => window.removeEventListener("wellrun-context", sync);
  }, []);

  if (!years.length) return null;
  const active = years.find((y) => y.id === yearId) ?? years.find((y) => y.current) ?? years[0];
  const sorted = [...years].sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  function choose(id: string) {
    if (id === active.id) return;
    writeYearId(id);
    setYearId(id);
    window.dispatchEvent(new Event("wellrun-context"));
    void queryClient.invalidateQueries();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground" />}>
            <CalendarRangeIcon />
            <span className="truncate">
              {active.name}
              {active.current ? "" : " (past)"}
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Academic year</DropdownMenuLabel>
              {sorted.map((year) => (
                <DropdownMenuItem key={year.id} onClick={() => choose(year.id)}>
                  <span className="truncate">{year.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{year.id === active.id ? "Viewing" : year.current ? "Current" : ""}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
