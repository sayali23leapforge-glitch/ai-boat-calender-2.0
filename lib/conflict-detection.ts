/**
 * Conflict Detection & Notification System
 * Monitors for conflicts and sends alerts via iMessage
 */

import { getMessageService } from '@/lib/messaging/service-selector';
import { supabase } from '@/lib/supabase';

export type ConflictType = 'calendar' | 'task' | 'schedule' | 'goal' | 'duplicate';

export interface Conflict {
  id: string;
  type: ConflictType;
  title: string;
  description: string;
  items: string[];
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
  resolved: boolean;
}

class ConflictDetectionService {
  private userId: string | null = null;
  private conversationId: string | null = null;

  /**
   * Initialize with user ID and conversation for alerts
   */
  setUserContext(userId: string, conversationId: string) {
    this.userId = userId;
    this.conversationId = conversationId;
  }

  /**
   * Detect calendar conflicts (overlapping events)
   */
  async detectCalendarConflicts(userId: string): Promise<Conflict[]> {
    try {
      const { data: events, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('start_time', { ascending: true });

      if (error) throw error;

      const conflicts: Conflict[] = [];

      // Check for overlapping events
      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const event1 = events[i];
          const event2 = events[j];

          const start1 = new Date(event1.start_time).getTime();
          const end1 = new Date(event1.end_time).getTime();
          const start2 = new Date(event2.start_time).getTime();
          const end2 = new Date(event2.end_time).getTime();

          // Check if time ranges overlap
          if (start1 < end2 && start2 < end1) {
            conflicts.push({
              id: `conflict_${event1.id}_${event2.id}`,
              type: 'calendar',
              title: `Calendar Conflict: ${event1.title} overlaps with ${event2.title}`,
              description: `"${event1.title}" (${new Date(start1).toLocaleTimeString()}) conflicts with "${event2.title}" (${new Date(start2).toLocaleTimeString()})`,
              items: [event1.title, event2.title],
              severity: 'high',
              timestamp: Date.now(),
              resolved: false,
            });
          }
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Error detecting calendar conflicts:', error);
      return [];
    }
  }

  /**
   * Detect duplicate tasks
   */
  async detectDuplicateTasks(userId: string): Promise<Conflict[]> {
    try {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_completed', false)
        .is('deleted_at', null);

      if (error) throw error;

      const conflicts: Conflict[] = [];
      const titleMap = new Map<string, any[]>();

      // Group by similar titles
      tasks.forEach((task) => {
        const normalizedTitle = task.title.toLowerCase().trim();
        if (!titleMap.has(normalizedTitle)) {
          titleMap.set(normalizedTitle, []);
        }
        titleMap.get(normalizedTitle)!.push(task);
      });

      // Find duplicates
      titleMap.forEach((taskGroup, title) => {
        if (taskGroup.length > 1) {
          conflicts.push({
            id: `dup_task_${taskGroup.map((t) => t.id).join('_')}`,
            type: 'duplicate',
            title: `Duplicate Task: "${title}"`,
            description: `Found ${taskGroup.length} similar tasks with the same title. Consider consolidating them.`,
            items: taskGroup.map((t) => t.title),
            severity: 'medium',
            timestamp: Date.now(),
            resolved: false,
          });
        }
      });

      return conflicts;
    } catch (error) {
      console.error('Error detecting duplicate tasks:', error);
      return [];
    }
  }

  /**
   * Detect overdue items
   */
  async detectOverdueItems(userId: string): Promise<Conflict[]> {
    try {
      const now = new Date();
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_completed', false)
        .lt('due_date', now.toISOString())
        .is('deleted_at', null);

      if (error) throw error;

      if (!tasks || tasks.length === 0) return [];

      return [
        {
          id: `overdue_tasks_${Date.now()}`,
          type: 'task',
          title: `⚠️ You have ${tasks.length} overdue task(s)`,
          description: tasks
            .slice(0, 3)
            .map((t) => `• ${t.title}`)
            .join('\n'),
          items: tasks.map((t) => t.title),
          severity: 'high',
          timestamp: Date.now(),
          resolved: false,
        },
      ];
    } catch (error) {
      console.error('Error detecting overdue items:', error);
      return [];
    }
  }

  /**
   * Send conflict alert via iMessage
   */
  async sendConflictAlert(conflict: Conflict): Promise<void> {
    if (!this.conversationId || !this.userId) {
      console.warn('User context not set. Cannot send alert.');
      return;
    }

    try {
      const service = getMessageService();

      if (!service.isConnected()) {
        console.warn('Messaging service not connected. Cannot send alert.');
        return;
      }

      // Format the conflict message
      const emoji = {
        calendar: '📅',
        task: '✓',
        schedule: '⏰',
        goal: '🎯',
        duplicate: '⚠️',
      }[conflict.type];

      const message = `${emoji} ${conflict.title}\n\n${conflict.description}`;

      // Send via iMessage
      await service.sendMessage(this.conversationId, message, 'Calendar AI Assistant');

      console.log(`✓ Conflict alert sent: ${conflict.title}`);
    } catch (error) {
      console.error('Failed to send conflict alert:', error);
    }
  }

  /**
   * Run all conflict checks and send alerts
   */
  async checkAllConflicts(userId: string): Promise<Conflict[]> {
    try {
      const allConflicts: Conflict[] = [];

      // Run all conflict detection checks
      const calendarConflicts = await this.detectCalendarConflicts(userId);
      const duplicateConflicts = await this.detectDuplicateTasks(userId);
      const overdueConflicts = await this.detectOverdueItems(userId);

      allConflicts.push(...calendarConflicts, ...duplicateConflicts, ...overdueConflicts);

      // Send alerts for high severity conflicts
      for (const conflict of allConflicts.filter((c) => c.severity === 'high')) {
        await this.sendConflictAlert(conflict);
      }

      return allConflicts;
    } catch (error) {
      console.error('Error running conflict checks:', error);
      return [];
    }
  }

  /**
   * Start monitoring for conflicts (runs periodically)
   */
  startMonitoring(userId: string, intervalMs: number = 300000): () => void {
    // Check every 5 minutes by default
    const interval = setInterval(() => {
      this.checkAllConflicts(userId).catch(console.error);
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(interval);
  }
}

export const conflictDetection = new ConflictDetectionService();
