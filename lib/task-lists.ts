export type TaskList = {
  id: string
  user_id: string
  name: string
  color: string
  is_visible: boolean
  position: number
  created_at: string
  updated_at: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed: ${res.status}`)
  return json as T
}

export type TaskListsPageResult = {
  data: TaskList[]
  hasMore: boolean
}

export async function getTaskLists(
  userId: string,
  filters?: {
    /** ILIKE on `task_lists.name` only — does not query the `tasks` table. */
    nameSearch?: string
  }
): Promise<TaskList[]> {
  const params = new URLSearchParams({ userId })
  if (filters?.nameSearch?.trim()) params.set('nameSearch', filters.nameSearch.trim())
  const out = await api<{ data: TaskList[] }>(`/api/task-lists/get?${params.toString()}`)
  return out.data || []
}

/**
 * Paginated `task_lists` rows (use with infinite scroll). Pass `limit`/`offset` to GET.
 */
export async function getTaskListsPage(
  userId: string,
  options: {
    limit?: number
    offset?: number
    nameSearch?: string
  } = {}
): Promise<TaskListsPageResult> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25))
  const offset = Math.max(0, options.offset ?? 0)
  const params = new URLSearchParams({
    userId,
    limit: String(limit),
    offset: String(offset),
  })
  if (options.nameSearch?.trim()) params.set('nameSearch', options.nameSearch.trim())
  const out = await api<{ data: TaskList[]; hasMore?: boolean }>(
    `/api/task-lists/get?${params.toString()}`
  )
  return {
    data: out.data ?? [],
    hasMore: Boolean(out.hasMore),
  }
}

export async function createTaskList(
  userId: string,
  name: string,
  color: string = '#3b82f6'
): Promise<TaskList> {
  const out = await api<{ data: TaskList }>(`/api/task-lists/create`, {
    method: 'POST',
    body: JSON.stringify({ userId, name, color }),
  })
  return out.data
}

export async function updateTaskList(
  listId: string,
  updates: Partial<Pick<TaskList, 'name' | 'color' | 'is_visible' | 'position'>>
): Promise<TaskList> {
  const out = await api<{ data: TaskList }>(`/api/task-lists/update`, {
    method: 'POST',
    body: JSON.stringify({ listId, updates }),
  })
  return out.data
}

export async function deleteTaskList(listId: string): Promise<void> {
  await api<{ ok: true }>(`/api/task-lists/delete`, {
    method: 'POST',
    body: JSON.stringify({ listId }),
  })
}

export async function toggleListVisibility(listId: string, isVisible: boolean): Promise<TaskList> {
  return updateTaskList(listId, { is_visible: isVisible })
}

export async function getTaskCountByList(userId: string, listId: string): Promise<number> {
  // You can optionally add an API route for count.
  // For now: fetch tasks for this list and compute (safe, but not optimal).
  const tasks = await api<{ data: Array<{ is_completed: boolean }> }>(
    `/api/tasks/get?${new URLSearchParams({ userId, listId, isCompleted: 'false' }).toString()}`
  )
  return (tasks.data || []).length
}
