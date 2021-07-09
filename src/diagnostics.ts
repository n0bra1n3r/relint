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
            const matcher = new RegExp(rule.regex);
            let matchGroups: RegExpExecArray | null;

            if (rule.fixType === 'replace') {
                while (matchGroups = matcher.exec(text)) {
                    const diagnostic = createDiagnostic(
                        diagnostics.name,
                        document,
                        matchGroups,
                        rule);
                    diagnosticList.push(diagnostic);
                }
            } else {
                if (rule.fix === undefined) { continue; }

                let diagnostic: Diagnostic | undefined;
                const tokenList: string[] = [];

                let iterCount = 0;
                let isOrdered = true;

                while (matchGroups = matcher.exec(text)) {
                    if (!diagnostic) {
                        diagnostic = createDiagnostic(
                            diagnostics.name,
                            document,
                            matchGroups,
                            rule);
                        diagnostic.relatedInformation = [];
                    } else {
                        diagnostic.relatedInformation!.push({
                            location: {
                                uri: document.uri,
                                range : rangeFromMatch(document, matchGroups)
                            },
                            message: 'related match here'
                        });
                    }

                    if (isOrdered) {
                        const token = matchGroups[0].replace(rule.regex, rule.fix);
                        const index = rule.fixType === 'reorder_asc'
                            ? sortedIndex(tokenList, token, (a, b) => a < b)
                            : sortedIndex(tokenList, token, (a, b) => a > b);
                        tokenList.splice(index, 0, token);

                        isOrdered = iterCount == index;
                        iterCount += 1;
                    }
                }

                if (!isOrdered) { diagnosticList.push(diagnostic!); }
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
    const matchLength = Math.max(...matchArray.map(match => match.length));

    const startPosition = document.positionAt(matchStart);
    const endPosition = document.positionAt(matchStart + matchLength);

    return new vscode.Range(startPosition, endPosition);
}
