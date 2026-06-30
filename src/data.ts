import type { PlannerState, UserProfile } from './types'

export const defaultProfile: UserProfile = {
  name: 'Денис',
  role: 'Основатель',
  bio: 'Создаю экосистему Strategy Platform.',
  vision: 'Построить интеллектуальную операционную систему для предпринимателей.',
  goals: ['Запустить Founder OS', 'Развивать Strategy Platform'],
  constraints: 'Один основатель, приоритет — скорость запуска',
  workingStyle: 'Сначала работающий MVP, затем постепенное улучшение',
}

const today = new Date()
const date = (days: number) => {
  const d = new Date(today); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const task = (id: string, title: string, status: 'Backlog'|'Todo'|'In Progress'|'Done', priority: 'Low'|'Medium'|'High', days?: number, tags: string[] = []) => ({ id, title, status, priority, deadline: days === undefined ? undefined : date(days), tags })
const entry = (id: string, title: string, body?: string) => ({ id, title, body, createdAt: new Date().toISOString() })

export const initialState: PlannerState = {
  focus: 'Подготовить первый рабочий релиз Founder OS',
  decisions: [],
  projects: [
    { id:'company', name:'Company', icon:'Building2', color:'#a78bfa', description:'Стратегия, процессы и рост компании', progress:82,
      tasks:[task('c1','Сформировать план на неделю','In Progress','High',0,['strategy']),task('c2','Проверить ключевые метрики','Todo','High',1,['metrics']),task('c3','Обновить карту рисков','Backlog','Medium',4)],
      ideas:[entry('ci1','Еженедельный founder review')], improvements:[entry('cm1','Упростить процесс планирования')], notes:[entry('cn1','Главная цель квартала','Получить устойчивый ежедневный ритм выпуска продукта.')]
    },
    { id:'platform', name:'Strategy Platform', icon:'Orbit', color:'#6ee7f9', description:'Единая платформа для стратегического управления', progress:74,
      tasks:[task('p1','Собрать MVP Founder Planner','In Progress','High',0,['product']),task('p2','Проверить навигацию','Todo','Medium',2,['ux']),task('p3','Описать модульную архитектуру','Backlog','Medium',7)],
      ideas:[entry('pi1','Добавить AI Agents')], improvements:[entry('pm1','Улучшить Dashboard')], notes:[entry('pn1','Принцип продукта','Скорость запуска важнее количества функций.')]
    },
    { id:'ai', name:'Strategy AI', icon:'Sparkles', color:'#f0abfc', description:'Интеллектуальный слой для стратегических решений', progress:61,
      tasks:[task('a1','Определить контекст AI-помощника','Todo','High',1,['ai']),task('a2','Собрать набор системных промптов','Backlog','Medium',5)],
      ideas:[entry('ai1','Режим критического советника')], improvements:[entry('am1','Добавить краткие рекомендации')], notes:[]
    },
    { id:'business', name:'Business OS', icon:'Factory', color:'#fbbf24', description:'Операционная система компании', progress:22, tasks:[task('b1','Описать основные контуры','Backlog','Medium',10)], ideas:[], improvements:[], notes:[] },
    { id:'life', name:'Life', icon:'Heart', color:'#fb7185', description:'Энергия, здоровье и личная устойчивость', progress:10, tasks:[task('l1','Запланировать спорт','Todo','Medium',0,['health'])], ideas:[], improvements:[], notes:[] },
    { id:'website', name:'Website', icon:'Globe2', color:'#60a5fa', description:'Главная точка контакта с продуктом', progress:46, tasks:[task('w1','Переписать hero section','Todo','High',3,['copy']),task('w2','Проверить мобильную версию','Backlog','Medium',6,['ux'])], ideas:[entry('wi1','Интерактивное product demo')], improvements:[entry('wm1','Усилить социальное доказательство')], notes:[] },
    { id:'brand', name:'Brand', icon:'Palette', color:'#34d399', description:'Визуальная система и голос компании', progress:58, tasks:[task('br1','Утвердить визуальное направление','In Progress','Medium',2,['design'])], ideas:[entry('bri1','Новый логотип')], improvements:[], notes:[] },
    { id:'marketing', name:'Marketing', icon:'Megaphone', color:'#fb923c', description:'Системный рост внимания и спроса', progress:39, tasks:[task('m1','Подготовить контент-план','Todo','High',4,['content'])], ideas:[entry('mi1','Серия заметок о founder workflow')], improvements:[], notes:[] },
  ]
}
