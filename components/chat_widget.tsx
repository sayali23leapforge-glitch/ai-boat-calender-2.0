// components/ChatWidget.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, ChevronDown, ChevronUp, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceInputButton } from "@/components/voice-input-button";
import { cn } from "@/lib/utils";
import { uploadDocument } from "@/lib/document-processor";
import { getMessageService } from "@/lib/messaging";

import { supabase } from "@/lib/supabase";

import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  type TaskPriority,
  type TaskWithList,
} from "@/lib/tasks";
import { getTaskLists, createTaskList, type TaskList } from "@/lib/task-lists";

import {
  getCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  type CalendarEvent,
} from "@/lib/calendar-events";

import { createGoal, getGoals, updateGoal, deleteGoal, type GoalWithTasks } from "@/lib/goals";

type AllowedView =
  | "tasks"
  | "calendar"
  | "goals"
  | "priorities"
  | "focus"
  | "google"
  | "upload";

type Priority = "critical" | "high" | "medium" | "low";

/**
 * ✅ toolCallId added for idempotency.
 * Server will send it; client will skip if already executed.
 */
type ToolCall =
  | { id?: string; name: "ui_console_log"; arguments: { message: string } }
  | { id?: string; name: "ui_alert"; arguments: { message: string } }
  | { id?: string; name: "set_active_view"; arguments: { view: AllowedView } }
  | {
      id?: string;
      name: "request_disambiguation";
      arguments: {
        prompt: string;
        // ✅ additive: include "slot" for conflict quick-pick
        kind: "task" | "event" | "goal" | "slot";
        choices: Array<{
          key: string;
          title: string;
          subtitle?: string;
          // ✅ additive: slot payload
          payload?: { date?: string; time?: string; endTime?: string; durationMinutes?: number };
        }>;
        pendingTool: ToolCall;
      };
    }
  | {
      id?: string;
      name: "create_task_list";
      arguments: { name: string; color?: string };
    }
  | {
      id?: string;
      name: "create_task";
      arguments: {
        title: string;
        notes?: string;
        dueDate?: string;
        dueTime?: string;
        priority?: TaskPriority;
        goal?: string;
        estimatedHours?: number;
        location?: string;
        syncToCalendar?: boolean;
        listName?: string;
      };
    }
  | {
      id?: string;
      name: "create_event";
      arguments: {
        title: string;
        description?: string;
        date: string; // may arrive as "today"/"tomorrow" or missing => we normalize now
        time?: string;
        endTime?: string;
        location?: string;
        category?: string;
        priority?: TaskPriority;
      };
    }
  | {
      id?: string;
      name: "create_goal";
      arguments: {
        title: string;
        description?: string;
        targetDate?: string;
        metric?: string;
      };
    }
  | {
      id?: string;
      name: "update_task_by_title";
      arguments: {
        titleQuery: string;
        title?: string;
        notes?: string;
        dueDate?: string;
        dueTime?: string;
        priority?: Priority;
        goal?: string;
        estimatedHours?: number;
        location?: string;
        progress?: number;
      };
    }
  | { id?: string; name: "complete_task_by_title"; arguments: { titleQuery: string; completed?: boolean } }
  | { id?: string; name: "star_task_by_title"; arguments: { titleQuery: string; starred?: boolean } }
  | { id?: string; name: "delete_task_by_title"; arguments: { titleQuery: string } }
  | {
      id?: string;
      name: "update_event_by_title";
      arguments: {
        titleQuery: string;
        title?: string;
        description?: string;
        date?: string;
        time?: string;
        endTime?: string;
        location?: string;
        category?: string;
        priority?: Priority;
        isCompleted?: boolean;
      };
    }
  | { id?: string; name: "delete_event_by_title"; arguments: { titleQuery: string } }
  | {
      id?: string;
      name: "update_goal_by_title";
      arguments: {
        titleQuery: string;
        title?: string;
        description?: string;
        targetDate?: string;
        progress?: number;
      };
    }
  | { id?: string; name: "delete_goal_by_title"; arguments: { titleQuery: string } };

type ChatApiResponse = {
  assistantText: string;
  toolCalls: ToolCall[];
  requestId?: string;
  pendingEventDraft?: PendingEventDraft | null;
  successMessage?: string;
  silentMode?: boolean;
};

type PendingEventDraft = {
  kind: "event_conflict_resolution";
  date: string;
  requestedStartTime?: string;
  requestedEndTime?: string;
  durationMinutes: number;
  pendingTool: ToolCall;
  slots: Array<{ start_time: string; end_time: string; reason: string }>;
  createdAt: string;
};

type ChatWidgetProps = {
  onSetActiveView: (view: AllowedView) => void;
  userId: string;
  onFileUploaded?: () => void;
};

type RecentEntities = {
  lastTaskTitle?: string | null;
  lastEventTitle?: string | null;
  lastGoalTitle?: string | null;
  lastTaskListName?: string | null;
  lastActiveView?: AllowedView | null;

  // ✅ Wave 4 (additive): ID-based memory
  lastTaskId?: string | null;
  lastEventId?: string | null;
  lastGoalId?: string | null;
  lastTaskListId?: string | null;

  updatedAt?: number | null;
};

const RECENT_ENTITIES_LS_KEY = "edge_assistant_recent_entities_v1";
const CHAT_WIDGET_POSITION_LS_KEY = "edge_assistant_chat_widget_position_v1";

type ChatMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string;
      disambiguation: {
        prompt: string;
        kind: "task" | "event" | "goal" | "slot";
        choices: Array<{
          key: string;
          title: string;
          subtitle?: string;
          payload?: { date?: string; time?: string; endTime?: string; durationMinutes?: number };
        }>;
        pendingTool: ToolCall;
        toolId?: string;
      };
    };

