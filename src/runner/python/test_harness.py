import json
import sys
import unittest

import harness

SOLUTION = '''
def add(a, b):
    return a + b

def helper():
    raise ValueError('bad input')
'''

TESTS = '''
from solution import *
import solution

def test_add():
    """Adds two numbers."""
    print('checking add')
    assert add(2, 3) == 5

def test_add_wrong():
    assert add(2, 2) == 5, 'expected 5'

def test_bare_assert():
    assert add(1, 1) == 3

def test_raises():
    helper()

def _helper_not_a_test():
    raise RuntimeError('must not run')

not_callable_test_ = 1
test_value = 3
'''


def run_tests(code=SOLUTION, tests=TESTS, only=()):
    return json.loads(harness.run_tests(code, tests, json.dumps(list(only))))


class RunCode(unittest.TestCase):
    def test_captures_output(self):
        r = json.loads(harness.run_code('print("hello")\nprint("world")'))
        self.assertEqual(r['stdout'], 'hello\nworld\n')
        self.assertIsNone(r['error'])
        self.assertIsInstance(r['ms'], float)

    def test_runs_as_main(self):
        r = json.loads(harness.run_code('if __name__ == "__main__":\n    print("main")'))
        self.assertEqual(r['stdout'], 'main\n')

    def test_reports_error_with_user_frames_only(self):
        r = json.loads(harness.run_code('def f():\n    return 1 / 0\n\nprint("before")\nf()'))
        self.assertEqual(r['stdout'], 'before\n')
        self.assertIn('solution.py, line 2, in f', r['error'])
        self.assertIn('return 1 / 0', r['error'])
        self.assertTrue(r['error'].endswith('ZeroDivisionError: division by zero'))
        self.assertNotIn('harness', r['error'])

    def test_reports_syntax_error(self):
        r = json.loads(harness.run_code('def f(:\n    pass'))
        self.assertIn('SyntaxError', r['error'])

    def test_survives_sys_exit(self):
        r = json.loads(harness.run_code('import sys\nprint("bye")\nsys.exit(2)'))
        self.assertEqual(r['stdout'], 'bye\n')
        self.assertIn('SystemExit', r['error'])

    def test_restores_stdout(self):
        before = sys.stdout
        harness.run_code('raise KeyError("x")')
        self.assertIs(sys.stdout, before)

    def test_keeps_the_end_of_long_output(self):
        r = json.loads(harness.run_code('print("a" * 30000)\nprint("end")'))
        self.assertEqual(len(r['stdout']), harness.MAX_OUTPUT)
        self.assertTrue(r['stdout'].endswith('end\n'))


class RunTests(unittest.TestCase):
    def test_collects_only_test_functions_from_the_test_file(self):
        r = run_tests()
        self.assertEqual([t['name'] for t in r['tests']],
                         ['test_add', 'test_add_wrong', 'test_bare_assert', 'test_raises'])

    def test_does_not_collect_tests_imported_from_the_solution(self):
        r = run_tests(code='def test_mine():\n    raise RuntimeError("no")\n',
                      tests='from solution import *\n\ndef test_real():\n    pass\n')
        self.assertEqual([t['name'] for t in r['tests']], ['test_real'])

    def test_passing_test(self):
        t = run_tests()['tests'][0]
        self.assertTrue(t['passed'])
        self.assertIsNone(t['error'])
        self.assertEqual(t['doc'], 'Adds two numbers.')
        self.assertEqual(t['stdout'], 'checking add\n')

    def test_failed_assert_with_message(self):
        t = run_tests()['tests'][1]
        self.assertFalse(t['passed'])
        self.assertTrue(t['error'].startswith('AssertionError: expected 5\n'))
        self.assertIn('hidden_tests.py, line', t['error'])

    def test_failed_assert_without_message(self):
        t = run_tests()['tests'][2]
        self.assertTrue(t['error'].startswith('AssertionError\n'))

    def test_error_inside_solution_shows_both_files(self):
        t = run_tests()['tests'][3]
        self.assertFalse(t['passed'])
        self.assertIn('hidden_tests.py', t['error'])
        self.assertIn('solution.py', t['error'])
        self.assertTrue(t['error'].startswith('ValueError: bad input\n'))

    def test_hidden_frames_follow_the_exception_line(self):
        t = run_tests(tests='def test_x():\n    assert 1 == 2, "first\\nsecond"\n')['tests'][0]
        self.assertEqual(t['error'].split('\n')[:2], ['AssertionError: first', 'second'])
        self.assertIn('hidden_tests.py, line 2', t['error'])

    def test_only_runs_named_tests(self):
        r = run_tests(only=['test_add', 'test_raises'])
        self.assertEqual([t['name'] for t in r['tests']], ['test_add', 'test_raises'])

    def test_load_error_stops_before_tests(self):
        r = run_tests(code='print("loading")\nimport no_such_module_xyz')
        self.assertIn('ModuleNotFoundError', r['load_error'])
        self.assertEqual(r['stdout'], 'loading\n')
        self.assertEqual(r['tests'], [])

    def test_broken_test_module(self):
        r = run_tests(tests='from solution import missing_name\n')
        self.assertTrue(r['tests_error'].startswith('ImportError'))
        self.assertEqual(r['tests'], [])

    def test_each_run_sees_the_new_solution(self):
        tests = 'from solution import value\n\ndef test_value():\n    assert value == 2\n'
        self.assertFalse(run_tests(code='value = 1', tests=tests)['tests'][0]['passed'])
        self.assertTrue(run_tests(code='value = 2', tests=tests)['tests'][0]['passed'])

    def test_async_test_fails_instead_of_passing_unrun(self):
        r = run_tests(tests='async def test_later():\n    assert False\n')
        self.assertFalse(r['tests'][0]['passed'])
        self.assertIn('Async tests are not supported', r['tests'][0]['error'])

    def test_one_failing_test_does_not_stop_the_rest(self):
        r = run_tests()
        self.assertEqual([t['passed'] for t in r['tests']], [True, False, False, False])


if __name__ == '__main__':
    unittest.main()
