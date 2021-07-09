import * as vscode from 'vscode';
import activateDiagnostics from './diagnostics';
import activateFixes from './fixes';
import Rule from './rule';

export function activate(context: vscode.ExtensionContext) {
    Rule.loadAll();

    activateFixes(context);
    activateDiagnostics(context);
}
