import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { DatabaseZap, Link2, Save } from 'lucide-react'
import { api } from './api'
import type { AuthUser } from './types'

export default function ProfileBridge({auth,setAuth,children}:{auth:AuthUser;setAuth:Dispatch<SetStateAction<AuthUser|null|undefined>>;children:ReactNode}){
  const [financeId,setFinanceId]=useState(auth.externalUserId||'')
  const [status,setStatus]=useState<'idle'|'saving'|'saved'|'error'>('idle')
  const save=async()=>{setStatus('saving');try{const r=await api.saveAccount(financeId);setAuth(u=>u?{...u,externalUserId:r.externalUserId}:u);setStatus('saved')}catch{setStatus('error')}}
  return <><section className="finance-link-card"><span><DatabaseZap/></span><div><b>Связь с Finance</b><p>Один стабильный ID объединяет профиль между приложениями, не смешивая базы данных.</p></div><label><Link2 size={14}/><input value={financeId} onChange={e=>setFinanceId(e.target.value)} placeholder="Finance user ID"/></label><button onClick={save} disabled={status==='saving'}><Save size={14}/>{status==='saving'?'Сохраняем':status==='saved'?'Связано':status==='error'?'ID уже занят':'Сохранить'}</button></section>{children}</>
}
