import * as vscode from 'vscode';

const enum ConfigSection
{
    Name = 'relint',
    Rules = 'rules',
    Flags = 'flags'
}

type Config = {
    id: string,
    flags: string,
    regex: string,
    language: string,
    message: string,
    severity?: vscode.DiagnosticSeverity,
    quickFix?: string
};

const SeverityMap: { [Key in keyof typeof vscode.DiagnosticSeverity]: vscode.DiagnosticSeverity } = {
    Error: vscode.DiagnosticSeverity.Error,
    Warning: vscode.DiagnosticSeverity.Warning,
    Information: vscode.DiagnosticSeverity.Information,
    Hint: vscode.DiagnosticSeverity.Hint
};

export default class Rule
{
    private static rules: Rule[] = [];

    private constructor(
            readonly id: string,
            readonly regex: RegExp,
            readonly language: string,
            readonly message: string,
            readonly severity: vscode.DiagnosticSeverity,
            readonly quickFix?: string) { }

    public static get all() : Rule[] {
        return this.rules;
    }

    public static loadAll() {
        Rule.rules = [];

        const vsconfig = vscode.workspace.getConfiguration(ConfigSection.Name);

        const rules = vsconfig.get<Config[]>(ConfigSection.Rules) ?? [];
        // https://stackoverflow.com/a/31970023/38940
        // The index at which to start the next match. When "g" is absent, this will remain as 0.
        // Adding g to prevent infinite loop
        const globalFlags = vsconfig.get<string>(ConfigSection.Flags) || 'g';

        for (const { flags, regex, severity, ...info } of rules) {
            Rule.rules.push({
                ...info,
                regex: new RegExp(regex, flags || globalFlags),
                severity: SeverityMap[severity ?? "Warning"] ??
                            vscode.DiagnosticSeverity.Warning
            });
        }
    }
}
