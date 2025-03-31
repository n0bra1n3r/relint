import * as vscode from 'vscode';
import activateDiagnostics from './diagnostics';
import activateFixes from './fixes';
import Rule from './rule';

let outputChannel: vscode.OutputChannel;
export function activate(context: vscode.ExtensionContext) {
    // Create a dedicated output channel
    outputChannel = vscode.window.createOutputChannel("Relint");

    // Create the list of rules.
    Rule.loadAll();

    activateFixes(context);
    activateDiagnostics(context);
}

export function deactivate() {
    outputChannel.appendLine("Relint is shutting down.");
    outputChannel.dispose();
}

// Function to log messages to the custom output channel
export function relintLog(message: string) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}