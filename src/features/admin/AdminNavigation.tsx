import { useState, type KeyboardEvent } from 'react'
import { ADMIN_MODULE_RULES, type AdminModuleId } from '../access/access-rules'
import { adminTasks, adminTaskModuleLabel } from '../access/admin-navigation'

export function AdminNavigation({ authorized, tab, canReceive, onSelect }: {
  authorized: AdminModuleId[]; tab: AdminModuleId; canReceive: boolean; onSelect: (id: AdminModuleId) => void
}) {
  const tasks = adminTasks(authorized, canReceive)
  const current = tasks.find(task => task.modules.includes(tab)) ?? tasks[0]
  const [expanded, setExpanded] = useState(false)
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tasks.length - 1 : offset ? (index + offset + tasks.length) % tasks.length : null
    if (next === null) return
    event.preventDefault(); onSelect(tasks[next].modules[0]); setExpanded(false)
    requestAnimationFrame(() => document.getElementById(`admin-task-${tasks[next].id}`)?.focus())
  }
  if (!current) return null
  const secondaryModules = current.modules.filter(id => id !== tab)
  return <nav className="admin-task-navigation" aria-label="Tareas del vivero">
    <div className="admin-task-tabs" role="tablist" aria-label="Áreas de trabajo">
      {tasks.map((task, index) => <button key={task.id} id={`admin-task-${task.id}`} type="button" role="tab"
        className={`admin-task-button ${current.id === task.id ? 'active' : ''}`} aria-selected={current.id === task.id}
        aria-controls="admin-task-panel" tabIndex={current.id === task.id ? 0 : -1}
        onKeyDown={event => keyboard(event, index)} onClick={() => { onSelect(task.modules.includes(tab) ? tab : task.modules[0]); setExpanded(false) }}>
        {task.label}
      </button>)}
    </div>
    {secondaryModules.length > 0 && <div className="admin-task-options">
      <button type="button" className="admin-options-toggle" aria-label={`Herramientas de ${current.label.toLocaleLowerCase('es-MX')}`} aria-expanded={expanded} aria-controls="admin-task-options" onClick={() => setExpanded(value => !value)}>Herramientas <span aria-hidden="true">{expanded ? '−' : '+'}</span></button>
      <div id="admin-task-options" className={`admin-task-links ${expanded ? 'expanded' : ''}`}>
        {secondaryModules.map(id => <button key={id} type="button" id={`admin-tab-${id}`}
          onClick={() => onSelect(id)}>{id === 'compras' && !canReceive ? 'Consultar compras' : adminTaskModuleLabel[id] ?? ADMIN_MODULE_RULES.find(item => item.id === id)?.label.replace(/^[^\p{L}\p{N}]+/u, '')}</button>)}
      </div>
    </div>}
  </nav>
}
