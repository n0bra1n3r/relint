import * as vscode from 'vscode';
import Rule, { ConfigSection } from './rule';
import activateDiagnostics from './diagnostics';

const DiagnosticCollectionName = "relint";

type QuickFix = { regex: RegExp, quickFix: string };

export function activate(context: vscode.ExtensionContext) {
    Rule.loadAll();

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(ConfigSection.Name)) {
            Rule.loadAll();
        }
    });


    const diagnostics = vscode.languages.createDiagnosticCollection(DiagnosticCollectionName);
    context.subscriptions.push(diagnostics);

    activateDiagnostics(context, diagnostics);

    const languageMap = Rule.all
        .filter(rule => rule.quickFix !== undefined)
        .reduce((accumulator, rule) => ({
            ...accumulator, [rule.language]: [
                ...(accumulator[rule.language] ?? []),
                {
                    regex: rule.regex,
                    quickFix: rule.quickFix!
                }
            ]
        }), <{ [language: string]: QuickFix[] }>{});

    for (const [language, fixes] of Object.entries(languageMap)) {
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(language, new QuickFixProvider(fixes), {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            })
        );
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(language, new QuickFixAllProvider(fixes), {
                providedCodeActionKinds: [
                    vscode.CodeActionKind.SourceFixAll,
                    vscode.CodeActionKind.QuickFix
                ]
            })
        );
    }
}

export class QuickFixProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: QuickFix[]) { }

    provideCodeActions(
            document: vscode.TextDocument,
            range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        const text = document.getText(range);
        const fix = this.fixes.find(fix => fix.regex.test(text));
        if (!fix) { return []; }

        const action = new vscode.CodeAction(`Quick fix to '${fix.quickFix}'`, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, range, text.replace(fix.regex, fix.quickFix));
        action.isPreferred = true;
        return [action];
    }
}

export class QuickFixAllProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: QuickFix[]) { }

    provideCodeActions(
            document: vscode.TextDocument,
            range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        const fixAllAction = new vscode.CodeAction('Apply all quick fixes', vscode.CodeActionKind.SourceFixAll);
        fixAllAction.edit = new vscode.WorkspaceEdit();
        const quickFixAction = new vscode.CodeAction('Apply all quick fixes', vscode.CodeActionKind.QuickFix);
        quickFixAction.edit = new vscode.WorkspaceEdit();

        const edits: vscode.TextEdit[] = [];

        const diagnostics = vscode.languages
            .getDiagnostics(document.uri)
            .filter(diagnostic => diagnostic.source === DiagnosticCollectionName);

        for (const { range } of diagnostics) {
            const text = document.getText(range);
            const fix = this.fixes.find(fix => fix.regex.test(text));
            if (!fix) { continue; }

            edits.push(new vscode.TextEdit(range, text.replace(fix.regex, fix.quickFix)));
        }

        if (edits.length === 0) { return []; }
        fixAllAction.edit.set(document.uri, edits);
        quickFixAction.edit.set(document.uri, edits);
        return [fixAllAction, quickFixAction];
    }
}
