import { Link } from 'react-router-dom'
import { ADMIN_MODULE_RULES, type AdminModuleId } from '../access/access-rules'
import { adminTasks, adminTaskModuleLabel } from '../access/admin-navigation'

export function AdminNavigation({ authorized, tab, canCashier, onSelect }: {
  authorized: AdminModuleId[]; tab: AdminModuleId; canCashier: boolean; onSelect: (id: AdminModuleId) => void
}) {
  const tasks = adminTasks(authorized, canCashier)
  return <nav className="admin-task-navigation" aria-label="Tareas del vivero">
    {tasks.map(task => <section key={task.id} className={`admin-task-group ${task.modules.includes(tab) ? 'active' : ''}`} aria-labelledby={`admin-task-${task.id}`}>
      <h3 id={`admin-task-${task.id}`} className="admin-task-heading">{task.label}</h3>
      <div className="admin-task-links">
        {task.id === 'sales' && canCashier && <Link to="/caja">Caja</Link>}
        {task.modules.map(id => <button key={id} type="button" id={`admin-tab-${id}`} aria-current={id === tab ? 'page' : undefined}
          onClick={() => onSelect(id)}>{adminTaskModuleLabel[id] ?? ADMIN_MODULE_RULES.find(item => item.id === id)?.label.replace(/^[^\p{L}\p{N}]+/u, '')}</button>)}
      </div>
    </section>)}
  </nav>
}
