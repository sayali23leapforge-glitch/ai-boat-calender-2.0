import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns'
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from './calendar-events'

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type TaskReminderStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED'

export type TaskReminderScheduleItem = {
  scheduled_at: string
  status: TaskReminderStatus
  sent_at?: string | null
  importance_level?: number | null
  offset_minutes?: number | null
}

export type Task = {
  id: string
  user_id: string
  list_id: string
  title: string
  notes: string
  due_date: string | null
  due_time: string | null
  is_completed: boolean
  is_starred: boolean
  position: number
  priority: TaskPriority
  estimated_hours: number | null
  progress: number
  goal: string | null
  location: string | null
  metadata: Record<string, unknown> | null
  reminder_schedule?: TaskReminderScheduleItem[]
  created_at: string
  updated_at: string
}

export type TaskWithList = Task & {
  task_lists?: {
    name: string
    color: string
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `/${path.replace(/^\/+/, "")}`;

  const candidates: string[] = [];
  const envBase = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (envBase && !/^https?:\/\//i.test(normalizedPath)) {
    candidates.push(`${envBase}${normalizedPath}`);
  }
  candidates.push(normalizedPath);

  const uniqueCandidates = [...new Set(candidates)];
  let lastError: Error | null = null;

  for (const url of uniqueCandidates) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 404 && url !== uniqueCandidates[uniqueCandidates.length - 1]) {
          continue;
        }
        throw new Error((json as any)?.error || `Request failed: ${res.status}`);
      }

      return json as T;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (url === uniqueCandidates[uniqueCandidates.length - 1]) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Request failed");
}

export async function getTasks(
  userId: string,
  filters?: {
    listId?: string
    /** Restrict to these list ids (from `task_lists`; see /api/tasks/get). */
    listIds?: string[]
    isStarred?: boolean
    isCompleted?: boolean
  }
): Promise<TaskWithList[]> {
  const params = new URLSearchParams({ userId })
  if (filters?.listId) params.set('listId', filters.listId)
  if (filters?.listIds?.length) params.set('listIds', filters.listIds.join(','))
  if (filters?.isStarred !== undefined) params.set('isStarred', String(filters.isStarred))
  if (filters?.isCompleted !== undefined) params.set('isCompleted', String(filters.isCompleted))

  const out = await api<{ data: TaskWithList[] }>(`/api/tasks/get?${params.toString()}`)
  return out.data || []
}

export async function createTask(
  userId: string,
  listId: string,
  title: string,
  options?: {
    notes?: string
    dueDate?: string
    dueTime?: string
    isStarred?: boolean
    priority?: TaskPriority
    goal?: string
    estimatedHours?: number | null
    progress?: number
    location?: string
    metadata?: Record<string, unknown>
    syncToCalendar?: boolean
    clientTimezone?: string
  }
): Promise<Task> {
  const detectedClientTimezone =
    options?.clientTimezone ||
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined)

  const out = await api<{ data: Task }>(`/api/tasks/create`, {
    method: 'POST',
    body: JSON.stringify({
      userId,
      listId,
      title,
      options: {
        ...options,
        clientTimezone: detectedClientTimezone,
      },
    }),
  })

  const data = out.data

  // Keep your existing calendar sync behavior (client-side)
  const shouldSyncCalendar = options?.syncToCalendar ?? Boolean(options?.dueDate)
  if (shouldSyncCalendar && options?.dueDate && data) {
    try {
      const eventPriority = options?.priority || (options?.isStarred ? 'high' : 'medium')
      await createCalendarEvent({
        user_id: userId,
        title: `📋 ${title}`,
        description: options?.notes || undefined,
        event_date: options.dueDate,
        start_time: options?.dueTime || undefined,
        end_time: undefined,
        location: options?.location || undefined,
        category: 'other',
        priority: eventPriority,
        source: 'manual',
        source_id: data.id,
        is_completed: false,
      } as any)
    } catch (calendarError) {
      console.error('Failed to create calendar event for task:', calendarError)
    }
  }

  return data
}

