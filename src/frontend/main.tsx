import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

// Global error handlers - log and show toast
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[RuFloUI] Global error:', { message, source, lineno, colno, error })
  showErrorToast(`${message}`)
  return false
}

window.onunhandledrejection = (event) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason)
  console.error('[RuFloUI] Unhandled promise rejection:', event.reason)
  showErrorToast(`Async error: ${msg}`)
}

function showErrorToast(message: string) {
  const existing = document.getElementById('ruflo-error-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'ruflo-error-toast'
  Object.assign(toast.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: '99999',
    maxWidth: '480px', padding: '14px 20px',
    background: '#1a1a2e', border: '1px solid #ef4444', borderRadius: '10px',
    color: '#f1f5f9', fontSize: '13px', fontFamily: 'Inter, system-ui, sans-serif',
    boxShadow: '0 4px 24px rgba(239, 68, 68, 0.25)',
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    animation: 'fadeIn 0.3s ease',
  })

  toast.innerHTML = `
    <div style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;color:#ef4444;font-weight:700">!</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;margin-bottom:4px;color:#ef4444">Error</div>
      <div style="word-break:break-word;color:#94a3b8;line-height:1.4">${escapeHtml(message)}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;padding:0;line-height:1">&times;</button>
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 8000)
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
