"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Calendar, CheckCircle2, TrendingUp, Edit, Trash2, Loader2, Search, X } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import {
  getGoalsPage,
  getGoalWithTasks,
  createGoal,
  updateGoal,
  deleteGoal,
  createGoalTask,
  updateGoalTask,
  deleteGoalTask,
  type GoalWithTasks,
  type GoalCategory,
  type GoalPriority,
  type GoalTask,
} from "@/lib/goals"

interface GoalManagerProps {
  userId: string
}

const categoryColors = {
  work: "bg-[color:var(--goal-work)]",
  personal: "bg-[color:var(--goal-personal)]",
  health: "bg-[color:var(--goal-health)]",
  learning: "bg-[color:var(--goal-learning)]",
}

const priorityColors = {
  critical: "bg-[color:var(--priority-critical)]",
  high: "bg-[color:var(--priority-high)]",
  medium: "bg-[color:var(--priority-medium)]",
  low: "bg-[color:var(--priority-low)]",
}

const GOAL_PAGE_SIZE = 12

export function GoalManager({ userId }: GoalManagerProps) {
  const [goals, setGoals] = useState<GoalWithTasks[]>([])
  const [selectedGoal, setSelectedGoal] = useState<GoalWithTasks | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasMoreGoals, setHasMoreGoals] = useState(false)
  const [loadingMoreGoals, setLoadingMoreGoals] = useState(false)

  const goalsOffsetRef = useRef(0)
  const goalsScrollRef = useRef<HTMLDivElement | null>(null)
  const hasMoreGoalsRef = useRef(false)
  const loadingMoreGoalsRef = useRef(false)
  const loadMoreInFlightRef = useRef(false)

  // Form states
  const [formTitle, setFormTitle] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formCategory, setFormCategory] = useState<GoalCategory>("personal")
  const [formPriority, setFormPriority] = useState<GoalPriority>("medium")
  const [formTargetDate, setFormTargetDate] = useState("")

  // Task form states
  const [taskTitle, setTaskTitle] = useState("")
  const [taskPriority, setTaskPriority] = useState<GoalPriority>("medium")
  const [taskDueDate, setTaskDueDate] = useState("")

  const [filterCategory, setFilterCategory] = useState<"all" | GoalCategory>("all")
  const [filterPriority, setFilterPriority] = useState<"all" | GoalPriority>("all")
  const [goalSearch, setGoalSearch] = useState("")
  const [debouncedGoalSearch, setDebouncedGoalSearch] = useState("")

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedGoalSearch(goalSearch.trim()), 300)
    return () => window.clearTimeout(t)
  }, [goalSearch])

  const hasActiveFilters =
    filterCategory !== "all" || filterPriority !== "all" || debouncedGoalSearch.length > 0

  const clearGoalFilters = () => {
    setFilterCategory("all")
    setFilterPriority("all")
    setGoalSearch("")
  }

  const loadGoalsInitial = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoading(true)
      setLoadingMoreGoals(false)
      loadingMoreGoalsRef.current = false
      loadMoreInFlightRef.current = false
      goalsOffsetRef.current = 0
      const { goals: page, hasMore } = await getGoalsPage(userId, {
        limit: GOAL_PAGE_SIZE,
        offset: 0,
        ...(filterCategory !== "all" ? { category: filterCategory } : {}),
        ...(filterPriority !== "all" ? { priority: filterPriority } : {}),
        ...(debouncedGoalSearch ? { search: debouncedGoalSearch } : {}),
      })
      goalsOffsetRef.current = page.length
      setGoals(page)
      setHasMoreGoals(hasMore)
      hasMoreGoalsRef.current = hasMore
    } catch (error) {
      console.error("Failed to load goals", error)
      toast.error("Failed to load goals")
    } finally {
      setIsLoading(false)
    }
  }, [userId, filterCategory, filterPriority, debouncedGoalSearch])

  const loadGoalsInitialRef = useRef(loadGoalsInitial)
  loadGoalsInitialRef.current = loadGoalsInitial

  const loadMoreGoals = useCallback(async () => {
    if (!userId || !hasMoreGoalsRef.current || loadMoreInFlightRef.current) return
    loadMoreInFlightRef.current = true
    setLoadingMoreGoals(true)
    loadingMoreGoalsRef.current = true
    try {
      const { goals: page, hasMore } = await getGoalsPage(userId, {
        limit: GOAL_PAGE_SIZE,
        offset: goalsOffsetRef.current,
        ...(filterCategory !== "all" ? { category: filterCategory } : {}),
        ...(filterPriority !== "all" ? { priority: filterPriority } : {}),
        ...(debouncedGoalSearch ? { search: debouncedGoalSearch } : {}),
      })
      if (page.length === 0) {
        setHasMoreGoals(false)
        hasMoreGoalsRef.current = false
        return
      }
      goalsOffsetRef.current += page.length
      setHasMoreGoals(hasMore)
      hasMoreGoalsRef.current = hasMore
      setGoals((prev) => [...prev, ...page])
    } catch (error) {
      console.error("Failed to load more goals", error)
      toast.error("Failed to load more goals")
    } finally {
      loadMoreInFlightRef.current = false
      loadingMoreGoalsRef.current = false
      setLoadingMoreGoals(false)
    }
  }, [userId, filterCategory, filterPriority, debouncedGoalSearch])

  const loadMoreGoalsRef = useRef(loadMoreGoals)
  loadMoreGoalsRef.current = loadMoreGoals

  useEffect(() => {
    if (userId) {
      void loadGoalsInitial()

      const channel = supabase
        .channel(`goals-user-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "goals",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            console.log("✨ New goal created via iMessage! Refreshing...")
            void loadGoalsInitialRef.current()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [userId, loadGoalsInitial])

  const mergeRefreshedGoal = useCallback(
    (refreshed: GoalWithTasks) => {
      setSelectedGoal(refreshed)
      setGoals((prev) => {
        const matchesCategory = filterCategory === "all" || refreshed.category === filterCategory
        const matchesPriority = filterPriority === "all" || refreshed.priority === filterPriority
        const q = debouncedGoalSearch.toLowerCase()
        const matchesSearch =
          !q ||
          `${refreshed.title} ${refreshed.description ?? ""}`.toLowerCase().includes(q)
        if (!matchesCategory || !matchesPriority || !matchesSearch) {
          return prev.filter((g) => g.id !== refreshed.id)
        }
        const i = prev.findIndex((g) => g.id === refreshed.id)
        if (i < 0) return prev
        const next = [...prev]
        next[i] = refreshed
        return next
      })
    },
    [filterCategory, filterPriority, debouncedGoalSearch]
  )

  const onGoalsScroll = useCallback(() => {
    const el = goalsScrollRef.current
    if (!el || loadMoreInFlightRef.current || !hasMoreGoalsRef.current) return
    if (loadingMoreGoalsRef.current) return
    const threshold = 200
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      void loadMoreGoalsRef.current()
    }
  }, [])

  const resetForm = () => {
    setFormTitle("")
    setFormDescription("")
    setFormCategory("personal")
    setFormPriority("medium")
    setFormTargetDate("")
  }

  const resetTaskForm = () => {
    setTaskTitle("")
    setTaskPriority("medium")
    setTaskDueDate("")
  }

  const handleCreateGoal = async () => {
    if (!formTitle.trim()) {
      toast.error("Please enter a goal title")
      return
    }

    try {
      setIsSaving(true)
      await createGoal(userId, {
        title: formTitle,
        description: formDescription,
        category: formCategory,
        priority: formPriority,
        target_date: formTargetDate || null,
      })
      toast.success("Goal created successfully")
      setIsCreateDialogOpen(false)
      resetForm()
      await loadGoalsInitial()
    } catch (error) {
      console.error("Failed to create goal", error)
      toast.error(error instanceof Error ? error.message : "Failed to create goal")
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateGoal = async () => {
    if (!selectedGoal || !formTitle.trim()) {
      toast.error("Please enter a goal title")
      return
    }

    try {
      setIsSaving(true)
      await updateGoal(selectedGoal.id, {
        title: formTitle,
        description: formDescription,
        category: formCategory,
        priority: formPriority,
        target_date: formTargetDate || null,
      })
      toast.success("Goal updated successfully")
      setIsEditDialogOpen(false)
      resetForm()
      await loadGoalsInitial()
      setSelectedGoal(null)
    } catch (error) {
      console.error("Failed to update goal", error)
      toast.error(error instanceof Error ? error.message : "Failed to update goal")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteGoal = async () => {
    if (!selectedGoal) return

    if (!confirm("Are you sure you want to delete this goal? This will also delete all associated tasks.")) {
      return
    }

    try {
      await deleteGoal(selectedGoal.id)
      toast.success("Goal deleted successfully")
      setSelectedGoal(null)
      await loadGoalsInitial()
    } catch (error) {
      console.error("Failed to delete goal", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete goal")
    }
  }

  const handleAddTask = async () => {
    if (!selectedGoal || !taskTitle.trim()) {
      toast.error("Please enter a task title")
      return
    }

    try {
      setIsSaving(true)
      await createGoalTask(selectedGoal.id, {
        title: taskTitle,
        priority: taskPriority,
        due_date: taskDueDate || null,
      })
      toast.success("Task added successfully")
      setIsAddTaskDialogOpen(false)
      resetTaskForm()
      const refreshed = await getGoalWithTasks(selectedGoal.id)
      if (refreshed) mergeRefreshedGoal(refreshed)
    } catch (error) {
      console.error("Failed to add task", error)
      toast.error(error instanceof Error ? error.message : "Failed to add task")
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleTask = async (task: GoalTask) => {
    try {
      await updateGoalTask(task.id, { completed: !task.completed })
      if (selectedGoal) {
        const refreshed = await getGoalWithTasks(selectedGoal.id)
        if (refreshed) mergeRefreshedGoal(refreshed)
      }
    } catch (error) {
      console.error("Failed to update task", error)
      toast.error("Failed to update task")
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteGoalTask(taskId)
      toast.success("Task deleted")
      if (selectedGoal) {
        const refreshed = await getGoalWithTasks(selectedGoal.id)
        if (refreshed) mergeRefreshedGoal(refreshed)
      }
    } catch (error) {
      console.error("Failed to delete task", error)
      toast.error("Failed to delete task")
    }
  }

  const openEditDialog = (goal: GoalWithTasks) => {
    setSelectedGoal(goal)
    setFormTitle(goal.title)
    setFormDescription(goal.description)
    setFormCategory(goal.category)
    setFormPriority(goal.priority)
    setFormTargetDate(goal.target_date || "")
    setIsEditDialogOpen(true)
  }

  const getDaysUntilTarget = (targetDate: string | null) => {
    if (!targetDate) return null
    const target = new Date(targetDate)
    const today = new Date()
    const diffTime = target.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getCompletedTasksCount = (tasks: GoalTask[]) => {
    return tasks.filter((task) => task.completed).length
  }

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header — fixed; list scrolls below */}
      <div className="shrink-0 space-y-4 p-6 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Goals & Objectives</h1>
          <p className="text-muted-foreground">Track your progress and achieve your targets</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              New Goal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Goal Title</Label>
                <Input
                  id="title"
                  placeholder="Enter goal title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your goal"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={formCategory} onValueChange={(value) => setFormCategory(value as GoalCategory)}>
                  <SelectTrigger id="category">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={formPriority} onValueChange={(value) => setFormPriority(value as GoalPriority)}>
                  <SelectTrigger id="priority">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetDate">Target Date (Optional)</Label>
                <Input
                  id="targetDate"
                  type="date"
                  value={formTargetDate}
                  onChange={(e) => setFormTargetDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateGoal} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Create Goal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative min-w-0 flex-1 sm:min-w-[200px] sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={goalSearch}
            onChange={(e) => setGoalSearch(e.target.value)}
            placeholder="Search title or description…"
            className="h-9 pl-9 pr-9"
            aria-label="Search goals"
          />
          {goalSearch ? (
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setGoalSearch("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="grid gap-1">
            <Label htmlFor="filter-category" className="text-xs text-muted-foreground">
              Category
            </Label>
            <Select
              value={filterCategory}
              onValueChange={(v) => setFilterCategory(v as "all" | GoalCategory)}
            >
              <SelectTrigger id="filter-category" className="h-9 w-[min(100%,11rem)]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="work">Work</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="learning">Learning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="filter-priority" className="text-xs text-muted-foreground">
              Priority
            </Label>
            <Select
              value={filterPriority}
              onValueChange={(v) => setFilterPriority(v as "all" | GoalPriority)}
            >
              <SelectTrigger id="filter-priority" className="h-9 w-[min(100%,11rem)]">
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
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={clearGoalFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
      </div>

      <div
        ref={goalsScrollRef}
        onScroll={onGoalsScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
        role="region"
        aria-label="Goals list"
      >
      {/* Goals Grid */}
      {goals.length === 0 ? (
        <Card className="p-12 text-center">
          {hasActiveFilters ? (
            <>
              <p className="text-muted-foreground mb-4">No goals match your filters.</p>
              <Button type="button" variant="outline" onClick={clearGoalFilters}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">No goals yet. Create your first goal to get started!</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Goal
              </Button>
            </>
          )}
        </Card>
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {goals.map((goal) => {
            const daysLeft = getDaysUntilTarget(goal.target_date)
          const completedTasks = getCompletedTasksCount(goal.tasks)
          const totalTasks = goal.tasks.length

          return (
            <Card
              key={goal.id}
              className="p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedGoal(goal)}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-card-foreground">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{goal.description || "No description"}</p>
                  </div>
                    <div className="flex items-center space-x-2 ml-2">
                    <div className={`w-3 h-3 rounded-full ${categoryColors[goal.category]}`} />
                    <Badge className={`text-xs ${priorityColors[goal.priority]} text-white`}>{goal.priority}</Badge>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{goal.progress}%</span>
                  </div>
                  <Progress value={goal.progress} className="h-2" />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="space-y-1">
                    <div className="flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-[color:var(--priority-low)]" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {completedTasks}/{totalTasks} tasks
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} days left` : "Overdue") : "No date"}
                      </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-[color:var(--goal-work)]" />
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{goal.category}</div>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      {hasMoreGoals ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          {loadingMoreGoals ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
              <span>Loading more goals…</span>
            </>
          ) : (
            <span className="text-xs">Scroll for more goals</span>
          )}
        </div>
      ) : null}
      </>
      )}
      </div>

      {/* Goal Detail Modal */}
      {selectedGoal && (
        <Dialog open={!!selectedGoal} onOpenChange={() => setSelectedGoal(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <DialogTitle className="text-xl">{selectedGoal.title}</DialogTitle>
                  <p className="text-muted-foreground">{selectedGoal.description || "No description"}</p>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditDialog(selectedGoal)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteGoal()
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              {/* Progress Overview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Overall Progress</span>
                  <span className="text-2xl font-bold">{selectedGoal.progress}%</span>
                </div>
                <Progress value={selectedGoal.progress} className="h-3" />
              </div>

              {/* Goal Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Category</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${categoryColors[selectedGoal.category]}`} />
                    <span className="capitalize">{selectedGoal.category}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Priority</span>
                  <Badge className={`${priorityColors[selectedGoal.priority]} text-white`}>
                    {selectedGoal.priority}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Target Date</span>
                  <span>
                    {selectedGoal.target_date
                      ? new Date(selectedGoal.target_date).toLocaleDateString()
                      : "Not set"}
                  </span>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Days Remaining</span>
                  <span>
                    {getDaysUntilTarget(selectedGoal.target_date) !== null
                      ? `${getDaysUntilTarget(selectedGoal.target_date)} days`
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Tasks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Tasks</h4>
                  <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          resetTaskForm()
                        }}
                      >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                  </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Task to Goal</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="taskTitle">Task Title</Label>
                          <Input
                            id="taskTitle"
                            placeholder="Enter task title"
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="taskPriority">Priority</Label>
                          <Select
                            value={taskPriority}
                            onValueChange={(value) => setTaskPriority(value as GoalPriority)}
                          >
                            <SelectTrigger id="taskPriority">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="critical">Critical</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="taskDueDate">Due Date (Optional)</Label>
                          <Input
                            id="taskDueDate"
                            type="date"
                            value={taskDueDate}
                            onChange={(e) => setTaskDueDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleAddTask} disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Add Task
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {selectedGoal.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No tasks yet. Add your first task!</p>
                ) : (
                <div className="space-y-2">
                  {selectedGoal.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => handleToggleTask(task)}
                          className="rounded border-border cursor-pointer"
                        />
                      <div className="flex-1">
                        <span
                          className={`text-sm ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                        >
                          {task.title}
                        </span>
                      </div>
                        <Badge className={`text-xs ${priorityColors[task.priority]} text-white`}>
                          {task.priority}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTask(task.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Goal Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editTitle">Goal Title</Label>
              <Input
                id="editTitle"
                placeholder="Enter goal title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDescription">Description</Label>
              <Textarea
                id="editDescription"
                placeholder="Describe your goal"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCategory">Category</Label>
              <Select value={formCategory} onValueChange={(value) => setFormCategory(value as GoalCategory)}>
                <SelectTrigger id="editCategory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPriority">Priority</Label>
              <Select value={formPriority} onValueChange={(value) => setFormPriority(value as GoalPriority)}>
                <SelectTrigger id="editPriority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editTargetDate">Target Date (Optional)</Label>
              <Input
                id="editTargetDate"
                type="date"
                value={formTargetDate}
                onChange={(e) => setFormTargetDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGoal} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
