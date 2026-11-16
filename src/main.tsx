import 'bootstrap/dist/css/bootstrap.min.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { builtInTopic } from './content'
import { createPyodideRunner } from './runner'
import { App } from './ui/App'
import { followSystemTheme } from './ui/theme'

followSystemTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App topic={builtInTopic} runner={createPyodideRunner()} />
  </StrictMode>,
)
