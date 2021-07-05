## Demo

relint is a language and framework agnostic linter. Here is an example configuration for Nim:

```json
{
    ...
    "relint": {
        "rules": [
            {
                "id": "syntax-assert",
                "regex": "assert\\((.+), (.+)\\)",
                "flags": "ig",
                "language": "nim",
                "message": "syntax: use `assert <condition>: <message>`",
                "severity": "Warning",
                "quickFix": "assert $1: $2"
            }
        ]
    }
}
```

This configuration issues a warning for the `assert` function call syntax matched by a regular expression, telling the user to use Nim's command syntax instead. `Quick Fix` and `Fix All` options are available from the editor context menus.

```nim
assert(false, "test assert") # becomes: `assert false: "test assert"`
```
