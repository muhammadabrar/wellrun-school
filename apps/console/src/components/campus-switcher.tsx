import { Building2Icon, ChevronsUpDownIcon, GlobeIcon, PlusIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ALL_CAMPUSES } from "@/lib/campus";
import { useCampus } from "@/hooks/use-campus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

export function CampusSwitcher() {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const { campuses, campusId, active, setCampusId, allSelected } = useCampus();

  const label = allSelected ? "All campuses" : (active?.name ?? "Select campus");
  const detail = allSelected
    ? `${campuses.length} ${campuses.length === 1 ? "campus" : "campuses"}`
    : active?.isMain
      ? "Main campus"
      : active?.code || "Branch";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground" />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {allSelected ? <GlobeIcon /> : <Building2Icon />}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{label}</span>
              <span className="truncate text-xs">{detail}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Campuses</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setCampusId(ALL_CAMPUSES)}>
                <div className="flex size-6 items-center justify-center rounded-md border">
                  <GlobeIcon />
                </div>
                All campuses
              </DropdownMenuItem>
              {campuses.map((campus) => (
                <DropdownMenuItem key={campus.id} onClick={() => setCampusId(campus.id)}>
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <Building2Icon />
                  </div>
                  <span className="truncate">{campus.name}</span>
                  {campus.id === campusId ? <span className="ml-auto text-xs text-muted-foreground">Current</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate("/campuses")}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon />
                </div>
                <span className="font-medium text-muted-foreground">Add campus</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
