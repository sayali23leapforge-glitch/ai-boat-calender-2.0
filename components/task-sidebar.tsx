"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, CheckSquare, Star, Eye, EyeOff, ChevronDown, ChevronRight, X, Loader2, Search } from "lucide-react"
import {
  getTaskListsPage,
  createTaskList,
  toggleListVisibility,
  type TaskList,
} from "@/lib/task-lists"
import { getTasks } from "@/lib/tasks"
import { toast } from "sonner"

interface TaskSidebarProps {
  userId: string
  activeFilter: string
  onFilterChange: (filter: string) => void
  /** When set, shows a close control (for drawer mode). */
  onClose?: () => void
}

const LIST_PAGE_SIZE = 25

export function TaskSidebar({ userId, activeFilter, onFilterChange, onClose }: TaskSidebarProps) {
  const [lists, setLists] = useState<TaskList[]>([])
  const [hasMoreLists, setHasMoreLists] = useState(true)
  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingMoreLists, setLoadingMoreLists] = useState(false)
  /** Next offset for GET /api/task-lists/get (cursor for pagination). */
  const listsOffsetRef = useRef(0)
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [isCreatingList, setIsCreatingList] = useState(false)
  const [isSubmittingList, setIsSubmittingList] = useState(false)
  const [newListName, setNewListName] = useState("")
  /** Prevents Enter + onBlur both calling create (common duplicate source). */
  const ignoreBlurSubmitRef = useRef(false)
  const [isListsExpanded, setIsListsExpanded] = useState(true)
  const [allTasksCount, setAllTasksCount] = useState(0)
  const [starredCount, setStarredCount] = useState(0)
  const [listSearchQuery, setListSearchQuery] = useState("")
  const [debouncedListSearch, setDebouncedListSearch] = useState("")

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedListSearch(listSearchQuery.trim()), 300)
    return () => window.clearTimeout(t)
  }, [listSearchQuery])

  const loadListsInitial = useCallback(async () => {
    if (!userId) return
    try {
      setLoadingLists(true)
      listsOffsetRef.current = 0
      const nameSearch = debouncedListSearch || undefined
      const { data, hasMore } = await getTaskListsPage(userId, {
        limit: LIST_PAGE_SIZE,
        offset: 0,
        nameSearch,
      })
      setLists(data)
      listsOffsetRef.current = data.length
      setHasMoreLists(hasMore)
    } catch (error) {
      console.error("Error loading task lists:", error)
      toast.error("Failed to load task lists")
    } finally {
      setLoadingLists(false)
    }
  }, [userId, debouncedListSearch])

  const loadMoreLists = useCallback(async () => {
    if (!userId || !hasMoreLists || loadingMoreLists || loadingLists) return
    try {
      setLoadingMoreLists(true)
      const nameSearch = debouncedListSearch || undefined
      const { data, hasMore } = await getTaskListsPage(userId, {
        limit: LIST_PAGE_SIZE,
        offset: listsOffsetRef.current,
        nameSearch,
      })
      setLists((prev) => [...prev, ...data])
      listsOffsetRef.current += data.length
      setHasMoreLists(hasMore)
    } catch (error) {
      console.error("Error loading more task lists:", error)
      toast.error("Failed to load more lists")
    } finally {
      setLoadingMoreLists(false)
    }
  }, [userId, hasMoreLists, loadingMoreLists, loadingLists, debouncedListSearch])

  useEffect(() => {
    void loadListsInitial()
  }, [loadListsInitial])

  useEffect(() => {
    if (!userId) return
    loadCounts()
  }, [userId, lists])

  const onListsScroll = useCallback(() => {
    const el = scrollRootRef.current
    if (!el || !hasMoreLists || loadingMoreLists || loadingLists) return
    const threshold = 72
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      void loadMoreLists()
    }
  }, [hasMoreLists, loadingMoreLists, loadingLists, loadMoreLists])

  const loadCounts = async () => {
    try {
      const allTasks = await getTasks(userId, { isCompleted: false })
      setAllTasksCount(allTasks.length)

      const starredTasks = await getTasks(userId, { isStarred: true, isCompleted: false })
      setStarredCount(starredTasks.length)

      const counts: Record<string, number> = {}
      for (const list of lists) {
        const listTasks = await getTasks(userId, { listId: list.id, isCompleted: false })
        counts[list.id] = listTasks.length
      }
      setTaskCounts(counts)
    } catch (error) {
      console.error('Error loading task counts:', error)
    }
  }

  const handleCreateList = async () => {
    if (isSubmittingList) return
    const name = newListName.trim()
    if (!name) return

    setIsSubmittingList(true)
    try {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
      const randomColor = colors[Math.floor(Math.random() * colors.length)]

      await createTaskList(userId, name, randomColor)
      setNewListName("")
      setIsCreatingList(false)
      await loadListsInitial()
      toast.success('List created')
    } catch (error) {
      console.error('Error creating list:', error)
      toast.error('Failed to create list')
    } finally {
      setIsSubmittingList(false)
    }
  }

  const handleToggleVisibility = async (listId: string, currentVisibility: boolean) => {
    try {
      await toggleListVisibility(listId, !currentVisibility)
      await loadListsInitial()
    } catch (error) {
      console.error('Error toggling visibility:', error)
      toast.error('Failed to update list visibility')
    }
  }

  return (
    <div className="w-full min-w-0 max-w-[18rem] bg-background border-r border-border flex flex-col h-full min-h-0 shadow-sm">
      <div className="p-4 border-b border-border flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">Tasks</h1>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close task list panel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        ref={scrollRootRef}
        onScroll={onListsScroll}
        className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0"
      >
        <div className="space-y-1">
          <Button
            variant="ghost"
            className={`w-full justify-start text-sm font-normal ${
              activeFilter === "all" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
            }`}
            onClick={() => onFilterChange("all")}
          >
            <CheckSquare className="h-4 w-4 mr-3" />
            All Tasks
            {allTasksCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {allTasksCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="ghost"
            className={`w-full justify-start text-sm font-normal ${
              activeFilter === "starred" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
            }`}
            onClick={() => onFilterChange("starred")}
          >
            <Star className="h-4 w-4 mr-3" />
            Starred
            {starredCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {starredCount}
              </Badge>
            )}
          </Button>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={listSearchQuery}
            onChange={(e) => setListSearchQuery(e.target.value)}
            placeholder="Search lists…"
            className="h-8 pl-8 pr-8 text-sm"
            aria-label="Search task lists by name"
          />
          {listSearchQuery ? (
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setListSearchQuery("")}
              aria-label="Clear list search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <button
              onClick={() => setIsListsExpanded(!isListsExpanded)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
            >
              {isListsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              My Lists
            </button>
          </div>

          {isListsExpanded && (
            <div className="space-y-1">
              {loadingLists && lists.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden />
                  Loading lists…
                </div>
              ) : null}
              {!loadingLists && lists.length === 0 && debouncedListSearch ? (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">
                  No lists match “{debouncedListSearch}”
                </p>
              ) : null}
              {lists.map((list) => (
                <div
                  key={list.id}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    activeFilter === `list:${list.id}` ? "bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  <button
                    onClick={() => onFilterChange(`list:${list.id}`)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <div
                      className="w-3 h-3 rounded flex-shrink-0"
                      style={{ backgroundColor: list.color }}
                    />
                    <span className={`text-sm truncate ${
                      activeFilter === `list:${list.id}` ? "text-primary font-medium" : "text-foreground"
                    }`}>
                      {list.name}
                    </span>
                    {taskCounts[list.id] > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {taskCounts[list.id]}
                      </Badge>
                    )}
                  </button>
                  <button
                    onClick={() => handleToggleVisibility(list.id, list.is_visible)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
                  >
                    {list.is_visible ? (
                      <Eye className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-3 w-3 text-muted-foreground/70" />
                    )}
                  </button>
                </div>
              ))}
              {loadingMoreLists ? (
                <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" aria-hidden />
                  Loading more…
                </div>
              ) : null}
              {!hasMoreLists && lists.length > 0 ? (
                <p className="text-[10px] text-center text-muted-foreground/80 pt-1">End of lists</p>
              ) : null}

              {isCreatingList ? (
                <div className="px-2 py-1.5 relative">
                  <Input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => {
                      if (isSubmittingList) {
                        e.preventDefault()
                        return
                      }
                      if (e.key === "Enter") {
                        e.preventDefault()
                        ignoreBlurSubmitRef.current = true
                        window.setTimeout(() => {
                          ignoreBlurSubmitRef.current = false
                        }, 400)
                        void handleCreateList()
                      }
                      if (e.key === "Escape" && !isSubmittingList) {
                        setIsCreatingList(false)
                        setNewListName("")
                      }
                    }}
                    onBlur={() => {
                      if (isSubmittingList) return
                      if (ignoreBlurSubmitRef.current) return
                      if (newListName.trim()) {
                        void handleCreateList()
                      } else {
                        setIsCreatingList(false)
                      }
                    }}
                    placeholder="List name"
                    className="h-7 text-sm pr-8"
                    autoFocus
                    disabled={isSubmittingList}
                    aria-busy={isSubmittingList}
                  />
                  {isSubmittingList && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    </span>
                  )}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setIsCreatingList(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New List
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
