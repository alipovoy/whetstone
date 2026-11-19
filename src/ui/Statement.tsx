import type { ReactNode } from 'react'
import { conceptNames, type Problem, type Topic, type Wording } from '@/content/schema'
import { Markdown } from './Markdown'
import { ConceptTags } from './progress'

interface Props {
  topic: Topic
  problem: Problem
  wording: Wording
  children?: ReactNode
}

// The problem as the solver reads it.
export function Statement({ topic, problem, wording, children }: Props) {
  return (
    <div className="ws-statement">
      <h1 className="h3">{wording.title}</h1>
      <p className="ws-statement-meta">
        <span className="ws-difficulty" data-level={problem.difficulty}>
          {problem.difficulty}
        </span>
        {topic.name}
      </p>
      <ConceptTags names={conceptNames(topic, problem.concepts)} />
      <Markdown source={wording.statement} />
      {wording.examples.map((example, i) => (
        <div key={i}>
          <h2 className="h6">Example {i + 1}</h2>
          <pre className="ws-example">{`Input: ${example.input}\nOutput: ${example.output}`}</pre>
          {example.explanation && <p className="small">{example.explanation}</p>}
        </div>
      ))}
      {wording.constraints.length > 0 && (
        <>
          <h2 className="h6">Constraints</h2>
          <ul className="small">
            {wording.constraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {children}
    </div>
  )
}
