"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, parseISO } from "date-fns"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Clock, CheckCircle2, TrendingUp, Calendar, MapPin, Loader2, Search, X } from "lucide-react"
import { toast } from "sonner"
import { computePriorityStats, getPrioritySnapshot, sortPriorityTasks, type PriorityTask, type PriorityFilter } from "@/lib/priorities"
import { formatCompletedAt, toggleTaskComplete } from "@/lib/tasks"
import { cn } from "@/lib/utils"

const emptyStats = {
  total: 0,
  completed: 0,
  overdue: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
}

const priorityIcons = {
  critical: AlertTriangle,
  high: TrendingUp,
  medium: Clock,
  low: CheckCircle2,
}

const priorityAccent = {
  critical: {
    cardBorder: "border-[color:var(--priority-critical)]/50 bg-[color:var(--priority-critical)]/5",
    badge: "bg-[color:var(--priority-critical)]/15 text-[color:var(--priority-critical)] border border-[color:var(--priority-critical)]/30",
  },
  high: {
    cardBorder: "border-[color:var(--priority-high)]/40 bg-[color:var(--priority-high)]/5",
    badge: "bg-[color:var(--priority-high)]/15 text-[color:var(--priority-high)] border border-[color:var(--priority-high)]/30",
  },
  medium: {
    cardBorder: "border-[color:var(--priority-medium)]/40 bg-[color:var(--priority-medium)]/5",
    badge: "bg-[color:var(--priority-medium)]/15 text-[color:var(--priority-medium)] border border-[color:var(--priority-medium)]/30",
  },
  low: {
    cardBorder: "border-[color:var(--priority-low)]/30 bg-[color:var(--priority-low)]/10",
    badge: "bg-[color:var(--priority-low)]/20 text-[color:var(--priority-low)] border border-[color:var(--priority-low)]/30",
  },
}

interface PriorityDashboardProps {
  userId: string
}

/** Match `GOAL_PAGE_SIZE` in goal-manager (12). */
const PRIORITY_TASK_PAGE_SIZE = 12

function taskMatchesDueDateRange(dueDate: string | null, from: string, to: string): boolean {
  const hasFrom = Boolean(from?.trim())
  const hasTo = Boolean(to?.trim())
  if (!hasFrom && !hasTo) return true
  if (!dueDate) return false
  const d = dueDate.slice(0, 10)
  if (hasFrom && d < from) return false
  if (hasTo && d > to) return false
  return true
}

