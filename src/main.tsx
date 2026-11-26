import '@fontsource-variable/atkinson-hyperlegible-next/index.css'
import '@fontsource-variable/atkinson-hyperlegible-mono/index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import './ui/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { builtInTopics } from './content'
import { createPyodideRunner } from './runner'
import { topicFromFile } from './core/topics'
import { openDatabase } from './storage/database'
import { App, type AppStorage } from './ui/App'
import { applyTheme } from './ui/theme'

applyTheme()

async function openStorage(): Promise<AppStorage> {
  try {
    const store = await openDatabase()
    const [attempts, topics, quizzes] = await Promise.all([
      store.attempts.all(),
      store.topics.all(),
      store.quizzes.all(),
    ])
    return {
      store,
      attempts: attempts.records,
      topics: topics.records,
      quizzes: quizzes.records,
      skipped: attempts.skipped + topics.skipped + quizzes.skipped,
    }
  } catch (error) {
    const now = Date.now()
    const topics = builtInTopics.map((file) => topicFromFile(file, now))
    return { store: null, attempts: [], topics, quizzes: [], skipped: 0, error: String(error) }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App runner={createPyodideRunner()} storage={await openStorage()} />
  </StrictMode>,
)
