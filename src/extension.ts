import * as vscode from 'vscode';
import Rule, { ConfigSection } from './rule';
import activateDiagnostics from './diagnostics';

const DiagnosticCollectionName = "relint";

type QuickFix = { ruleId: string, regex: RegExp, quickFix: string };

export function activate(context: vscode.ExtensionContext) {
    Rule.loadAll();

    const quickFixes = loadQuickFixes(context);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(ConfigSection.Name)) {
            Rule.loadAll();

            for (const rule of Rule.all) {
                const array = quickFixes[rule.language];
                const index = array.findIndex(quickFix => quickFix.ruleId === rule.id);
                if (index === -1) { continue; }

                if (rule.quickFix === undefined) {
                    array.splice(index, 1);
                } else {
                    const quickFix = array[index];
                    quickFix.regex = rule.regex;
                    quickFix.quickFix = rule.quickFix;
                }
            }
        }
    });

    const diagnostics = vscode.languages.createDiagnosticCollection(DiagnosticCollectionName);
    context.subscriptions.push(diagnostics);
    activateDiagnostics(context, diagnostics);
}

function loadQuickFixes(context: vscode.ExtensionContext): { [language: string]: QuickFix[] } {
    const languageMap = Rule.all
        .filter(rule => rule.quickFix !== undefined)
        .reduce((accumulator, rule) => ({
            ...accumulator, [rule.language]: [
                ...(accumulator[rule.language] ?? []),
                {
                    ruleId: rule.id,
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

    return languageMap;
}

export class QuickFixProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: QuickFix[]) { }

    provideCodeActions(
            document: vscode.TextDocument,
            range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        let text = document.getText(range);
        let edit = this.fixes.find(fix => fix.regex.test(text));
        if (!edit) { return []; }

        while (edit) {
            text = text.replace(edit.regex, edit.quickFix);
            edit = this.fixes.find(fix => fix.regex.test(text));
        }

        const action = new vscode.CodeAction(`Quick fix to '${text}'`, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, range, text);
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
            let text = document.getText(range);
            let edit = this.fixes.find(fix => fix.regex.test(text));
            if (!edit) { continue; }

            while (edit) {
                text = text.replace(edit.regex, edit.quickFix);
                edit = this.fixes.find(fix => fix.regex.test(text));
            }
            edits.push(new vscode.TextEdit(range, text));
        }

        if (edits.length === 0) { return []; }
        fixAllAction.edit.set(document.uri, edits);
        quickFixAction.edit.set(document.uri, edits);
        return [fixAllAction, quickFixAction];
    }
}
