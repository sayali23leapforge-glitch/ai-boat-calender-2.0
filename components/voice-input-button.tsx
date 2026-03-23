/**
 * Voice Input Button Component
 * Uses OpenAI Whisper for transcription
 */

'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useWhisperVoiceInput } from '@/hooks/use-whisper-voice-input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  continuous?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  className,
  size = 'icon',
}: VoiceInputButtonProps) {
  const {
    isRecording,
    transcript,
    error,
    isSupported,
    isProcessing,
    startRecording,
    stopRecording,
    resetTranscript,
  } = useWhisperVoiceInput(onTranscript);

  // Show errors
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Show success
  useEffect(() => {
    if (transcript) {
      toast.success('Voice transcribed successfully!', { duration: 1000 });
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  if (!isSupported) {
    return null;
  }

  const handleClick = async () => {
    if (isRecording || isProcessing) {
      // If recording or processing, stop recording
      await stopRecording();
    } else {
      // Start recording
      await startRecording();
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        size={size}
        variant={isRecording ? 'destructive' : 'ghost'}
        onClick={handleClick}
        disabled={isProcessing}
        className={cn(className, isRecording && 'animate-pulse')}
        title={isRecording ? 'Stop recording' : 'Start voice input'}
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>

      {isRecording && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap animate-pulse">
          🎙️ Listening... (click to stop)
        </div>
      )}

      {isProcessing && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
          ⏳ Transcribing...
        </div>
      )}
    </div>
  );
}
