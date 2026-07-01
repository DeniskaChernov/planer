import 'dotenv/config'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { hasDatabase, initDatabase, pool } from './db.js'
import { founderInstructions } from './prompt.js'

const app = express()
app.set('trust proxy',1)
const port = Number(process.env.PORT || 3000)
const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const fallbackProfile = { name:'Новый пользователь', role:'Участник', bio:'', vision:'', goals:[], constraints:'', workingStyle:'' }
const cookieName='founder_session'

app.use(express.json({limit:'2mb'}))
app.use(cookieParser())
const authLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много попыток. Попробуйте через 15 минут.'}})

type Permissions={viewAll?:boolean;manageProjects?:boolean;manageTasks?:boolean;viewDecisions?:boolean;manageDecisions?:boolean;useAI?:boolean;manageMembers?:boolean}
type SessionUser={accountId:string;publicId:string;displayName:string;externalUserId?:string;profile:Record<string,unknown>;workspaceId:string;workspaceName:string;role:string;permissions:Permissions;projectIds:string[]}
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex')
const normalizeId=(value:unknown)=>String(value||'').trim().toLowerCase()
const validId=(id:string)=>/^[a-z0-9_-]{4,32}$/.test(id)
const validPin=(pin:unknown)=>/^\d{4,12}$/.test(String(pin||''))

async function sessionUser(req:express.Request):Promise<SessionUser|null>{
  if(!pool)return null
  const token=req.cookies?.[cookieName]
  if(!token)return null
  const result=await pool.query(`SELECT a.id account_id,a.public_id,a.display_name,a.external_user_id,a.profile,w.id workspace_id,w.name workspace_name,m.role,m.permissions,m.project_ids
    FROM planner_sessions s JOIN planner_accounts a ON a.id=s.account_id JOIN planner_memberships m ON m.account_id=a.id JOIN planner_workspaces w ON w.id=m.workspace_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW() ORDER BY m.created_at LIMIT 1`,[hashToken(token)])
  const r=result.rows[0]; if(!r)return null
  return {accountId:r.account_id,publicId:r.public_id,displayName:r.display_name,externalUserId:r.external_user_id,profile:r.profile||{},workspaceId:r.workspace_id,workspaceName:r.workspace_name,role:r.role,permissions:r.permissions||{},projectIds:Array.isArray(r.project_ids)?r.project_ids:[]}
}
async function createSession(res:express.Response,accountId:string){
  const token=randomBytes(32).toString('base64url')
  await pool!.query(`DELETE FROM planner_sessions WHERE expires_at<NOW()`)
  await pool!.query(`INSERT INTO planner_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')`,[hashToken(token),accountId])
  res.cookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:30*24*60*60*1000,path:'/'})
}
async function requireUser(req:express.Request,res:express.Response):Promise<SessionUser|null>{const user=await sessionUser(req);if(!user)res.status(401).json({error:'Войдите в Planner'});return user}
const allowed=(user:SessionUser,key:keyof Permissions)=>user.role==='owner'||Boolean(user.permissions[key])
const filterState=(state:any,user:SessionUser)=>{const source=state&&typeof state==='object'?state:{focus:'',projects:[],decisions:[]};const allProjects=Array.isArray(source.projects)?source.projects:[];const projects=user.role==='owner'||user.permissions.viewAll?allProjects:allProjects.filter((p:any)=>user.projectIds.includes(String(p.id)));return {...source,projects,decisions:allowed(user,'viewDecisions')?(source.decisions||[]):[]}}
const mergeState=(current:any,incoming:any,user:SessionUser)=>{if(user.role==='owner')return incoming;const next={...current};const canTouch=(id:string)=>user.permissions.viewAll||user.projectIds.includes(id);if(allowed(user,'manageProjects'))next.projects=(current.projects||[]).map((p:any)=>{const edited=(incoming.projects||[]).find((x:any)=>x.id===p.id);return edited&&canTouch(p.id)?edited:p});else if(allowed(user,'manageTasks'))next.projects=(current.projects||[]).map((p:any)=>{const edited=(incoming.projects||[]).find((x:any)=>x.id===p.id);return edited&&canTouch(p.id)?{...p,tasks:edited.tasks||p.tasks}:p});if(allowed(user,'manageDecisions'))next.decisions=incoming.decisions||current.decisions;if(user.permissions.manageProjects)next.focus=incoming.focus??current.focus;return next}
const activityFor=(before:any,after:any)=>{const bp=before?.projects||[],ap=after?.projects||[],bd=before?.decisions||[],ad=after?.decisions||[];if(ap.length>bp.length){const item=ap.find((p:any)=>!bp.some((x:any)=>x.id===p.id));return {action:'project.created',entityType:'project',entityId:item?.id,metadata:{title:item?.name}}}if(ap.length<bp.length)return {action:'project.deleted',entityType:'project',metadata:{}};if(ad.length>bd.length){const item=ad.find((d:any)=>!bd.some((x:any)=>x.id===d.id));return {action:'decision.created',entityType:'decision',entityId:item?.id,metadata:{title:item?.title}}}const beforeTasks=bp.flatMap((p:any)=>p.tasks||[]),afterTasks=ap.flatMap((p:any)=>p.tasks||[]);if(afterTasks.length>beforeTasks.length){const item=afterTasks.find((t:any)=>!beforeTasks.some((x:any)=>x.id===t.id));return {action:'task.created',entityType:'task',entityId:item?.id,metadata:{title:item?.title}}}if(before?.focus!==after?.focus)return {action:'focus.updated',entityType:'workspace',metadata:{title:after?.focus||''}};return {action:'workspace.updated',entityType:'workspace',metadata:{}}}

