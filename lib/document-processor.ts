import { supabase } from './supabase'
import { hasRecurringTextCues } from './recurring-detection'

export async function uploadDocument(file: File, userId: string) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}.${fileExt}`

  try {
    // Pre-check: Verify bucket exists before attempting upload
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      const documentsBucketExists = buckets?.some(b => b.name === 'documents')
      
      if (!documentsBucketExists) {
        throw new Error('Storage bucket "documents" not found. Initializing buckets...')
      }
    } catch (bucketCheckError) {
      // If bucket check fails, try to initialize via API
      try {
        const response = await fetch('/api/storage/init-bucket', { method: 'POST' })
        if (!response.ok) {
          console.warn('Failed to auto-initialize buckets')
        }
      } catch (error) {
        console.warn('Could not contact bucket initialization endpoint')
      }
      // Continue anyway - might work if buckets are already created
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, file)

    if (uploadError) {
      // Check if it's a bucket not found error
      if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
        throw new Error(`Storage bucket not found. Please initialize the storage system first. Try reloading the page.`)
      }
      throw new Error(`Failed to upload file: ${uploadError.message}`)
    }

    // Use API endpoint that uses admin client (bypasses RLS)
    console.log('📤 Creating document record via API...')
    const apiResponse = await fetch('/api/documents/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath: fileName,
        name: file.name
      })
    })

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json()
      console.error('API Error response:', errorData)
      await supabase.storage.from('documents').remove([fileName])
      throw new Error(`Failed to create document: ${errorData.error}`)
    }

    const { document } = await apiResponse.json()
    console.log('✅ Document created successfully:', document)

    return document
  } catch (error) {
    console.error('Error uploading document:', error)
    throw error
  }
}

export async function processDocument(documentId: string) {
  // Use local API endpoint instead of Edge Function
  const response = await fetch('/api/documents/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ documentId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to process document')
  }

  return await response.json()
}

export async function getDocuments(userId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`)
  }

  return data
}

export async function getExtractedEvents(documentId: string) {
  const { data, error } = await supabase
    .from('extracted_events')
    .select('*')
    .eq('document_id', documentId)
    .order('event_date', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch events: ${error.message}`)
  }

  if (data) {
    for (const event of data) {
      const hasRecurringCue = hasRecurringTextCues(event.title + ' ' + (event.description || ''))
      if (hasRecurringCue && !(event as any).is_recurring_tagged) {
        try {
          const currentMetadata = (event.metadata as Record<string, any>) || {}
          const { error } = await supabase
            .from('extracted_events')
            .update({ 
              metadata: { ...currentMetadata, has_recurring_cue: true } 
            })
            .eq('id', event.id)
          
          if (error) {
            console.warn('Failed to update event metadata:', error)
            // Don't throw - this is optional metadata update
          }
        } catch (error) {
          console.warn('Error updating event metadata:', error)
          // Silently continue - this is optional
        }
      }
    }
  }

  return data
}

export async function deleteDocument(documentId: string) {
  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()

  if (fetchError) {
    throw new Error(`Failed to fetch document: ${fetchError.message}`)
  }

  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([document.storage_path])

  if (storageError) {
    console.error('Failed to delete file from storage:', storageError)
  }

  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (deleteError) {
    throw new Error(`Failed to delete document: ${deleteError.message}`)
  }
}

export async function markEventAsImported(eventId: string) {
  const { error } = await supabase
    .from('extracted_events')
    .update({ is_imported: true })
    .eq('id', eventId)

  if (error) {
    throw new Error(`Failed to mark event as imported: ${error.message}`)
  }
}

export async function deleteExtractedEvent(eventId: string) {
  const { error } = await supabase
    .from('extracted_events')
    .delete()
    .eq('id', eventId)

  if (error) {
    throw new Error(`Failed to delete event: ${error.message}`)
  }
}

export async function deleteExtractedEvents(eventIds: string[]) {
  const { error } = await supabase
    .from('extracted_events')
    .delete()
    .in('id', eventIds)

  if (error) {
    throw new Error(`Failed to delete events: ${error.message}`)
  }
}

export async function importEventToCalendar(eventId: string) {
  const { data: extractedEvent, error: fetchError } = await supabase
    .from('extracted_events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (fetchError || !extractedEvent) {
    throw new Error('Failed to fetch extracted event')
  }

  const metadata = extractedEvent.metadata || {}
  
  // Check if this is a range with day pattern that needs expansion
  if (metadata.is_range_with_day && metadata.normalized_date && metadata.normalized_end_date && metadata.day_of_week) {
    // Expand into multiple calendar events
    const expandedEvents = expandRangeWithDays(
      extractedEvent,
      metadata.normalized_date,
      metadata.normalized_end_date,
      metadata.day_of_week
    )
    
    // Insert all expanded events
    const eventsToInsert = expandedEvents.map(event => ({
      user_id: extractedEvent.user_id,
      title: event.title,
      description: event.description,
      event_date: event.event_date,
      start_time: extractedEvent.start_time,
      end_time: extractedEvent.end_time,
      location: extractedEvent.location,
      category: extractedEvent.category,
      priority: extractedEvent.priority,
      source: 'extracted',
      source_id: eventId,
      is_completed: false,
    }))

    const { data: calendarEvents, error: insertError } = await supabase
      .from('calendar_events')
      .insert(eventsToInsert)
      .select()

    if (insertError) {
      throw new Error(`Failed to import expanded events to calendar: ${insertError.message}`)
    }

    await markEventAsImported(eventId)

    return calendarEvents
  } else {
    // Normal single event import
    const { data: calendarEvent, error: insertError } = await supabase
      .from('calendar_events')
      .insert({
        user_id: extractedEvent.user_id,
        title: extractedEvent.title,
        description: extractedEvent.description,
        event_date: extractedEvent.event_date,
        start_time: extractedEvent.start_time,
        end_time: extractedEvent.end_time,
        location: extractedEvent.location,
        category: extractedEvent.category,
        priority: extractedEvent.priority,
        source: 'extracted',
        source_id: eventId,
        is_completed: false,
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Failed to import event to calendar: ${insertError.message}`)
    }

    await markEventAsImported(eventId)

    return calendarEvent
  }
}

// Helper function to expand date range with day pattern
function expandRangeWithDays(
  extractedEvent: any,
  startDateStr: string,
  endDateStr: string,
  dayOfWeekStr: string
): Array<{ title: string; description: string | null; event_date: string }> {
  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)
  
  // Parse day(s) of week
  const dayMap: Record<string, number> = {
    'sunday': 0, 'sun': 0,
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
  }
  
  const daysOfWeek = dayOfWeekStr
    .toLowerCase()
    .split(',')
    .map(d => d.trim())
    .map(d => dayMap[d])
    .filter(d => d !== undefined)

  if (daysOfWeek.length === 0) {
    return []
  }

  const expandedEvents: Array<{ title: string; description: string | null; event_date: string }> = []
  const currentDate = new Date(startDate)

  // Generate events for each matching day in the range
  while (currentDate <= endDate) {
    if (daysOfWeek.includes(currentDate.getDay())) {
      const eventDate = currentDate.toISOString().split('T')[0]
      expandedEvents.push({
        title: extractedEvent.title,
        description: extractedEvent.description,
        event_date: eventDate,
      })
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return expandedEvents
}
