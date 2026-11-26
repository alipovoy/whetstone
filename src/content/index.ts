import algorithms from './algorithms.json'
import bitsAndMath from './bits-and-math.json'
import complexityAnalysis from './complexity-analysis.json'
import dataStructures from './data-structures.json'
import { validateTopicFile, type TopicFile } from './schema'

function load(input: unknown): TopicFile {
  const result = validateTopicFile(input)
  if (!result.ok) throw new Error(`Built-in topic is invalid:\n${result.errors.join('\n')}`)
  return result.file
}

export const builtInTopics: TopicFile[] = [
  dataStructures,
  algorithms,
  complexityAnalysis,
  bitsAndMath,
].map(load)
