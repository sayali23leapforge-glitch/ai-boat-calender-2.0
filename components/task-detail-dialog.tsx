"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { BellRing, Loader2, Star, Trash2 } from "lucide-react"
import { normalizeDueDateForInput, type Task } from "@/lib/tasks"
import { format, formatDistanceToNow } from "date-fns"

interface TaskDetailDialogProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<boolean>
  onDelete: (taskId: string) => Promise<boolean>
}

export function TaskDetailDialog({ task, isOpen, onClose, onUpdate, onDelete }: TaskDetailDialogProps) {
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [dueTime, setDueTime] = useState("")
  const [isStarred, setIsStarred] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState("")
  const [progressPercent, setProgressPercent] = useState(0)
  const [goal, setGoal] = useState("")
  const [location, setLocation] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes || "")
      setDueDate(normalizeDueDateForInput(task.due_date))
      setIsStarred(task.is_starred)
      setEstimatedHours(task.estimated_hours ? String(task.estimated_hours) : "")
      setProgressPercent(task.progress ?? (task.is_completed ? 100 : 0))
      setDueTime(task.due_time || "")
      setGoal(task.goal || "")
      setLocation(task.location || "")
    }
  }, [task])

  const handleSave = async () => {
    if (!task) return

    setIsSaving(true)
    const updated = await onUpdate(task.id, {
      title: title.trim(),
      notes: notes.trim(),
      due_date: dueDate || null,
      is_starred: isStarred,
      estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      progress: progressPercent,
      due_time: dueTime || null,
      goal: goal.trim() || null,
      location: location.trim() || null,
    })
    setIsSaving(false)
    if (updated) onClose()
  }

  const handleDelete = async () => {
    if (!task) return
    setIsDeleting(true)
    await onDelete(task.id)
    setIsDeleting(false)
  }

  const reminderSchedule = [...(task?.reminder_schedule ?? [])].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )
  const hasDueDate = Boolean(task?.due_date)

  if (!task) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[525px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Edit Task</DialogTitle>
            <button
              onClick={() => {
                setIsStarred(!isStarred)
              }}
              className={`p-2 rounded-full transition-colors ${
                isStarred
                  ? "text-yellow-500 hover:text-yellow-600"
                  : "text-gray-300 hover:text-gray-400"
              }`}
            >
              <Star className={`h-5 w-5 ${isStarred ? "fill-current" : ""}`} />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add detailed notes..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date & Time</Label>
            <div className="flex items-center gap-2">
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <Input
                id="dueTime"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-32"
              />
              {(dueDate || dueTime) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDueDate("")
                    setDueTime("")
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
            <Label htmlFor="estimated-hours">Estimated hours</Label>
            <Input
              id="estimated-hours"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 2.5"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Priority level</Label>
            <Input value={task.priority} readOnly className="capitalize bg-muted/50" />
            <p className="text-xs text-muted-foreground">
              Auto-generated by AI from title and notes.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Input
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What is this task driving?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional location"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="progress">Progress (%)</Label>
          <div className="flex items-center gap-4">
            <input
            id="progress"
              type="range"
            min="0"
            max="100"
            value={progressPercent}
              onChange={(e) => setProgressPercent(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {progressPercent}%
            </span>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 p-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium text-foreground">Email alert schedule</p>
          </div>
          {reminderSchedule.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {hasDueDate
                ? "No email alerts are currently queued for this task."
                : "Set a due date/time to generate scheduled email alerts."}
            </p>
          ) : (
            <div className="space-y-2">
              {reminderSchedule.map((reminder, index) => {
                const scheduledDate = new Date(reminder.scheduled_at)
                const isValid = !Number.isNaN(scheduledDate.getTime())
                const status = reminder.status
                const statusClass =
                  status === "SENT"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : status === "FAILED"
                    ? "bg-red-500/10 text-red-700 dark:text-red-300"
                    : "bg-blue-500/10 text-blue-700 dark:text-blue-300"

                return (
                  <div key={`${reminder.scheduled_at}-${index}`} className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500/80" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                          {status}
                        </span>
                        {reminder.offset_minutes ? (
                          <span className="text-[11px] text-muted-foreground">
                            {Math.round(reminder.offset_minutes / 60)}h before due
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-foreground">
                        {isValid ? format(scheduledDate, "EEE, MMM d • p") : "Unknown scheduled time"}
                      </p>
                      {isValid && (
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(scheduledDate, { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={isSaving || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isDeleting}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
