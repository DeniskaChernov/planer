import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { ensureUser, hasDatabase, initDatabase, pool } from './db.js'
import { founderInstructions } from './prompt.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const fallbackProfile = { name:'Денис', role:'Основатель', bio:'Создаю экосистему Strategy Platform.', vision:'Построить интеллектуальную операционную систему для предпринимателей.', goals:['Запустить Founder OS','Развивать Strategy Platform'], constraints:'Один основатель, приоритет — скорость запуска', workingStyle:'Сначала работающий MVP, затем постепенное улучшение' }

app.use(express.json({ limit: '2mb' }))
const userId = (req: express.Request) => String(req.header('x-user-id') || 'founder')

app.get('/api/health', (_req,res)=>res.json({ ok:true, database:hasDatabase, ai:Boolean(openai) }))

app.post('/api/bootstrap', async (req,res,next)=>{ try {
  const data = await ensureUser(userId(req), req.body.profile || fallbackProfile, req.body.state || {})
  res.json({ profile:data.profile, state:data.planner_state, persistence:hasDatabase?'postgres':'local' })
} catch(e){ next(e) } })

app.put('/api/state', async (req,res,next)=>{ try {
  if (!pool) return res.json({ ok:true, persistence:'local' })
  await pool.query(`UPDATE users SET planner_state=$2, updated_at=NOW() WHERE id=$1`,[userId(req),JSON.stringify(req.body)])
  res.json({ok:true,persistence:'postgres'})
} catch(e){next(e)} })

app.put('/api/profile', async (req,res,next)=>{ try {
  if (!pool) return res.json({ ok:true, persistence:'local' })
  await pool.query(`UPDATE users SET profile=$2, updated_at=NOW() WHERE id=$1`,[userId(req),JSON.stringify(req.body)])
  res.json({ok:true,persistence:'postgres'})
} catch(e){next(e)} })

app.post('/api/ai/chat', async (req,res,next)=>{ try {
  if (!openai) return res.status(503).json({ error:'OPENAI_API_KEY не настроен на сервере' })
  const id=userId(req); const { message, context='company' }=req.body
  if (!message?.trim()) return res.status(400).json({error:'Сообщение пустое'})
  const user = pool ? (await pool.query(`SELECT profile, planner_state FROM users WHERE id=$1`,[id])).rows[0] : {profile:req.body.profile||fallbackProfile,planner_state:req.body.state||{}}
  let conversationId=req.body.conversationId as string|undefined
  let history:{role:'user'|'assistant';content:string}[]=[]
  if(pool){
    if(!conversationId){
      const latest=await pool.query(`SELECT id FROM conversations WHERE user_id=$1 AND context=$2 ORDER BY updated_at DESC LIMIT 1`,[id,context])
      conversationId=latest.rows[0]?.id
      if(!conversationId){const c=await pool.query(`INSERT INTO conversations(user_id,context,title) VALUES($1,$2,$3) RETURNING id`,[id,context,message.slice(0,80)]);conversationId=c.rows[0].id}
    }
    const h=await pool.query(`SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20`,[conversationId]);history=h.rows.reverse()
    await pool.query(`INSERT INTO messages(conversation_id,role,content) VALUES($1,'user',$2)`,[conversationId,message])
  }
  const response=await openai.responses.create({
    model:process.env.OPENAI_MODEL||'gpt-5.4-mini',
    instructions:founderInstructions(user?.profile||fallbackProfile,user?.planner_state||{},context),
    input:[...history.map(m=>({role:m.role,content:m.content})),{role:'user',content:message}],
    reasoning:{effort:'low'},
  })
  const answer=response.output_text||'Не удалось сформировать ответ.'
  if(pool&&conversationId){await pool.query(`INSERT INTO messages(conversation_id,role,content) VALUES($1,'assistant',$2)`,[conversationId,answer]);await pool.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`,[conversationId])}
  res.json({answer,conversationId})
} catch(e){next(e)} })

app.use(express.static(dist))
app.get('/{*splat}',(_req,res)=>res.sendFile(join(dist,'index.html')))
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(err);res.status(500).json({error:'Внутренняя ошибка сервера'})})

initDatabase().then(()=>app.listen(port,()=>console.log(`Founder OS running on :${port}`))).catch(error=>{console.error('Database init failed',error);process.exit(1)})
