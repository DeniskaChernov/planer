import type { AuthUser, PlannerState, UserProfile, WorkspaceInfo } from './types'

async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{...options,credentials:'include',headers:{'Content-Type':'application/json',...options?.headers}})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||'Ошибка сервера')
  return data
}
export const api={
  me:()=>request<{user:AuthUser|null}>('/api/auth/me'),
  login:(publicId:string,pin:string)=>request<{ok:true}>('/api/auth/login',{method:'POST',body:JSON.stringify({publicId,pin})}),
  register:(data:{publicId:string;pin:string;name:string;workspaceName?:string;inviteCode?:string;externalUserId?:string;state:PlannerState})=>request<{ok:true}>('/api/auth/register',{method:'POST',body:JSON.stringify(data)}),
  logout:()=>request('/api/auth/logout',{method:'POST'}),
  bootstrap:(state:PlannerState)=>request<{state:PlannerState;profile:UserProfile;persistence:string;user:AuthUser}>('/api/bootstrap',{method:'POST',body:JSON.stringify({state})}),
  saveState:(state:PlannerState)=>request('/api/state',{method:'PUT',body:JSON.stringify(state)}),
  saveProfile:(profile:UserProfile)=>request('/api/profile',{method:'PUT',body:JSON.stringify(profile)}),
  saveAccount:(externalUserId:string)=>request<{ok:true;externalUserId?:string}>('/api/account',{method:'PUT',body:JSON.stringify({externalUserId})}),
  workspace:()=>request<WorkspaceInfo>('/api/workspace'),
  chat:(payload:{message:string;context:string;conversationId?:string})=>request<{answer:string;conversationId:string}>('/api/ai/chat',{method:'POST',body:JSON.stringify(payload)}),
}
