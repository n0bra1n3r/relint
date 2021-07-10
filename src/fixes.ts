import * as vscode from 'vscode';
import { Diagnostic, DiagnosticCollectionName } from './diagnostics';
import Rule, { ConfigSection, FixType } from './rule';
import { sortedIndex } from './util';

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
    return Rule.all
        .filter(rule => rule.fix !== undefined)
        .reduce((accumulator, rule) => ({
            ...accumulator, [rule.id]: {
                language: rule.language,
                regex: rule.regex,
                ruleId: rule.id,
                string: rule.fix!,
                type: rule.fixType
            }
        }), <FixMap>{});
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
        const edits = applyFixes(document, <Diagnostic[]>context.diagnostics, this.fixes);
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

        const edits = applyFixes(document, <Diagnostic[]>diagnostics, this.fixes);
        if (edits.length === 0) { return []; }

        fixAllAction.edit.set(document.uri, edits);
        quickFixAction.edit.set(document.uri, edits);
        return [fixAllAction, quickFixAction];
    }
}

function applyFixes(
        document: vscode.TextDocument,
        diagnostics: Diagnostic[],
        fixes: FixMap): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    for (const { ruleId, range, relatedInformation: info = [] } of diagnostics) {
        const fix = fixes[ruleId];
        if (!fix) { continue; }

        const ranges = [
            range, ...info.map(({ location: { range } }) => range)
        ];

        switch (fix.type) {
            case 'replace':
                edits.push(...applyReplaceFix(document, ranges, fix));
                break;
            case 'reorder_asc':
            case 'reorder_desc':
                edits.push(...applyReorderFix(document, ranges, fix));
                break;
        }
    }

    return edits;
}

function applyReplaceFix(
            document: vscode.TextDocument,
            fixRanges: vscode.Range[],
            fix: Fix): vscode.TextEdit[] {
    return fixRanges.map(range =>
        new vscode.TextEdit(range, document
            .getText(range)
            .replace(fix.regex, fix.string)));
}

function applyReorderFix(
            document: vscode.TextDocument,
            fixRanges: vscode.Range[],
            fix: Fix): vscode.TextEdit[] {
    const ranges: vscode.Range[] = [];
    const sorter: [number, string][] = [];

    for (const [i, range] of fixRanges.entries()) {
        ranges.push(range);

        const fixText = document.getText(range);
        const sortTok = fixText.replace(fix.regex, fix.string);

        const tuple: [number, string] = [i, sortTok];
        const index = fix.type === 'reorder_asc'
            ? sortedIndex(sorter, tuple, ([_i, a], [_j, b]) => a < b)
            : sortedIndex(sorter, tuple, ([_i, a], [_j, b]) => a > b);

        sorter.splice(index, 0, tuple);
    }

    return sorter.map(([j], i) =>
        new vscode.TextEdit(ranges[i], document.getText(ranges[j])));
}
