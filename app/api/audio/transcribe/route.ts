/**
 * API endpoint to transcribe audio files using OpenAI Whisper
 * Used for voice messages from iMessage and web voice input
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    console.log('Transcribing audio file:', audioFile.name, audioFile.type, audioFile.size);

    // Convert File to format OpenAI expects
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
    });

    console.log('Transcription result:', transcription.text);

    return NextResponse.json({
      success: true,
      transcript: transcription.text,
    });
    
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to transcribe audio',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
