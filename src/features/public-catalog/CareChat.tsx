import { useState, type FormEvent } from 'react'
import { useCareCatalog } from './useCareCatalog'
import { answerFromCatalog } from './care-catalog'

export function CareChat() {
  const catalog = useCareCatalog()
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Array<{ question: string; answer: string }>>([])
  const send = (event: FormEvent) => {
    event.preventDefault()
    const question = query.trim()
    if (!question || catalog.status !== 'ready') return
    setMessages((current) => [...current.slice(-9), { question, answer: answerFromCatalog(catalog.products, question) }])
    setQuery('')
  }
  return <section className="chatbot-section" id="care-chat" aria-labelledby="chat-title"><div className="chat-container">
    <div className="chat-info"><h3 id="chat-title">Asistente de cuidados del catálogo</h3>
      <p>Escribe el nombre de una planta para consultar su luz, riego y clima. Las respuestas provienen de nuestras fichas actuales.</p></div>
    <div className="chat-box">
      {catalog.status === 'loading' && <p role="status">Consultando fichas…</p>}
      {catalog.status === 'error' && <p role="alert">No pudimos consultar el catálogo. <button onClick={catalog.retry}>Reintentar</button></p>}
      <div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div key={index}>
        <p className="message user">{message.question}</p><p className="message bot" style={{ whiteSpace: 'pre-line' }}>{message.answer}</p>
      </div>)}</div>
      <form className="chat-input-area" onSubmit={send}><label className="sr-only" htmlFor="care-query">Nombre de la planta o pregunta</label>
        <input id="care-query" value={query} maxLength={240} onChange={(event) => setQuery(event.target.value)} placeholder="Cuidados de la Monstera…" />
        <button className="send-chat-btn" disabled={catalog.status !== 'ready' || !query.trim()}>Consultar</button>
      </form>
    </div>
  </div></section>
}
