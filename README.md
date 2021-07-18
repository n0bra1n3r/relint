# relint

`relint` is a language and framework agnostic linter. Its main purpose is to serve as tooling for programming languages that do not yet have their own specialized linters.

## Demo

Here is a configuration I use for one of my [Nim](https://nim-lang.org/) projects:

```json
// .vscode/settings.json
{
    ...

    "relint": {
        "language": "nim",
        "rules": [
            {
                "fix": "(addr)$1$2$3$4",
                "message": "syntax: use command syntax for `addr`",
                "name": "syntax-addr",
                "pattern": "(?<=\\W|^)(?:addr\\((.+)\\)|addr (.+)|addr: (.+)|(.+)\\.addr)",
                "severity": "Warning"
            },
            {
                "fix": "{.$1 $2}",
                "message": "syntax: use spaces to separate pragmas",
                "name": "syntax-pragma",
                "pattern": "{\\.(.+),\\ *(.*)}",
                "severity": "Warning"
            }
        ]
    },

    ...
}
```

![Demo1](assets/relint-demo1.gif?raw=true)

I use an awesome plugin called [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) in conjunction with this to make issues easier to spot.

## Features

`relint` produces configurable diagnostics for *rule violations*, each of which are described by a [regular expression](https://www.regular-expressions.info/). Rule violations can also be assigned fixes, which are repeatedly applied until no matching rule violations are found. Fixes can perform one of two operations:

- **Replace** the matched text
- **Reorder** the matched text

The configuration options can be found in the `contributes.configuration` section of the [package.json](package.json).

## More examples

The following is a more complex example that uses the **reorder** feature combined with the **replace** function to organize imports at the top of a Nim file.

```json
// .vscode/settings.json
{
    ...

    "relint": {
        "language": "nim",
        "rules": [
            {
                // 1
                "fixType": "reorder_desc",
                "fix": "$1",
                "message": "organization: unordered imports",
                "name": "organization-import",
                "pattern": "^import ([.\\w]+/).+"
            },
            {
                // 2
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import \\./.+"
            },
            {
                // 2.1
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import \\.\\./.+"
            },
            {
                // 2.2
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import src/.+"
            },
            {
                // 2.3
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import std/.+"
            },
            {
                // 3
                "fix": "$1\r\n$4",
                "message": "organization: bad spacing in import group",
                "maxLines": 0,
                "name": "organization-import",
                "pattern": "(^import ([.\\w]+)/.+)(\\r\\n){2,}(^import \\2/.+)"
            },
            {
                // 4
                "fix": "$1\r\n\r\n$4",
                "message": "organization: bad spacing in import group",
                "maxLines": 0,
                "name": "organization-import",
                "pattern": "(^import ([.\\w]+)/.+)(\\r\\n|(?:\\r\\n){3,})(^import (?!\\2/).+)"
            }
        ]
    },

    ...
}
```

![Demo2](assets/relint-demo2.gif?raw=true)

This configuration performs the following fixes:

1. Order imports by root folder in descending alphabetical order,
1. order each *import group* in ascending alphabetical order,
1. ensures import groups are separated by 1 newline,
1. and finally, ensures imports within each import group do not have newlines between them.

The `name` configuration plays an important part here in that all rules with the same name are considered part of a *rule group*. Rules in such groups that produce diagnostics in overlapping ranges of text behave as one rule that can match multiple rule violations and apply the corresponding fixes to text in their combined ranges.

## More examples

The following is a simple configuration that issues diagnostics for maximum characters exceeded in a line:

```json
{
    ...

    [
        {
            "message": "format: 80 columns exceeded",
            "name": "format-line",
            "pattern": "^.{81,120}$",
            "severity": "Warning"
        },
        {
            "message": "format: 120 columns exceeded",
            "name": "format-line",
            "pattern": "^.{121,}$",
            "severity": "Error"
        }
    ]

    ...
}
```
