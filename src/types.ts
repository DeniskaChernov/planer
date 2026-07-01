export type View = 'dashboard' | 'decisions' | 'projects' | 'calendar' | 'ideas' | 'team' | 'settings'
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
  estimate?: number
  blocked?: boolean
}

export interface Entry { id: string; title: string; body?: string; createdAt: string }

export interface Project {
  id: string
  name: string
  icon: string
  color: string
  description: string
  outcome?: string
  owner?: string
  status?: 'active'|'paused'|'completed'
  progress: number
  tasks: Task[]
  ideas: Entry[]
  improvements: Entry[]
  notes: Entry[]
}

export interface PlannerState {
  focus: string
  projects: Project[]
  decisions: Decision[]
}

export interface ActivityItem { id:string; action:string; entity_type?:string; entity_id?:string; metadata:{title?:string}; created_at:string; display_name?:string; public_id?:string }
export interface AIConversation { id:string; context:string; title:string; preview?:string; created_at:string; updated_at:string }
export interface AIMessage { id:string; role:'user'|'assistant'; content:string; created_at:string }
export interface FinanceStatus { linked:boolean; externalUserId?:string; mode:'identity'|'live'; serviceConfigured:boolean; message:string }

export interface Decision {
  id: string
  title: string
  rationale: string
  expectedOutcome: string
  confidence: number
  reviewDate?: string
  status: 'captured'|'committed'|'under_review'|'validated'|'reversed'
  createdAt: string
  createdBy?: string
  projectId?: string
  reversibility?: 'reversible'|'costly'|'irreversible'
  assumptions?: string
  premortem?: string
  actualOutcome?: string
  reviewNote?: string
  reasoningQuality?: 'sound'|'unclear'|'flawed'
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
  role: 'owner' | 'member'
  permissions: AccessPermissions
  projectIds: string[]
}

export interface AccessPermissions { viewAll?:boolean; manageProjects?:boolean; manageTasks?:boolean; viewDecisions?:boolean; manageDecisions?:boolean; useAI?:boolean; manageMembers?:boolean }

export interface WorkspaceInfo {
  id: string
  name: string
  role: string
  members: { id:string; public_id:string; display_name:string; external_user_id?:string; role:string; permissions:AccessPermissions; project_ids:string[] }[]
  invites: { id:string; code:string; label:string; permissions:AccessPermissions; project_ids:string[]; expires_at:string }[]
  projects: {id:string;name:string;color:string}[]
}
