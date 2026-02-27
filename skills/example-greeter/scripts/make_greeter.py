from pathlib import Path

out = Path("output")
out.mkdir(parents=True, exist_ok=True)

(out / "greeter.py").write_text(
    """def greet(name: str) -> str:
    return f\"Hello, {name}!\"


if __name__ == '__main__':
    import sys
    who = sys.argv[1] if len(sys.argv) > 1 else 'Mini-Agent-TS'
    print(greet(who))
""",
    encoding="utf-8",
)

(out / "README.md").write_text(
    """# Greeter Output

Run:

```bash
python output/greeter.py
python output/greeter.py Alice
```
""",
    encoding="utf-8",
)

print("Generated output/greeter.py and output/README.md")
