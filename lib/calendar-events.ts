export type CalendarEvent = {
  id: string
  user_id: string
  title: string
  description?: string
  event_date: string
  start_time?: string
  end_time?: string
  location?: string
  category: 'assignment' | 'exam' | 'meeting' | 'deadline' | 'milestone' | 'other'
  priority: 'critical' | 'high' | 'medium' | 'low'
  source: 'manual' | 'extracted' | 'google_calendar' | 'email'
  source_id?: string
  is_completed: boolean
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
  if (!res.ok) {
    throw new Error(json?.error || `Request failed: ${res.status}`)
  }
  return json as T
}

export async function importExtractedEventToCalendar(eventId: string) {
  // NOTE: This still needs an API route if you want it fully server-side.
  // For now we keep the behavior client-side by calling server calendar create
  // after you fetch extracted_events elsewhere.
  throw new Error('importExtractedEventToCalendar needs a server route for extracted_events OR move this logic into an API route.')
}

export async function getCalendarEvents(userId: string, startDate?: string, endDate?: string) {
  const params = new URLSearchParams({ userId })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)

  const out = await api<{ data: CalendarEvent[] }>(`/api/calendar/get?${params.toString()}`)
  return out.data || []
}

export async function createCalendarEvent(event: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>) {
  const out = await api<{ data: CalendarEvent }>(`/api/calendar/create`, {
    method: 'POST',
    body: JSON.stringify({ event }),
  })
  return out.data
}

export async function updateCalendarEvent(eventId: string, updates: Partial<CalendarEvent>) {
  const out = await api<{ data: CalendarEvent }>(`/api/calendar/update`, {
    method: 'POST',
    body: JSON.stringify({ eventId, updates }),
  })
  return out.data
}

export async function deleteCalendarEvent(eventId: string) {
  await api<{ ok: true }>(`/api/calendar/delete`, {
    method: 'POST',
    body: JSON.stringify({ eventId }),
  })
}
