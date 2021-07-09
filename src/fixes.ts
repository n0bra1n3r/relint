import * as vscode from 'vscode';
import { Diagnostic, DiagnosticCollectionName } from './diagnostics';
import Rule, { ConfigSection, FixType } from './rule';
import { sortedIndex } from './util';

const MaxFixIterations = 64;

type Fix = {
    language: string,
    regex: RegExp,
    ruleId: string,
    string: string,
    type: FixType
};

type FixMap = { [id: string]: Fix };

const disposableCache: {
    [language: string]: {
        count: number,
        disposables: vscode.Disposable[]
    }
} = {};

export default function activateFixes(context: vscode.ExtensionContext) {
    const fixes = getFixes();
    registerFixes(context, fixes);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(ConfigSection.Name)) {
            const newFixes = getFixes();

            Object.values(fixes)
                .filter(fix => !newFixes[fix.ruleId])
                .forEach(fix => {
                    deregisterFix(context, fix);
                    delete fixes[fix.ruleId];
                });

            Object.values(newFixes)
                .forEach(newFix => {
                    fixes[newFix.ruleId] = newFix;
                });

            registerFixes(context, newFixes);
        }
    });
}

function getFixes(): FixMap {
    const fixes = Rule.all
        .filter(rule => rule.fix !== undefined)
        .reduce((accumulator, rule) => ({
            ...accumulator, [rule.id]: {
                language: rule.language,
                regex: rule.regex,
                ruleId: rule.id,
                string: rule.fix!,
                type: rule.fixType,
                dispose: () => {}
            }
        }), <FixMap>{});

    return fixes;
}

function registerFixes(context: vscode.ExtensionContext, fixes: FixMap) {
    for (const fix of Object.values(fixes)) {
        if (disposableCache[fix.language]) {
            disposableCache[fix.language].count += 1;
        } else {
            const disposables = [
                vscode.languages.registerCodeActionsProvider(fix.language, new QuickFixProvider(fixes), {
                    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
                }),
                vscode.languages.registerCodeActionsProvider(fix.language, new FixAllProvider(fixes), {
                    providedCodeActionKinds: [
                        vscode.CodeActionKind.SourceFixAll,
                        vscode.CodeActionKind.QuickFix
                    ]
                })
            ];

            context.subscriptions.push(...disposables);

            disposableCache[fix.language] = {
                count: 1,
                disposables
            };
        }
    }
}

function deregisterFix(context: vscode.ExtensionContext, fix: Fix) {
    const disposeData = disposableCache[fix.language];
    if ((disposeData.count -= 1) <= 0) {
        disposeData.disposables.forEach(disposable => disposable.dispose());

        for (const disposable of disposeData.disposables) {
            const index = context.subscriptions.indexOf(disposable);
            context.subscriptions.splice(index, 1);
        }

        delete disposableCache[fix.language];
    }
}

class QuickFixProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: FixMap) { }

    provideCodeActions(
            document: vscode.TextDocument,
            range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        const edits = applyQuickFixes(document, <Diagnostic[]>context.diagnostics, this.fixes);
        if (edits.length === 0) { return []; }

        const action = new vscode.CodeAction('Fix this issue', vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.set(document.uri, edits);
        action.isPreferred = true;
        return [action];
    }
}

class FixAllProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: FixMap) { }

    provideCodeActions(
            document: vscode.TextDocument,
            range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        const fixAllAction = new vscode.CodeAction('Apply all fixes', vscode.CodeActionKind.SourceFixAll);
        fixAllAction.edit = new vscode.WorkspaceEdit();
        const quickFixAction = new vscode.CodeAction('Apply all fixes', vscode.CodeActionKind.QuickFix);
        quickFixAction.edit = new vscode.WorkspaceEdit();

        const diagnostics = vscode.languages
            .getDiagnostics(document.uri)
            .filter(diagnostic => diagnostic.source === DiagnosticCollectionName);

        const edits = applyQuickFixes(document, <Diagnostic[]>diagnostics, this.fixes);
        if (edits.length === 0) { return []; }

        fixAllAction.edit.set(document.uri, edits);
        quickFixAction.edit.set(document.uri, edits);
        return [fixAllAction, quickFixAction];
    }
}

function applyQuickFixes(
        document: vscode.TextDocument,
        diagnostics: Diagnostic[],
        fixes: FixMap): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    const reorderDiagnostics: Diagnostic[] = [];
    for (const diagnostic of diagnostics) {
        const fix = fixes[diagnostic.ruleId];
        if (!fix) { continue; }

        if (fix.type !== 'replace') {
            reorderDiagnostics.push(diagnostic);
            continue;
        }

        const matcher = new RegExp(fix.regex);
        let fixText = document.getText(diagnostic.range);
        let fixIter = 0;

        while (true) {
            fixText = fixText.replace(fix.regex, fix.string);
            if (!matcher.test(fixText) ||
                // required to avoid infinite loops
                (fixIter += 1) > MaxFixIterations) { break; }
        }

        edits.push(new vscode.TextEdit(diagnostic.range, fixText));
    }

    for (const diagnostic of reorderDiagnostics) {
        const fix = fixes[diagnostic.ruleId];

        let fixText = document.getText(diagnostic.range);
        let sortTok = fixText.replace(fix.regex, fix.string);

        const ranges = [diagnostic.range];
        const tuples: [number, string][] = [[0, sortTok]];

        for (const [i, info] of diagnostic.relatedInformation!.entries()) {
            ranges.push(info.location.range);

            fixText = document.getText(info.location.range);
            sortTok = fixText.replace(fix.regex, fix.string);

            const tuple: [number, string] = [i + 1, sortTok];
            const index = fix.type === 'reorder_asc'
                ? sortedIndex(tuples, tuple, ([_i, a], [_j, b]) => a < b)
                : sortedIndex(tuples, tuple, ([_i, a], [_j, b]) => a > b);

            tuples.splice(index, 0, tuple);
        }
        console.log(tuples);
        for (const [i, [j]] of tuples.entries()) {
            edits.push(new vscode.TextEdit(ranges[i], document.getText(ranges[j])));
        }
    }

    return edits;
}
