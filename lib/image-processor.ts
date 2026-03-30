/**
 * Image Processing & Upload Handler
 * Handles images sent via iMessage and extracts dates/times/events/tasks.
 *
 * Uses Gemini Vision (same key as the rest of the app) instead of Anthropic Claude.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from './supabase-admin';

// --- Types -----------------------------------------------------------

export interface ExtractedEvent {
  type: 'event' | 'task';
  title: string;
  date: string | null;        // YYYY-MM-DD
  start_time: string | null;  // HH:MM  (24-hr)
  end_time: string | null;    // HH:MM  (24-hr)
  location: string | null;
  description: string;
}

export interface ImageUpload {
  id: string;
  userId: string;
  conversationId: string;
  sender: string;
  imageUrl: string;
  extractedText: string;
  extractedDates: string[];
  extractedEvents: ExtractedEvent[];
  uploadedAt: number;
  processed: boolean;
}

// Raw shape returned by Gemini (validated + normalised before use)
interface GeminiExtraction {
  text: string;
  dates: string[];
  events: Array<{
    type?: string;
    title?: string;
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    description?: string;
  }>;
}

// --- Service ---------------------------------------------------------

class ImageProcessingService {
  /**
   * Process an image that is accessible at a public URL.
   * Downloads the image first, then runs AI extraction.
   */
  async processImageMessage(
    imageUrl: string,
    userId: string,
    conversationId: string,
    sender: string,
  ): Promise<ImageUpload> {
    console.log('🖼️  Processing image from URL:', imageUrl);
    const { buffer, contentType } = await this.downloadImage(imageUrl);
    return this.processImageBuffer(buffer, contentType, imageUrl, userId, conversationId, sender);
  }

  /**
   * Process an image when the caller already has the raw buffer
   * (avoids a second HTTP round-trip and bucket-privacy issues).
   */
  async processImageBuffer(
    buffer: Buffer,
    mimeType: string,
    imageUrl: string,
    userId: string,
    conversationId: string,
    sender: string,
  ): Promise<ImageUpload> {
    const base64Image = buffer.toString('base64');
    const extracted = await this.extractImageContent(base64Image, mimeType);
    console.log(
      `✓ Image extracted: ${extracted.dates.length} date(s), ${extracted.events.length} event(s)`,
    );
    return this.saveImageUpload(userId, conversationId, sender, imageUrl, extracted);
  }

  // --- Private helpers -----------------------------------------------

  private async downloadImage(
    imageUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const headerType = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    type ValidMime = (typeof validTypes)[number];

    let contentType: ValidMime = 'image/jpeg';
    if (validTypes.includes(headerType as ValidMime)) {
      contentType = headerType as ValidMime;
    } else {
      const ext = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
      const extMap: Record<string, ValidMime> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      };
      if (ext && extMap[ext]) contentType = extMap[ext];
    }

    return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
  }

  /**
   * Run Gemini Vision on the image and return structured extraction.
   *
   * Switched from Anthropic Claude → Gemini for two reasons:
   *   1. The whole app uses GEMINI_API_KEY — ANTHROPIC_API_KEY is not configured.
   *   2. We can use inline_data directly, matching how the Bloo bot's scanImage works.
   *
   * The prompt extracts start_time, end_time, location and type (event vs task)
   * in addition to the basic title/date that the old prompt captured.
   */
  private async extractImageContent(
    base64Image: string,
    mimeType: string,
  ): Promise<{ text: string; dates: string[]; events: ExtractedEvent[] }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const prompt = `You are a calendar assistant. Analyze this image and extract every event, appointment, meeting, party, reminder, or task shown in it.

Return ONLY valid JSON — no markdown, no extra text — in this exact schema:
{
  "text": "<all visible text in the image>",
  "dates": ["YYYY-MM-DD", ...],
  "events": [
    {
      "type": "event" | "task",
      "title": "<concise event or task name>",
      "date": "YYYY-MM-DD" | null,
      "start_time": "HH:MM" | null,
      "end_time": "HH:MM" | null,
      "location": "<location string>" | null,
      "description": "<any additional context>"
    }
  ]
}

Rules:
- type = "event" for: parties, birthdays, meetings, appointments, conferences, dinners, concerts, etc.
- type = "task" for: to-dos, reminders, deadlines, assignments, homework.
- Convert 12-hr times to 24-hr: "7:00 PM" → "19:00", "11:00 PM" → "23:00", "9:30 AM" → "09:30".
- date must be YYYY-MM-DD (e.g. "2025-04-12"), never a day name alone.
- If no events or tasks are found return an empty events array.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Image } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gemini API error ${resp.status}: ${err}`);
    }

    const data = await resp.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    try {
      // Strip markdown code fences Gemini occasionally wraps around JSON
      const cleaned = rawText.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const parsed = JSON.parse(cleaned) as GeminiExtraction;

      // Normalise events to ensure required fields are present
      const events: ExtractedEvent[] = (parsed.events ?? []).map((e) => ({
        type: (e.type === 'task' ? 'task' : 'event') as 'event' | 'task',
        title: (e.title ?? '').trim(),
        date: e.date ?? null,
        start_time: e.start_time ?? null,
        end_time: e.end_time ?? null,
        location: e.location ?? null,
        description: (e.description ?? '').trim(),
      })).filter((e) => e.title.length > 0);

      return {
        text: parsed.text ?? rawText,
        dates: Array.isArray(parsed.dates) ? parsed.dates : [],
        events,
      };
    } catch (err) {
      console.error('Failed to parse Gemini Vision response:', rawText, err);
      return { text: rawText, dates: [], events: [] };
    }
  }

  private async saveImageUpload(
    userId: string,
    conversationId: string,
    sender: string,
    imageUrl: string,
    extracted: { text: string; dates: string[]; events: ExtractedEvent[] },
  ): Promise<ImageUpload> {
    const id = randomUUID();

    const imageUpload: ImageUpload = {
      id,
      userId,
      conversationId,
      sender,
      imageUrl,
      extractedText: extracted.text,
      extractedDates: extracted.dates,
      extractedEvents: extracted.events,
      uploadedAt: Date.now(),
      processed: true,
    };

    try {
      const admin = getSupabaseAdminClient();
      const { error } = await admin.from('image_uploads').insert({
        id,
        user_id: userId,
        conversation_id: conversationId,
        sender,
        image_url: imageUrl,
        extracted_text: extracted.text,
        extracted_dates: extracted.dates,
        extracted_events: extracted.events,
        uploaded_at: new Date(imageUpload.uploadedAt),
        processed: true,
      });
      if (error) console.warn('image_uploads insert warning:', error.message);
    } catch (err) {
      console.warn('image_uploads insert failed (non-fatal):', err);
    }

    return imageUpload;
  }

  /**
   * Create calendar events AND tasks from the extracted image data.
   * Returns counts so the caller can build a meaningful reply message.
   */
  async createEventsFromImage(
    imageUpload: ImageUpload,
    userId: string,
  ): Promise<{ eventIds: string[]; taskIds: string[] }> {
    const eventIds: string[] = [];
    const taskIds: string[] = [];
    const admin = getSupabaseAdminClient();

    for (const item of imageUpload.extractedEvents) {
      if (!item.title) continue;

      if (item.type === 'task') {
        // ---- Task creation ----------------------------------------
        try {
          // Get or create a default task list for this user
          let listId: string | undefined;
          const { data: listData } = await admin
            .from('task_lists')
            .select('id')
            .eq('user_id', userId)
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (listData?.id) {
            listId = listData.id as string;
          } else {
            const { data: newList } = await admin
              .from('task_lists')
              .insert({ user_id: userId, name: 'Personal', color: '#3b82f6', is_visible: true, position: 0 })
              .select('id')
              .single();
            listId = newList?.id as string | undefined;
          }

          if (!listId) { console.error('No task list available for user', userId); continue; }

          const { data: posData } = await admin
            .from('tasks')
            .select('position')
            .eq('list_id', listId)
            .order('position', { ascending: false })
            .limit(1);
          const nextPos = posData?.length ? ((posData[0].position as number) ?? 0) + 1 : 0;

          const { data: task, error: taskErr } = await admin
            .from('tasks')
            .insert({
              user_id: userId,
              list_id: listId,
              title: item.title.slice(0, 200),
              notes: item.description || '',
              due_date: item.date ?? null,
              due_time: item.start_time ?? null,
              is_completed: false,
              is_starred: false,
              position: nextPos,
              priority: 'medium',
              progress: 0,
              metadata: { source: 'image_extraction', source_id: imageUpload.id },
            })
            .select('id');

          if (taskErr) {
            console.error(`Failed to create task "${item.title}":`, taskErr);
          } else if (task?.length) {
            taskIds.push(task[0].id as string);
            console.log(`✓ Created task: ${item.title}`);
          }
        } catch (err) {
          console.error(`Task creation error for "${item.title}":`, err);
        }
      } else {
        // ---- Calendar event creation --------------------------------
        try {
          const { data: event, error: eventErr } = await admin
            .from('calendar_events')
            .insert({
              user_id: userId,
              title: item.title.slice(0, 200),
              description: item.description || `Extracted from image`,
              event_date: item.date,           // YYYY-MM-DD
              start_time: item.start_time,     // HH:MM or null
              end_time: item.end_time,         // HH:MM or null
              location: item.location,         // string or null
              category: 'other',
              priority: 'medium',
              source: 'image_extraction',
              source_id: imageUpload.id,
              is_completed: false,
            })
            .select('id');

          if (eventErr) {
            console.error(`Failed to create event "${item.title}":`, eventErr);
          } else if (event?.length) {
            eventIds.push(event[0].id as string);
            console.log(`✓ Created event: ${item.title}`);
          }
        } catch (err) {
          console.error(`Event creation error for "${item.title}":`, err);
        }
      }
    }

    return { eventIds, taskIds };
  }
}

export const imageProcessing = new ImageProcessingService();
