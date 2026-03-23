/**
 * useConflictDetection Hook
 * Monitors for conflicts and sends alerts via iMessage
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Conflict } from '@/lib/conflict-detection';

interface UseConflictDetectionState {
  conflicts: Conflict[];
  loading: boolean;
  error: string | null;
  lastCheck: number | null;
}

interface UseConflictDetectionActions {
  checkConflicts: () => Promise<void>;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  checkCalendar: () => Promise<void>;
  checkDuplicates: () => Promise<void>;
  checkOverdue: () => Promise<void>;
}

export function useConflictDetection(userId: string, conversationId?: string) {
  const [state, setState] = useState<UseConflictDetectionState>({
    conflicts: [],
    loading: false,
    error: null,
    lastCheck: null,
  });

  const monitoringRef = useRef<NodeJS.Timeout | null>(null);

  const checkConflicts = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const response = await fetch('/api/conflicts/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          action: 'check',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      setState((prev) => ({
        ...prev,
        conflicts: data.conflicts || [],
        loading: false,
        lastCheck: Date.now(),
      }));

      if (data.count > 0) {
        console.log(`✓ Found ${data.count} conflict(s). Alerts sent via iMessage.`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to check conflicts';
      setState((prev) => ({
        ...prev,
        error: errorMsg,
        loading: false,
      }));
      console.error('Conflict check failed:', errorMsg);
    }
  };

  const checkCalendar = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const response = await fetch('/api/conflicts/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          action: 'calendar',
        }),
      });

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        conflicts: data.conflicts || [],
        loading: false,
        lastCheck: Date.now(),
      }));
    } catch (error) {
      console.error('Calendar check failed:', error);
    }
  };

  const checkDuplicates = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const response = await fetch('/api/conflicts/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          action: 'duplicates',
        }),
      });

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        conflicts: data.conflicts || [],
        loading: false,
        lastCheck: Date.now(),
      }));
    } catch (error) {
      console.error('Duplicate check failed:', error);
    }
  };

  const checkOverdue = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const response = await fetch('/api/conflicts/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          action: 'overdue',
        }),
      });

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        conflicts: data.conflicts || [],
        loading: false,
        lastCheck: Date.now(),
      }));
    } catch (error) {
      console.error('Overdue check failed:', error);
    }
  };

  const startMonitoring = () => {
    if (monitoringRef.current) return; // Already monitoring

    console.log('✓ Starting conflict monitoring...');
    checkConflicts(); // Check immediately

    // Check every 5 minutes
    monitoringRef.current = setInterval(() => {
      checkConflicts();
    }, 5 * 60 * 1000);
  };

  const stopMonitoring = () => {
    if (monitoringRef.current) {
      clearInterval(monitoringRef.current);
      monitoringRef.current = null;
      console.log('✓ Conflict monitoring stopped');
    }
  };

  // Auto-start monitoring on mount if conversationId is provided
  useEffect(() => {
    if (conversationId) {
      startMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [userId, conversationId]);

  return {
    ...state,
    checkConflicts,
    startMonitoring,
    stopMonitoring,
    checkCalendar,
    checkDuplicates,
    checkOverdue,
  } as UseConflictDetectionState & UseConflictDetectionActions;
}
