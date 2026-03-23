import { NextRequest, NextResponse } from 'next/server';
import { conflictDetection } from '@/lib/conflict-detection';

/**
 * API endpoint to check for conflicts and send alerts via iMessage
 * POST /api/conflicts/check
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, conversationId, action } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Set user context for messaging alerts
    if (conversationId) {
      conflictDetection.setUserContext(userId, conversationId);
    }

    if (action === 'check') {
      // Run all conflict checks
      const conflicts = await conflictDetection.checkAllConflicts(userId);

      return NextResponse.json({
        status: 'success',
        conflicts,
        count: conflicts.length,
        highSeverity: conflicts.filter((c) => c.severity === 'high').length,
        message: conflicts.length > 0 
          ? `Found ${conflicts.length} conflict(s). Alerts sent via iMessage.`
          : 'No conflicts detected.',
      });
    }

    if (action === 'calendar') {
      const conflicts = await conflictDetection.detectCalendarConflicts(userId);
      return NextResponse.json({
        status: 'success',
        conflicts,
        type: 'calendar',
      });
    }

    if (action === 'duplicates') {
      const conflicts = await conflictDetection.detectDuplicateTasks(userId);
      return NextResponse.json({
        status: 'success',
        conflicts,
        type: 'duplicates',
      });
    }

    if (action === 'overdue') {
      const conflicts = await conflictDetection.detectOverdueItems(userId);
      return NextResponse.json({
        status: 'success',
        conflicts,
        type: 'overdue',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: check, calendar, duplicates, or overdue' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Conflict detection error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to get monitoring status
 */
export async function GET() {
  return NextResponse.json({
    status: 'success',
    message: 'Conflict detection service is running',
    endpoints: {
      check: 'POST /api/conflicts/check { userId, conversationId, action: "check" }',
      calendar: 'POST /api/conflicts/check { userId, conversationId, action: "calendar" }',
      duplicates: 'POST /api/conflicts/check { userId, conversationId, action: "duplicates" }',
      overdue: 'POST /api/conflicts/check { userId, conversationId, action: "overdue" }',
    },
  });
}
