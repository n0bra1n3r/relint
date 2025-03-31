# Change Log

All notable changes to the "relint" extension will be documented in this file.

## 0.1.0
- Initial release

## 0.1.1
- Fix contribution points

## 0.1.2
- Reload diagnostics when config changes

## 0.1.3
- Reload code actions when config changes

## 0.1.4
- Apply fixes recursively

## 0.1.5
- Polish and fixes

## 0.2.0
- Add reodering support

## 0.3.0
- Improve reodering and fix diagnostics issues

## 0.3.1
- Fix issue where some diagnostics are skipped

## 0.4.0
- Improve recursive fixes and merge diagnostics with the same name

## 0.4.1
- Recursive fixes are only done for rules in the same group

## 0.4.2
- Update readme

## 0.4.3
- Improve performance

## 0.4.4
- Add new config 'maxLines' to enable optimizations

## 0.5.0
- Refactor datastructures to improve performance

## 0.5.1
- Fix crash on unsupported language

## 0.6.0
- Don't diagnose files outside of project and allow multiple languages per rule

## 0.6.1
- Update readme and add icon

## 0.7.0
- Add ability to disable/enable Relint via inline comments.
- Allow group match replacement in diagnostic messages.
- Make regex case sensitive by default. To make a pattern case sensitie, set the new "caseInsensitive" to true.
- Show error messages and status bar item for invalid rules.