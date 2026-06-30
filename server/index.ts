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

app.post('/api/bootstrap',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const data=await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[user.workspaceId]);res.json({profile:user.profile,state:filterState(data.rows[0]?.planner_state||{focus:'',projects:[],decisions:[]},user),persistence:'postgres',user})}catch(e){next(e)}})
app.put('/api/state',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const current=(await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[user.workspaceId])).rows[0]?.planner_state||{};const merged=mergeState(current,req.body,user);await pool!.query(`UPDATE planner_workspaces SET planner_state=$2,updated_at=NOW() WHERE id=$1`,[user.workspaceId,JSON.stringify(merged)]);res.json({ok:true,persistence:'postgres'})}catch(e){next(e)}})
app.put('/api/profile',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;await pool!.query(`UPDATE planner_accounts SET profile=$2,display_name=$3,updated_at=NOW() WHERE id=$1`,[user.accountId,JSON.stringify(req.body),req.body.name||user.displayName]);await pool!.query(`UPDATE users SET profile=$2,updated_at=NOW() WHERE id=$1`,[user.accountId,JSON.stringify(req.body)]);res.json({ok:true})}catch(e){next(e)}})
app.put('/api/account',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const externalUserId=String(req.body.externalUserId||'').trim()||null;await pool!.query(`UPDATE planner_accounts SET external_user_id=$2,updated_at=NOW() WHERE id=$1`,[user.accountId,externalUserId]);res.json({ok:true,externalUserId})}catch(e){if((e as {code?:string}).code==='23505')return res.status(400).json({error:'Этот Finance ID уже привязан к другому аккаунту'});next(e)}})
app.get('/api/workspace',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const canManage=user.role==='owner'||Boolean(user.permissions.manageMembers);const members=await pool!.query(`SELECT a.id,a.public_id,a.display_name,a.external_user_id,m.role,m.permissions,m.project_ids FROM planner_memberships m JOIN planner_accounts a ON a.id=m.account_id WHERE m.workspace_id=$1 ${canManage?'':'AND a.id=$2'} ORDER BY m.created_at`,canManage?[user.workspaceId]:[user.workspaceId,user.accountId]);const invites=canManage?(await pool!.query(`SELECT id,code,label,permissions,project_ids,expires_at FROM planner_invites WHERE workspace_id=$1 AND used_by IS NULL AND expires_at>NOW() ORDER BY created_at DESC`,[user.workspaceId])).rows:[];const state=(await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[user.workspaceId])).rows[0]?.planner_state||{};const visible=filterState(state,user);res.json({id:user.workspaceId,name:user.workspaceName,role:user.role,members:members.rows,invites,projects:(visible.projects||[]).map((p:any)=>({id:p.id,name:p.name,color:p.color}))})}catch(e){next(e)}})
app.post('/api/workspace/invites',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;if(user.role!=='owner'&&!user.permissions.manageMembers)return res.status(403).json({error:'Недостаточно прав'});const permissions:Permissions={viewAll:Boolean(req.body.permissions?.viewAll),manageProjects:Boolean(req.body.permissions?.manageProjects),manageTasks:Boolean(req.body.permissions?.manageTasks),viewDecisions:Boolean(req.body.permissions?.viewDecisions),manageDecisions:Boolean(req.body.permissions?.manageDecisions),useAI:Boolean(req.body.permissions?.useAI),manageMembers:false};const projectIds=Array.isArray(req.body.projectIds)?req.body.projectIds.map(String):[];const code=randomBytes(9).toString('base64url').toLowerCase();const result=await pool!.query(`INSERT INTO planner_invites(workspace_id,code,label,permissions,project_ids,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,code,label,permissions,project_ids,expires_at`,[user.workspaceId,code,String(req.body.label||'Новый участник').slice(0,80),JSON.stringify(permissions),JSON.stringify(projectIds),user.accountId]);res.json({invite:result.rows[0]})}catch(e){next(e)}})
app.put('/api/workspace/members/:accountId',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;if(user.role!=='owner')return res.status(403).json({error:'Только владелец изменяет права'});const permissions={...req.body.permissions,manageMembers:false};await pool!.query(`UPDATE planner_memberships SET permissions=$3,project_ids=$4 WHERE workspace_id=$1 AND account_id=$2 AND role<>'owner'`,[user.workspaceId,req.params.accountId,JSON.stringify(permissions),JSON.stringify(req.body.projectIds||[])]);res.json({ok:true})}catch(e){next(e)}})

app.post('/api/ai/chat',async(req,res,next)=>{try{
  const auth=await requireUser(req,res);if(!auth)return;if(!allowed(auth,'useAI'))return res.status(403).json({error:'AI не разрешён для этого профиля'});if(!openai)return res.status(503).json({error:'OPENAI_API_KEY не настроен на сервере'})
  const {message,context='company'}=req.body;if(!message?.trim())return res.status(400).json({error:'Сообщение пустое'})
  const rawState=(await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[auth.workspaceId])).rows[0]?.planner_state||{};const state=filterState(rawState,auth)
  let conversationId=req.body.conversationId as string|undefined;let history:{role:'user'|'assistant';content:string}[]=[]
  if(!conversationId){const latest=await pool!.query(`SELECT id FROM conversations WHERE user_id=$1 AND context=$2 ORDER BY updated_at DESC LIMIT 1`,[auth.accountId,context]);conversationId=latest.rows[0]?.id;if(!conversationId){const c=await pool!.query(`INSERT INTO conversations(user_id,context,title) VALUES($1,$2,$3) RETURNING id`,[auth.accountId,context,message.slice(0,80)]);conversationId=c.rows[0].id}}
  const h=await pool!.query(`SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20`,[conversationId]);history=h.rows.reverse();await pool!.query(`INSERT INTO messages(conversation_id,role,content) VALUES($1,'user',$2)`,[conversationId,message])
  const response=await openai.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.4-mini',instructions:founderInstructions(auth.profile,state,context),input:[...history.map(m=>({role:m.role,content:m.content})),{role:'user',content:message}],reasoning:{effort:'low'}})
  const answer=response.output_text||'Не удалось сформировать ответ.';await pool!.query(`INSERT INTO messages(conversation_id,role,content) VALUES($1,'assistant',$2)`,[conversationId,answer]);await pool!.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`,[conversationId]);res.json({answer,conversationId})
}catch(e){next(e)}})

app.use(express.static(dist))
app.get('/{*splat}',(_req,res)=>res.sendFile(join(dist,'index.html')))
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(err);res.status(500).json({error:err instanceof Error?err.message:'Внутренняя ошибка сервера'})})
initDatabase().then(()=>app.listen(port,'::',()=>console.log(`Founder OS running on :${port}`))).catch(error=>{console.error('Database init failed',error);process.exit(1)})
