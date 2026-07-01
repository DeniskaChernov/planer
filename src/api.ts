import type { AccessPermissions, ActivityItem, AIConversation, AIMessage, AuthUser, FinanceStatus, PlannerState, UserProfile, WorkspaceInfo } from './types'

export class ApiError extends Error { status:number; data:Record<string,unknown>; constructor(message:string,status:number,data:Record<string,unknown>){super(message);this.status=status;this.data=data} }

async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{...options,credentials:'include',headers:{'Content-Type':'application/json',...options?.headers}})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new ApiError(data.error||'Ошибка сервера',response.status,data)
  return data
}
export const api={
  me:()=>request<{user:AuthUser|null}>('/api/auth/me'),
  login:(publicId:string,pin:string)=>request<{ok:true}>('/api/auth/login',{method:'POST',body:JSON.stringify({publicId,pin})}),
  register:(data:{publicId:string;pin:string;name:string;workspaceName?:string;inviteCode?:string;externalUserId?:string;state:PlannerState})=>request<{ok:true}>('/api/auth/register',{method:'POST',body:JSON.stringify(data)}),
  logout:()=>request('/api/auth/logout',{method:'POST'}),
  bootstrap:(state:PlannerState)=>request<{state:PlannerState;profile:UserProfile;persistence:string;user:AuthUser;version:number;updatedAt:string}>('/api/bootstrap',{method:'POST',body:JSON.stringify({state})}),
  saveState:(state:PlannerState,version:number)=>request<{ok:true;version:number;updatedAt:string}>('/api/state',{method:'PUT',body:JSON.stringify({state,version})}),
  saveProfile:(profile:UserProfile)=>request('/api/profile',{method:'PUT',body:JSON.stringify(profile)}),
  saveAccount:(externalUserId:string)=>request<{ok:true;externalUserId?:string}>('/api/account',{method:'PUT',body:JSON.stringify({externalUserId})}),
  financeStatus:()=>request<FinanceStatus>('/api/integrations/finance'),
  workspace:()=>request<WorkspaceInfo>('/api/workspace'),
  createInvite:(data:{label:string;permissions:AccessPermissions;projectIds:string[]})=>request<{invite:WorkspaceInfo['invites'][number]}>('/api/workspace/invites',{method:'POST',body:JSON.stringify(data)}),
  revokeInvite:(inviteId:string)=>request<{ok:true}>(`/api/workspace/invites/${inviteId}`,{method:'DELETE'}),
  updateMember:(accountId:string,data:{permissions:AccessPermissions;projectIds:string[]})=>request(`/api/workspace/members/${accountId}`,{method:'PUT',body:JSON.stringify(data)}),
  removeMember:(accountId:string)=>request<{ok:true}>(`/api/workspace/members/${accountId}`,{method:'DELETE'}),
  activity:()=>request<{items:ActivityItem[]}>('/api/activity'),
  conversations:()=>request<{items:AIConversation[]}>('/api/ai/conversations'),
  conversationMessages:(id:string)=>request<{items:AIMessage[]}>(`/api/ai/conversations/${id}/messages`),
  deleteConversation:(id:string)=>request<{ok:true}>(`/api/ai/conversations/${id}`,{method:'DELETE'}),
  chat:(payload:{message:string;context:string;conversationId?:string})=>request<{answer:string;conversationId:string}>('/api/ai/chat',{method:'POST',body:JSON.stringify(payload)}),
}
