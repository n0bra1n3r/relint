import * as vscode from 'vscode';
import { Diagnostic, DiagnosticCollectionName } from './diagnostics';
import Rule, { ConfigSection, FixType } from './rule';
import { sortedIndex } from './util';

type Fix = {
    group: string,
    language: string,
    regex: RegExp,
    ruleId: string,
    string: string,
    type: FixType
};

type FixMap = { [id: string]: Fix };

const MaxFixIters = 64;

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
                group: rule.name,
                language: rule.language,
                regex: new RegExp(rule.regex),
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

class QuickFixProvider implements vscode.CodeActionProvider
{
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

class FixAllProvider implements vscode.CodeActionProvider
{
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

    for (const diagnostic of diagnostics) {
        const fullRange = diagnostic.effectiveRange;
        const editRange = diagnostics.reduce((range, fixable) => {
            const fixRange = fixable.effectiveRange;
            if (fixRange.intersection(range))
                return fixRange.union(range);
            return range;
        }, fullRange);
        const rangeText = document.getText(editRange);
        const fixGroup = Object.values(fixes)
            .filter(fix => fix.group === diagnostic.code);

        let fixedText: string | undefined;
        for (let fixIter = 0; fixIter < MaxFixIters; fixIter += 1) {
            for (const fix of fixGroup) {
                switch (fix.type) {
                    case 'replace':
                        fixedText = applyReplaceFix(fixedText ?? rangeText, fix)
                            ?? fixedText;
                        break;
                    case 'reorder_asc':
                    case 'reorder_desc':
                        fixedText = applyReorderFix(fixedText ?? rangeText, fix)
                            ?? fixedText;
                        break;
                }
            }
            if (!fixedText) { break; }
        }
        if (fixedText) { edits.push(new vscode.TextEdit(editRange, fixedText)); }
    }

    return edits;
}

function applyReplaceFix(text: string, fix: Fix): string | undefined {
    if (!fix.regex.test(text)) { return undefined; }
    return text.replace(fix.regex, fix.string);
}

function applyReorderFix(text: string, fix: Fix): string | undefined {
    const sorter: [number, string][] = [];
    const bucket: [string, number][] = [];

    let array: RegExpExecArray | null;
    let doFix = false;
    let count = 0;
    while (array = fix.regex.exec(text)) {
        const lastIndex = fix.regex.lastIndex;
        const match = array[0];
        const token = match.replace(fix.regex, fix.string);
        fix.regex.lastIndex = lastIndex;

        const tuple: [number, string] = [count, token];
        const index = fix.type === 'reorder_asc'
            ? sortedIndex(sorter, tuple, ([_i, a], [_j, b]) => a <= b)
            : sortedIndex(sorter, tuple, ([_i, a], [_j, b]) => a >= b);

        sorter.splice(index, 0, tuple);
        bucket.push([match, array.index]);

        doFix = doFix || count !== index;
        count += 1;
    }

    if (!doFix) { return undefined; }

    let result = '';
    let offset = 0;
    for (const [i, [j]] of sorter.entries()) {
        const [match0, index0] = bucket[i];
        const [match1] = bucket[j];
        const length0 = match0.length;
        let part = text.substring(offset, index0 + length0);
        part = part.replace(match0, match1);
        result += part;
        offset = index0 + length0;
    }
    result += text.substr(offset);

    return result;
}
