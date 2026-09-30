import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export type NavItem = {
  title: string;
  url: string;
  icon?: ReactNode;
  end?: boolean;
  items?: { title: string; url: string; end?: boolean }[];
};

function pathActive(pathname: string, to: string, end?: boolean) {
  if (end || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** The one sub-item that matches best, so "/admissions" doesn't light up beside "/admissions/new". */
function bestSubUrl(items: NonNullable<NavItem["items"]>, pathname: string) {
  const matches = items.filter((sub) => pathActive(pathname, sub.url, sub.end));
  return matches.reduce<string | null>((best, sub) => (best === null || sub.url.length > best.length ? sub.url : best), null);
}

export function NavMain({
  groups,
}: {
  groups: { label: string; items: NavItem[] }[];
}) {
  const location = useLocation();

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => {
              const activeSub = item.items ? bestSubUrl(item.items, location.pathname) : null;
              const childActive = activeSub !== null;
              if (!item.items?.length) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<NavLink to={item.url} end={item.end} />}
                      isActive={pathActive(location.pathname, item.url, item.end)}
                      tooltip={item.title}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              return (
                <Collapsible
                  key={item.title}
                  defaultOpen={Boolean(childActive)}
                  className="group/collapsible"
                  render={<SidebarMenuItem />}
                >
                  <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
                    {item.icon}
                    <span>{item.title}</span>
                    <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            render={<NavLink to={subItem.url} end={subItem.end} />}
                            isActive={subItem.url === activeSub}
                          >
                            <span>{subItem.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
