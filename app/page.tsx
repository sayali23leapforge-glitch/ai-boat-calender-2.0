"use client"

import { useState } from "react"
import { CalendarView } from "@/components/calendar-view"
import { GoalManager } from "@/components/goal-manager"
import { PriorityDashboard } from "@/components/priority-dashboard"
import { GoogleIntegrations } from "@/components/google-integrations"
import { DocumentUpload } from "@/components/document-upload"
import { TasksView } from "@/components/tasks-view"
import { FocusModeView } from "@/components/focus-mode-view"
import { Sidebar } from "@/components/sidebar"
import { AppNavbar } from "@/components/app-navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { EmailAuthForm } from "@/components/auth/email-auth-form"
import { Loader2 } from "lucide-react"
import ChatWidget from "@/components/chat_widget"
import { UserProfile } from "@/components/user-profile"
import { cn } from "@/lib/utils"
import type { WorkspaceView } from "@/lib/workspace-types"

export default function HomePage() {
  const [activeView, setActiveView] = useState<WorkspaceView>("tasks")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { user, loading, signOut } = useAuth()

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleViewChange = (view: WorkspaceView) => {
    setActiveView(view)
    setSidebarOpen(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
        <div className="max-w-6xl w-full grid gap-12 md:grid-cols-2 items-center">
          <div className="space-y-6 text-white">
            <p className="inline-flex items-center text-sm uppercase tracking-[0.3em] text-primary/80">
              AI calendar workspace
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
              Stay in flow with automated scheduling, focus, and planning.
            </h1>
            <p className="text-lg text-white/70">
              Create an account with your email to start syncing tasks, events, and documents securely through Supabase.
            </p>
            <ul className="space-y-3 text-white/80">
              <li>• Secure email/password authentication powered by Supabase Auth</li>
              <li>• Personal calendar, task lists, and AI document parsing</li>
              <li>• Data stored per-user with row level security</li>
            </ul>
          </div>
          <EmailAuthForm />
        </div>
      </div>
    )
  }

  const userId = user.id

  const renderView = () => {
    switch (activeView) {
      case "tasks":
        return <TasksView key={refreshKey} userId={userId} />
      case "goals":
        return <GoalManager key={refreshKey} userId={userId} />
      case "priorities":
        return <PriorityDashboard key={refreshKey} userId={userId} />
      case "focus":
        return <FocusModeView key={refreshKey} />
      case "google":
        return <GoogleIntegrations key={refreshKey} userId={userId} />
      case "upload":
        return <DocumentUpload key={refreshKey} userId={userId} />
      case "profile":
        return <UserProfile key={refreshKey} />
      case "calendar":
        return <CalendarView key={refreshKey} userId={userId} />
      default:
        return <TasksView key={refreshKey} userId={userId} />
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[105] bg-black/50 md:hidden"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[110] flex h-full w-[min(18rem,100vw)] shrink-0 flex-col bg-background shadow-xl transition-transform duration-200 ease-out md:static md:z-[1] md:w-64 md:max-w-none md:translate-x-0 md:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          userId={userId}
          onRefresh={handleRefresh}
          onSignOut={signOut}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppNavbar
          activeView={activeView}
          userEmail={user.email ?? undefined}
          onMenuClick={() => setSidebarOpen(true)}
          onRefresh={handleRefresh}
          onSignOut={signOut}
        />
        <main className="relative flex-1 min-h-0 overflow-hidden">
          {renderView()}
          <ChatWidget
            onSetActiveView={handleViewChange}
            userId={userId}
            onFileUploaded={() => {
              if (activeView === "upload") {
                handleRefresh()
              }
            }}
          />
        </main>
      </div>
    </div>
  )
}
