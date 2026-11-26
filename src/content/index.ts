import algorithms from './algorithms.json'
import bitsAndMath from './bits-and-math.json'
import complexityAnalysis from './complexity-analysis.json'
import dataStructures from './data-structures.json'
import pythonAdvanced from './python-advanced.json'
import pythonBasics from './python-basics.json'
import pythonStandardLibrary from './python-standard-library.json'
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
  pythonBasics,
  pythonStandardLibrary,
  pythonAdvanced,
].map(load)
