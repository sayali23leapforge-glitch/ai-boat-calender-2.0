/**
 * Conflict Alert Component
 * Displays detected conflicts and allows users to take action
 */

'use client';

import React from 'react';
import { useConflictDetection } from '@/hooks/use-conflict-detection';
import { Button } from '@/components/ui/button';
import { AlertCircle, Calendar, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConflictAlertProps {
  userId: string;
  conversationId?: string;
  autoMonitor?: boolean;
  className?: string;
}

export function ConflictAlert({
  userId,
  conversationId,
  autoMonitor = true,
  className,
}: ConflictAlertProps) {
  const { conflicts, loading, error, lastCheck, checkConflicts, startMonitoring } =
    useConflictDetection(userId, conversationId);

  React.useEffect(() => {
    if (autoMonitor && conversationId) {
      startMonitoring();
    }
  }, [autoMonitor, conversationId, startMonitoring]);

  if (conflicts.length === 0 && !loading && !error) {
    return null; // No conflicts to show
  }

  const highSeverity = conflicts.filter((c) => c.severity === 'high');
  const mediumSeverity = conflicts.filter((c) => c.severity === 'medium');

  return (
    <div className={cn('space-y-3', className)}>
      {/* High Severity Alerts */}
      {highSeverity.length > 0 && (
        <div className="border-l-4 border-red-500 bg-red-50 p-4 rounded">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">
                {highSeverity.length} High Priority Issue{highSeverity.length !== 1 ? 's' : ''}
              </h3>
              <ul className="space-y-2">
                {highSeverity.map((conflict) => (
                  <li key={conflict.id} className="text-sm text-red-800">
                    <strong>{conflict.title}</strong>
                    <p className="text-red-700 mt-1">{conflict.description}</p>
                  </li>
                ))}
              </ul>
              {conversationId && (
                <p className="text-xs text-red-700 mt-2">
                  📱 Alert sent to iMessage
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Medium Severity Alerts */}
      {mediumSeverity.length > 0 && (
        <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-2">
                {mediumSeverity.length} Medium Priority Issue{mediumSeverity.length !== 1 ? 's' : ''}
              </h3>
              <ul className="space-y-2">
                {mediumSeverity.map((conflict) => (
                  <li key={conflict.id} className="text-sm text-yellow-800">
                    <strong>{conflict.title}</strong>
                    <p className="text-yellow-700 mt-1">{conflict.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <p className="text-sm text-gray-700">
            <strong>Error:</strong> {error}
          </p>
          <Button
            size="sm"
            onClick={checkConflicts}
            disabled={loading}
            className="mt-2"
          >
            {loading ? 'Checking...' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Last Check Info */}
      {lastCheck && (
        <p className="text-xs text-gray-500">
          Last checked: {new Date(lastCheck).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

/**
 * Inline conflict badge for quick overview
 */
export function ConflictBadge({ userId, conversationId }: ConflictAlertProps) {
  const { conflicts, checkConflicts } = useConflictDetection(userId, conversationId);

  if (conflicts.length === 0) return null;

  const highCount = conflicts.filter((c) => c.severity === 'high').length;

  return (
    <button
      onClick={checkConflicts}
      className={cn(
        'px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2',
        highCount > 0
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
      )}
    >
      <Zap className="w-4 h-4" />
      {conflicts.length} {conflicts.length === 1 ? 'Issue' : 'Issues'}
    </button>
  );
}
