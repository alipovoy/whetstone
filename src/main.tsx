import 'bootstrap/dist/css/bootstrap.min.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { builtInTopic } from './content'
import { createPyodideRunner } from './runner'
import { AttemptStore } from './storage/attempts'
import { App, type AppStorage } from './ui/App'
import { followSystemTheme } from './ui/theme'

followSystemTheme()

async function openStorage(): Promise<AppStorage> {
  try {
    const store = await AttemptStore.open()
    return { store, ...(await store.all()) }
  } catch (error) {
    return { store: null, attempts: [], skipped: 0, error: String(error) }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App topic={builtInTopic} runner={createPyodideRunner()} storage={await openStorage()} />
  </StrictMode>,
)
