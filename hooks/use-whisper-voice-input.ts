/**
 * Voice Input Hook using OpenAI Whisper
 * Records audio and sends to backend for transcription
 */

'use client';

import { useState, useRef, useCallback } from 'react';

interface WhisperVoiceState {
  isRecording: boolean;
  transcript: string;
  error: string | null;
  isProcessing: boolean;
  isSupported: boolean;
}

interface WhisperVoiceActions {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetTranscript: () => void;
}

export function useWhisperVoiceInput(
  onTranscript?: (text: string) => void
): WhisperVoiceState & WhisperVoiceActions {
  const [state, setState] = useState<WhisperVoiceState>({
    isRecording: false,
    transcript: '',
    error: null,
    isProcessing: false,
    isSupported: typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({ ...prev, error: 'Audio recording not supported in this browser' }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Clean up audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        // Send to backend for transcription
        setState((prev) => ({ ...prev, isProcessing: true, isRecording: false }));

        console.log('[Whisper] Sending audio for transcription...', { 
          audioBlobSize: audioBlob.size,
          audioBlobType: audioBlob.type 
        });

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch('/api/audio/transcribe', {
            method: 'POST',
            body: formData,
          });

          console.log('[Whisper] Transcription response:', { 
            status: response.status, 
            ok: response.ok 
          });

          const data = await response.json();

          console.log('[Whisper] Transcription data:', { 
            success: data.success, 
            transcript: data.transcript,
            error: data.error 
          });

          if (data.success && data.transcript) {
            setState((prev) => ({
              ...prev,
              transcript: data.transcript,
              isProcessing: false,
              error: null,
            }));

            if (onTranscript) {
              onTranscript(data.transcript);
            }
          } else {
            throw new Error(data.error || 'Transcription failed');
          }
        } catch (error: any) {
          console.error('Transcription error:', error);
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            error: error.message || 'Failed to transcribe audio',
          }));
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      // Set up silence detection
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const audioSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      
      audioSource.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let silenceStart = Date.now();
      let hasDetectedSound = false; // Track if user has started speaking
      const SILENCE_THRESHOLD = 30; // Volume threshold
      const SILENCE_DURATION = 1500; // 1.5 seconds of silence after speaking to auto-stop

      const checkAudioLevel = () => {
        if (!analyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          return;
        }

        analyserRef.current.getByteTimeDomainData(dataArray);

        // Calculate volume level
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const value = Math.abs(dataArray[i] - 128);
          sum += value;
        }
        const average = sum / bufferLength;

        if (average < SILENCE_THRESHOLD) {
          // Silence detected
          if (hasDetectedSound) {
            // Only auto-stop if user has already started speaking
            const silenceDuration = Date.now() - silenceStart;
            if (silenceDuration > SILENCE_DURATION) {
              // Auto-stop after silence following speech
              console.log('Silence detected, auto-stopping recording');
              stopRecording();
              return;
            }
          }
        } else {
          // Sound detected, mark that user has started speaking
          hasDetectedSound = true;
          silenceStart = Date.now();
        }

        // Continue checking
        requestAnimationFrame(checkAudioLevel);
      };

      // Start checking audio levels
      checkAudioLevel();

      setState((prev) => ({
        ...prev,
        isRecording: true,
        error: null,
      }));
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      setState((prev) => ({
        ...prev,
        error: error.name === 'NotAllowedError' 
          ? 'Microphone access denied. Please allow microphone access.'
          : 'Failed to access microphone',
      }));
    }
  }, [onTranscript]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      
      // Clean up audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Stop stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcript: '',
      error: null,
    }));
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
