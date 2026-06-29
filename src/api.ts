import type { PlannerState, UserProfile } from './types'

const headers = {'Content-Type':'application/json','x-user-id':'founder'}
async function request<T>(url:string, options?:RequestInit):Promise<T>{
  const response=await fetch(url,{...options,headers:{...headers,...options?.headers}})
  const data=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(data.error||'Ошибка сервера')
  return data
}
export const api={
  bootstrap:(state:PlannerState,profile:UserProfile)=>request<{state:PlannerState;profile:UserProfile;persistence:string}>('/api/bootstrap',{method:'POST',body:JSON.stringify({state,profile})}),
  saveState:(state:PlannerState)=>request('/api/state',{method:'PUT',body:JSON.stringify(state)}),
  saveProfile:(profile:UserProfile)=>request('/api/profile',{method:'PUT',body:JSON.stringify(profile)}),
  chat:(payload:{message:string;context:string;conversationId?:string;state:PlannerState;profile:UserProfile})=>request<{answer:string;conversationId:string}>('/api/ai/chat',{method:'POST',body:JSON.stringify(payload)}),
}
