/** Primary app sections (sidebar + URL-less SPA state). */
export type WorkspaceView =
  | "tasks"
  | "calendar"
  | "goals"
  | "priorities"
  | "focus"
  | "google"
  | "upload"
  | "profile"

export const WORKSPACE_VIEW_TITLES: Record<WorkspaceView, string> = {
  tasks: "Tasks",
  calendar: "Calendar",
  goals: "Goals",
  priorities: "Priorities",
  focus: "Focus mode",
  google: "Integrations",
  upload: "Upload",
  profile: "Profile",
}

export function getWorkspaceViewTitle(view: WorkspaceView): string {
  return WORKSPACE_VIEW_TITLES[view] ?? "Workspace"
}