export function PriorityDashboard({ userId }: PriorityDashboardProps) {
  const [tasks, setTasks] = useState<PriorityTask[]>([])
  const [stats, setStats] = useState(emptyStats)
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all")
  const [taskNameSearch, setTaskNameSearch] = useState("")
  const [debouncedNameSearch, setDebouncedNameSearch] = useState("")
  const [dueDateFrom, setDueDateFrom] = useState("")
  const [dueDateTo, setDueDateTo] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  /** How many sorted tasks to render (scrollable pagination over in-memory list). */
  const [visibleTaskCount, setVisibleTaskCount] = useState(PRIORITY_TASK_PAGE_SIZE)
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false)
  const priorityListScrollRef = useRef<HTMLDivElement | null>(null)
  const loadMoreInFlightRef = useRef(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedNameSearch(taskNameSearch.trim()), 300)
    return () => window.clearTimeout(t)
  }, [taskNameSearch])

  const hasActiveFilters =
    priorityFilter !== "all" ||
    debouncedNameSearch.length > 0 ||
    dueDateFrom.trim().length > 0 ||
    dueDateTo.trim().length > 0

  const clearPriorityFilters = () => {
    setPriorityFilter("all")
    setTaskNameSearch("")
    setDueDateFrom("")
    setDueDateTo("")
  }

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoading(true)
      const snapshot = await getPrioritySnapshot(userId)
      setTasks(snapshot.tasks)
      setStats(snapshot.stats)
    } catch (error) {
      console.error("Failed to load priority data", error)
      toast.error("Unable to load priority data right now.")
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    loadData()
  }, [userId, loadData])

  // Listen for task creation/update events to refresh the dashboard
  useEffect(() => {
    const handleRefresh = () => {
      loadData()
    }
    
    window.addEventListener('refreshCalendar', handleRefresh)
    window.addEventListener('refreshTasks', handleRefresh)
    
    return () => {
      window.removeEventListener('refreshCalendar', handleRefresh)
      window.removeEventListener('refreshTasks', handleRefresh)
    }
  }, [loadData])

  const updateTasksState = useCallback((updater: (prev: PriorityTask[]) => PriorityTask[]) => {
    setTasks((prev) => {
      const next = updater(prev)
      setStats(computePriorityStats(next))
      return next
    })
  }, [])

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    updateTasksState((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              is_completed: completed,
              progress: completed ? 100 : 0,
              updated_at: completed ? new Date().toISOString() : task.updated_at,
            }
          : task,
      ),
    )

    try {
      const updated = await toggleTaskComplete(taskId, completed)
      updateTasksState((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, ...updated } : task)),
      )
    } catch (error) {
      console.error("Failed to update task completion", error)
      toast.error("Could not update task. Restoring previous state.")
      await loadData()
    }
  }

  const filteredTasks = useMemo(() => {
    let list = tasks

    if (priorityFilter !== "all") {
      list = list.filter((task) => task.priority === priorityFilter)
    }

    const q = debouncedNameSearch.toLowerCase()
    if (q) {
      list = list.filter((task) => {
        const title = (task.title || "").toLowerCase()
        const notes = (task.notes || "").toLowerCase()
        const listName = (task.task_lists?.name || "").toLowerCase()
        const goal = (task.goal || "").toLowerCase()
        return title.includes(q) || notes.includes(q) || listName.includes(q) || goal.includes(q)
      })
    }

    const from = dueDateFrom.trim()
    const to = dueDateTo.trim()
    if (from || to) {
      list = list.filter((task) => taskMatchesDueDateRange(task.due_date, from, to))
    }

    return list
  }, [tasks, priorityFilter, debouncedNameSearch, dueDateFrom, dueDateTo])

  const sortedTasks = useMemo(() => sortPriorityTasks(filteredTasks), [filteredTasks])

  const hasMoreTasks = sortedTasks.length > visibleTaskCount

  const pagedTasks = useMemo(
    () => sortedTasks.slice(0, visibleTaskCount),
    [sortedTasks, visibleTaskCount]
  )

  useEffect(() => {
    setVisibleTaskCount(PRIORITY_TASK_PAGE_SIZE)
  }, [priorityFilter, debouncedNameSearch, dueDateFrom, dueDateTo])

  const onPriorityListScroll = useCallback(() => {
    const el = priorityListScrollRef.current
    if (!el || loadMoreInFlightRef.current || loadingMoreTasks || !hasMoreTasks) return
    const threshold = 200
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      loadMoreInFlightRef.current = true
      setLoadingMoreTasks(true)
      setVisibleTaskCount((c) => Math.min(c + PRIORITY_TASK_PAGE_SIZE, sortedTasks.length))
      window.setTimeout(() => {
        setLoadingMoreTasks(false)
        loadMoreInFlightRef.current = false
      }, 350)
    }
  }, [hasMoreTasks, loadingMoreTasks, sortedTasks.length])

  const getDaysUntilDue = (dueDate: string | null) => {
    if (!dueDate) return null
    const due = new Date(dueDate)
    const today = new Date()
    const diffTime = due.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const formatDueTime = (date: string | null, time: string | null) => {
    if (!date || !time) return null
    try {
      const iso = `${date}T${time.length === 5 ? `${time}:00` : time}`
      return format(parseISO(iso), "p")
    } catch {
      return null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header + stats — fixed height */}
      <div className="shrink-0 space-y-6 p-6 pb-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Priority Dashboard</h1>
          <p className="text-muted-foreground">Focus on what matters most</p>
        </div>
        {isLoading ? (
          <span className="text-xs text-muted-foreground animate-pulse sm:pt-1">Refreshing…</span>
        ) : null}
      </div>

      {/* Filters — name, priority level, due date range */}
      <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</p>
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
          <div className="relative min-w-0 flex-1 xl:min-w-[220px] xl:max-w-md">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={taskNameSearch}
              onChange={(e) => setTaskNameSearch(e.target.value)}
              placeholder="Search title, notes, list, or goal…"
              className="h-9 pl-9 pr-9"
              aria-label="Search tasks by name or notes"
            />
            {taskNameSearch ? (
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setTaskNameSearch("")}
                aria-label="Clear name search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="grid gap-1 sm:min-w-[11rem]">
            <Label htmlFor="priority-level-filter" className="text-xs text-muted-foreground">
              Priority level
            </Label>
            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}
            >
              <SelectTrigger id="priority-level-filter" className="h-9 w-full sm:w-[11rem]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 sm:min-w-[10rem]">
            <Label htmlFor="due-from" className="text-xs text-muted-foreground">
              Due from
            </Label>
            <Input
              id="due-from"
              type="date"
              value={dueDateFrom}
              onChange={(e) => setDueDateFrom(e.target.value)}
              className="h-9 w-full sm:w-[10.5rem]"
            />
          </div>
          <div className="grid gap-1 sm:min-w-[10rem]">
            <Label htmlFor="due-to" className="text-xs text-muted-foreground">
              Due to
            </Label>
            <Input
              id="due-to"
              type="date"
              value={dueDateTo}
              onChange={(e) => setDueDateTo(e.target.value)}
              className="h-9 w-full sm:w-[10.5rem]"
            />
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={clearPriorityFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[color:var(--priority-critical)]/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-[color:var(--priority-critical)]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold">{stats.critical}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <Clock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold">{stats.overdue}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-muted rounded-lg">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
      </div>
      </div>

      {/* Priority Tasks — scrollable list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6">
        <h2 className="shrink-0 pb-3 text-lg font-semibold">Priority Tasks</h2>
        <div
          ref={priorityListScrollRef}
          onScroll={onPriorityListScroll}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
          role="region"
          aria-label="Priority tasks list"
        >
          {isLoading && tasks.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Loading priority data…</Card>
          ) : sortedTasks.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              {hasActiveFilters ? (
                <>
                  <p className="mb-4">No tasks match your filters.</p>
                  <Button type="button" variant="outline" size="sm" onClick={clearPriorityFilters}>
                    Clear filters
                  </Button>
                </>
              ) : (
                "No tasks available yet."
              )}
            </Card>
          ) : (
            <>
            <div className="space-y-3">
            {pagedTasks.map((task) => {
              const daysLeft = getDaysUntilDue(task.due_date)
              const PriorityIcon = priorityIcons[task.priority]
              const isOverdue = typeof daysLeft === "number" && daysLeft < 0 && !task.is_completed
              const completedAtText = task.is_completed
                ? formatCompletedAt(task.updated_at) ?? "Completed"
                : null
              const dueCopy = task.is_completed
                ? null
                : daysLeft === null
                  ? "No due date"
                  : isOverdue
                    ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue`
                    : daysLeft === 0
                      ? "Due today"
                      : daysLeft === 1
                        ? "Due tomorrow"
                        : `${daysLeft} days left`
              const dueTimeLabel = task.is_completed ? null : formatDueTime(task.due_date, task.due_time)
              const progressValue = Math.min(100, Math.max(0, task.progress ?? (task.is_completed ? 100 : 0)))
              const accent = priorityAccent[task.priority]

              return (
                <Card
                  key={task.id}
                  className={cn(
                    "p-5 rounded-2xl border-2 shadow-sm transition-all hover:shadow-lg",
                    accent.cardBorder,
                    task.is_completed && "opacity-60",
                    isOverdue && "border-destructive/70",
                  )}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={task.is_completed}
                      className="mt-1 rounded border-border"
                      onChange={(e) => handleToggleComplete(task.id, e.target.checked)}
                    />

                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                          <h3
                              className={cn(
                                "text-base font-semibold text-foreground",
                                task.is_completed && "line-through text-muted-foreground",
                              )}
                          >
                            {task.title}
                          </h3>
                          </div>
                          {task.notes && (
                            <p className="text-sm text-muted-foreground max-w-3xl">{task.notes}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Goal:</span>{" "}
                            {task.goal || task.task_lists?.name || "Personal"}
                          </p>
                        </div>

                        <Badge className={cn("capitalize text-xs font-semibold px-3 py-1 rounded-full", accent.badge)}>
                            <PriorityIcon className="h-3 w-3 mr-1" />
                          {task.priority}
                          </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                          <span>Progress</span>
                          <span>{progressValue}%</span>
                        </div>
                        <Progress value={progressValue} className="h-2" />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              completedAtText &&
                                "rounded-full border border-emerald-200/70 bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/80 dark:text-emerald-200",
                              !completedAtText && isOverdue && "text-destructive font-medium",
                            )}
                          >
                            {completedAtText ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                                {completedAtText}
                              </>
                            ) : (
                              <>
                                <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                                {dueCopy}
                                {dueTimeLabel && <span className="text-muted-foreground">• {dueTimeLabel}</span>}
                              </>
                            )}
                          </span>
                          {task.estimated_hours && task.estimated_hours > 0 && (
                            <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                              {task.estimated_hours}h estimated
                            </span>
                          )}
                          {task.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {task.location}
                            </span>
                          )}
                        </div>

                        <Button variant="ghost" size="sm" className="h-7 px-3 text-xs font-medium">
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
            </div>
          {hasMoreTasks ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              {loadingMoreTasks ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                  <span>Loading more tasks…</span>
                </>
              ) : (
                <span className="text-xs">Scroll for more tasks</span>
              )}
            </div>
          ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
