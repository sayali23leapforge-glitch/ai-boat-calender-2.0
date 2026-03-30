/**
 * iOS Voice Shortcut Endpoint
 * Accepts: Audio file OR transcribed text
 * Creates task/event/goal from voice input
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    let text = '';
    let userId = '';

    // Try to get userId from query params or headers first
    userId = req.nextUrl.searchParams.get('userId') || req.headers.get('x-user-id') || '';

    // Check Content-Type to determine how to parse the request
    const contentType = req.headers.get('content-type') || '';
    
    console.log('[Voice Create] 🎤 Request received. Content-Type:', contentType);

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data (audio file upload)
      console.log('[Voice Create] 📁 Handling multipart form-data...');
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File;
      userId = (formData.get('userId') as string) || userId;

      if (!audioFile) {
        return NextResponse.json(
          { error: 'No audio file provided', success: false },
          { status: 400 }
        );
      }

      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: 'OpenAI API not configured', success: false },
          { status: 500 }
        );
      }

      console.log('[Voice Create] 🎙️ Transcribing audio file:', audioFile.name);

      // Transcribe audio using OpenAI Whisper
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en',
      });

      text = transcription.text.trim();
      console.log('[Voice Create] 📝 Transcribed:', text);
    } else if (contentType.includes('application/json')) {
      // Handle JSON body (text or audio as base64)
      console.log('[Voice Create] 📋 Handling JSON body...');
      const body = await req.json();
      text = body.text || '';
      userId = body.userId || userId;

      if (body.audio && !text) {
        // If audio base64 is provided, transcribe it
        if (!process.env.OPENAI_API_KEY) {
          return NextResponse.json(
            { error: 'OpenAI API not configured', success: false },
            { status: 500 }
          );
        }

        console.log('[Voice Create] 🎙️ Decoding and transcribing base64 audio...');

        const audioBuffer = Buffer.from(body.audio, 'base64');
        const audioBlob = new Blob([audioBuffer], { type: 'audio/wave' });
        const audioFile = new File([audioBlob], 'voice.wav', { type: 'audio/wave' });

        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          language: 'en',
        });

        text = transcription.text.trim();
        console.log('[Voice Create] 📝 Transcribed:', text);
      }
    } else {
      // Try to parse as JSON anyway
      try {
        const body = await req.json();
        text = body.text || '';
        userId = body.userId || userId;
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid content type. Use multipart/form-data or application/json', success: false },
          { status: 400 }
        );
      }
    }

    if (!text || !userId) {
      return NextResponse.json(
        { error: 'Missing text or user ID', success: false },
        { status: 400 }
      );
    }

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: 'Google API not configured', success: false },
        { status: 500 }
      );
    }

    console.log('[Voice Create] ✅ Got text and userId. Analyzing intent...');

    // Use Gemini to classify intent and extract details
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const intentPrompt = `You are an AI assistant that extracts actionable tasks, events, and goals from voice messages.

Analyze this voice message and determine if it's a TASK, EVENT, or GOAL. Return a JSON response with:
{
  "type": "TASK" | "EVENT" | "GOAL",
  "title": "the main action or item",
  "description": "optional additional details or context",
  "dueDate": "YYYY-MM-DD if mentioned, otherwise null",
  "dueTime": "HH:mm if a specific time is mentioned, otherwise null"
}

Rules:
- TASK: Action items, things to buy, calls to make, etc. (no specific meeting time)
- EVENT: Meetings, appointments, dates with specific times
- GOAL: Learning goals, habits, aspirations (ongoing)
- For dates: Extract exact dates, or relative dates (tomorrow, next Monday, Feb 15)
- For times: Only include if explicitly stated
- Title should be short and actionable (2-5 words)
- Strip filler words, return only the core intent

Voice message: "${text.replace(/"/g, "'")}"`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: intentPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    });

    const intentText = result.response.text();
    console.log('[Voice Create] 🤖 Intent analysis:', intentText);

    // Parse JSON response
    let parsed;
    try {
      const jsonMatch = intentText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[Voice Create] ❌ Failed to parse intent:', e);
      return NextResponse.json(
        { error: 'Failed to understand voice message', success: false },
        { status: 400 }
      );
    }

    const { type, title, description, dueDate, dueTime } = parsed;

    if (!title) {
      return NextResponse.json(
        { error: 'Could not extract title from voice message', success: false },
        { status: 400 }
      );
    }

    console.log('[Voice Create] ✅ Parsed:', { type, title, dueDate, dueTime });

    // Create in database based on type
    if (type === 'TASK') {
      const { error } = await supabase.from('tasks').insert({
        user_id: userId,
        title,
        description: description || `via Bloo (voice)`,
        due_date: dueDate,
        due_time: dueTime,
        priority: 'medium',
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[Voice Create] ❌ Task creation error:', error);
        return NextResponse.json(
          { error: 'Failed to create task', success: false },
          { status: 500 }
        );
      }

      console.log('[Voice Create] ✅ Task created:', title);
      return NextResponse.json({
        success: true,
        type: 'TASK',
        title,
        dueDate,
        message: `✅ Task created: ${title}`,
      });
    } else if (type === 'EVENT') {
      const { error } = await supabase.from('calendar_events').insert({
        user_id: userId,
        title,
        description: description || `via Bloo (voice)`,
        start_date: dueDate,
        start_time: dueTime,
        end_date: dueDate,
        end_time: dueTime ? addHour(dueTime) : null,
        notification_minutes: 30,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[Voice Create] ❌ Event creation error:', error);
        return NextResponse.json(
          { error: 'Failed to create event', success: false },
          { status: 500 }
        );
      }

      console.log('[Voice Create] ✅ Event created:', title);
      return NextResponse.json({
        success: true,
        type: 'EVENT',
        title,
        dueDate,
        dueTime,
        message: `✅ Event created: ${title}`,
      });
    } else if (type === 'GOAL') {
      const { error } = await supabase.from('goals').insert({
        user_id: userId,
        title,
        description: description || `via Bloo (voice)`,
        start_date: new Date().toISOString().split('T')[0],
        target_date: dueDate,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[Voice Create] ❌ Goal creation error:', error);
        return NextResponse.json(
          { error: 'Failed to create goal', success: false },
          { status: 500 }
        );
      }

      console.log('[Voice Create] ✅ Goal created:', title);
      return NextResponse.json({
        success: true,
        type: 'GOAL',
        title,
        message: `✅ Goal created: ${title}`,
      });
    } else {
      return NextResponse.json(
        { error: 'Unknown type: ' + type, success: false },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('[Voice Create] ❌ Error:', error?.message);
    return NextResponse.json(
      { error: 'Voice processing failed', details: error?.message, success: false },
      { status: 500 }
    );
  }
}

// Helper: Add 1 hour to time
function addHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const newHours = (hours + 1) % 24;
  return `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