export async function updateTask(
  taskId: string,
  updates: Partial<
    Pick<
      Task,
      | 'title'
      | 'notes'
      | 'due_date'
      | 'due_time'
      | 'is_completed'
      | 'is_starred'
      | 'position'
      | 'priority'
      | 'estimated_hours'
      | 'progress'
      | 'goal'
      | 'location'
      | 'metadata'
      | 'list_id'
    >
  >
): Promise<Task> {
  // We no longer fetch current task from Supabase directly.
  // If you need calendar sync logic, we’ll do a best-effort update of linked calendar event.
  const out = await api<{ data: Task }>(`/api/tasks/update`, {
    method: 'POST',
    body: JSON.stringify({ taskId, updates }),
  })

  const data = out.data

  // Calendar sync (best-effort) if task has a due date or due_date is changed
  try {
    // Find linked calendar event by source_id = taskId is not available here without a route,
    // so we keep this minimal: if you want perfect sync, add calendar lookup route.
    const effectivePriority: TaskPriority =
      (updates.priority as TaskPriority | undefined) ||
      data.priority ||
      ((updates.is_starred ?? data.is_starred) ? 'high' : 'medium')

    // If due_date exists, we can create/update a calendar event via calendar routes,
    // but we need the calendar event id (we don’t have it).
    // Easiest: create a new event if due_date present AND no existing link tracking.
    // (Optional enhancement: store calendar_event_id in task.metadata.)
    if ((updates.due_date ?? data.due_date) && !data.metadata?.['calendar_event_id']) {
      const created = await createCalendarEvent({
        user_id: data.user_id,
        title: `📋 ${updates.title || data.title}`,
        description: (updates.notes !== undefined ? updates.notes : data.notes) || undefined,
        event_date: (updates.due_date || data.due_date)!,
        start_time:
          updates.due_time !== undefined ? updates.due_time || undefined : data.due_time || undefined,
        end_time: undefined,
        location:
          updates.location !== undefined ? updates.location || undefined : data.location || undefined,
        category: 'other',
        priority: effectivePriority,
        source: 'manual',
        source_id: taskId,
        is_completed: updates.is_completed !== undefined ? updates.is_completed : data.is_completed,
      } as any)

      // write back calendar_event_id into task.metadata (best effort)
      await api<{ data: Task }>(`/api/tasks/update`, {
        method: 'POST',
        body: JSON.stringify({
          taskId,
          updates: {
            metadata: {
              ...(data.metadata || {}),
              calendar_event_id: (created as any)?.id,
            },
          },
        }),
      })
    } else if (!((updates.due_date ?? data.due_date)) && data.metadata?.['calendar_event_id']) {
      // due date removed => delete linked event
      await deleteCalendarEvent(String(data.metadata['calendar_event_id']))
      await api(`/api/tasks/update`, {
        method: 'POST',
        body: JSON.stringify({
          taskId,
          updates: { metadata: { ...(data.metadata || {}), calendar_event_id: null } },
        }),
      })
    } else if (data.metadata?.['calendar_event_id']) {
      // update existing linked event
      await updateCalendarEvent(String(data.metadata['calendar_event_id']), {
        title: `📋 ${updates.title || data.title}`,
        description: (updates.notes !== undefined ? updates.notes : data.notes) || undefined,
        is_completed: updates.is_completed !== undefined ? updates.is_completed : data.is_completed,
        priority: effectivePriority,
        start_time:
          updates.due_time !== undefined ? updates.due_time || undefined : data.due_time || undefined,
        location:
          updates.location !== undefined ? updates.location || undefined : data.location || undefined,
      } as any)
    }
  } catch (calendarError) {
    console.error('Failed to sync calendar event for task:', calendarError)
  }

  return data
}

export async function deleteTask(taskId: string): Promise<void> {
  // If you stored calendar_event_id in task.metadata, you can delete it here by first fetching task.
  // For now: just delete task server-side.
  await api(`/api/tasks/delete`, {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  })
}

export async function toggleTaskComplete(taskId: string, isCompleted: boolean, progressPercent?: number): Promise<Task> {
  const computedProgress = progressPercent ?? (isCompleted ? 100 : 0)
  return updateTask(taskId, { is_completed: isCompleted, progress: computedProgress })
}

export async function toggleTaskStarred(taskId: string, isStarred: boolean): Promise<Task> {
  return updateTask(taskId, { is_starred: isStarred })
}

export function normalizeDueDateForInput(dueDate: string | null | undefined): string {
  if (!dueDate) return ""
  const raw = String(dueDate).trim()
  const match = raw.match(/\d{4}-\d{2}-\d{2}/)
  return match?.[0] || ""
}

export function formatDueDate(dueDate: string | null, dueTime?: string | null): string | null {
  if (!dueDate) return null

  try {
    const normalizedDate = normalizeDueDateForInput(dueDate)
    if (!normalizedDate) return null
    const isoString = dueTime ? `${normalizedDate}T${normalizeTime(dueTime)}` : normalizedDate
    const date = parseISO(isoString)
    const now = new Date()
    const sameDay = now.toDateString() === date.toDateString()
    const isOverdue = isPast(date) && !sameDay

    if (isOverdue) {
      return `Due ${formatDistanceToNow(date)} ago`
    }

    const relative = formatDistanceToNow(date, { addSuffix: true })
    const timeLabel = dueTime ? format(date, 'p') : null
    return timeLabel ? `Due ${relative} • ${timeLabel}` : `Due ${relative}`
  } catch {
    return null
  }
}

/**
 * Label for completed tasks. Uses `updated_at` as a proxy for completion time
 * (no dedicated `completed_at` column yet).
 */
export function formatCompletedAt(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null
  try {
    const d = parseISO(updatedAt)
    return `Completed ${format(d, 'PPp')}`
  } catch {
    return null
  }
}

export function isTaskOverdue(dueDate: string | null, dueTime?: string | null): boolean {
  if (!dueDate) return false

  try {
    const normalizedDate = normalizeDueDateForInput(dueDate)
    if (!normalizedDate) return false
    const isoString = dueTime ? `${normalizedDate}T${normalizeTime(dueTime)}` : normalizedDate
    const date = parseISO(isoString)
    return isPast(date) && new Date().toDateString() !== date.toDateString()
  } catch {
    return false
  }
}

function normalizeTime(timeValue: string): string {
  if (timeValue.length === 5) {
    return `${timeValue}:00`
  }
  return timeValue
}

export async function reorderTask(taskId: string, newPosition: number): Promise<void> {
  await updateTask(taskId, { position: newPosition })
}
