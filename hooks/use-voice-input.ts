/**
 * Voice Input Hook
 * Uses Web Speech API for browser-based speech recognition
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceInputState {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
}

interface VoiceInputActions {
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useVoiceInput(
  onTranscript?: (text: string) => void,
  continuous: boolean = false
): VoiceInputState & VoiceInputActions {
  const [state, setState] = useState<VoiceInputState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    isSupported: false,
  });

  const recognitionRef = useRef<any>(null);

  // Check if Web Speech API is supported
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const isSupported = !!SpeechRecognition;
      
      setState((prev) => ({ ...prev, isSupported }));

      if (isSupported && !recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = continuous;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.maxAlternatives = 1;

        // Handle results
        recognitionRef.current.onresult = (event: any) => {
          let interimText = '';
          let finalText = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalText += transcript + ' ';
            } else {
              interimText += transcript;
            }
          }

          setState((prev) => ({
            ...prev,
            transcript: prev.transcript + finalText,
            interimTranscript: interimText,
          }));

          // Call callback if final result
          if (finalText && onTranscript) {
            onTranscript(finalText.trim());
          }
        };

        // Handle errors
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          
          let errorMessage = '';
          switch (event.error) {
            case 'network':
              errorMessage = 'Network error. Check your internet connection and try again.';
              break;
            case 'no-speech':
              errorMessage = 'No speech detected. Please try again.';
              break;
            case 'audio-capture':
              errorMessage = 'Microphone not found. Please check your device.';
              break;
            case 'not-allowed':
              errorMessage = 'Microphone access denied. Please allow microphone access.';
              break;
            case 'aborted':
              // Ignore abort errors (happens when stopping)
              return;
            default:
              errorMessage = `Speech recognition error: ${event.error}`;
          }
          
          setState((prev) => ({
            ...prev,
            isListening: false,
            error: errorMessage,
          }));
        };

        // Handle end
        recognitionRef.current.onend = () => {
          setState((prev) => ({ ...prev, isListening: false }));
        };
      }
    }
  }, [continuous, onTranscript]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((prev) => ({ ...prev, error: 'Speech recognition not supported in this browser' }));
      return;
    }

    try {
      setState((prev) => ({
        ...prev,
        isListening: true,
        error: null,
        transcript: '',
        interimTranscript: '',
      }));
      
      recognitionRef.current.start();
    } catch (error: any) {
      console.error('Failed to start recognition:', error);
      
      let errorMessage = 'Failed to start listening';
      if (error.message?.includes('already started')) {
        errorMessage = 'Already listening...';
      }
      
      setState((prev) => ({
        ...prev,
        isListening: false,
        error: errorMessage,
      }));
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setState((prev) => ({ ...prev, isListening: false }));
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    resetTranscript,
  };
}
