import * as vscode from 'vscode';
import Rule from './rule';
import { sortedIndex } from './util';

export const DiagnosticCollectionName = 'relint';

export class Diagnostic extends vscode.Diagnostic
{
    public get effectiveRange(): vscode.Range {
        return this.relatedInformation?.reduce((range, info) =>
            range.union(info.location.range), this.range)
            ?? this.range;
    }
}

export default function activateDiagnostics(context: vscode.ExtensionContext): void {
    const diagnostics = vscode.languages.createDiagnosticCollection(DiagnosticCollectionName);
    context.subscriptions.push(diagnostics);

    if (vscode.window.activeTextEditor) {
        refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log(editor?.document.fileName);
            if (editor) { refreshDiagnostics(editor.document, diagnostics); }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event =>
            refreshDiagnostics(event.document, diagnostics))
    );
}

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
    const rules = Rule.all[document.languageId];

    const diagnosticList: Diagnostic[] = [];

    if (rules?.length) {
        const numLines = document.lineCount;

        for (const rule of rules) {
            const maxLines = rule.maxLines || numLines;

            let line = 0;
            while (line < numLines) {
                const endLine = Math.min(line + maxLines, numLines)
                let textRange = document
                    .lineAt(line)
                    .range
                    .union(document
                        .lineAt(endLine - 1)
                        .rangeIncludingLineBreak);

                const text = document.getText(textRange);
                let array: RegExpExecArray | null;

                if (rule.fixType === 'replace') {
                    while (array = rule.regex.exec(text)) {
                        const range = rangeFromMatch(document, textRange, array);
                        const entry = mergeDiagnostic(diagnosticList, document, range, rule)
                            ?? createDiagnostic(diagnostics.name, range, rule);
                        if (!diagnosticList.includes(entry)) {
                            diagnosticList.push(entry);
                        }
                    }
                } else {
                    const sorter: string[] = [];

                    let entry: Diagnostic | undefined;
                    let isBad = false;
                    let count = 0;
                    while (array = rule.regex.exec(text)) {
                        const range = rangeFromMatch(document, textRange, array);
                        if (!entry) {
                            entry = mergeDiagnostic(diagnosticList, document, range, rule)
                                ?? createDiagnostic(diagnostics.name, range, rule);
                        } else {
                            addRelatedInfo(entry, document, range);
                        }

                        if (!isBad) {
                            const lastIndex = rule.regex.lastIndex;
                            const match = array[0];
                            const token = match.replace(rule.regex, rule.fix!);
                            rule.regex.lastIndex = lastIndex;
                            const index = rule.fixType === 'reorder_asc'
                                ? sortedIndex(sorter, token, (a, b) => a <= b)
                                : sortedIndex(sorter, token, (a, b) => a >= b);
                            sorter.splice(index, 0, token);

                            isBad = count !== index;
                            count += 1;
                        }
                    }

                    if (isBad && !diagnosticList.includes(entry!)) {
                        diagnosticList.push(entry!);
                    }
                }

                if (textRange.end.line >= numLines - 1) { break; }
                line += 1;
            }
        }
    }

    diagnostics.set(document.uri, diagnosticList);
}

function mergeDiagnostic(
            diagnosticList: Diagnostic[],
            document: vscode.TextDocument,
            range: vscode.Range,
            rule: Rule): Diagnostic | undefined {
    let diagnostic = diagnosticList.find(diagnostic =>
        diagnostic.code === rule.name &&
        diagnostic.effectiveRange.intersection(range));
    if (diagnostic) {
        if (diagnostic.range.intersection(range)) {
            diagnostic.range = diagnostic.range.union(range);
        } else {
            addRelatedInfo(diagnostic, document, range);
        }
    }
    return diagnostic;
}

function addRelatedInfo(diagnostic: Diagnostic, document: vscode.TextDocument, range: vscode.Range) {
    if (diagnostic.relatedInformation === undefined)
        diagnostic.relatedInformation = [];
    const info = diagnostic.relatedInformation.find(info =>
        info.location.range.intersection(range));
    if (info) {
        info.location.range = info.location.range.union(range);
    } else {
        diagnostic.relatedInformation.push({
            location: { uri: document.uri, range },
            message: 'related match here'
        });
    }
}

function createDiagnostic(source: string, range: vscode.Range, rule: Rule): Diagnostic {
    const diagnostic = new Diagnostic(range, rule.message, rule.severityCode);
    diagnostic.source = source;
    diagnostic.code = rule.name;
    return diagnostic;
}

function rangeFromMatch(
            document: vscode.TextDocument,
            textRange: vscode.Range,
            matchArray: RegExpExecArray): vscode.Range {
    const matchStart = document.offsetAt(textRange.start) + matchArray.index;
    const matchLength = matchArray[0].length;
    const startPosition = document.positionAt(matchStart);
    const endPosition = document.positionAt(matchStart + matchLength);
    return new vscode.Range(startPosition, endPosition);
}
