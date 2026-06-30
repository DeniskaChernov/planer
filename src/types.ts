export type View = 'dashboard' | 'projects' | 'calendar' | 'ideas' | 'team' | 'settings'
export type TaskStatus = 'Backlog' | 'Todo' | 'In Progress' | 'Done'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: 'Low' | 'Medium' | 'High'
  deadline?: string
  tags: string[]
  assignee?: string
}

export interface Entry { id: string; title: string; body?: string; createdAt: string }

export interface Project {
  id: string
  name: string
  icon: string
  color: string
  description: string
  progress: number
  tasks: Task[]
  ideas: Entry[]
  improvements: Entry[]
  notes: Entry[]
}

export interface PlannerState {
  focus: string
  projects: Project[]
}

export interface UserProfile {
  name: string
  role: string
  bio: string
  vision: string
  goals: string[]
  constraints: string
  workingStyle: string
}

export interface AuthUser {
  accountId: string
  publicId: string
  displayName: string
  externalUserId?: string
  workspaceId: string
  workspaceName: string
  inviteCode: string
  role: 'owner' | 'member'
}

export interface WorkspaceInfo {
  id: string
  name: string
  inviteCode: string
  role: string
  members: { public_id:string; display_name:string; external_user_id?:string; role:string }[]
}
