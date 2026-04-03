"use client"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  Calendar,
  Target,
  Plus,
  Upload,
  BarChart3,
  Mail,
  Brain,
  CheckSquare,
  LogOut,
  User,
} from "lucide-react"
import { useState } from "react"
import { AIQuickCreate } from "./ai-quick-create"
import { cn } from "@/lib/utils"
import type { WorkspaceView } from "@/lib/workspace-types"

/** Swap this file in `/public` for your brand asset (e.g. `logo.svg`). */
const SIDEBAR_LOGO_SRC = "/LOGO.png"

const priorities = [
  { id: "critical", label: "Critical", color: "bg-red-500", count: 3 },
  { id: "high", label: "High", color: "bg-orange-500", count: 7 },
  { id: "medium", label: "Medium", color: "bg-yellow-500", count: 12 },
  { id: "low", label: "Low", color: "bg-green-500", count: 8 },
]

const goals = [
  { id: "work", label: "Work Projects", color: "bg-blue-500", progress: 65 },
  { id: "personal", label: "Personal Growth", color: "bg-green-500", progress: 40 },
  { id: "health", label: "Health & Fitness", color: "bg-orange-500", progress: 80 },
  { id: "learning", label: "Learning", color: "bg-purple-500", progress: 55 },
]

interface SidebarProps {
  activeView: WorkspaceView
  onViewChange: (view: WorkspaceView) => void
  userId: string
  onRefresh?: () => void
  onSignOut?: () => void | Promise<void>
}

export function Sidebar({ activeView, onViewChange, userId, onRefresh, onSignOut }: SidebarProps) {
  const [showAICreate, setShowAICreate] = useState(false)

  /* Mini calendar — temporarily disabled (restore when wiring date selection / main calendar)
  const [miniCalDate, setMiniCalDate] = useState(new Date())

  const generateMiniCalendar = () => {
    const year = miniCalDate.getFullYear()
    const month = miniCalDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date()

    const days = []
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    return { days, today, month, year }
  }

  const { days, today, month, year } = generateMiniCalendar()
  const monthName = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  */

  return (
    <div className="w-full min-w-0 glass-strong border-r border-border/50 flex flex-col h-full min-h-0 backdrop-blur-xl">
      <div className="px-4 py-5 border-b border-border/50 flex items-center justify-center min-h-[5.5rem]">
        <Image
          src={SIDEBAR_LOGO_SRC}
          alt="App logo"
          width={320}
          height={96}
          className="h-16 sm:h-20 w-auto max-w-full object-contain object-left"
          priority
        />
      </div>

      <AIQuickCreate
        isOpen={showAICreate}
        onClose={() => setShowAICreate(false)}
        userId={userId}
        onSuccess={onRefresh}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {/* Mini calendar — temporarily disabled (see commented block at top of Sidebar)
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">{monthName}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  const newDate = new Date(miniCalDate)
                  newDate.setMonth(newDate.getMonth() - 1)
                  setMiniCalDate(newDate)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  const newDate = new Date(miniCalDate)
                  newDate.setMonth(newDate.getMonth() + 1)
                  setMiniCalDate(newDate)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
              <div key={i} className="text-xs text-gray-500 font-medium py-1">
                {day}
              </div>
            ))}
            {days.map((day, i) => {
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              return (
                <div
                  key={i}
                  className={cn(
                    "text-xs py-1.5 rounded-lg cursor-pointer transition-all duration-200",
                    day
                      ? isToday
                        ? "bg-primary text-primary-foreground font-semibold shadow-md scale-110"
                        : "text-foreground/70 hover:bg-accent hover:text-accent-foreground font-medium"
                      : ""
                  )}
                >
                  {day || ""}
                </div>
              )
            })}
          </div>
        </div>
        */}

        <div className="space-y-1">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "calendar"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("calendar")}
          >
            <Calendar className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "calendar" && "scale-110")} />
            Calendar
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "tasks"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("tasks")}
          >
            <CheckSquare className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "tasks" && "scale-110")} />
            Tasks
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "goals"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("goals")}
          >
            <Target className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "goals" && "scale-110")} />
            Goals
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "priorities"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("priorities")}
          >
            <BarChart3 className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "priorities" && "scale-110")} />
            Priorities
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "focus"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("focus")}
          >
            <Brain className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "focus" && "scale-110")} />
            Focus Mode
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "google"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("google")}
          >
            <Mail className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "google" && "scale-110")} />
            Integrations
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "upload"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("upload")}
          >
            <Upload className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "upload" && "scale-110")} />
            Upload
          </Button>

          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-sm font-medium transition-all duration-200 rounded-lg",
              activeView === "profile"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onViewChange("profile")}
          >
            <User className={cn("h-4 w-4 mr-3 transition-transform duration-200", activeView === "profile" && "scale-110")} />
            Profile
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">My Calendars</h3>
          <div
            className="max-h-[min(12rem,40vh)] space-y-1 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
            role="region"
            aria-label="Goals"
          >
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded-lg cursor-pointer transition-all duration-200 group"
              >
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full transition-transform duration-200 group-hover:scale-110", goal.color)} />
                  <span className="text-sm text-foreground font-medium">{goal.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto shrink-0 border-t border-border/50">
        <div className="p-4">
          <Button
            onClick={() => setShowAICreate(true)}
            className="w-full bg-primary/10 hover:bg-primary/20 text-foreground border border-primary/20 shadow-md hover:shadow-lg transition-all duration-300 justify-start group"
          >
            <Plus className="h-5 w-5 mr-3 text-primary group-hover:scale-110 transition-transform duration-300" />
            <span className="font-medium">Create</span>
          </Button>
        </div>
        {onSignOut && (
          <div className="px-4 pb-4 pt-0">
            <Button
              variant="ghost"
              className="w-full justify-start text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-all duration-200"
              onClick={() => onSignOut()}
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign out
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