app.get('/api/health',(_req,res)=>res.json({ok:true,database:hasDatabase,ai:Boolean(openai)}))
app.get('/api/auth/me',async(req,res,next)=>{try{const user=await sessionUser(req);res.json({user})}catch(e){next(e)}})
app.post('/api/auth/register',authLimiter,async(req,res,next)=>{try{
  if(!pool)return res.status(503).json({error:'Для регистрации подключите PostgreSQL'})
  const publicId=normalizeId(req.body.publicId),pin=String(req.body.pin||''),name=String(req.body.name||'').trim()
  if(!validId(publicId))return res.status(400).json({error:'ID: 4–32 символа, латиница, цифры, _ или -'})
  if(!validPin(pin))return res.status(400).json({error:'PIN должен содержать 4–12 цифр'})
  if(name.length<2)return res.status(400).json({error:'Укажите имя'})
  const client=await pool.connect();try{await client.query('BEGIN')
    const exists=await client.query(`SELECT 1 FROM planner_accounts WHERE public_id=$1`,[publicId]);if(exists.rowCount)throw new Error('ID уже занят')
    let workspaceId:string,role='member',permissions:Permissions={},projectIds:string[]=[];const invite=normalizeId(req.body.inviteCode);let inviteId:string|undefined
    if(invite){const found=await client.query(`SELECT id,workspace_id,permissions,project_ids FROM planner_invites WHERE lower(code)=lower($1) AND used_by IS NULL AND expires_at>NOW() FOR UPDATE`,[invite]);if(!found.rowCount)throw new Error('Приглашение недействительно или уже использовано');const row=found.rows[0];inviteId=row.id;workspaceId=row.workspace_id;permissions=row.permissions||{};projectIds=Array.isArray(row.project_ids)?row.project_ids:[]}
    else{role='owner';permissions={viewAll:true,manageProjects:true,manageTasks:true,viewDecisions:true,manageDecisions:true,useAI:true,manageMembers:true};const workspaceName=String(req.body.workspaceName||'Моё пространство').trim();const legacyCode=randomBytes(8).toString('hex');const emptyState={focus:'',projects:[],decisions:[]};const w=await client.query(`INSERT INTO planner_workspaces(name,invite_code,planner_state) VALUES($1,$2,$3) RETURNING id`,[workspaceName,legacyCode,JSON.stringify(emptyState)]);workspaceId=w.rows[0].id}
    const profile={...fallbackProfile,name};const account=await client.query(`INSERT INTO planner_accounts(public_id,display_name,pin_hash,external_user_id,profile) VALUES($1,$2,$3,$4,$5) RETURNING id`,[publicId,name,await bcrypt.hash(pin,12),req.body.externalUserId||null,JSON.stringify(profile)])
    await client.query(`INSERT INTO planner_memberships(account_id,workspace_id,role,permissions,project_ids) VALUES($1,$2,$3,$4,$5)`,[account.rows[0].id,workspaceId,role,JSON.stringify(permissions),JSON.stringify(projectIds)])
    if(inviteId)await client.query(`UPDATE planner_invites SET used_by=$2 WHERE id=$1`,[inviteId,account.rows[0].id])
    await client.query(`INSERT INTO users(id,profile,planner_state) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,[account.rows[0].id,JSON.stringify(profile),JSON.stringify(req.body.state||{})])
    await client.query('COMMIT');await createSession(res,account.rows[0].id);res.json({ok:true})
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}catch(e){if(e instanceof Error&&['ID уже занят','Приглашение недействительно или уже использовано'].includes(e.message))return res.status(400).json({error:e.message});if((e as {code?:string}).code==='23505')return res.status(400).json({error:'Этот Planner ID или Finance ID уже используется'});next(e)}})
app.post('/api/auth/login',authLimiter,async(req,res,next)=>{try{
  if(!pool)return res.status(503).json({error:'База данных не подключена'})
  const result=await pool.query(`SELECT id,pin_hash FROM planner_accounts WHERE public_id=$1`,[normalizeId(req.body.publicId)])
  const account=result.rows[0];if(!account||!await bcrypt.compare(String(req.body.pin||''),account.pin_hash))return res.status(401).json({error:'Неверный ID или PIN'})
  await createSession(res,account.id);res.json({ok:true})
}catch(e){next(e)}})
app.post('/api/auth/logout',async(req,res,next)=>{try{const token=req.cookies?.[cookieName];if(pool&&token)await pool.query(`DELETE FROM planner_sessions WHERE token_hash=$1`,[hashToken(token)]);res.clearCookie(cookieName,{path:'/'});res.json({ok:true})}catch(e){next(e)}})

app.post('/api/bootstrap',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const data=await pool!.query(`SELECT planner_state,state_version,updated_at FROM planner_workspaces WHERE id=$1`,[user.workspaceId]);res.json({profile:user.profile,state:filterState(data.rows[0]?.planner_state||{focus:'',projects:[],decisions:[]},user),version:data.rows[0]?.state_version||1,updatedAt:data.rows[0]?.updated_at,persistence:'postgres',user})}catch(e){next(e)}})
app.put('/api/state',async(req,res,next)=>{const user=await requireUser(req,res);if(!user)return;const client=await pool!.connect();try{await client.query('BEGIN');const row=(await client.query(`SELECT planner_state,state_version FROM planner_workspaces WHERE id=$1 FOR UPDATE`,[user.workspaceId])).rows[0];const expected=Number(req.body.version);if(!Number.isInteger(expected)||expected!==row.state_version){await client.query('ROLLBACK');return res.status(409).json({error:'Пространство уже изменено другим участником',state:filterState(row.planner_state,user),version:row.state_version})}const merged=mergeState(row.planner_state,req.body.state,user);const updated=await client.query(`UPDATE planner_workspaces SET planner_state=$2,state_version=state_version+1,updated_at=NOW() WHERE id=$1 RETURNING state_version,updated_at`,[user.workspaceId,JSON.stringify(merged)]);const activity=activityFor(row.planner_state,merged);await client.query(`INSERT INTO planner_activity(workspace_id,account_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6)`,[user.workspaceId,user.accountId,activity.action,activity.entityType,activity.entityId||null,JSON.stringify(activity.metadata)]);await client.query('COMMIT');res.json({ok:true,persistence:'postgres',version:updated.rows[0].state_version,updatedAt:updated.rows[0].updated_at})}catch(e){await client.query('ROLLBACK');next(e)}finally{client.release()}})
app.put('/api/profile',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;await pool!.query(`UPDATE planner_accounts SET profile=$2,display_name=$3,updated_at=NOW() WHERE id=$1`,[user.accountId,JSON.stringify(req.body),req.body.name||user.displayName]);await pool!.query(`UPDATE users SET profile=$2,updated_at=NOW() WHERE id=$1`,[user.accountId,JSON.stringify(req.body)]);res.json({ok:true})}catch(e){next(e)}})
app.put('/api/account',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const externalUserId=String(req.body.externalUserId||'').trim()||null;await pool!.query(`UPDATE planner_accounts SET external_user_id=$2,updated_at=NOW() WHERE id=$1`,[user.accountId,externalUserId]);res.json({ok:true,externalUserId})}catch(e){if((e as {code?:string}).code==='23505')return res.status(400).json({error:'Этот Finance ID уже привязан к другому аккаунту'});next(e)}})
app.get('/api/workspace',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const canManage=user.role==='owner'||Boolean(user.permissions.manageMembers);const members=await pool!.query(`SELECT a.id,a.public_id,a.display_name,a.external_user_id,m.role,m.permissions,m.project_ids FROM planner_memberships m JOIN planner_accounts a ON a.id=m.account_id WHERE m.workspace_id=$1 ${canManage?'':'AND a.id=$2'} ORDER BY m.created_at`,canManage?[user.workspaceId]:[user.workspaceId,user.accountId]);const invites=canManage?(await pool!.query(`SELECT id,code,label,permissions,project_ids,expires_at FROM planner_invites WHERE workspace_id=$1 AND used_by IS NULL AND expires_at>NOW() ORDER BY created_at DESC`,[user.workspaceId])).rows:[];const state=(await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[user.workspaceId])).rows[0]?.planner_state||{};const visible=filterState(state,user);res.json({id:user.workspaceId,name:user.workspaceName,role:user.role,members:members.rows,invites,projects:(visible.projects||[]).map((p:any)=>({id:p.id,name:p.name,color:p.color}))})}catch(e){next(e)}})
app.post('/api/workspace/invites',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;if(user.role!=='owner'&&!user.permissions.manageMembers)return res.status(403).json({error:'Недостаточно прав'});const permissions:Permissions={viewAll:Boolean(req.body.permissions?.viewAll),manageProjects:Boolean(req.body.permissions?.manageProjects),manageTasks:Boolean(req.body.permissions?.manageTasks),viewDecisions:Boolean(req.body.permissions?.viewDecisions),manageDecisions:Boolean(req.body.permissions?.manageDecisions),useAI:Boolean(req.body.permissions?.useAI),manageMembers:false};const projectIds=Array.isArray(req.body.projectIds)?req.body.projectIds.map(String):[];const code=randomBytes(9).toString('base64url').toLowerCase();const result=await pool!.query(`INSERT INTO planner_invites(workspace_id,code,label,permissions,project_ids,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,code,label,permissions,project_ids,expires_at`,[user.workspaceId,code,String(req.body.label||'Новый участник').slice(0,80),JSON.stringify(permissions),JSON.stringify(projectIds),user.accountId]);res.json({invite:result.rows[0]})}catch(e){next(e)}})
app.delete('/api/workspace/invites/:inviteId',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;if(user.role!=='owner'&&!user.permissions.manageMembers)return res.status(403).json({error:'Недостаточно прав'});const result=await pool!.query(`DELETE FROM planner_invites WHERE id=$1 AND workspace_id=$2 AND used_by IS NULL RETURNING label`,[req.params.inviteId,user.workspaceId]);if(!result.rowCount)return res.status(404).json({error:'Приглашение уже использовано или отозвано'});await pool!.query(`INSERT INTO planner_activity(workspace_id,account_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'invite.revoked','invite',$3,$4)`,[user.workspaceId,user.accountId,req.params.inviteId,JSON.stringify({title:result.rows[0].label})]);res.json({ok:true})}catch(e){next(e)}})
app.put('/api/workspace/members/:accountId',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;if(user.role!=='owner')return res.status(403).json({error:'Только владелец изменяет права'});const permissions:Permissions={viewAll:Boolean(req.body.permissions?.viewAll),manageProjects:Boolean(req.body.permissions?.manageProjects),manageTasks:Boolean(req.body.permissions?.manageTasks),viewDecisions:Boolean(req.body.permissions?.viewDecisions),manageDecisions:Boolean(req.body.permissions?.manageDecisions),useAI:Boolean(req.body.permissions?.useAI),manageMembers:false};const projectIds=Array.isArray(req.body.projectIds)?req.body.projectIds.map(String):[];const result=await pool!.query(`UPDATE planner_memberships SET permissions=$3,project_ids=$4 WHERE workspace_id=$1 AND account_id=$2 AND role<>'owner' RETURNING account_id`,[user.workspaceId,req.params.accountId,JSON.stringify(permissions),JSON.stringify(projectIds)]);if(!result.rowCount)return res.status(404).json({error:'Участник не найден'});res.json({ok:true})}catch(e){next(e)}})
app.delete('/api/workspace/members/:accountId',async(req,res,next)=>{const user=await requireUser(req,res);if(!user)return;if(user.role!=='owner')return res.status(403).json({error:'Только владелец удаляет участников'});const client=await pool!.connect();try{await client.query('BEGIN');const member=await client.query(`SELECT a.display_name FROM planner_memberships m JOIN planner_accounts a ON a.id=m.account_id WHERE m.workspace_id=$1 AND m.account_id=$2 AND m.role<>'owner' FOR UPDATE`,[user.workspaceId,req.params.accountId]);if(!member.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Участник не найден'})}await client.query(`DELETE FROM planner_memberships WHERE workspace_id=$1 AND account_id=$2 AND role<>'owner'`,[user.workspaceId,req.params.accountId]);await client.query(`DELETE FROM planner_sessions WHERE account_id=$1`,[req.params.accountId]);await client.query(`INSERT INTO planner_activity(workspace_id,account_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'member.removed','member',$3,$4)`,[user.workspaceId,user.accountId,req.params.accountId,JSON.stringify({title:member.rows[0].display_name})]);await client.query('COMMIT');res.json({ok:true})}catch(e){await client.query('ROLLBACK');next(e)}finally{client.release()}})
app.get('/api/activity',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const seeAll=user.role==='owner'||Boolean(user.permissions.viewAll);const result=await pool!.query(`SELECT x.id,x.action,x.entity_type,x.entity_id,x.metadata,x.created_at,a.display_name,a.public_id FROM planner_activity x LEFT JOIN planner_accounts a ON a.id=x.account_id WHERE x.workspace_id=$1 ${seeAll?'':'AND x.account_id=$2'} ORDER BY x.created_at DESC LIMIT 30`,seeAll?[user.workspaceId]:[user.workspaceId,user.accountId]);res.json({items:result.rows})}catch(e){next(e)}})

app.post('/api/ai/chat',async(req,res,next)=>{try{
  const auth=await requireUser(req,res);if(!auth)return;if(!allowed(auth,'useAI'))return res.status(403).json({error:'AI не разрешён для этого профиля'});if(!openai)return res.status(503).json({error:'OPENAI_API_KEY не настроен на сервере'})
  const {message,context='company'}=req.body;if(!message?.trim())return res.status(400).json({error:'Сообщение пустое'})
  const rawState=(await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[auth.workspaceId])).rows[0]?.planner_state||{};const state=filterState(rawState,auth)
  let conversationId=req.body.conversationId as string|undefined;let history:{role:'user'|'assistant';content:string}[]=[]
  if(conversationId){const owned=await pool!.query(`SELECT id FROM conversations WHERE id=$1 AND user_id=$2`,[conversationId,auth.accountId]);if(!owned.rowCount)return res.status(404).json({error:'Диалог не найден'})}
  if(!conversationId){const latest=await pool!.query(`SELECT id FROM conversations WHERE user_id=$1 AND context=$2 ORDER BY updated_at DESC LIMIT 1`,[auth.accountId,context]);conversationId=latest.rows[0]?.id;if(!conversationId){const c=await pool!.query(`INSERT INTO conversations(user_id,context,title) VALUES($1,$2,$3) RETURNING id`,[auth.accountId,context,message.slice(0,80)]);conversationId=c.rows[0].id}}
  const h=await pool!.query(`SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20`,[conversationId]);history=h.rows.reverse();await pool!.query(`INSERT INTO messages(conversation_id,role,content) VALUES($1,'user',$2)`,[conversationId,message])
  const response=await openai.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.4-mini',instructions:founderInstructions(auth.profile,state,context),input:[...history.map(m=>({role:m.role,content:m.content})),{role:'user',content:message}],reasoning:{effort:'low'}})
  const answer=response.output_text||'Не удалось сформировать ответ.';await pool!.query(`INSERT INTO messages(conversation_id,role,content) VALUES($1,'assistant',$2)`,[conversationId,answer]);await pool!.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`,[conversationId]);res.json({answer,conversationId})
}catch(e){next(e)}})

app.use(express.static(dist))
app.get('/{*splat}',(_req,res)=>res.sendFile(join(dist,'index.html')))
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(err);res.status(500).json({error:err instanceof Error?err.message:'Внутренняя ошибка сервера'})})
initDatabase().then(()=>app.listen(port,'::',()=>console.log(`Founder OS running on :${port}`))).catch(error=>{console.error('Database init failed',error);process.exit(1)})
