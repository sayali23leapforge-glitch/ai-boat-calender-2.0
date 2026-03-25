"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react"
import { TaskListCard } from "./task-list-card"
import { TaskSidebar } from "./task-sidebar"
import { TaskDetailDialog } from "./task-detail-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { getTaskLists, getTaskListsPage, deleteTaskList, type TaskList } from "@/lib/task-lists"
import { getTasks, createTask, updateTask, deleteTask, toggleTaskComplete, toggleTaskStarred, type Task, type TaskPriority } from "@/lib/tasks"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface TasksViewProps {
  userId: string
}

/** Match task-sidebar list pagination — grid loads lists in pages. */
const GRID_LIST_PAGE_SIZE = 10

export function TasksView({ userId }: TasksViewProps) {
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [lists, setLists] = useState<TaskList[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [listToDelete, setListToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  /** Debounced value → GET /api/task-lists/get `nameSearch` (`task_lists.name` only; never queries `tasks`). */
  const [listNameFilter, setListNameFilter] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [hasMoreGridLists, setHasMoreGridLists] = useState(false)
  const [loadingMoreGrid, setLoadingMoreGrid] = useState(false)
  const gridListsOffsetRef = useRef(0)
  /** Prevents duplicate concurrent load-more from rapid scroll (before React re-renders). */
  const gridLoadMoreInFlightRef = useRef(false)
  const hasMoreGridListsRef = useRef(false)
  const loadingMoreGridRef = useRef(false)
  const activeFilterRef = useRef(activeFilter)
  activeFilterRef.current = activeFilter

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(listNameFilter.trim()), 300)
    return () => window.clearTimeout(t)
  }, [listNameFilter])

  const loadData = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoading(true)
      setLoadingMoreGrid(false)
      loadingMoreGridRef.current = false
      const listSearch = debouncedSearch.trim() || undefined

      // "All" grid: paginate task_lists + tasks for loaded list ids only.
      if (activeFilter === "all") {
        gridLoadMoreInFlightRef.current = false
        gridListsOffsetRef.current = 0
        setHasMoreGridLists(false)
        hasMoreGridListsRef.current = false
        const page = await getTaskListsPage(userId, {
          limit: GRID_LIST_PAGE_SIZE,
          offset: 0,
          nameSearch: listSearch,
        })
        gridListsOffsetRef.current = page.data.length
        setHasMoreGridLists(page.hasMore)
        hasMoreGridListsRef.current = page.hasMore
        setLists(page.data)

        const visibleIds = page.data.filter((l) => l.is_visible).map((l) => l.id)
        if (visibleIds.length === 0) {
          setTasks([])
          return
        }
        const tasksData = await getTasks(userId, { listIds: visibleIds })
        setTasks(tasksData)
        return
      }

      // Starred / single list: need full list set for filters (starred+search, single-list match).
      const listsAll = await getTaskLists(userId, listSearch ? { nameSearch: listSearch } : undefined)

      let listsForState = listsAll
      if (activeFilter.startsWith("list:")) {
        const id = activeFilter.replace("list:", "")
        listsForState = listsAll.filter((l) => l.id === id)
      }

      let taskFilters: Parameters<typeof getTasks>[1] | undefined

      if (listSearch) {
        if (activeFilter === "starred") {
          const ids = listsAll.map((l) => l.id)
          if (ids.length === 0) {
            setLists(listsForState)
            setTasks([])
            return
          }
          taskFilters = { listIds: ids, isStarred: true, isCompleted: false }
        } else if (activeFilter.startsWith("list:")) {
          const id = activeFilter.replace("list:", "")
          if (!listsAll.some((l) => l.id === id)) {
            setLists(listsForState)
            setTasks([])
            return
          }
          taskFilters = { listId: id }
        }
        /* `activeFilter === "all"` + listSearch is handled by the paginated block above. */
      } else if (activeFilter === "starred") {
        taskFilters = { isStarred: true, isCompleted: false }
      } else if (activeFilter.startsWith("list:")) {
        taskFilters = { listId: activeFilter.replace("list:", "") }
      } else {
        taskFilters = undefined
      }

      const tasksData = await getTasks(userId, taskFilters)
      setLists(listsForState)
      setTasks(tasksData)
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Failed to load tasks")
    } finally {
      setIsLoading(false)
    }
  }, [userId, debouncedSearch, activeFilter])

  const loadMoreGridLists = useCallback(async () => {
    if (
      !userId ||
      activeFilterRef.current !== "all" ||
      !hasMoreGridListsRef.current ||
      loadingMoreGridRef.current ||
      gridLoadMoreInFlightRef.current
    ) {
      return
    }
    gridLoadMoreInFlightRef.current = true
    const listSearch = debouncedSearch.trim() || undefined
    try {
      setLoadingMoreGrid(true)
      loadingMoreGridRef.current = true
      const page = await getTaskListsPage(userId, {
        limit: GRID_LIST_PAGE_SIZE,
        offset: gridListsOffsetRef.current,
        nameSearch: listSearch,
      })
      if (page.data.length === 0) {
        setHasMoreGridLists(false)
        hasMoreGridListsRef.current = false
        return
      }
      gridListsOffsetRef.current += page.data.length
      setHasMoreGridLists(page.hasMore)
      hasMoreGridListsRef.current = page.hasMore
      setLists((prev) => [...prev, ...page.data])

      const newVisibleIds = page.data.filter((l) => l.is_visible).map((l) => l.id)
      if (newVisibleIds.length === 0) return
      const newTasks = await getTasks(userId, { listIds: newVisibleIds })
      setTasks((prev) => [...prev, ...newTasks])
    } catch (error) {
      console.error("Error loading more lists:", error)
      toast.error("Failed to load more lists")
    } finally {
      gridLoadMoreInFlightRef.current = false
      loadingMoreGridRef.current = false
      setLoadingMoreGrid(false)
    }
  }, [userId, debouncedSearch])

  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  const mainScrollRef = useRef<HTMLElement | null>(null)
  const loadMoreGridListsRef = useRef(loadMoreGridLists)
  loadMoreGridListsRef.current = loadMoreGridLists

  useEffect(() => {
    hasMoreGridListsRef.current = hasMoreGridLists
  }, [hasMoreGridLists])
  useEffect(() => {
    loadingMoreGridRef.current = loadingMoreGrid
  }, [loadingMoreGrid])

  const onMainScroll = useCallback(() => {
    const el = mainScrollRef.current
    if (!el || activeFilterRef.current !== "all") return
    if (!hasMoreGridListsRef.current || loadingMoreGridRef.current || gridLoadMoreInFlightRef.current) return
    const threshold = 240
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      void loadMoreGridListsRef.current()
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    void loadData()
  }, [userId, loadData])

  useEffect(() => {
    if (!userId) return

    const handleRefresh = () => {
      void loadDataRef.current()
    }

    window.addEventListener("refreshTasks", handleRefresh)
    window.addEventListener("refreshCalendar", handleRefresh)

    const channel = supabase
      .channel(`tasks-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          console.log("✨ New task created via iMessage! Refreshing...")
          void loadDataRef.current()
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener("refreshTasks", handleRefresh)
      window.removeEventListener("refreshCalendar", handleRefresh)
      supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    if (!taskDrawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTaskDrawerOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [taskDrawerOpen])

  const handleFilterChange = useCallback((filter: string) => {
    setActiveFilter(filter)
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setTaskDrawerOpen(false)
    }
  }, [])

  const handleAddTask = async (listId: string, title: string, options?: { priority?: TaskPriority }) => {
    try {
      const newTask = await createTask(userId, listId, title, {
        priority: options?.priority,
      })
      setTasks(prev => [...prev, newTask])
      toast.success('Task created', { duration: 2000 })
      
      // Force a refresh after task creation to ensure consistency
      setTimeout(() => {
        loadData()
      }, 500)
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Failed to create task')
      throw error
    }
  }

  const handleToggleComplete = async (taskId: string, isCompleted: boolean) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? {
              ...t,
              is_completed: isCompleted,
              progress: isCompleted ? 100 : t.progress,
              updated_at: isCompleted ? new Date().toISOString() : t.updated_at,
            }
          : t,
      ),
    )

    try {
      const updated = await toggleTaskComplete(taskId, isCompleted)
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, ...updated } : t)))
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Failed to update task')
      await loadData()
    }
  }

  const handleToggleStarred = async (taskId: string, isStarred: boolean) => {
    setTasks(prev =>
      prev.map(t => t.id === taskId ? { ...t, is_starred: isStarred } : t)
    )

    try {
      await toggleTaskStarred(taskId, isStarred)
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Failed to update task')
      await loadData()
    }
  }

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      await updateTask(taskId, updates)
      setTasks(prev =>
        prev.map(t => t.id === taskId ? { ...t, ...updates } : t)
      )
      toast.success('Task updated')
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Failed to update task')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      setIsDeleting(true)
      // Close the dialog first
      setSelectedTask(null)
      
      // Optimistically update UI
      setTasks(prev => prev.filter(t => t.id !== taskId))
      
      // Delete from database
      await deleteTask(taskId)
      
      toast.success('Task deleted', { duration: 2000 })
    } catch (error) {
      console.error('Error deleting task:', error)
      toast.error('Failed to delete task')
      // Reload data on error to get accurate state
      await loadData()
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteList = async (listId: string) => {
    try {
      setIsDeleting(true)
      // Close the confirmation dialog first
      setListToDelete(null)
      
      // Optimistically update UI
      setLists(prev => prev.filter(l => l.id !== listId))
      setTasks(prev => prev.filter(t => t.list_id !== listId))
      
      // Delete from database
      await deleteTaskList(listId)
      
      toast.success('List deleted', { duration: 2000 })
    } catch (error) {
      console.error('Error deleting list:', error)
      toast.error('Failed to delete list')
      // Reload data on error to get accurate state
      await loadData()
    } finally {
      setIsDeleting(false)
    }
  }

  const getFilteredLists = () => {
    if (activeFilter === 'all') {
      return lists.filter(l => l.is_visible)
    }
    if (activeFilter === 'starred') {
      return []
    }
    if (activeFilter.startsWith('list:')) {
      const listId = activeFilter.replace('list:', '')
      return lists.filter(l => l.id === listId)
    }
    return lists.filter(l => l.is_visible)
  }

  const getFilteredTasks = (listId: string) => {
    let filtered = tasks.filter((t) => t.list_id === listId)
    if (activeFilter === "starred") {
      filtered = filtered.filter((t) => t.is_starred)
    }
    return filtered
  }

  const getStarredTasks = () => tasks.filter((t) => t.is_starred && !t.is_completed)

  const filteredLists = getFilteredLists()
  const hasNameFilter = debouncedSearch.trim().length > 0
  /** List name search: hide list cards with no tasks (tasks loaded by listIds from `tasks`). */
  const listsForGrid = hasNameFilter
    ? filteredLists.filter((list) => getFilteredTasks(list.id).length > 0)
    : filteredLists

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-background overflow-hidden">
      <div className="relative z-10 flex shrink-0 flex-col gap-2 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setTaskDrawerOpen((o) => !o)}
            aria-expanded={taskDrawerOpen}
            aria-label={taskDrawerOpen ? "Hide task lists" : "Show task lists"}
            title={taskDrawerOpen ? "Hide task lists" : "Show task lists"}
          >
            {taskDrawerOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Lists &amp; filters
          </span>
        </div>
        <div className="relative flex min-w-0 flex-1 sm:max-w-md sm:ml-auto">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={listNameFilter}
            onChange={(e) => setListNameFilter(e.target.value)}
            placeholder="Search list names…"
            className="h-9 pl-9 pr-9"
            aria-label="Filter task lists by name"
          />
          {listNameFilter ? (
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setListNameFilter("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main
            ref={mainScrollRef}
            onScroll={onMainScroll}
            className="flex-1 min-h-0 overflow-auto p-6"
          >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-in-smooth">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground font-medium">Loading tasks...</p>
            </div>
          </div>
        ) : activeFilter === 'starred' ? (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-6">Starred Tasks</h1>
            {getStarredTasks().length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">
                  {hasNameFilter
                    ? `No starred tasks in lists matching “${debouncedSearch.trim()}”`
                    : "No starred tasks"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {getStarredTasks().map(task => (
                  <div key={task.id} className="glass rounded-xl border border-border/50 p-4 hover-lift transition-all duration-300">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={task.is_completed}
                        onChange={(e) => handleToggleComplete(task.id, e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
                        {task.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : filteredLists.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-in-smooth max-w-md px-4">
              {hasNameFilter ? (
                <>
                  <h2 className="text-2xl font-bold text-foreground mb-2">No matching lists</h2>
                  <p className="text-muted-foreground mb-4">
                    No list names match{" "}
                    <span className="font-medium text-foreground">“{debouncedSearch.trim()}”</span>.
                  </p>
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => setListNameFilter("")}
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-foreground mb-2">No lists yet</h2>
                  <p className="text-muted-foreground">Create your first list to get started</p>
                </>
              )}
            </div>
          </div>
        ) : hasNameFilter && filteredLists.length > 0 && listsForGrid.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
              <p>
                No tasks in lists matching{" "}
                <span className="font-medium text-foreground">“{debouncedSearch.trim()}”</span>.
              </p>
              <button
                type="button"
                className="mt-4 text-primary underline-offset-4 hover:underline"
                onClick={() => setListNameFilter("")}
              >
                Clear search
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-min">
              {listsForGrid.map((list, index) => (
                <div key={list.id} className="animate-in-smooth" style={{ animationDelay: `${index * 0.05}s` }}>
                  <TaskListCard
                    list={list}
                    tasks={getFilteredTasks(list.id)}
                    onAddTask={handleAddTask}
                    onToggleComplete={handleToggleComplete}
                    onToggleStarred={handleToggleStarred}
                    onTaskClick={setSelectedTask}
                    onEditList={(listId) => {
                      toast.info('Edit list feature coming soon')
                    }}
                    onDeleteList={setListToDelete}
                    userId={userId}
                    onRefresh={loadData}
                  />
                </div>
              ))}
            </div>
            {activeFilter === "all" && hasMoreGridLists ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loadingMoreGrid ? (
                  <>
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                    <span>Loading more lists…</span>
                  </>
                ) : (
                  <span className="text-xs">Scroll for more lists</span>
                )}
              </div>
            ) : null}
          </div>
        )}
          </main>
        </div>

        {taskDrawerOpen && (
          <button
            type="button"
            className="absolute inset-0 z-[90] bg-black/40 backdrop-blur-[1px] md:bg-black/20"
            aria-label="Close task list"
            onClick={() => setTaskDrawerOpen(false)}
          />
        )}

        <div
          className={cn(
            "absolute inset-y-0 left-0 z-[100] flex h-full w-[min(18rem,92vw)] max-w-[18rem] transition-transform duration-200 ease-out",
            taskDrawerOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
          )}
          aria-hidden={!taskDrawerOpen}
        >
          <TaskSidebar
            userId={userId}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            onClose={() => setTaskDrawerOpen(false)}
          />
        </div>
      </div>

      <TaskDetailDialog
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
      />

      <AlertDialog open={!!listToDelete} onOpenChange={() => setListToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the list and all its tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => listToDelete && handleDeleteList(listToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
