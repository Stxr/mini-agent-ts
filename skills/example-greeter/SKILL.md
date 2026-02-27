---
name: example-greeter
description: Generate a small greeting CLI and usage notes
license: MIT
allowed-tools:
  - read_file
  - write_file
  - bash
metadata:
  author: mini-agent-ts
  level: beginner
---

# Example Greeter Skill

Use this skill when the user asks for a tiny starter script or a quick demo CLI.

## Workflow

1. Read references/checklist.md to confirm output expectations.
2. Run python scripts/make_greeter.py to generate the demo files.
3. Verify output by reading `output/README.md` and `output/greeter.py`.
4. If needed, adjust generated content with edit_file.

## Expected Output

- output/greeter.py
- output/README.md

See references/checklist.md for quality checks.
