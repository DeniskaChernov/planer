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
const port = Number(process.env.PORT || 3000)
const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const fallbackProfile = { name:'Новый пользователь', role:'Участник', bio:'', vision:'', goals:[], constraints:'', workingStyle:'' }
const cookieName='founder_session'

app.use(express.json({limit:'2mb'}))
app.use(cookieParser())
const authLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много попыток. Попробуйте через 15 минут.'}})

type SessionUser={accountId:string;publicId:string;displayName:string;externalUserId?:string;profile:Record<string,unknown>;workspaceId:string;workspaceName:string;inviteCode:string;role:string}
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex')
const normalizeId=(value:unknown)=>String(value||'').trim().toLowerCase()
const validId=(id:string)=>/^[a-z0-9_-]{4,32}$/.test(id)
const validPin=(pin:unknown)=>/^\d{4,12}$/.test(String(pin||''))

async function sessionUser(req:express.Request):Promise<SessionUser|null>{
  if(!pool)return null
  const token=req.cookies?.[cookieName]
  if(!token)return null
  const result=await pool.query(`SELECT a.id account_id,a.public_id,a.display_name,a.external_user_id,a.profile,w.id workspace_id,w.name workspace_name,w.invite_code,m.role
    FROM planner_sessions s JOIN planner_accounts a ON a.id=s.account_id JOIN planner_memberships m ON m.account_id=a.id JOIN planner_workspaces w ON w.id=m.workspace_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW() ORDER BY m.created_at LIMIT 1`,[hashToken(token)])
  const r=result.rows[0]; if(!r)return null
  return {accountId:r.account_id,publicId:r.public_id,displayName:r.display_name,externalUserId:r.external_user_id,profile:r.profile||{},workspaceId:r.workspace_id,workspaceName:r.workspace_name,inviteCode:r.invite_code,role:r.role}
}
async function createSession(res:express.Response,accountId:string){
  const token=randomBytes(32).toString('base64url')
  await pool!.query(`DELETE FROM planner_sessions WHERE expires_at<NOW()`)
  await pool!.query(`INSERT INTO planner_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')`,[hashToken(token),accountId])
  res.cookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:30*24*60*60*1000,path:'/'})
}
async function requireUser(req:express.Request,res:express.Response):Promise<SessionUser|null>{const user=await sessionUser(req);if(!user)res.status(401).json({error:'Войдите в Planner'});return user}

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
    let workspaceId:string,role='member'; const invite=normalizeId(req.body.inviteCode)
    if(invite){const w=await client.query(`SELECT id FROM planner_workspaces WHERE lower(invite_code)=lower($1)`,[invite]);if(!w.rowCount)throw new Error('Код пространства не найден');workspaceId=w.rows[0].id}
    else{role='owner';const workspaceName=String(req.body.workspaceName||'Моё пространство').trim();const inviteCode=randomBytes(4).toString('hex');const w=await client.query(`INSERT INTO planner_workspaces(name,invite_code,planner_state) VALUES($1,$2,$3) RETURNING id`,[workspaceName,inviteCode,JSON.stringify(req.body.state||{})]);workspaceId=w.rows[0].id}
    const profile={...fallbackProfile,name};const account=await client.query(`INSERT INTO planner_accounts(public_id,display_name,pin_hash,external_user_id,profile) VALUES($1,$2,$3,$4,$5) RETURNING id`,[publicId,name,await bcrypt.hash(pin,12),req.body.externalUserId||null,JSON.stringify(profile)])
    await client.query(`INSERT INTO planner_memberships(account_id,workspace_id,role) VALUES($1,$2,$3)`,[account.rows[0].id,workspaceId,role])
    await client.query(`INSERT INTO users(id,profile,planner_state) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,[account.rows[0].id,JSON.stringify(profile),JSON.stringify(req.body.state||{})])
    await client.query('COMMIT');await createSession(res,account.rows[0].id);res.json({ok:true})
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}catch(e){if(e instanceof Error&&['ID уже занят','Код пространства не найден'].includes(e.message))return res.status(400).json({error:e.message});next(e)}})
app.post('/api/auth/login',authLimiter,async(req,res,next)=>{try{
  if(!pool)return res.status(503).json({error:'База данных не подключена'})
  const result=await pool.query(`SELECT id,pin_hash FROM planner_accounts WHERE public_id=$1`,[normalizeId(req.body.publicId)])
  const account=result.rows[0];if(!account||!await bcrypt.compare(String(req.body.pin||''),account.pin_hash))return res.status(401).json({error:'Неверный ID или PIN'})
  await createSession(res,account.id);res.json({ok:true})
}catch(e){next(e)}})
app.post('/api/auth/logout',async(req,res,next)=>{try{const token=req.cookies?.[cookieName];if(pool&&token)await pool.query(`DELETE FROM planner_sessions WHERE token_hash=$1`,[hashToken(token)]);res.clearCookie(cookieName,{path:'/'});res.json({ok:true})}catch(e){next(e)}})

app.post('/api/bootstrap',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const data=await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[user.workspaceId]);res.json({profile:user.profile,state:data.rows[0]?.planner_state||req.body.state||{},persistence:'postgres',user})}catch(e){next(e)}})
app.put('/api/state',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;await pool!.query(`UPDATE planner_workspaces SET planner_state=$2,updated_at=NOW() WHERE id=$1`,[user.workspaceId,JSON.stringify(req.body)]);res.json({ok:true,persistence:'postgres'})}catch(e){next(e)}})
app.put('/api/profile',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;await pool!.query(`UPDATE planner_accounts SET profile=$2,display_name=$3,updated_at=NOW() WHERE id=$1`,[user.accountId,JSON.stringify(req.body),req.body.name||user.displayName]);await pool!.query(`UPDATE users SET profile=$2,updated_at=NOW() WHERE id=$1`,[user.accountId,JSON.stringify(req.body)]);res.json({ok:true})}catch(e){next(e)}})
app.get('/api/workspace',async(req,res,next)=>{try{const user=await requireUser(req,res);if(!user)return;const members=await pool!.query(`SELECT a.public_id,a.display_name,a.external_user_id,m.role FROM planner_memberships m JOIN planner_accounts a ON a.id=m.account_id WHERE m.workspace_id=$1 ORDER BY m.created_at`,[user.workspaceId]);res.json({id:user.workspaceId,name:user.workspaceName,inviteCode:user.inviteCode,role:user.role,members:members.rows})}catch(e){next(e)}})

app.post('/api/ai/chat',async(req,res,next)=>{try{
  const auth=await requireUser(req,res);if(!auth)return;if(!openai)return res.status(503).json({error:'OPENAI_API_KEY не настроен на сервере'})
  const {message,context='company'}=req.body;if(!message?.trim())return res.status(400).json({error:'Сообщение пустое'})
  const state=(await pool!.query(`SELECT planner_state FROM planner_workspaces WHERE id=$1`,[auth.workspaceId])).rows[0]?.planner_state||{}
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
