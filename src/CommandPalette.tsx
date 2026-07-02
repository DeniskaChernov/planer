import { useEffect, useMemo, useRef, useState } from 'react'
import { BrainCircuit, Calendar, FileText, FolderKanban, Lightbulb, Search, SquareCheckBig, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PlannerState, View } from './types'

type Result = {
  id: string
  type: 'project' | 'task' | 'decision' | 'idea' | 'note'
  title: string
  subtitle: string
  projectId?: string
  view?: View
}

const icons = { project: FolderKanban, task: SquareCheckBig, decision: BrainCircuit, idea: Lightbulb, note: FileText }
const labels = { project: 'Проект', task: 'Задача', decision: 'Решение', idea: 'Идея', note: 'Заметка' }

export default function CommandPalette({ state, close, openProject, openView }: {
  state: PlannerState
  close: () => void
  openProject: (id: string) => void
  openView: (view: View) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const all = useMemo<Result[]>(() => [
    ...state.projects.map(project => ({
      id: project.id,
      type: 'project' as const,
      title: project.name,
      subtitle: project.outcome || project.description || 'Проект',
      projectId: project.id,
    })),
    ...state.projects.flatMap(project => project.tasks.map(task => ({
      id: task.id,
      type: 'task' as const,
      title: task.title,
      subtitle: `${project.name} · ${task.status}`,
      projectId: project.id,
    }))),
    ...state.decisions.map(decision => ({
      id: decision.id,
      type: 'decision' as const,
      title: decision.title,
      subtitle: decision.expectedOutcome,
      view: 'decisions' as View,
    })),
    ...state.projects.flatMap(project => project.ideas.map(idea => ({
      id: idea.id,
      type: 'idea' as const,
      title: idea.title,
      subtitle: project.name,
      projectId: project.id,
    }))),
    ...state.projects.flatMap(project => project.notes.map(note => ({
      id: note.id,
      type: 'note' as const,
      title: note.title,
      subtitle: project.name,
      projectId: project.id,
    }))),
  ], [state])

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru')
    return (normalized
      ? all.filter(item => `${item.title} ${item.subtitle}`.toLocaleLowerCase('ru').includes(normalized))
      : all).slice(0, 12)
  }, [all, query])

  useEffect(() => setSelected(0), [query])

  const open = (item: Result) => {
    if (item.view) openView(item.view)
    else if (item.projectId) openProject(item.projectId)
    close()
  }

  return <motion.div className="command-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => event.target === event.currentTarget && close()}>
    <motion.section className="command-palette" role="dialog" aria-modal="true" aria-label="Поиск в рабочем пространстве" initial={{ opacity: 0, y: -12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .98 }}>
      <header>
        <Search />
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSelected(index => Math.min(index + 1, Math.max(0, results.length - 1)))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSelected(index => Math.max(index - 1, 0))
            }
            if (event.key === 'Enter' && results[selected]) open(results[selected])
          }}
          placeholder="Найти проект, задачу, решение или идею…"
          aria-label="Поиск"
        />
        <kbd>ESC</kbd>
        <button onClick={close} aria-label="Закрыть поиск"><X /></button>
      </header>

      {!query && <div className="command-shortcuts">
        <button onClick={() => { openView('calendar'); close() }}><Calendar />Открыть календарь</button>
        <button onClick={() => { openView('decisions'); close() }}><BrainCircuit />Проверить решения</button>
        <button onClick={() => { openView('ideas'); close() }}><Lightbulb />Открыть идеи</button>
      </div>}

      <div className="command-results">
        {results.map((item, index) => {
          const Icon = icons[item.type]
          return <button className={selected === index ? 'active' : ''} onMouseEnter={() => setSelected(index)} key={`${item.type}-${item.id}`} onClick={() => open(item)}>
            <span><Icon /></span>
            <div><b>{item.title}</b><small>{labels[item.type]} · {item.subtitle}</small></div>
            <em>↵</em>
          </button>
        })}
        {!results.length && <div className="command-empty"><Search /><b>Ничего не найдено</b><span>Попробуйте другое слово или название проекта.</span></div>}
      </div>

      <footer><span><kbd>⌘ K</kbd> открыть поиск</span><span><kbd>↑ ↓</kbd> навигация</span><span><kbd>Enter</kbd> открыть</span></footer>
    </motion.section>
  </motion.div>
}