function normalizeName(s: string) {
  return (s || "").trim().toLowerCase();
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function loadRecentEntitiesFromStorage(): RecentEntities {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(RECENT_ENTITIES_LS_KEY);
  if (!raw) return {};
  const parsed = safeJsonParse<RecentEntities>(raw);
  if (!parsed || typeof parsed !== "object") return {};
  return {
    lastTaskTitle: parsed.lastTaskTitle ?? null,
    lastEventTitle: parsed.lastEventTitle ?? null,
    lastGoalTitle: parsed.lastGoalTitle ?? null,
    lastTaskListName: parsed.lastTaskListName ?? null,
    lastActiveView: parsed.lastActiveView ?? null,

    lastTaskId: parsed.lastTaskId ?? null,
    lastEventId: parsed.lastEventId ?? null,
    lastGoalId: parsed.lastGoalId ?? null,
    lastTaskListId: parsed.lastTaskListId ?? null,

    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
  };
}

function saveRecentEntitiesToStorage(next: RecentEntities) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_ENTITIES_LS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function mapCategoryToValid(
  category: string | undefined
): "assignment" | "exam" | "meeting" | "deadline" | "milestone" | "other" {
  if (!category) return "other";
  const c = category.toLowerCase();
  const m: Record<string, "assignment" | "exam" | "meeting" | "deadline" | "milestone" | "other"> =
    {
      assignment: "assignment",
      exam: "exam",
      meeting: "meeting",
      deadline: "deadline",
      milestone: "milestone",
      other: "other",
      work: "assignment",
      personal: "other",
      health: "other",
      learning: "assignment",
      study: "assignment",
      class: "meeting",
      lecture: "meeting",
      appointment: "meeting",
      office_hours: "meeting",
    };
  return m[c] || "other";
}

function normalizeTimeToHHMM(timeValue: string): string {
  if (!timeValue) return timeValue;
  const t = timeValue.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t.slice(0, 5);
  return t;
}

function addMinutesHHMM(timeHHMM: string, addMins: number): string {
  const t = normalizeTimeToHHMM(timeHHMM);
  const [hhStr, mmStr] = t.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return t;
  const base = hh * 60 + mm;
  const next = (base + addMins + 24 * 60) % (24 * 60);
  const newH = Math.floor(next / 60);
  const newM = next % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function addHourHHMM(timeHHMM: string): string {
  return addMinutesHHMM(timeHHMM, 60);
}

function parseDurationMinutesFromText(text: string): number | null {
  const s = (text || "").toLowerCase();
  const m = s.match(/(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (unit.startsWith("h")) return n * 60;
  return n;
}

function getYmdLocal(dateObj = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(dateObj); // YYYY-MM-DD
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function resolveDateTokenClient(dateLike: any, fallbackUserText?: string): string | undefined {
  const raw = String(dateLike || "").trim().toLowerCase();
  const today = getYmdLocal();

  // Direct YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Tokens
  if (raw === "today") return today;
  if (raw === "tomorrow") return addDaysYmd(today, 1);

  // If missing/empty, try infer from user text
  const txt = String(fallbackUserText || "").toLowerCase();
  if (txt.includes("tomorrow")) return addDaysYmd(today, 1);
  if (/\btoday\b/.test(txt)) return today;

  // Explicit date in message
  const m = txt.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m?.[1]) return m[1];

  return undefined;
}

async function ensureQuickTasksList(userId: string): Promise<TaskList | null> {
  if (!userId) return null;
  const lists = await getTaskLists(userId);
  if (lists?.length) return lists.find((l) => l.name === "Quick Tasks") || lists[0];
  const created = await createTaskList(userId, "Quick Tasks", "#3b82f6");
  return created ?? null;
}

async function getOrCreateListByName(
  userId: string,
  listName: string,
  color?: string
): Promise<TaskList | null> {
  if (!userId) return null;
  const target = normalizeName(listName);
  if (!target) return null;

  const lists = await getTaskLists(userId);
  const existing = lists?.find((l) => normalizeName(l.name) === target);
  if (existing) return existing;

  const created = await createTaskList(userId, listName.trim(), color || "#3b82f6");
  return created ?? null;
}

function scoreMatch(title: string, q: string): number {
  const t = (title || "").toLowerCase();
  const query = (q || "").toLowerCase().trim();
  if (!query) return 0;
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  if (t.includes(query)) return 60;
  return 0;
}

function pickBestByTitle<T extends { title: string }>(items: T[], titleQuery: string): T | null {
  if (!items?.length) return null;
  let best: T | null = null;
  let bestScore = -1;
  for (const it of items) {
    const s = scoreMatch(it.title, titleQuery);
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return bestScore > 0 ? best : null;
}

function pickMatchesByTitle<T extends { title: string }>(
  items: T[],
  titleQuery: string
): { score: number; items: T[] } {
  const q = (titleQuery || "").trim();
  if (!q || !items?.length) return { score: 0, items: [] };

  let bestScore = 0;
  const scored: Array<{ it: T; s: number }> = [];

  for (const it of items) {
    const s = scoreMatch(it.title, q);
    if (s > 0) scored.push({ it, s });
    if (s > bestScore) bestScore = s;
  }

  const bestItems = scored.filter((x) => x.s === bestScore).map((x) => x.it);
  return { score: bestScore, items: bestItems };
}

/**
 * IMPORTANT: calendar create must hit server route so we bypass RLS
 * and match API's expected request body shape: { event: {...} }
 */
async function createCalendarEventViaApi(payload: {
  user_id: string;
  title: string;
  description?: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  category?: string;
  priority?: string;
  source?: string;
  source_id?: string;
  is_completed?: boolean;
}) {
  const resp = await fetch("/api/calendar/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: payload }),
  });

  const data = await resp.json().catch(() => ({} as any));
  if (!resp.ok) {
    const msg =
      data?.error ||
      data?.message ||
      (typeof data === "string" ? data : null) ||
      `Calendar create failed (${resp.status})`;
    throw new Error(msg);
  }
  return data;
}

function makeRequestId() {
  const g = (globalThis as any);
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isAmbiguousReference(s: string): boolean {
  const t = (s || "").trim().toLowerCase();
  if (!t) return true;
  return (
    t === "it" ||
    t === "that" ||
    t === "this" ||
    t === "that one" ||
    t === "this one" ||
    t === "the meeting" ||
    t === "the event" ||
    t === "meeting" ||
    t === "event" ||
    t === "task" ||
    t === "goal"
  );
}

export default function ChatWidget({ onSetActiveView, userId, onFileUploaded }: ChatWidgetProps) {
  console.log("[ChatWidget] Props received:", { userId, userIdType: typeof userId });
  
  const [open, setOpen] = useState(true);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [iMessageConnected, setIMessageConnected] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [resolvedUserId, setResolvedUserId] = useState<string>(userId || "");

  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hey 👋 Tell me what you want in natural language.\nExamples:\n• “Create task list: Work”\n• “Create task: Send invoice under list Work”\n• “Meeting Monday 9am with Rahul”\n• “Mark ‘send invoice’ done”\n• “Reschedule ‘Rahul meeting’ to Friday 4pm”",
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ✅ hard idempotency: never execute the same tool call twice
  const executedToolCallIdsRef = useRef<Set<string>>(new Set());

  // ✅ recent entity memory (client)
  const recentEntitiesRef = useRef<RecentEntities>({});
  const [recentEntitiesLoaded, setRecentEntitiesLoaded] = useState(false);

  // ✅ NEW: keep last user text so tool execution can parse duration/date even after input is cleared
  const lastSentUserTextRef = useRef<string>("");
  const pendingEventDraftRef = useRef<PendingEventDraft | null>(null);

  const apiMessages = useMemo(
    () =>
      chat
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: (m as any).content })),
    [chat]
  );

  function clampWidgetPosition(next: { x: number; y: number }) {
    if (typeof window === "undefined") return next;
    const widgetWidth = widgetRef.current?.offsetWidth ?? 380;
    const widgetHeight = widgetRef.current?.offsetHeight ?? 420;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, window.innerWidth - widgetWidth - 8);
    const maxY = Math.max(minY, window.innerHeight - widgetHeight - 8);
    return {
      x: Math.min(Math.max(next.x, minX), maxX),
      y: Math.min(Math.max(next.y, minY), maxY),
    };
  }

  function setRecentEntities(patch: Partial<RecentEntities>) {
    const next: RecentEntities = {
      ...(recentEntitiesRef.current || {}),
      ...patch,
      updatedAt: Date.now(),
    };
    recentEntitiesRef.current = next;
    saveRecentEntitiesToStorage(next);
  }

  useEffect(() => {
    const loaded = loadRecentEntitiesFromStorage();
    recentEntitiesRef.current = loaded;
    setRecentEntitiesLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Always calculate bottom-right position on load
    const defaultWidth = Math.min(380, Math.floor(window.innerWidth * 0.92));
    const defaultHeight = 520;
    const bottomRightPosition = {
      x: Math.max(8, window.innerWidth - defaultWidth - 16),
      y: Math.max(8, window.innerHeight - defaultHeight - 16),
    };
    
    // Try to load saved position, but default to bottom-right
    const saved = safeJsonParse<{ x: number; y: number }>(
      window.localStorage.getItem(CHAT_WIDGET_POSITION_LS_KEY) || ""
    );
    
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      setPosition(saved);
    } else {
      setPosition(bottomRightPosition);
    }
  }, []);

  useEffect(() => {
    if (!position || typeof window === "undefined") return;
    window.localStorage.setItem(CHAT_WIDGET_POSITION_LS_KEY, JSON.stringify(position));
  }, [position]);

  useEffect(() => {
    const handleResize = () => {
      if (!position) return;
      setPosition((prev) => (prev ? clampWidgetPosition(prev) : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const next = {
        x: event.clientX - dragOffsetRef.current.x,
        y: event.clientY - dragOffsetRef.current.y,
      };
      setPosition(clampWidgetPosition(next));
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  // Handle paste events for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!open || !composerRef.current?.contains(document.activeElement)) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const renamedFile = new File([file], `pasted-image-${Date.now()}.png`, { type: file.type });
            setAttachedFiles(prev => [...prev, renamedFile]);
            toast.success(`Image attached`);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [open]);

  // Initialize iMessage integration (optional - app works without it)
  useEffect(() => {
    // Check if BlueBubbles is configured
    const blueBubblesUrl = process.env.NEXT_PUBLIC_BLUEBUBBLES_BASE_URL;
    if (!blueBubblesUrl || blueBubblesUrl === '') {
      console.log('ℹ️ iMessage not configured (BlueBubbles URL missing)');
      return;
    }

    let unsubscribeMessage: (() => void) | null = null;
    let unsubscribeConnection: (() => void) | null = null;

    const initializeIMessage = async () => {
      try {
        const messageService = getMessageService();
        
        // Initialize with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        );
        
        await Promise.race([
          messageService.initialize(),
          timeoutPromise
        ]);

        console.log('✓ iMessage connected to chat bot');
        setIMessageConnected(true);
        
        // Get first conversation
        try {
          const convs = await messageService.getConversations();
          if (convs.length > 0) {
            setConversationId(convs[0].id);
            console.log(`📱 Using conversation: ${convs[0].displayName || convs[0].id}`);
          }
        } catch (err) {
          console.warn('Could not fetch conversations:', err instanceof Error ? err.message : 'Unknown error');
        }

        // Listen for incoming iMessages
        unsubscribeMessage = messageService.onMessage((message) => {
          console.log('📨 Incoming iMessage:', message.text);
          
          setChat(prev => [...prev, { 
            role: 'user', 
            content: message.text 
          }]);
          
          setTimeout(() => {
            send(message.text);
          }, 500);
        });

        // Connection status listener
        unsubscribeConnection = messageService.onConnectionStatusChange((connected) => {
          setIMessageConnected(connected);
          if (connected) {
            console.log('📱 iMessage reconnected');
          } else {
            console.warn('📱 iMessage disconnected');
          }
        });

      } catch (err) {
        console.warn('⚠️ iMessage unavailable:', err instanceof Error ? err.message : 'Connection failed');
        console.log('💡 App will work without iMessage integration');
        setIMessageConnected(false);
      }
    };

    initializeIMessage();

    return () => {
      if (unsubscribeMessage) unsubscribeMessage();
      if (unsubscribeConnection) unsubscribeConnection();
    };
  }, []);

  useEffect(() => {
    if (userId && userId !== resolvedUserId) setResolvedUserId(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) return;
        const uid = data?.user?.id || "";
        if (isMounted && uid) setResolvedUserId(uid);
      } catch {
        // ignore
      }
    }

    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id || "";
      setResolvedUserId(uid);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
    return () => clearTimeout(t);
  }, [chat.length]);

  function pushAssistantText(text: string) {
    setChat((prev) => [...prev, { role: "assistant", content: text }]);
  }

  function pushDisambiguationMessage(msg: ChatMessage & { disambiguation: any }) {
    setChat((prev) => [...prev, msg]);
  }

  function deriveEndTimeFromDurationIfNeeded(args: any, userText?: string) {
    // Only applies if start exists and end missing
    const time = args?.time ? String(args.time).trim() : "";
    const endTime = args?.endTime ? String(args.endTime).trim() : "";

    if (!time || endTime) return args;

    const durFromText = userText ? parseDurationMinutesFromText(userText) : null;
    const dur = durFromText && durFromText > 0 ? durFromText : 60;
    return { ...args, endTime: addMinutesHHMM(time, dur) };
  }

  async function executeToolCallNow(tc: ToolCall, toolId?: string) {
    if (toolId) {
      if (executedToolCallIdsRef.current.has(toolId)) return;
      executedToolCallIdsRef.current.add(toolId);
    }

    const uid = resolvedUserId || userId;

    if (tc.name === "ui_console_log") {
      console.log("[Assistant]", (tc as any).arguments?.message ?? "");
      return;
    }
    if (tc.name === "ui_alert") {
      alert((tc as any).arguments?.message ?? "");
      return;
    }
    if (tc.name === "set_active_view") {
      const view = (tc as any).arguments?.view as AllowedView | undefined;
      if (view) {
        onSetActiveView(view);
        setRecentEntities({ lastActiveView: view });
      }
      return;
    }

    if (tc.name === "request_disambiguation") {
      const d = (tc as any).arguments;
      if (!d?.choices?.length) return;

      pushDisambiguationMessage({
        role: "assistant",
        content: "",
        disambiguation: {
          prompt: d.prompt,
          kind: d.kind,
          choices: d.choices,
          pendingTool: d.pendingTool,
          toolId,
        },
      });
      return;
    }

    if (tc.name === "create_task_list") {
      try {
        const a = (tc as any).arguments;
        if (!a?.name?.trim()) return;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const existing = await getOrCreateListByName(uid, a.name.trim(), a.color);
        if (!existing?.id) {
          toast.error("Failed to create task list");
          return;
        }

        toast.success(`Task list created ✅ (${existing.name})`);
        setRecentEntities({
          lastTaskListName: existing.name,
          lastTaskListId: existing.id,
          lastActiveView: "tasks",
        });
        // Small delay to ensure list is fully saved before refreshing
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("refreshTasks"));
          onSetActiveView("tasks");
        }, 300);
      } catch (e: any) {
        console.error("create_task_list failed:", e);
        toast.error(e?.message ?? "Failed to create task list");
      }
      return;
    }

    if (tc.name === "create_task") {
      try {
        const a = (tc as any).arguments;
        if (!a?.title?.trim()) return;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        let list: TaskList | null = null;

        if (a.listName && a.listName.trim()) {
          list = await getOrCreateListByName(uid, a.listName.trim());
          if (!list?.id) {
            toast.error(`No task list found: "${a.listName}"`);
            return;
          }
        } else {
          list = await ensureQuickTasksList(uid);
          if (!list?.id) {
            toast.error("No task list found. Please create a list first.");
            return;
          }
        }

        const resolvedPriority: TaskPriority = a.priority || "medium";
        const shouldStar = resolvedPriority === "critical" || resolvedPriority === "high";

        const created: any = await createTask(uid, list.id, a.title.trim(), {
          notes: a.notes || "",
          dueDate: a.dueDate || undefined,
          dueTime: a.dueTime || undefined,
          isStarred: shouldStar,
          priority: resolvedPriority,
          goal: a.goal || undefined,
          estimatedHours: typeof a.estimatedHours === "number" ? a.estimatedHours : undefined,
          location: a.location || undefined,
          metadata: { source: "assistant_chat", listName: a.listName || null },
          syncToCalendar: a.syncToCalendar ?? true,
        });

        toast.success(`Task created ✅ (${list.name})`);

        setRecentEntities({
          lastTaskTitle: a.title.trim(),
          lastTaskListName: list.name,
          lastTaskListId: list.id,
          lastTaskId: created?.id || created?.data?.id || null,
          lastActiveView: "tasks",
        });

        // Small delay to ensure task is fully saved before refreshing
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("refreshCalendar"));
          window.dispatchEvent(new CustomEvent("refreshTasks"));
          onSetActiveView("tasks");
        }, 300);
      } catch (e: any) {
        console.error("create_task failed:", e);
        toast.error(e?.message ?? "Failed to create task");
      }
      return;
    }

    if (tc.name === "create_event") {
      try {
        const a0 = (tc as any).arguments;

        // ✅ use last sent user text instead of cleared input
        const userText = lastSentUserTextRef.current || "";

        // ✅ duration-driven endTime if omitted
        let a = deriveEndTimeFromDurationIfNeeded(a0, userText) as any;

        if (!a?.title?.trim()) return;

        // ✅ NEW: normalize date tokens/missing date using user text
        const resolvedDate = resolveDateTokenClient(a?.date, userText);
        if (resolvedDate) a = { ...a, date: resolvedDate };

        if (!a?.date || !String(a.date).match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.error("create_event missing/invalid date:", a, { userText });
          toast.error("Event date missing. Try: “Meeting on 2026-01-10 2pm”");
          return;
        }

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const hasTime = Boolean(a.time && String(a.time).trim());
        const startHHMM = hasTime ? normalizeTimeToHHMM(a.time) : undefined;
        const endHHMM = hasTime ? normalizeTimeToHHMM(a.endTime || addHourHHMM(a.time)) : undefined;

        const startTime = startHHMM ? `${startHHMM}:00` : undefined;
        const endTime = endHHMM ? `${endHHMM}:00` : undefined;

        const created = await createCalendarEventViaApi({
          user_id: uid,
          title: a.title.trim(),
          description: a.description || undefined,
          event_date: a.date,
          start_time: startTime,
          end_time: endTime,
          location: a.location || undefined,
          category: mapCategoryToValid(a.category),
          priority: (a.priority as TaskPriority) || "medium",
          source: "manual",
          source_id: undefined,
          is_completed: false,
        });

        toast.success("Event created 📅");

        const createdId =
          (created as any)?.event?.id ||
          (created as any)?.data?.id ||
          (created as any)?.id ||
          null;

        setRecentEntities({
          lastEventTitle: a.title.trim(),
          lastEventId: createdId,
          lastActiveView: "calendar",
        });

        // Delay refresh to ensure API response is fully processed, then trigger calendar refresh
        setTimeout(() => {
          // Dispatch multiple times to ensure it's caught
          window.dispatchEvent(new CustomEvent("refreshCalendar"));
          window.dispatchEvent(new CustomEvent("refreshCalendar"));
        }, 800);
        
        // Switch to calendar view after a slight delay
        setTimeout(() => {
          onSetActiveView("calendar");
        }, 1000);

        pendingEventDraftRef.current = null;
      } catch (e: any) {
        console.error("create_event failed:", e);
        toast.error(e?.message ?? "Failed to create event");
      }
      return;
    }

    if (tc.name === "create_goal") {
      try {
        const a = (tc as any).arguments;
        if (!a?.title?.trim()) return;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const descParts: string[] = [];
        if (a.description?.trim()) descParts.push(a.description.trim());
        if (a.metric?.trim()) descParts.push(`Metric: ${a.metric.trim()}`);

        const created: any = await createGoal(uid, {
          title: a.title.trim(),
          description: descParts.join("\n") || "",
          target_date: a.targetDate || null,
        });

        toast.success("Goal created 🎯");

        setRecentEntities({
          lastGoalTitle: a.title.trim(),
          lastGoalId: created?.id || created?.data?.id || null,
          lastActiveView: "goals",
        });

        onSetActiveView("goals");
      } catch (e: any) {
        console.error("create_goal failed:", e);
        toast.error(e?.message ?? "Failed to create goal");
      }
      return;
    }

    // ----- rest of file unchanged (your existing handlers) -----

    if (tc.name === "update_task_by_title") {
      try {
        const a = (tc as any).arguments;
        if (!a?.titleQuery?.trim()) return;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const tasks = await getTasks(uid, { isCompleted: false });

        const tq = String(a.titleQuery || "").trim();
        const shouldUseLastId = isAmbiguousReference(tq) && recentEntitiesRef.current?.lastTaskId;
        const t =
          shouldUseLastId
            ? (tasks as any[]).find((x: any) => x?.id === recentEntitiesRef.current?.lastTaskId) || null
            : pickBestByTitle<TaskWithList>(tasks as any, tq);

        if (!t) {
          toast.error(`No task found matching: "${a.titleQuery}"`);
          return;
        }

        const updates: any = {};

        if (a.title !== undefined) updates.title = a.title;
        if (a.notes !== undefined) updates.notes = a.notes;
        if (a.dueDate !== undefined) updates.due_date = a.dueDate || null;
        if (a.dueTime !== undefined) updates.due_time = a.dueTime || null;
        if (a.priority !== undefined) updates.priority = a.priority;
        if (a.goal !== undefined) updates.goal = a.goal || null;
        if (a.location !== undefined) updates.location = a.location || null;
        if (typeof a.estimatedHours === "number") updates.estimated_hours = a.estimatedHours;
        if (typeof a.progress === "number") updates.progress = Math.max(0, Math.min(100, a.progress));

        await updateTask(t.id, updates);

        toast.success("Task updated ✅");

        setRecentEntities({
          lastTaskTitle: (a.title !== undefined && a.title ? a.title : t.title) || t.title,
          lastTaskId: t.id,
          lastActiveView: "tasks",
        });

        window.dispatchEvent(new CustomEvent("refreshCalendar"));
        onSetActiveView("tasks");
      } catch (e: any) {
        console.error("update_task_by_title failed:", e);
        toast.error(e?.message ?? "Failed to update task");
      }
      return;
    }

    if (tc.name === "complete_task_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const tasks = await getTasks(uid, {});
        const tq = String(a.titleQuery || "").trim();
        const shouldUseLastId = isAmbiguousReference(tq) && recentEntitiesRef.current?.lastTaskId;
        const t =
          shouldUseLastId
            ? (tasks as any[]).find((x: any) => x?.id === recentEntitiesRef.current?.lastTaskId) || null
            : pickBestByTitle<TaskWithList>(tasks as any, tq);

        if (!t) {
          toast.error(`No task found matching: "${a.titleQuery}"`);
          return;
        }

        const completed = a.completed !== undefined ? a.completed : true;
        await updateTask(t.id, {
          is_completed: completed,
          progress: completed ? 100 : 0,
        } as any);

        toast.success(completed ? "Task completed ✅" : "Task marked incomplete ↩️");

        setRecentEntities({
          lastTaskTitle: t.title,
          lastTaskId: t.id,
          lastActiveView: "tasks",
        });

        window.dispatchEvent(new CustomEvent("refreshCalendar"));
        onSetActiveView("tasks");
      } catch (e: any) {
        console.error("complete_task_by_title failed:", e);
        toast.error(e?.message ?? "Failed to update task completion");
      }
      return;
    }

    if (tc.name === "star_task_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const tasks = await getTasks(uid, {});
        const tq = String(a.titleQuery || "").trim();
        const shouldUseLastId = isAmbiguousReference(tq) && recentEntitiesRef.current?.lastTaskId;
        const t =
          shouldUseLastId
            ? (tasks as any[]).find((x: any) => x?.id === recentEntitiesRef.current?.lastTaskId) || null
            : pickBestByTitle<TaskWithList>(tasks as any, tq);

        if (!t) {
          toast.error(`No task found matching: "${a.titleQuery}"`);
          return;
        }

        const starred = a.starred !== undefined ? a.starred : true;
        await updateTask(t.id, { is_starred: starred } as any);

        toast.success(starred ? "Task starred ⭐" : "Task unstarred");

        setRecentEntities({
          lastTaskTitle: t.title,
          lastTaskId: t.id,
          lastActiveView: "tasks",
        });

        window.dispatchEvent(new CustomEvent("refreshCalendar"));
        onSetActiveView("tasks");
      } catch (e: any) {
        console.error("star_task_by_title failed:", e);
        toast.error(e?.message ?? "Failed to star task");
      }
      return;
    }

    if (tc.name === "delete_task_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const tasks = await getTasks(uid, {});
        const tq = String(a.titleQuery || "").trim();
        const shouldUseLastId = isAmbiguousReference(tq) && recentEntitiesRef.current?.lastTaskId;
        const t =
          shouldUseLastId
            ? (tasks as any[]).find((x: any) => x?.id === recentEntitiesRef.current?.lastTaskId) || null
            : pickBestByTitle<TaskWithList>(tasks as any, tq);

        if (!t) {
          toast.error(`No task found matching: "${a.titleQuery}"`);
          return;
        }

        await deleteTask(t.id);

        toast.success("Task deleted 🗑️");

        setRecentEntities({
          lastTaskTitle: t.title,
          lastTaskId: t.id,
          lastActiveView: "tasks",
        });

        window.dispatchEvent(new CustomEvent("refreshCalendar"));
        onSetActiveView("tasks");
      } catch (e: any) {
        console.error("delete_task_by_title failed:", e);
        toast.error(e?.message ?? "Failed to delete task");
      }
      return;
    }

    if (tc.name === "update_event_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const titleQuery = String(a.titleQuery || "").trim();
        const events = (await getCalendarEvents(uid)) as CalendarEvent[];

        const effectiveQuery =
          titleQuery && !isAmbiguousReference(titleQuery)
            ? titleQuery
            : (recentEntitiesRef.current?.lastEventTitle || "").trim();

        const useLastId = isAmbiguousReference(titleQuery) && recentEntitiesRef.current?.lastEventId;
        const ev =
          useLastId
            ? events.find((x: any) => String((x as any)?.id || "") === String(recentEntitiesRef.current?.lastEventId || "")) || null
            : pickBestByTitle<CalendarEvent>(events, effectiveQuery);

        if (!ev) {
          toast.error(`No event found matching: "${a.titleQuery}"`);
          return;
        }

        const updates: any = {};

        if (a.title !== undefined) updates.title = a.title;
        if (a.description !== undefined) updates.description = a.description;
        if (a.date !== undefined) updates.event_date = a.date;
        if (a.location !== undefined) updates.location = a.location;
        if (a.category !== undefined) updates.category = mapCategoryToValid(a.category);
        if (a.priority !== undefined) updates.priority = a.priority;
        if (a.isCompleted !== undefined) updates.is_completed = a.isCompleted;

        if (a.time !== undefined) {
          const hhmm = a.time ? normalizeTimeToHHMM(a.time) : undefined;
          updates.start_time = hhmm ? `${hhmm}:00` : undefined;
        }

        if (a.endTime !== undefined) {
          const hhmm = a.endTime ? normalizeTimeToHHMM(a.endTime) : undefined;
          updates.end_time = hhmm ? `${hhmm}:00` : undefined;
        } else if (a.time !== undefined && a.time) {
          const userText = lastSentUserTextRef.current || "";
          const dur = parseDurationMinutesFromText(userText) || 60;
          const endHHMM = addMinutesHHMM(a.time, dur);
          updates.end_time = `${normalizeTimeToHHMM(endHHMM)}:00`;
        }

        await updateCalendarEvent((ev as any).id, updates);

        toast.success("Event updated 📅");

        setRecentEntities({
          lastEventTitle: (a.title !== undefined && a.title ? a.title : (ev as any).title) || (ev as any).title,
          lastEventId: (ev as any).id,
          lastActiveView: "calendar",
        });

        window.dispatchEvent(new CustomEvent("refreshCalendar"));
        onSetActiveView("calendar");
        pendingEventDraftRef.current = null;
      } catch (e: any) {
        console.error("update_event_by_title failed:", e);
        toast.error(e?.message ?? "Failed to update event");
      }
      return;
    }

    if (tc.name === "delete_event_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const titleQuery = String(a.titleQuery || "").trim();
        const events = (await getCalendarEvents(uid)) as CalendarEvent[];

        const effectiveQuery =
          titleQuery && !isAmbiguousReference(titleQuery)
            ? titleQuery
            : (recentEntitiesRef.current?.lastEventTitle || "").trim();

        const useLastId = isAmbiguousReference(titleQuery) && recentEntitiesRef.current?.lastEventId;
        const ev =
          useLastId
            ? events.find((x: any) => String((x as any)?.id || "") === String(recentEntitiesRef.current?.lastEventId || "")) || null
            : pickBestByTitle<CalendarEvent>(events, effectiveQuery);

        if (!ev) {
          toast.error(`No event found matching: "${a.titleQuery}"`);
          return;
        }

        await deleteCalendarEvent((ev as any).id);

        toast.success("Event deleted 🗑️");

        setRecentEntities({
          lastEventTitle: (ev as any).title,
          lastEventId: (ev as any).id,
          lastActiveView: "calendar",
        });

        window.dispatchEvent(new CustomEvent("refreshCalendar"));
        onSetActiveView("calendar");
      } catch (e: any) {
        console.error("delete_event_by_title failed:", e);
        toast.error(e?.message ?? "Failed to delete event");
      }
      return;
    }

    if (tc.name === "update_goal_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const goals = (await getGoals(uid)) as GoalWithTasks[];
        const tq = String(a.titleQuery || "").trim();
        const useLastId = isAmbiguousReference(tq) && recentEntitiesRef.current?.lastGoalId;
        const g =
          useLastId
            ? goals.find((x: any) => String((x as any)?.id || "") === String(recentEntitiesRef.current?.lastGoalId || "")) || null
            : pickBestByTitle<GoalWithTasks>(goals, tq);

        if (!g) {
          toast.error(`No goal found matching: "${a.titleQuery}"`);
          return;
        }

        const updates: any = {};
        if (a.title !== undefined) updates.title = a.title;
        if (a.description !== undefined) updates.description = a.description;
        if (a.targetDate !== undefined) updates.target_date = a.targetDate || null;
        if (typeof a.progress === "number") updates.progress = Math.max(0, Math.min(100, a.progress));

        await updateGoal((g as any).id, updates);

        toast.success("Goal updated 🎯");

        setRecentEntities({
          lastGoalTitle: (a.title !== undefined && a.title ? a.title : (g as any).title) || (g as any).title,
          lastGoalId: (g as any).id,
          lastActiveView: "goals",
        });

        onSetActiveView("goals");
      } catch (e: any) {
        console.error("update_goal_by_title failed:", e);
        toast.error(e?.message ?? "Failed to update goal");
      }
      return;
    }

    if (tc.name === "delete_goal_by_title") {
      try {
        const a = (tc as any).arguments;

        if (!uid) {
          toast.error("Missing userId — please sign in again.");
          return;
        }

        const goals = (await getGoals(uid)) as GoalWithTasks[];
        const tq = String(a.titleQuery || "").trim();
        const useLastId = isAmbiguousReference(tq) && recentEntitiesRef.current?.lastGoalId;
        const g =
          useLastId
            ? goals.find((x: any) => String((x as any)?.id || "") === String(recentEntitiesRef.current?.lastGoalId || "")) || null
            : pickBestByTitle<GoalWithTasks>(goals, tq);

        if (!g) {
          toast.error(`No goal found matching: "${a.titleQuery}"`);
          return;
        }

        await deleteGoal((g as any).id);

        toast.success("Goal deleted 🗑️");

        setRecentEntities({
          lastGoalTitle: (g as any).title,
          lastGoalId: (g as any).id,
          lastActiveView: "goals",
        });

        onSetActiveView("goals");
      } catch (e: any) {
        console.error("delete_goal_by_title failed:", e);
        toast.error(e?.message ?? "Failed to delete goal");
      }
      return;
    }
  }

  async function execToolCalls(toolCalls: ToolCall[], requestId?: string) {
    const uid = resolvedUserId || userId;

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const toolId = tc.id || (requestId ? `${requestId}:${i}` : undefined);

      if (toolId && executedToolCallIdsRef.current.has(toolId)) continue;

      if (tc.name === "request_disambiguation") {
        await executeToolCallNow(tc, toolId);
        continue;
      }

      const byTitleNames = new Set([
        "update_task_by_title",
        "complete_task_by_title",
        "star_task_by_title",
        "delete_task_by_title",
        "update_event_by_title",
        "delete_event_by_title",
        "update_goal_by_title",
        "delete_goal_by_title",
      ]);

      if (byTitleNames.has(tc.name)) {
        if (!uid) {
          await executeToolCallNow(tc, toolId);
          continue;
        }

        const titleQuery = String((tc as any).arguments?.titleQuery || "").trim();

        if (
          tc.name === "update_task_by_title" ||
          tc.name === "complete_task_by_title" ||
          tc.name === "star_task_by_title" ||
          tc.name === "delete_task_by_title"
        ) {
          const tasks = await getTasks(uid, {});
          const { score, items } = pickMatchesByTitle<TaskWithList>(tasks as any, titleQuery);

          if (items.length > 1 && score > 0) {
            pushDisambiguationMessage({
              role: "assistant",
              content: "",
              disambiguation: {
                prompt: `I found multiple tasks matching “${titleQuery}”. Which one do you mean?`,
                kind: "task",
                choices: items.slice(0, 6).map((t) => ({
                  key: (t as any).id || t.title,
                  title: t.title,
                  subtitle: (t as any)?.listName ? String((t as any).listName) : undefined,
                })),
                pendingTool: tc,
                toolId,
              },
            });
            continue;
          }

          await executeToolCallNow(tc, toolId);
          continue;
        }

        if (tc.name === "update_event_by_title" || tc.name === "delete_event_by_title") {
          const events = (await getCalendarEvents(uid)) as CalendarEvent[];
          const { score, items } = pickMatchesByTitle<CalendarEvent>(events, titleQuery);

          if (items.length > 1 && score > 0) {
            pushDisambiguationMessage({
              role: "assistant",
              content: "",
              disambiguation: {
                prompt: `I found multiple events matching “${titleQuery}”. Which one do you mean?`,
                kind: "event",
                choices: items.slice(0, 6).map((ev) => {
                  const st = (ev as any).start_time ? String((ev as any).start_time).slice(0, 5) : "All day";
                  const en = (ev as any).end_time ? String((ev as any).end_time).slice(0, 5) : "";
                  const time = (ev as any).start_time ? `${st}–${en}` : st;
                  const date = (ev as any).event_date ? String((ev as any).event_date) : "";
                  return {
                    key: (ev as any).id || ev.title,
                    title: ev.title,
                    subtitle: `${date} • ${time}`,
                  };
                }),
                pendingTool: tc,
                toolId,
              },
            });
            continue;
          }

          await executeToolCallNow(tc, toolId);
          continue;
        }

        if (tc.name === "update_goal_by_title" || tc.name === "delete_goal_by_title") {
          const goals = (await getGoals(uid)) as GoalWithTasks[];
          const { score, items } = pickMatchesByTitle<GoalWithTasks>(goals, titleQuery);

          if (items.length > 1 && score > 0) {
            pushDisambiguationMessage({
              role: "assistant",
              content: "",
              disambiguation: {
                prompt: `I found multiple goals matching “${titleQuery}”. Which one do you mean?`,
                kind: "goal",
                choices: items.slice(0, 6).map((g) => ({
                  key: (g as any).id || g.title,
                  title: g.title,
                  subtitle: typeof (g as any).progress === "number" ? `Progress: ${(g as any).progress}%` : undefined,
                })),
                pendingTool: tc,
                toolId,
              },
            });
            continue;
          }

          await executeToolCallNow(tc, toolId);
          continue;
        }
      }

      await executeToolCallNow(tc, toolId);
    }
  }

  async function onPickDisambiguation(
    choice: { title: string; payload?: { date?: string; time?: string; endTime?: string; durationMinutes?: number } },
    kind: "task" | "event" | "goal" | "slot",
    pendingTool: ToolCall,
    toolId?: string
  ) {
    pushAssistantText(`Got it — using “${choice.title}”.`);

    if (kind === "slot") {
      const p = choice.payload || {};
      const patchedArgs = { ...(pendingTool as any).arguments };

      if (pendingTool.name === "create_event") {
        patchedArgs.date = p.date || patchedArgs.date;
        patchedArgs.time = p.time || patchedArgs.time;
        patchedArgs.endTime = p.endTime || patchedArgs.endTime;
      } else if (pendingTool.name === "update_event_by_title") {
        patchedArgs.date = p.date || patchedArgs.date;
        patchedArgs.time = p.time || patchedArgs.time;
        patchedArgs.endTime = p.endTime || patchedArgs.endTime;
      }

      const patched: ToolCall = { ...(pendingTool as any), arguments: patchedArgs };
      await executeToolCallNow(patched, toolId);

      setRecentEntities({
        lastActiveView: "calendar",
      });
      pendingEventDraftRef.current = null;
      return;
    }

    const patched: ToolCall = {
      ...(pendingTool as any),
      arguments: {
        ...(pendingTool as any).arguments,
        titleQuery: choice.title,
      },
    };

    await executeToolCallNow(patched, toolId);

    if (pendingTool.name.includes("task")) setRecentEntities({ lastTaskTitle: choice.title, lastActiveView: "tasks" });
    if (pendingTool.name.includes("event")) setRecentEntities({ lastEventTitle: choice.title, lastActiveView: "calendar" });
    if (pendingTool.name.includes("goal")) setRecentEntities({ lastGoalTitle: choice.title, lastActiveView: "goals" });
  }

  // Handle file selection from button
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files]);
      toast.success(`${files.length} file(s) attached`);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove attached file
  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Upload files to storage and create records
  const uploadFiles = async (files: File[]) => {
    const uploadPromises = files.map(async (file) => {
      try {
        const document = await uploadDocument(file, resolvedUserId || userId);
        const isImage = file.type.startsWith('image/');
        toast.success(`${isImage ? 'Image' : 'Document'} uploaded: ${file.name}`);
        return document;
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(`Failed to upload ${file.name}`);
        return null;
      }
    });

    await Promise.all(uploadPromises);
    
    // Notify parent to refresh upload section
    if (onFileUploaded) {
      onFileUploaded();
    }
  };

  async function send(messageText?: string) {
    console.log('[ChatWidget] send() called', { messageText, input, inputLength: input?.length });
    
    // If messageText is an event object, ignore it
    const actualMessage = (typeof messageText === 'string') ? messageText : undefined;
    const text = String(actualMessage || input || "").trim();
    const hasFiles = attachedFiles.length > 0;
    
    console.log('[ChatWidget] send() processed - TEXT:', text, 'LENGTH:', text.length, 'HAS_FILES:', hasFiles);
    
    // Need either text or files
    if (!text && !hasFiles) {
      console.log('[ChatWidget] send() aborted - no text or files');
      return;
    }
    if (loading) return;

    const requestId = makeRequestId();

    // Upload files first if any
    if (hasFiles) {
      setLoading(true);
      await uploadFiles(attachedFiles);
      setAttachedFiles([]);
      
      // If no text, just show upload confirmation
      if (!text) {
        setLoading(false);
        return;
      }
    }

    // ✅ store last user text BEFORE we clear input (used by tool execution for duration/date)
    lastSentUserTextRef.current = text;

    // Only add to chat if not from iMessage (to avoid duplicates)
    if (!messageText) {
      setChat((prev) => [...prev, { role: "user", content: text }]);
    }
    setInput("");
    setLoading(true);

    try {
      const uid = resolvedUserId || userId;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      console.log("[ChatWidget] Sending to API:", { 
        userId: userId, 
        resolvedUserId: resolvedUserId, 
        uid: uid,
        uidLength: uid?.length
      });

      const recentEntities = recentEntitiesLoaded
        ? (recentEntitiesRef.current || {})
        : (loadRecentEntitiesFromStorage() || {});

      console.log('[ChatWidget] Sending message:', { 
        text, 
        textLength: text?.length, 
        textType: typeof text,
        messagesCount: apiMessages.length 
      });

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          userId: uid,
          messages: [...apiMessages, { role: "user", content: text }],
          context: {
            timezone: tz,
            recentEntities,
            pendingEventDraft: pendingEventDraftRef.current,
          },
        }),
      });

      const data: ChatApiResponse = await resp.json();

      console.log('[ChatWidget] API Response STATUS:', resp.status, 'OK:', resp.ok, 'ASSISTANT_TEXT:', data?.assistantText, 'SILENT:', data?.silentMode, 'SUCCESS_MSG:', data?.successMessage, 'TOOL_CALLS:', data?.toolCalls?.length || 0);

      if (!resp.ok) {
        setChat((prev) => [
          ...prev,
          { role: "assistant", content: data?.assistantText || `Error: ${resp.status}` },
        ]);
        return;
      }

      if (Object.prototype.hasOwnProperty.call(data, "pendingEventDraft")) {
        pendingEventDraftRef.current = data.pendingEventDraft ?? null;
      }

      const assistantText = data?.assistantText || "Done.";
      
      // Handle silent mode (no assistant message, just toast)
      if (data?.silentMode) {
        if (data?.successMessage) {
          toast.success(data.successMessage, { duration: 2000 });
          setChat((prev) => [...prev, { role: "assistant", content: data.successMessage as string }]);
        } else {
          setChat((prev) => [...prev, { role: "assistant", content: "Done — I've handled that." }]);
        }
      } else if (assistantText.trim()) {
        setChat((prev) => [...prev, { role: "assistant", content: assistantText }]);
      }

      // Send response via iMessage if connected (only if not silent)
      if (!data?.silentMode && iMessageConnected && conversationId && assistantText) {
        try {
          const messageService = getMessageService();
          await messageService.sendMessage(conversationId, assistantText, 'AI Assistant');
          console.log('📤 Sent response via iMessage');
        } catch (err) {
          console.error('Failed to send iMessage:', err);
        }
      }

      if (Array.isArray(data?.toolCalls) && data.toolCalls.length > 0) {
        await execToolCalls(data.toolCalls, data.requestId || requestId);
      }
    } catch (e: any) {
      console.error('[ChatWidget] Error in send():', e);
      setChat((prev) => [...prev, { role: "assistant", content: e?.message ?? "Failed to send" }]);
    } finally {
      setLoading(false);
    }
  }

  function startDragging(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='button']")) {
      return;
    }
    if (!widgetRef.current || !position) return;
    const rect = widgetRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
  }

  return (
    <div
      ref={widgetRef}
      className="fixed z-[9999] w-[380px] max-w-[92vw]"
      style={{
        left: position?.x ?? 16,
        top: position?.y ?? 16,
      }}
    >
      <div className="rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30 select-none",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          onPointerDown={startDragging}
        >
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold flex items-center gap-2">
                Assistant
                {iMessageConnected && (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    iMessage
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {iMessageConnected ? 'Connected to iMessage' : 'Chat to control Tasks / Calendar / Goals'}
              </div>
            </div>
          </div>

          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setOpen((v) => !v)}>
            {open ? (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Minimize
              </>
            ) : (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Open
              </>
            )}
          </Button>
        </div>

        {/* Body */}
        {open && (
          <>
            <div ref={scrollRef} className="max-h-[340px] overflow-y-auto px-4 py-3 space-y-3">
              {chat.map((m, idx) => {
                const hasDisambig = (m as any).disambiguation;

                if (hasDisambig) {
                  const d = (m as any).disambiguation as any;
                  return (
                    <div
                      key={idx}
                      className="max-w-[92%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap mr-auto bg-muted text-foreground"
                    >
                      <div className="text-sm font-medium">{d.prompt}</div>
                      <div className="mt-2 flex flex-col gap-2">
                        {(d.choices || []).map((c: any) => (
                          <Button
                            key={c.key}
                            variant="secondary"
                            className="rounded-xl justify-start h-auto py-2 px-3"
                            onClick={() =>
                              onPickDisambiguation({ title: c.title, payload: c.payload }, d.kind, d.pendingTool, d.toolId)
                            }
                          >
                            <div className="flex flex-col items-start text-left">
                              <div className="text-sm font-semibold">{c.title}</div>
                              {c.subtitle ? (
                                <div className="text-xs text-muted-foreground mt-0.5">{c.subtitle}</div>
                              ) : null}
                            </div>
                          </Button>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Tip: Next time include list name or date/time to avoid duplicates.
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-muted text-foreground"
                    )}
                  >
                    {(m as any).content}
                  </div>
                );
              })}
            </div>

            {/* Composer */}
            <div ref={composerRef} className="border-t border-border/60 p-3 space-y-2">
              {/* Attached Files Preview */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2 border-b border-border/40">
                  {attachedFiles.map((file, idx) => {
                    const isImage = file.type.startsWith('image/');
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-muted rounded-lg px-2 py-1 text-xs">
                        {isImage ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button onClick={() => removeFile(idx)} className="hover:bg-background rounded p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Input Row */}
              <div className="flex gap-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {/* Attach button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl px-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                <div className="flex-1 relative">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder='Type or paste image (Ctrl+V)'
                    className="rounded-xl pr-12"
                    disabled={loading}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton
                      onTranscript={(text) => {
                        console.log('[ChatWidget] Voice transcript received:', text);
                        setInput((prev) => {
                          const newValue = prev + (prev ? ' ' : '') + text;
                          console.log('[ChatWidget] Input updated:', { prev, text, newValue });
                          return newValue;
                        });
                      }}
                      size="sm"
                    />
                  </div>
                </div>
                <Button onClick={() => send()} disabled={loading} className="rounded-xl">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
