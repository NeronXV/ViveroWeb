import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useDemoStore } from '../../app/providers/DemoStore'
import type { CareLevel } from '../../types/domain'
import { ProductCard } from './ProductCard'

type Answers = { light?: CareLevel; water?: 'alta' | 'baja'; pets?: boolean }
const steps = [
  { key: 'light' as const, question: '¿Cuál es el nivel de luz del espacio?', options: [{ label: '☀ Luz directa / Alta', value: 'alta' }, { label: '◐ Luz indirecta / Media', value: 'media' }, { label: '☾ Poca luz / Sombra', value: 'baja' }] },
  { key: 'water' as const, question: '¿Con qué frecuencia puedes regar?', options: [{ label: '💧 Frecuente', value: 'alta' }, { label: '🌵 Moderado / Bajo', value: 'baja' }] },
  { key: 'pets' as const, question: '¿Necesitas una planta segura para mascotas?', options: [{ label: '🐾 Sí, debe ser pet-friendly', value: true }, { label: '🌿 No es necesario', value: false }] },
]

export function CareQuiz() {
  const { plants, addToCart } = useDemoStore()
  const { openCart } = useOutletContext<{ openCart: () => void }>()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [done, setDone] = useState(false)
  const current = steps[step]
  const recommendation = useMemo(() => plants.find((plant) => plant.light === answers.light && plant.water === answers.water && (!answers.pets || plant.pets)) ?? plants.find((plant) => plant.light === answers.light && (!answers.pets || plant.pets)) ?? plants[0], [answers, plants])
  const selected = answers[current.key]
  const reset = () => { setAnswers({}); setStep(0); setDone(false) }
  if (done) return <section className="quiz-section" id="care-quiz"><div className="quiz-container"><div className="section-header"><h2>Tu planta recomendada</h2><p>Resultado orientativo con datos de demostración</p></div><div className="quiz-card quiz-result-container"><ProductCard plant={recommendation} onAdd={(id) => { addToCart(id); openCart() }} /><button className="quiz-btn quiz-btn-secondary" onClick={reset}>Volver a realizar el test</button></div></div></section>
  return <section className="quiz-section" id="care-quiz" aria-labelledby="quiz-title"><div className="quiz-container"><div className="section-header"><h2 id="quiz-title">Asistente de Recomendación</h2><p>Responde 3 sencillas preguntas para encontrar tu planta ideal</p></div><div className="quiz-card"><div className="progress-bar-container" aria-hidden="true"><div className="progress-bar" style={{ width: `${(step / steps.length) * 100}%` }} /></div><fieldset className="quiz-step active"><legend className="quiz-question">{current.question}</legend><div className="quiz-options">{current.options.map((option) => <button key={String(option.value)} className={`quiz-option ${selected === option.value ? 'selected' : ''}`} aria-pressed={selected === option.value} onClick={() => setAnswers((value) => ({ ...value, [current.key]: option.value }))}><span className="quiz-option-text">{option.label}</span></button>)}</div></fieldset><div className="quiz-nav"><button className="quiz-btn quiz-btn-secondary" onClick={() => setStep((value) => value - 1)} disabled={step === 0}>Atrás</button><button className="quiz-btn quiz-btn-primary" disabled={selected === undefined} onClick={() => step === steps.length - 1 ? setDone(true) : setStep((value) => value + 1)}>{step === steps.length - 1 ? 'Ver recomendación' : 'Siguiente'}</button></div></div></div></section>
}
