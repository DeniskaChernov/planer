import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Copy, History, Menu, MessageSquarePlus, PanelLeftClose, Sparkles, Trash2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from './api'
import type { AIConversation, AIMessage } from './types'

const suggestions=[
  'Какой следующий шаг даст наибольший эффект?',
  'Где я путаю факт и допущение?',
  'Проведи короткий премортем текущего плана',
]

export default function AIWorkspace({context,close}:{context:string;close:()=>void}){
  const [conversations,setConversations]=useState<AIConversation[]>([])
  const [conversationId,setConversationId]=useState<string>()
  const [messages,setMessages]=useState<AIMessage[]>([])
  const [text,setText]=useState('')
  const [busy,setBusy]=useState(false)
  const [threadsOpen,setThreadsOpen]=useState(false)
  const [copied,setCopied]=useState<string>()
  const [error,setError]=useState('')
  const endRef=useRef<HTMLDivElement>(null)

  const refresh=async()=>{try{const result=await api.conversations();setConversations(result.items)}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить диалоги')}}
  useEffect(()=>{refresh()},[])
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages,busy])

  const openConversation=async(item:AIConversation)=>{setConversationId(item.id);setThreadsOpen(false);setError('');try{const result=await api.conversationMessages(item.id);setMessages(result.items)}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть диалог')}}
  const newConversation=()=>{setConversationId(undefined);setMessages([]);setText('');setError('');setThreadsOpen(false)}
  const removeConversation=async(id:string)=>{if(!confirm('Удалить этот AI-диалог?'))return;try{await api.deleteConversation(id);if(conversationId===id)newConversation();await refresh()}catch(e){setError(e instanceof Error?e.message:'Не удалось удалить диалог')}}
  const copy=async(message:AIMessage)=>{await navigator.clipboard.writeText(message.content);setCopied(message.id);window.setTimeout(()=>setCopied(undefined),1800)}
  const send=async(value=text)=>{const question=value.trim();if(!question||busy)return;setText('');setError('');setMessages(m=>[...m,{id:`local-${Date.now()}`,role:'user',content:question,created_at:new Date().toISOString()}]);setBusy(true);try{const result=await api.chat({message:question,context,conversationId});setConversationId(result.conversationId);setMessages(m=>[...m,{id:`ai-${Date.now()}`,role:'assistant',content:result.answer,created_at:new Date().toISOString()}]);await refresh()}catch(e){setError(e instanceof Error?e.message:'Founder AI временно недоступен')}finally{setBusy(false)}}

  return <motion.aside className={`ai-workspace ${threadsOpen?'threads-open':''}`} initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} exit={{opacity:0,x:24}}>
    <header className="ai-workspace-head"><button className="ai-mobile-threads" onClick={()=>setThreadsOpen(true)} aria-label="История диалогов"><Menu/></button><span><Sparkles/></span><div><b>Founder AI</b><small>{context}</small></div><button onClick={newConversation} aria-label="Новый диалог"><MessageSquarePlus/></button><button onClick={close} aria-label="Закрыть"><X/></button></header>
    <div className="ai-workspace-body">
      <aside className="ai-thread-list"><header><div><History/><b>Диалоги</b></div><button onClick={()=>setThreadsOpen(false)}><PanelLeftClose/></button></header><button className="new-thread" onClick={newConversation}><MessageSquarePlus/>Новый диалог</button><div>{conversations.map(item=><article className={conversationId===item.id?'active':''} key={item.id}><button onClick={()=>openConversation(item)}><b>{item.title}</b><small>{item.preview||item.context}</small><time>{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(new Date(item.updated_at))}</time></button><button className="delete-thread" onClick={()=>removeConversation(item.id)} aria-label="Удалить"><Trash2/></button></article>)}{!conversations.length&&<p>История появится после первого вопроса.</p>}</div></aside>
      <section className="ai-dialog">
        <div className="ai-dialog-scroll">
          {!messages.length&&<div className="ai-welcome"><span><Sparkles/></span><h2>Что нужно прояснить?</h2><p>Я учитываю доступные вам проекты, решения и личный профиль. Финансовые данные использую только при живом подключении Finance.</p><div>{suggestions.map(item=><button key={item} onClick={()=>send(item)}>{item}</button>)}</div></div>}
          {messages.map(message=><article className={`ai-message-row ${message.role}`} key={message.id}><div className="ai-message-meta"><span>{message.role==='user'?'Вы':'Founder AI'}</span><time>{new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(message.created_at))}</time></div><MessageText text={message.content}/>{message.role==='assistant'&&<button className="copy-answer" onClick={()=>copy(message)}>{copied===message.id?<Check/>:<Copy/>}{copied===message.id?'Скопировано':'Копировать'}</button>}</article>)}
          {busy&&<div className="ai-thinking"><i/><i/><i/><span>Сопоставляю контекст…</span></div>}{error&&<div className="ai-error">{error}</div>}<div ref={endRef}/>
        </div>
        <div className="ai-composer"><div><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Опишите решение, сомнение или следующий шаг…" rows={1}/><button onClick={()=>send()} disabled={!text.trim()||busy}><ArrowUp/></button></div><small>Enter — отправить · Shift+Enter — новая строка</small></div>
      </section>
    </div>
  </motion.aside>
}

function MessageText({text}:{text:string}){const lines=text.split('\n');return <div className="ai-rich-text">{lines.map((line,index)=>line.trim().startsWith('- ')?<div className="ai-list-line" key={index}><i/>{line.trim().slice(2)}</div>:line.trim()?<p key={index}>{line}</p>:<br key={index}/>)}</div>}
