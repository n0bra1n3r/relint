import * as vscode from 'vscode';
import Rule, { ConfigSection } from './rule';
import { sortedIndex } from './util';

export const DiagnosticCollectionName = 'relint';

export class RuleDiagnostic extends vscode.Diagnostic
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

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri))
    );
}

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
    const rules = Rule.all.filter(rule => rule.language === document.languageId);

    const diagnosticList: RuleDiagnostic[] = [];

    if (rules.length > 0) {
        const text = document.getText();
        for (const rule of rules) {
            const matcher = new RegExp(rule.regex);
            let matchArray: RegExpExecArray | null;
            if (rule.fixType === 'replace') {
                while (matchArray = matcher.exec(text)) {
                    const diagnostic = createDiagnostic(
                        diagnostics.name,
                        document,
                        matchArray,
                        rule);
                    diagnosticList.push(diagnostic);
                }
            } else {
                if (rule.fix === undefined) { continue; }

                const tokenList: string[] = [];
                let iterCount = 0;
                let prevMatch: RegExpExecArray | null;
                let diagnostic: RuleDiagnostic | undefined;

                while (matchArray = matcher.exec(text)) {
                    const token = matchArray[0].replace(rule.regex, rule.fix);
                    const index = rule.fixType === 'reorder_asc'
                        ? sortedIndex(tokenList, token, (a, b) => a < b)
                        : sortedIndex(tokenList, token, (a, b) => a > b);

                    if (iterCount != index) {
                        if (!diagnostic) {
                            diagnostic = createDiagnostic(
                                diagnostics.name,
                                document,
                                prevMatch!,
                                rule);
                            diagnostic.relatedInformation = [];
                        }

                        const range = rangeFromMatch(document, matchArray);
                        diagnostic.relatedInformation!.push({
                            location: { uri: document.uri, range },
                            message: 'related rule violation here'
                        });
                    }

                    tokenList.splice(index, 0, token);
                    iterCount += 1;
                    prevMatch = matchArray;
                }

                if (diagnostic) { diagnosticList.push(diagnostic); }
            }
        }
    }

    diagnostics.set(document.uri, diagnosticList);
}

function createDiagnostic(
            source: string,
            document: vscode.TextDocument,
            matchArray: RegExpExecArray,
            rule: Rule): RuleDiagnostic {
    const range = rangeFromMatch(document, matchArray);
    const diagnostic = new RuleDiagnostic(rule.id, range, rule.message, rule.severityCode);
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
