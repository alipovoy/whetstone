# Whetstone

Interview practice in the browser: coding problems with tests, quizzes, progress tracking and weak-area detection.

Works without AI and without any key. AI guidance — generation, grading, tutoring, mock interviews — is a later, optional layer.

**Status:** early development. Live at <https://alipovoy.github.io/whetstone/>.

Python runs in your browser (Pyodide in a Web Worker). Nothing is sent to a server.

Reference solutions and hidden tests are in this public repository. That is accepted: the app is for
self-practice.

## Development

Requires Node (version in `.node-version`) and Python 3.14, the version Pyodide uses.

```sh
npm ci
npm run dev                # local server
npm test                   # unit tests, including the built-in problems run in Pyodide
npm run test:harness       # Python test harness under CPython
npm run validate:content   # built-in problems under CPython
npx playwright install chromium   # once
npm run build && npm run test:e2e   # browser test against the production build
```

## Licence

[MIT](LICENSE)
