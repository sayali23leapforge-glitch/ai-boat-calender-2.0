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

export async function getTaskLists(userId: string): Promise<TaskList[]> {
  const params = new URLSearchParams({ userId })
  const out = await api<{ data: TaskList[] }>(`/api/task-lists/get?${params.toString()}`)
  return out.data || []
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
