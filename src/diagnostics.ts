import * as vscode from 'vscode';
import Rule, { ConfigSection } from './rule';

export default function activateDiagnostics(
        context: vscode.ExtensionContext,
        diagnostics: vscode.DiagnosticCollection): void {
    if (vscode.window.activeTextEditor) {
        refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics, Rule.all);
    }

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(ConfigSection.Name) && vscode.window.activeTextEditor) {
            refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics, Rule.all);
        }
    });

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                refreshDiagnostics(editor.document, diagnostics, Rule.all);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event =>
            refreshDiagnostics(event.document, diagnostics, Rule.all))
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri))
    );
}

function refreshDiagnostics(
            document: vscode.TextDocument,
            diagnostics: vscode.DiagnosticCollection,
            checkRules: Rule[]): void {
    const rules = checkRules.filter(rule => rule.language === document.languageId);

    if (rules.length > 0) {
        const diagnosticList: vscode.Diagnostic[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const textLine = document.lineAt(lineIndex);
            for (const rule of rules) {
                const lineMatch = rule.regex.exec(textLine.text);
                rule.regex.lastIndex = 0;
                if (lineMatch) {
                    const diagnostic = createDiagnostic(
                        diagnostics.name,
                        lineIndex,
                        lineMatch,
                        rule.id,
                        rule.message,
                        rule.severity);
                    diagnosticList.push(diagnostic);
                }
            }
        }

        diagnostics.set(document.uri, diagnosticList);
    }
}

function createDiagnostic(
            source: string,
            lineIndex: number,
            lineMatch: RegExpExecArray,
            id: string,
            message: string,
            severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
    const lineColumn = lineMatch.index;
    const lineLength = Math.max(...lineMatch.map(match => match.length));

    const range = new vscode.Range(lineIndex, lineColumn, lineIndex, lineColumn + lineLength);
    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = source;
    diagnostic.code = id;
    return diagnostic;
}
