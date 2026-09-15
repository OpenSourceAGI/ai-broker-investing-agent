import { SidebarTrigger } from "@/components/ui/sidebar"

/**
 * Dashboard section shell (from the vinext template).
 *
 * The sidebar provider and <AppSidebar /> are mounted once for the whole app in
 * components/layout/conditional-layout-wrapper.tsx, so this layout only adds the
 * section header and its sidebar trigger — mounting a second SidebarProvider
 * here would nest two sidebars.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
        </div>
      </header>
      {children}
    </div>
  )
}
