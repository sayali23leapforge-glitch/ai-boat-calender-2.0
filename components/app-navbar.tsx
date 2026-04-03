"use client"

import { Menu, RefreshCw, LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { WorkspaceView } from "@/lib/workspace-types"
import { getWorkspaceViewTitle } from "@/lib/workspace-types"

export interface AppNavbarProps {
  activeView: WorkspaceView
  userEmail?: string | null
  onMenuClick: () => void
  onRefresh?: () => void
  onSignOut?: () => void | Promise<void>
  className?: string
}

export function AppNavbar({
  activeView,
  userEmail,
  onMenuClick,
  onRefresh,
  onSignOut,
  className,
}: AppNavbarProps) {
  const title = getWorkspaceViewTitle(activeView)

  return (
    <header
      className={cn(
        "relative z-[30] flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-5",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden shrink-0"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {userEmail ? (
          <p className="truncate text-xs text-muted-foreground md:text-sm">{userEmail}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onRefresh ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            aria-label="Refresh current view"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        ) : null}

        {onSignOut ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Account</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {userEmail ? (
                <>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{userEmail}</div>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => void onSignOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  )
}
