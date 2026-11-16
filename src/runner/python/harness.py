import inspect
import io
import json
import linecache
import sys
import time
import traceback
import types

# Fixed file names let tracebacks be cut down to the user's code and the tests, hiding the harness.
SOLUTION_FILE = 'solution.py'
TESTS_FILE = 'hidden_tests.py'

MAX_OUTPUT = 20000
MAX_TEST_OUTPUT = 1500
MAX_TEST_ERROR = 1500
MAX_DOC = 200
MAX_FRAMES = 3


def _register_source(name, code):
    linecache.cache[name] = (len(code), None, code.splitlines(True), name)


def _format_error(exc, keep_files, head_first=False):
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename in keep_files]
    lines = [
        f'  {f.filename}, line {f.lineno}, in {f.name}' + (f'\n    {f.line}' if f.line else '')
        for f in frames[-MAX_FRAMES:]
    ]
    head = f'{type(exc).__name__}: {exc}' if str(exc) else type(exc).__name__
    if not lines:
        return head
    # Test failures lead with the exception, so the first line alone can stand for a hidden test.
    return '\n'.join([head, *lines]) if head_first else '\n'.join([*lines, head])


class _Capture:
    def __init__(self, buffer):
        self.buffer = buffer

    def __enter__(self):
        self.saved = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = self.buffer
        return self.buffer

    def __exit__(self, *exc_info):
        sys.stdout, sys.stderr = self.saved
        return False


def _load_solution(user_code, out):
    _register_source(SOLUTION_FILE, user_code)
    module = types.ModuleType('solution')
    module.__file__ = SOLUTION_FILE
    sys.modules['solution'] = module
    with _Capture(out):
        try:
            exec(compile(user_code, SOLUTION_FILE, 'exec'), module.__dict__)
        except BaseException as exc:
            return _format_error(exc, (SOLUTION_FILE,))
    return None


def run_code(user_code):
    _register_source(SOLUTION_FILE, user_code)
    out = io.StringIO()
    error = None
    started = time.perf_counter()
    with _Capture(out):
        try:
            exec(compile(user_code, SOLUTION_FILE, 'exec'), {'__name__': '__main__'})
        except BaseException as exc:
            error = _format_error(exc, (SOLUTION_FILE,))
    return json.dumps({
        'stdout': out.getvalue()[-MAX_OUTPUT:],
        'error': error,
        'ms': round((time.perf_counter() - started) * 1000, 1),
    })


def run_tests(user_code, tests_code, only_json):
    only = set(json.loads(only_json) or [])
    out = io.StringIO()
    result = {'load_error': None, 'tests_error': None, 'stdout': '', 'tests': []}

    result['load_error'] = _load_solution(user_code, out)
    result['stdout'] = out.getvalue()[-MAX_OUTPUT:]
    if result['load_error']:
        return json.dumps(result)

    _register_source(TESTS_FILE, tests_code)
    namespace = {'__name__': 'hidden_tests'}
    try:
        with _Capture(io.StringIO()):
            exec(compile(tests_code, TESTS_FILE, 'exec'), namespace)
    except BaseException as exc:
        result['tests_error'] = _format_error(exc, (TESTS_FILE, SOLUTION_FILE), head_first=True)
        return json.dumps(result)

    # `from solution import *` would otherwise let the user's own test_* functions be collected.
    tests = [
        (name, fn) for name, fn in namespace.items()
        if name.startswith('test_') and callable(fn)
        and getattr(getattr(fn, '__code__', None), 'co_filename', '') == TESTS_FILE
    ]
    for name, fn in tests:
        if only and name not in only:
            continue
        buffer = io.StringIO()
        passed, error = True, None
        started = time.perf_counter()
        with _Capture(buffer):
            try:
                outcome = fn()
                if inspect.iscoroutine(outcome):
                    outcome.close()
                    passed = False
                    error = 'Async tests are not supported: write the test with a plain def.'
            except BaseException as exc:
                passed = False
                error = _format_error(exc, (TESTS_FILE, SOLUTION_FILE), head_first=True)
        result['tests'].append({
            'name': name,
            'doc': (fn.__doc__ or '').strip()[:MAX_DOC],
            'passed': passed,
            'error': error[:MAX_TEST_ERROR] if error else None,
            'stdout': buffer.getvalue()[-MAX_TEST_OUTPUT:],
            'ms': round((time.perf_counter() - started) * 1000, 2),
        })
    return json.dumps(result)
