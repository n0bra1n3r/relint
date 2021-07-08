import * as vscode from 'vscode';
import { DiagnosticCollectionName } from './diagnostics';
import Rule, { ConfigSection, FixType } from './rule';
import { sortedIndex } from './util';

const MaxFixIterations = 64;

type QuickFix = {
    regex: RegExp,
    ruleId: string,
    type: FixType,
    quickFix: string
};

type QuickFixMap = { [id: string]: QuickFix };
type LanguageFixesMap = { [language: string]: QuickFixMap };

export default function activateQuickFixes(context: vscode.ExtensionContext) {
    const quickFixes = loadQuickFixes(context);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(ConfigSection.Name)) {
            Rule.loadAll();

            for (const rule of Rule.all) {
                const map = quickFixes[rule.language];
                const fix = map[rule.id];
                if (!fix) { continue; }

                if (rule.quickFix === undefined) {
                    delete map[rule.id];
                } else {
                    fix.regex = rule.regex;
                    fix.quickFix = rule.quickFix;
                }
            }
        }
    });
}

function loadQuickFixes(context: vscode.ExtensionContext): LanguageFixesMap {
    const languageMap = Rule.all
        .filter(rule => rule.quickFix !== undefined)
        .reduce((accumulator, rule) => ({
            ...accumulator, [rule.language]: {
                ...(accumulator[rule.language] ?? {}),
                [rule.id]: {
                    regex: rule.regex,
                    ruleId: rule.id,
                    type: rule.fixType,
                    quickFix: rule.quickFix!
                }
            }
        }), <LanguageFixesMap>{});

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

class QuickFixProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: QuickFixMap) { }

    provideCodeActions(
            document: vscode.TextDocument,
            range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        const edits = applyQuickFixes(document, context.diagnostics, this.fixes);
        if (edits.length === 0) { return []; }

        const action = new vscode.CodeAction('Fix this issue', vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.set(document.uri, edits);
        action.isPreferred = true;
        return [action];
    }
}

class QuickFixAllProvider implements vscode.CodeActionProvider {

    public constructor(readonly fixes: QuickFixMap) { }

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

        const edits = applyQuickFixes(document, diagnostics, this.fixes);
        if (edits.length === 0) { return []; }

        fixAllAction.edit.set(document.uri, edits);
        quickFixAction.edit.set(document.uri, edits);
        return [fixAllAction, quickFixAction];
    }
}

function applyQuickFixes(
        document: vscode.TextDocument,
        diagnostics: Readonly<vscode.Diagnostic[]>,
        fixes: QuickFixMap): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    const reorderDiagnostics: vscode.Diagnostic[] = [];
    for (const diagnostic of diagnostics) {
        const fix = fixes[<string>diagnostic.code];
        if (!fix) { continue; }

        if (fix.type !== 'replace') {
            reorderDiagnostics.push(diagnostic);
            continue;
        }

        const matcher = new RegExp(fix.regex);
        let fixText = document.getText(diagnostic.range);
        let fixIter = 0;

        while (true) {
            fixText = fixText.replace(fix.regex, fix.quickFix);
            if (!matcher.test(fixText) ||
                // required to avoid infinite loops
                (fixIter += 1) > MaxFixIterations) { break; }
        }

        edits.push(new vscode.TextEdit(diagnostic.range, fixText));
    }

    for (const diagnostic of reorderDiagnostics) {
        const fix = fixes[<string>diagnostic.code];

        let fixText = document.getText(diagnostic.range);
        let sortTok = fixText.replace(fix.regex, fix.quickFix);

        const ranges = [diagnostic.range];
        const tuples: [number, string][] = [[0, sortTok]];

        for (const [i, info] of diagnostic.relatedInformation!.entries()) {
            ranges.push(info.location.range);

            fixText = document.getText(info.location.range);
            sortTok = fixText.replace(fix.regex, fix.quickFix);

            const tuple: [number, string] = [i + 1, sortTok];
            const index = fix.type === 'reorder_asc'
                ? sortedIndex(tuples, tuple, ([_i, a], [_j, b]) => a < b)
                : sortedIndex(tuples, tuple, ([_i, a], [_j, b]) => a > b);

            tuples.splice(index, 0, tuple);
        }

        for (const [i, [j]] of tuples.entries()) {
            edits.push(new vscode.TextEdit(ranges[i], document.getText(ranges[j])));
        }
    }

    return edits;
}
