import { useEffect, useState } from 'react'
import { AlertTriangle, Check, CircleCheck, Copy, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import { api } from './api'
import type { AccessPermissions, WorkspaceInfo } from './types'

const permissionOptions:{key:keyof AccessPermissions;label:string;description:string}[]=[
  {key:'viewAll',label:'Все проекты',description:'Видит все текущие и будущие проекты'},
  {key:'manageTasks',label:'Работа с задачами',description:'Создаёт и меняет задачи доступных проектов'},
  {key:'manageProjects',label:'Управление проектами',description:'Меняет структуру доступных проектов'},
  {key:'viewDecisions',label:'Видит решения',description:'Получает доступ к журналу решений'},
  {key:'manageDecisions',label:'Работа с решениями',description:'Фиксирует и проверяет решения'},
  {key:'useAI',label:'Founder AI',description:'Использует AI только в разрешённом контексте'},
]

type Member=WorkspaceInfo['members'][number]
type Editor={kind:'invite';label:string}|{kind:'member';member:Member}

export default function TeamAccess(){
  const [data,setData]=useState<WorkspaceInfo>()
  const [editor,setEditor]=useState<Editor>()
  const [permissions,setPermissions]=useState<AccessPermissions>({manageTasks:true})
  const [projectIds,setProjectIds]=useState<string[]>([])
  const [created,setCreated]=useState('')
  const [busy,setBusy]=useState(false)
  const [flash,setFlash]=useState<{kind:'ok'|'error';text:string}>()
  const notify=(kind:'ok'|'error',text:string)=>{setFlash({kind,text});window.setTimeout(()=>setFlash(undefined),3200)}
  const load=()=>api.workspace().then(setData).catch(e=>notify('error',e instanceof Error?e.message:'Не удалось загрузить доступы'))
  useEffect(()=>{load()},[])
  if(!data)return <div className="access-loading">Загружаем защищённое пространство…</div>

  const openInvite=()=>{setPermissions({manageTasks:true});setProjectIds([]);setEditor({kind:'invite',label:''})}
  const openMember=(member:Member)=>{setPermissions(member.permissions||{});setProjectIds(member.project_ids||[]);setEditor({kind:'member',member})}
  const togglePermission=(key:keyof AccessPermissions)=>setPermissions(p=>({...p,[key]:!p[key]}))
  const toggleProject=(id:string)=>setProjectIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])
  const copy=async(value:string)=>{await navigator.clipboard.writeText(value);notify('ok','Код скопирован')}
  const revoke=async(id:string)=>{if(!confirm('Отозвать это приглашение? Код перестанет работать.'))return;try{await api.revokeInvite(id);await load();notify('ok','Приглашение отозвано')}catch(e){notify('error',e instanceof Error?e.message:'Не удалось отозвать приглашение')}}
  const remove=async(member:Member)=>{if(!confirm(`Удалить ${member.display_name} из пространства? Доступ прекратится сразу.`))return;try{await api.removeMember(member.id);await load();notify('ok','Участник удалён')}catch(e){notify('error',e instanceof Error?e.message:'Не удалось удалить участника')}}
  const save=async()=>{
    if(!editor||busy)return
    setBusy(true)
    try{
      if(editor.kind==='invite'){
        const result=await api.createInvite({label:editor.label||'Новый участник',permissions,projectIds})
        setCreated(result.invite.code)
      }else await api.updateMember(editor.member.id,{permissions,projectIds})
      setEditor(undefined)
      await load()
      notify('ok',editor.kind==='invite'?'Приглашение готово':'Права сохранены')
    }catch(e){notify('error',e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}
  }

  return <>
    <div className="access-title">
      <div><span>PLATFORM CORE · ДОСТУП</span><h1>{data.name}</h1><p>Каждый участник видит только явно разрешённый контекст. Приглашение одноразовое и действует 14 дней.</p></div>
      {data.role==='owner'&&<button onClick={openInvite}><UserPlus/>Создать приглашение</button>}
    </div>
    {flash&&<div className={`access-flash ${flash.kind}`}>{flash.kind==='ok'?<CircleCheck/>:<AlertTriangle/>}{flash.text}</div>}
    {created&&<div className="created-invite"><ShieldCheck/><div><b>Приглашение создано</b><span>{created}</span></div><button onClick={()=>copy(created)}><Copy/>Копировать</button><button aria-label="Закрыть" onClick={()=>setCreated('')}><X/></button></div>}
    <div className="access-grid">
      <section><header><Users/><div><b>Участники</b><span>{data.members.length}</span></div></header>{data.members.map(member=><article key={member.id}><span>{member.display_name.slice(0,1)}</span><div><b>{member.display_name}</b><small>@{member.public_id}{member.external_user_id?` · Finance ${member.external_user_id}`:''}</small><p>{member.role==='owner'?'Полный доступ':permissionOptions.filter(x=>member.permissions?.[x.key]).map(x=>x.label).join(' · ')||'Только просмотр выбранных проектов'}</p></div><em>{member.role==='owner'?'Владелец':'Участник'}</em>{data.role==='owner'&&member.role!=='owner'&&<><button className="member-edit" onClick={()=>openMember(member)} aria-label="Настроить доступ"><Pencil/></button><button className="danger-action" onClick={()=>remove(member)} aria-label="Удалить участника"><Trash2/></button></>}</article>)}</section>
      <section><header><KeyRound/><div><b>Активные приглашения</b><span>{data.invites.length}</span></div></header>{data.invites.map(invite=><article key={invite.id}><span className="invite-avatar"><KeyRound/></span><div><b>{invite.label}</b><small>{invite.code}</small><p>До {new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(new Date(invite.expires_at))}</p></div><button onClick={()=>copy(invite.code)} aria-label="Копировать"><Copy/></button><button className="danger-action" onClick={()=>revoke(invite.id)} aria-label="Отозвать приглашение"><Trash2/></button></article>)}{!data.invites.length&&<div className="no-invites">Нет активных приглашений</div>}</section>
    </div>
    {editor&&<div className="access-modal" onMouseDown={e=>e.target===e.currentTarget&&setEditor(undefined)}><section><header><div><span>{editor.kind==='invite'?'НОВОЕ ПРИГЛАШЕНИЕ':'ПРАВА УЧАСТНИКА'}</span><h2>Выберите границы доступа</h2></div><button onClick={()=>setEditor(undefined)}><X/></button></header><div className="access-form">
      {editor.kind==='invite'?<label>Для кого<input value={editor.label} onChange={e=>setEditor({...editor,label:e.target.value})} placeholder="Например, Анна · семья" autoFocus/></label>:<div className="editing-member"><span>{editor.member.display_name.slice(0,1)}</span><div><b>{editor.member.display_name}</b><small>@{editor.member.public_id}</small></div></div>}
      <h3>Что можно делать</h3><div className="permission-list">{permissionOptions.map(item=><button className={permissions[item.key]?'selected':''} onClick={()=>togglePermission(item.key)} key={item.key}><i>{permissions[item.key]&&<Check/>}</i><div><b>{item.label}</b><span>{item.description}</span></div></button>)}</div>
      {!permissions.viewAll&&<><h3>Какие проекты видны</h3><div className="project-access-list">{data.projects.map(project=><button className={projectIds.includes(project.id)?'selected':''} onClick={()=>toggleProject(project.id)} key={project.id}><i style={{background:project.color}}/>{project.name}{projectIds.includes(project.id)&&<Check/>}</button>)}{!data.projects.length&&<p>Сначала создайте проект. Участник увидит пустое защищённое пространство.</p>}</div></>}
      <aside><ShieldCheck/><p>Права проверяются сервером. Прямой запрос API не даст доступа к чужим данным.</p></aside>
      <button className="create-access" disabled={busy} onClick={save}><Plus/>{busy?'Сохраняем…':editor.kind==='invite'?'Создать одноразовый код':'Сохранить права'}</button>
    </div></section></div>}
  </>
}
