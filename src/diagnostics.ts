import * as vscode from 'vscode';
import Rule, { ConfigSection } from './rule';
import { sortedIndex } from './util';

export const DiagnosticCollectionName = 'relint';

export class Diagnostic extends vscode.Diagnostic
{
    constructor(
            readonly ruleId: string,
            range: vscode.Range,
            message: string,
            severity?: vscode.DiagnosticSeverity) {
        super(range, message, severity);
    }

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

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(ConfigSection.Name) && vscode.window.activeTextEditor) {
            refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics);
        }
    });

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) { refreshDiagnostics(editor.document, diagnostics); }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event =>
            refreshDiagnostics(event.document, diagnostics))
    );
}

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
    const rules = Rule.all.filter(rule => rule.language === document.languageId);

    const diagnosticList: Diagnostic[] = [];

    if (rules.length > 0) {
        const text = document.getText();
        for (const rule of rules) {
            const regExp = new RegExp(rule.regex);

            let array: RegExpExecArray | null;

            if (rule.fixType === 'replace') {
                while (array = regExp.exec(text)) {
                    const entry = createDiagnostic(
                        diagnostics.name,
                        document,
                        array,
                        rule);
                    diagnosticList.push(entry);
                }
            } else {
                if (rule.fix === undefined) { continue; }

                const sorter: string[] = [];

                let entry: Diagnostic | undefined;
                let count = 0;
                let isBad = false;
                while (array = regExp.exec(text)) {
                    if (!entry) {
                        entry = createDiagnostic(
                            diagnostics.name,
                            document,
                            array,
                            rule);
                        entry.relatedInformation = [];
                    } else {
                        entry.relatedInformation!.push({
                            location: {
                                uri: document.uri,
                                range: rangeFromMatch(document, array)
                            },
                            message: 'related match here'
                        });
                    }

                    if (!isBad) {
                        const match = array[0];
                        const token = match.replace(rule.regex, rule.fix);
                        const index = rule.fixType === 'reorder_asc'
                            ? sortedIndex(sorter, token, (a, b) => a <= b)
                            : sortedIndex(sorter, token, (a, b) => a >= b);
                        sorter.splice(index, 0, token);

                        isBad = count !== index;
                        count += 1;
                    }
                }

                if (isBad) { diagnosticList.push(entry!); }
            }
        }
    }

    diagnostics.set(document.uri, diagnosticList);
}

function createDiagnostic(
            source: string,
            document: vscode.TextDocument,
            matchArray: RegExpExecArray,
            rule: Rule): Diagnostic {
    const range = rangeFromMatch(document, matchArray);
    const diagnostic = new Diagnostic(rule.id, range, rule.message, rule.severityCode);
    diagnostic.source = source;
    diagnostic.code = rule.name;
    return diagnostic;
}

function rangeFromMatch(document: vscode.TextDocument, matchArray: RegExpExecArray): vscode.Range {
    const matchStart = matchArray.index;
    const matchLength = matchArray[0].length;

    const startPosition = document.positionAt(matchStart);
    const endPosition = document.positionAt(matchStart + matchLength);

    return new vscode.Range(startPosition, endPosition);
}
