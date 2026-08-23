import { useState, type FormEvent } from 'react'
import { botKnowledge, chatFallback } from '../../data/mock/content'

interface Message { id: number; sender: 'bot' | 'user'; text: string }
const topics = ['¿Cómo sé si mi Monstera necesita agua?', '¿Qué plantas son mejores para poca luz?', '¿Por qué se ponen amarillas las hojas?']

export function CareChat() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([{ id: 1, sender: 'bot', text: '¡Hola! Soy el asistente botánico de demostración. ¿En qué puedo orientarte?' }])
  const send = (question: string) => { const clean = question.trim(); if (!clean) return; const normalized = clean.toLowerCase(); const answer = botKnowledge.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)))?.answer ?? chatFallback; setMessages((current) => [...current, { id: Date.now(), sender: 'user', text: clean }, { id: Date.now() + 1, sender: 'bot', text: answer }]); setQuery('') }
  const submit = (event: FormEvent) => { event.preventDefault(); send(query) }
  return <section className="chatbot-section" id="care-chat" aria-labelledby="chat-title"><div className="chat-container"><div className="chat-info"><h3 id="chat-title">Asistente botánico</h3><p>Orientación simulada basada en respuestas predefinidas. No utiliza IA ni sustituye asesoría profesional.</p><ul className="chat-topics">{topics.map((topic) => <li key={topic}><button onClick={() => send(topic)}>{topic}</button></li>)}</ul></div><div className="chat-box"><div className="chat-messages" aria-live="polite">{messages.map((message) => <div key={message.id} className={`message ${message.sender}`}>{message.text}</div>)}</div><form className="chat-input-area" onSubmit={submit}><label className="sr-only" htmlFor="chat-query">Pregunta sobre cuidado</label><input id="chat-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pregunta sobre el cuidado de tus plantas…" /><button className="send-chat-btn" aria-label="Enviar pregunta">➤</button></form></div></div></section>
}
