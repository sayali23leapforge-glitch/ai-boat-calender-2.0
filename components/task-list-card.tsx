"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MoreVertical, Plus, Pencil, Trash2, Sparkles, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TaskCard } from "./task-card"
import { type Task } from "@/lib/tasks"
import { type TaskList } from "@/lib/task-lists"
import { AIQuickCreate } from "./ai-quick-create"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TaskListCardProps {
  list: TaskList
  tasks: Task[]
  onAddTask: (
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
  ) => Promise<boolean>
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskNotes, setNewTaskNotes] = useState("")
  const [newTaskDueDate, setNewTaskDueDate] = useState("")
  const [newTaskDueTime, setNewTaskDueTime] = useState("")
  const [newTaskIsStarred, setNewTaskIsStarred] = useState(false)
  const [newTaskEstimatedHours, setNewTaskEstimatedHours] = useState("")
  const [newTaskProgress, setNewTaskProgress] = useState(0)
  const [newTaskGoal, setNewTaskGoal] = useState("")
  const [newTaskLocation, setNewTaskLocation] = useState("")
  const [showAICreate, setShowAICreate] = useState(false)
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  const resetCreateForm = () => {
    setNewTaskTitle("")
    setNewTaskNotes("")
    setNewTaskDueDate("")
    setNewTaskDueTime("")
    setNewTaskIsStarred(false)
    setNewTaskEstimatedHours("")
    setNewTaskProgress(0)
    setNewTaskGoal("")
    setNewTaskLocation("")
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return

    const estimatedHours = newTaskEstimatedHours ? Number(newTaskEstimatedHours) : null

    setIsCreatingTask(true)
    const created = await onAddTask(list.id, newTaskTitle.trim(), {
      notes: newTaskNotes.trim() || undefined,
      dueDate: newTaskDueDate || undefined,
      dueTime: newTaskDueTime || undefined,
      isStarred: newTaskIsStarred,
      estimatedHours,
      progress: newTaskProgress,
      goal: newTaskGoal.trim() || undefined,
      location: newTaskLocation.trim() || undefined,
    })
    setIsCreatingTask(false)

    if (created) {
      resetCreateForm()
      setIsCreateModalOpen(false)
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

        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 rounded-lg"
            onClick={() => setIsCreateModalOpen(true)}
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

        <AIQuickCreate
          isOpen={showAICreate}
          onClose={() => setShowAICreate(false)}
          userId={userId}
          onSuccess={() => {
            setShowAICreate(false)
            onRefresh?.()
          }}
        />

        <Dialog
          open={isCreateModalOpen}
          onOpenChange={(open) => {
            setIsCreateModalOpen(open)
            if (!open) resetCreateForm()
          }}
        >
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor={`create-title-${list.id}`}>Title</Label>
                <Input
                  id={`create-title-${list.id}`}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`create-notes-${list.id}`}>Notes</Label>
                <Textarea
                  id={`create-notes-${list.id}`}
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  placeholder="Add detailed notes..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`create-due-date-${list.id}`}>Due Date & Time</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`create-due-date-${list.id}`}
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                  />
                  <Input
                    id={`create-due-time-${list.id}`}
                    type="time"
                    value={newTaskDueTime}
                    onChange={(e) => setNewTaskDueTime(e.target.value)}
                    className="w-32"
                  />
                  {(newTaskDueDate || newTaskDueTime) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNewTaskDueDate("")
                        setNewTaskDueTime("")
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor={`create-estimated-hours-${list.id}`}>Estimated hours</Label>
                <Input
                  id={`create-estimated-hours-${list.id}`}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 2.5"
                  value={newTaskEstimatedHours}
                  onChange={(e) => setNewTaskEstimatedHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority level</Label>
                <Input value="Auto (AI classified)" readOnly className="bg-muted/50" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor={`create-goal-${list.id}`}>Goal</Label>
                <Input
                  id={`create-goal-${list.id}`}
                  value={newTaskGoal}
                  onChange={(e) => setNewTaskGoal(e.target.value)}
                  placeholder="What is this task driving?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`create-location-${list.id}`}>Location</Label>
                <Input
                  id={`create-location-${list.id}`}
                  value={newTaskLocation}
                  onChange={(e) => setNewTaskLocation(e.target.value)}
                  placeholder="Optional location"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`create-progress-${list.id}`}>Progress (%)</Label>
              <div className="flex items-center gap-4">
                <input
                  id={`create-progress-${list.id}`}
                  type="range"
                  min="0"
                  max="100"
                  value={newTaskProgress}
                  onChange={(e) => setNewTaskProgress(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-12 text-right">{newTaskProgress}%</span>
              </div>
            </div>

            <div className="flex items-center gap-2 py-2">
              <input
                id={`create-starred-${list.id}`}
                type="checkbox"
                checked={newTaskIsStarred}
                onChange={(e) => setNewTaskIsStarred(e.target.checked)}
              />
              <Label htmlFor={`create-starred-${list.id}`}>Mark as starred</Label>
            </div>

            <DialogFooter className="flex justify-end">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isCreatingTask}>
                  Cancel
                </Button>
                <Button onClick={handleAddTask} disabled={!newTaskTitle.trim() || isCreatingTask}>
                  {isCreatingTask ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Task"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
