import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useCareCatalog } from './useCareCatalog'
import { answerFromCatalog } from './care-catalog'

export function CareChat() {
  const catalog = useCareCatalog()
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Array<{ question: string; answer: string }>>([])
  const messagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = messagesRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages])
  const ask = (question: string) => {
    if (!question || catalog.status !== 'ready') return
    setMessages((current) => [...current.slice(-9), { question, answer: answerFromCatalog(catalog.products, question) }])
    setQuery('')
  }
  const send = (event: FormEvent) => {
    event.preventDefault()
    const question = query.trim()
    ask(question)
  }
  return <section className="chatbot-section care-assistant" id="care-chat" aria-labelledby="chat-title"><div className="chat-container">
    <div className="chat-info"><h3 id="chat-title">Cuidemos tus plantas</h3>
      <p>Escribe el nombre de una planta para consultar su luz, riego y clima. Las respuestas provienen de nuestras fichas actuales.</p><div className="care-topics"><span>☀ Luz adecuada</span><span>◉ Consejos de riego</span><span>❧ Clima recomendado</span></div></div>
    <div className="chat-box">
      {catalog.status === 'loading' && <p role="status">Consultando fichas…</p>}
      {catalog.status === 'error' && <p role="alert">No pudimos consultar el catálogo. <button onClick={catalog.retry}>Reintentar</button></p>}
      <div className="chat-messages" ref={messagesRef} role="log" aria-label="Conversación de cuidados" aria-live="polite">
        {messages.length === 0 && <div className="care-welcome">
          <span className="care-welcome-icon" aria-hidden="true">❧</span>
          <h4>¿Qué planta quieres cuidar?</h4>
          <p>Escribe su nombre y consulta los cuidados de su ficha.</p>
          {catalog.status === 'ready' && catalog.products.length > 0 && <div className="care-suggestions">
            {catalog.products.slice(0, 3).map((product) => <button type="button" key={product.id} onClick={() => ask(product.name)}>{product.name}</button>)}
          </div>}
          {catalog.status === 'ready' && catalog.products.length === 0 && <p>Aún no hay fichas disponibles. Consulta al personal del vivero.</p>}
        </div>}{messages.map((message, index) => <div className="care-exchange" key={index}>
        <p className="message user">{message.question}</p><p className="message bot" style={{ whiteSpace: 'pre-line' }}>{message.answer}</p>
      </div>)}</div>
      <form className="chat-input-area" onSubmit={send}><label className="sr-only" htmlFor="care-query">Nombre de la planta o pregunta</label>
        <input id="care-query" value={query} maxLength={240} onChange={(event) => setQuery(event.target.value)} placeholder="Escribe el nombre de tu planta…" disabled={catalog.status !== 'ready'} />
        <button className="send-chat-btn" disabled={catalog.status !== 'ready' || !query.trim()}>Consultar</button>
      </form>
    </div>
  </div></section>
}
