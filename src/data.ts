import type { PlannerState, UserProfile } from './types'

export const defaultProfile: UserProfile = {
  name: '',
  role: '',
  bio: '',
  vision: '',
  goals: [],
  constraints: '',
  workingStyle: '',
}

export const initialState: PlannerState = {
  focus: '',
  decisions: [],
  projects: [],
}
