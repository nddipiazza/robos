"""Narrow synthetic scenario; OpenTaxSolver is invoked through TenForty."""
import json
import sys
from importlib.metadata import version
from tenforty import evaluate_return

inputs = json.load(sys.stdin)
result = evaluate_return(**inputs, backend='ots').model_dump()
print(json.dumps({'version': version('tenforty'), 'result': result}))
