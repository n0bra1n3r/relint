import * as vscode from 'vscode';
import activateDiagnostics from './diagnostics';
import activateQuickFixes from './quickfixes';
import Rule from './rule';

export function activate(context: vscode.ExtensionContext) {
    Rule.loadAll();

    activateQuickFixes(context);
    activateDiagnostics(context);
}
