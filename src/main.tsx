import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { DemoStoreProvider } from './app/providers/DemoStore'
import { router } from './app/router'
import { AuthProvider } from './features/auth/AuthProvider'
import './styles/base.css'
import './styles/components.css'
import './styles/store.css'
import './styles/interactive.css'
import './styles/dashboard.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><DemoStoreProvider><RouterProvider router={router} /></DemoStoreProvider></AuthProvider></StrictMode>)
