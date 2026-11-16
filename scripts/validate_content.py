"""Checks every built-in problem with CPython: the reference solution passes every test in good
time, the starter code fails at least one, at least one test is hidden.

Usage: python3 scripts/validate_content.py [topic.json ...]
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HARNESS_DIR = ROOT / 'src' / 'runner' / 'python'

TIME_LIMIT_S = 20
SLOW_MS = 3000

# A child process, so code that never finishes can be stopped: the harness catches every exception.
CHILD = (
    'import json, sys\n'
    'sys.path.insert(0, sys.argv[1])\n'
    'import harness\n'
    'job = json.load(sys.stdin)\n'
    "sys.stdout.write(harness.run_tests(job['code'], job['tests'], '[]'))\n"
)


def run(code, tests):
    try:
        done = subprocess.run(
            [sys.executable, '-c', CHILD, str(HARNESS_DIR)],
            input=json.dumps({'code': code, 'tests': tests}),
            capture_output=True, text=True, timeout=TIME_LIMIT_S,
        )
    except subprocess.TimeoutExpired:
        return None
    if done.returncode != 0:
        raise RuntimeError('the harness could not be run:\n' + done.stderr)
    return json.loads(done.stdout)


def check_problem(problem):
    result = run(problem['reference_solution'], problem['tests'])
    if result is None:
        return [f'the reference solution did not finish within {TIME_LIMIT_S} s']
    if result['load_error']:
        return ['the reference solution does not load:\n' + result['load_error']]
    if result['tests_error']:
        return ['the tests do not load:\n' + result['tests_error']]
    if not result['tests']:
        return ['the tests define no test function']

    errors = [
        f"the reference solution fails {test['name']}:\n{test['error']}"
        for test in result['tests'] if not test['passed']
    ]
    total_ms = sum(test['ms'] for test in result['tests'])
    if total_ms > SLOW_MS:
        errors.append(f'the reference solution needs {total_ms:.0f} ms for all tests')

    names = {test['name'] for test in result['tests']}
    errors += [f'visible test {name} is not among the tests'
               for name in problem['visible_tests'] if name not in names]
    if names <= set(problem['visible_tests']):
        errors.append('every test is visible: at least one must be hidden')

    starter = run(problem['starter_code'], problem['tests'])
    if starter is not None and not starter['load_error'] and not starter['tests_error']:
        if all(test['passed'] for test in starter['tests']):
            errors.append('the starter code passes every test')
    return errors


def main(paths):
    files = [pathlib.Path(p) for p in paths] or sorted((ROOT / 'src' / 'content').glob('*.json'))
    if not files:
        print('No topic files found.')
        return 1
    failures = 0
    for path in files:
        problems = json.loads(path.read_text(encoding='utf-8'))['problems']
        print(f'{path.name}: {len(problems)} problems')
        for problem in problems:
            errors = check_problem(problem)
            print(f"  {'ok  ' if not errors else 'FAIL'} {problem['id']}")
            for error in errors:
                failures += 1
                print('       ' + error.replace('\n', '\n       '))
    if failures:
        print(f'\n{failures} problem(s) found.')
        return 1
    print('\nAll reference solutions pass their tests.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
