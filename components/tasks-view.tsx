"use client"

import { useState, useEffect } from "react"
import { TaskListCard } from "./task-list-card"
import { TaskSidebar } from "./task-sidebar"
import { TaskDetailDialog } from "./task-detail-dialog"
import { supabase } from "@/lib/supabase"
import { getTaskLists, deleteTaskList, type TaskList } from "@/lib/task-lists"
import { getTasks, createTask, updateTask, deleteTask, toggleTaskComplete, toggleTaskStarred, type Task } from "@/lib/tasks"
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
import { Button } from "@/components/ui/button"

interface TasksViewProps {
  userId: string
}

export function TasksView({ userId }: TasksViewProps) {
  const [activeFilter, setActiveFilter] = useState('all')
  const [isTaskSidebarCollapsed, setIsTaskSidebarCollapsed] = useState(false)
  const [lists, setLists] = useState<TaskList[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [listToDelete, setListToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (!userId) return
    loadData()
    
    // Listen for refresh events from AI/chat operations
    const handleRefresh = () => {
      loadData()
    }
    
    window.addEventListener('refreshTasks', handleRefresh)
    window.addEventListener('refreshCalendar', handleRefresh)

    // Subscribe to real-time task changes - ONLY for new tasks via iMessage
    const channel = supabase
      .channel(`tasks-user-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          console.log('✨ New task created via iMessage! Refreshing...')
          loadData()
        }
      )
      .subscribe()
    
    // Check mobile on mount and on resize
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => {
      window.removeEventListener('refreshTasks', handleRefresh)
      window.removeEventListener('refreshCalendar', handleRefresh)
      window.removeEventListener('resize', checkMobile)
      supabase.removeChannel(channel)
    }
  }, [userId])

  const loadData = async () => {
    if (!userId) return
    try {
      setIsLoading(true)
      const [listsData, tasksData] = await Promise.all([
        getTaskLists(userId),
        getTasks(userId)
      ])
      setLists(listsData)
      setTasks(tasksData)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTask = async (
    listId: string,
    title: string,
    options?: {
      notes?: string
      dueDate?: string
      dueTime?: string
      isStarred?: boolean
      estimatedHours?: number | null
      progress?: number
      goal?: string
      location?: string
    }
  ): Promise<boolean> => {
    try {
      const newTask = await createTask(userId, listId, title, {
        notes: options?.notes,
        dueDate: options?.dueDate,
        dueTime: options?.dueTime,
        isStarred: options?.isStarred,
        estimatedHours: options?.estimatedHours,
        progress: options?.progress,
        goal: options?.goal,
        location: options?.location,
      })
      setTasks(prev => [...prev, newTask])
      toast.success('Task created', { duration: 2000 })
      
      // Force a refresh after task creation to ensure consistency
      setTimeout(() => {
        loadData()
      }, 500)
      return true
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Failed to create task')
      return false
    }
  }

  const handleToggleComplete = async (taskId: string, isCompleted: boolean) => {
    setTasks(prev =>
      prev.map(t => t.id === taskId ? { ...t, is_completed: isCompleted } : t)
    )

    try {
      await toggleTaskComplete(taskId, isCompleted)
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

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>): Promise<boolean> => {
    try {
      await updateTask(taskId, updates)
      setTasks(prev =>
        prev.map(t => t.id === taskId ? { ...t, ...updates } : t)
      )
      toast.success('Task updated')
      return true
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Failed to update task')
      return false
    }
  }

  const handleDeleteTask = async (taskId: string): Promise<boolean> => {
    try {
      setIsDeleting(true)
      // Close the dialog first
      setSelectedTask(null)
      
      // Optimistically update UI
      setTasks(prev => prev.filter(t => t.id !== taskId))
      
      // Delete from database
      await deleteTask(taskId)
      
      toast.success('Task deleted', { duration: 2000 })
      return true
    } catch (error) {
      console.error('Error deleting task:', error)
      toast.error('Failed to delete task')
      // Reload data on error to get accurate state
      await loadData()
      return false
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
      // In "All Tasks", include all lists so hidden-state doesn't block task workflows.
      return lists
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
    let filtered = tasks.filter(t => t.list_id === listId)

    if (activeFilter === 'starred') {
      filtered = filtered.filter(t => t.is_starred)
    }

    return filtered
  }

  const getStarredTasks = () => {
    return tasks.filter(t => t.is_starred && !t.is_completed)
  }

  const filteredLists = getFilteredLists()

  useEffect(() => {
    // If currently selected list no longer exists, fall back to "all".
    if (activeFilter.startsWith('list:')) {
      const listId = activeFilter.replace('list:', '')
      const exists = lists.some(l => l.id === listId)
      if (!exists) {
        setActiveFilter('all')
      }
    }
  }, [activeFilter, lists])

  return (
    <div className="flex h-full bg-background">
      <TaskSidebar
        userId={userId}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        isCollapsed={isTaskSidebarCollapsed}
        onToggleCollapse={() => setIsTaskSidebarCollapsed((prev) => !prev)}
      />

      <main className="flex-1 overflow-auto p-4 md:p-5">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-in-smooth">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground font-medium">Loading tasks...</p>
            </div>
          </div>
        ) : activeFilter === 'starred' ? (
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-6">Starred Tasks</h1>
            {getStarredTasks().length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">No starred tasks</p>
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
            <div className="text-center animate-in-smooth">
              <h2 className="text-2xl font-bold text-foreground mb-2">No lists yet</h2>
              <p className="text-muted-foreground">Create your first list to get started</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-5 auto-rows-min">
            {filteredLists.map((list, index) => (
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
        )}
      </main>

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
