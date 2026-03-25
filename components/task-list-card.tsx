"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoreVertical, Plus, Pencil, Trash2, Sparkles, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TaskCard } from "./task-card"
import { type Task, type TaskPriority } from "@/lib/tasks"
import { type TaskList } from "@/lib/task-lists"
import { cn } from "@/lib/utils"
import { AIQuickCreate } from "./ai-quick-create"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TaskListCardProps {
  list: TaskList
  tasks: Task[]
  onAddTask: (listId: string, title: string, options?: { priority?: TaskPriority }) => void | Promise<void>
  onToggleComplete: (taskId: string, isCompleted: boolean) => void
  onToggleStarred: (taskId: string, isStarred: boolean) => void
  onTaskClick: (task: Task) => void
  onEditList: (listId: string) => void
  onDeleteList: (listId: string) => void
  userId: string
  onRefresh?: () => void
}

export function TaskListCard({
  list,
  tasks,
  onAddTask,
  onToggleComplete,
  onToggleStarred,
  onTaskClick,
  onEditList,
  onDeleteList,
  userId,
  onRefresh,
}: TaskListCardProps) {
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [showAICreate, setShowAICreate] = useState(false)
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium")

  const handleAddTask = async () => {
    if (isSubmittingTask) return
    const title = newTaskTitle.trim()
    if (!title) return

    setIsSubmittingTask(true)
    try {
      await Promise.resolve(onAddTask(list.id, title, { priority: newTaskPriority }))
      setNewTaskTitle("")
      setNewTaskPriority("medium")
      setIsAddingTask(false)
    } catch {
      // Parent should toast; keep form open for retry
    } finally {
      setIsSubmittingTask(false)
    }
  }

  const incompleteTasks = tasks.filter(t => !t.is_completed)
  const completedTasks = tasks.filter(t => t.is_completed)

  return (
    <Card className="w-full glass hover-lift border-border/50 shadow-md hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full shadow-sm ring-2 ring-white/50"
              style={{ backgroundColor: list.color }}
            />
            <h2 className="text-lg font-semibold text-foreground">{list.name}</h2>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {incompleteTasks.length}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditList(list.id)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit List
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDeleteList(list.id)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete List
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {incompleteTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggleComplete={onToggleComplete}
            onToggleStarred={onToggleStarred}
            onClick={onTaskClick}
          />
        ))}

        {completedTasks.length > 0 && (
          <div className="pt-3 mt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">
              Completed ({completedTasks.length})
            </p>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggleComplete={onToggleComplete}
                  onToggleStarred={onToggleStarred}
                  onClick={onTaskClick}
                />
              ))}
            </div>
          </div>
        )}

        {isAddingTask ? (
          <div className="pt-2 space-y-3">
            <div className="relative">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (isSubmittingTask) {
                    e.preventDefault()
                    return
                  }
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleAddTask()
                  }
                  if (e.key === "Escape" && !isSubmittingTask) {
                    setIsAddingTask(false)
                    setNewTaskTitle("")
                  }
                }}
                placeholder="Task title"
                className="h-9 text-sm pr-10"
                autoFocus
                disabled={isSubmittingTask}
                aria-busy={isSubmittingTask}
              />
              {isSubmittingTask && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-xs text-muted-foreground font-medium">Priority</Label>
              <Select
                value={newTaskPriority}
                onValueChange={(value) => setNewTaskPriority(value as TaskPriority)}
                disabled={isSubmittingTask}
              >
                <SelectTrigger className="h-8 text-xs w-[min(100%,11rem)]" disabled={isSubmittingTask}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                className="h-8 ml-auto"
                onClick={() => void handleAddTask()}
                disabled={isSubmittingTask || !newTaskTitle.trim()}
              >
                {isSubmittingTask ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Adding…
                  </>
                ) : (
                  "Add task"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 rounded-lg"
              onClick={() => setIsAddingTask(true)}
            >
              <Plus className="h-4 w-4 mr-2 transition-transform duration-200 group-hover:rotate-90" />
              Add a task
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200 hover:scale-110"
              onClick={() => setShowAICreate(true)}
              title="Quick create with AI"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        )}

        <AIQuickCreate
          isOpen={showAICreate}
          onClose={() => setShowAICreate(false)}
          userId={userId}
          onSuccess={() => {
            setShowAICreate(false)
            onRefresh?.()
          }}
        />
      </CardContent>
    </Card>
  )
}
