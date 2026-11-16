import algorithms from './algorithms.json'
import { validateTopicFile, type TopicFile } from './schema'

function load(input: unknown): TopicFile {
  const result = validateTopicFile(input)
  if (!result.ok) throw new Error(`Built-in topic is invalid:\n${result.errors.join('\n')}`)
  return result.file
}

export const builtInTopic: TopicFile = load(algorithms)
