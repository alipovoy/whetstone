import { readdirSync, readFileSync } from 'node:fs'

interface TopicFile {
  topic: { id: string; name: string }
  problems: { difficulty: string; wordings: { title: string }[] }[]
  questions: { type: string; concepts: string[] }[]
}

// Every topic file in the content folder is built in.
export const builtInTopics: TopicFile[] = readdirSync('src/content')
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(`src/content/${name}`, 'utf8')))
