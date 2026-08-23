import type { EditorialContent, StaffMember } from '../../types/domain'

export const defaultEditorial: EditorialContent = { title: 'Trae la armonía de la naturaleza a tu hogar', description: 'Descubre nuestra selecta colección de plantas de interior, exterior y variedades exóticas cultivadas con el mayor cuidado por expertos botánicos.', announcement: 'Envíos premium a todo el país' }
export const initialStaff: StaffMember[] = [
  { id: 1, name: 'Lucía Pérez', specialty: 'Botánica de interior', shift: '08:00–16:00', active: true },
  { id: 2, name: 'Carlos Méndez', specialty: 'Caja y atención', shift: '10:00–18:00', active: true },
  { id: 3, name: 'Ana Torres', specialty: 'Logística', shift: '12:00–20:00', active: false },
]
export const botKnowledge: Array<{ keywords: string[]; answer: string }> = [
  { keywords: ['riego', 'regar', 'agua'], answer: '💧 Comprueba la humedad a 3 cm de profundidad. Las suculentas prefieren secarse por completo; las plantas tropicales necesitan humedad sin encharcar.' },
  { keywords: ['monstera', 'costilla'], answer: '🌿 La Monstera prefiere luz brillante indirecta y riego cuando la capa superior del sustrato empieza a secarse.' },
  { keywords: ['amarilla', 'amarillas'], answer: '🍂 Las hojas amarillas suelen indicar exceso de agua o drenaje insuficiente. Espacia los riegos y revisa las raíces.' },
  { keywords: ['luz', 'sol', 'sombra'], answer: '☀️ Para poca luz prueba una Sansevieria. Evita el sol directo intenso sobre hojas tropicales delicadas.' },
  { keywords: ['mascota', 'perro', 'gato'], answer: '🐾 Elige plantas marcadas como seguras para mascotas y colócalas fuera de alcance si desconoces su toxicidad.' },
]
export const chatFallback = '🌿 Esta respuesta es orientativa y forma parte de la demostración. Observa la luz, revisa el sustrato antes de regar y consulta a un especialista si detectas una plaga.'
