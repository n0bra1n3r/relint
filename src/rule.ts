import * as vscode from 'vscode';

export const enum ConfigSection
{
    Name = 'relint',
    Flags = 'flags',
    Language = 'language',
    Rules = 'rules',
}

type Config = {
    id: string,
    flags?: string,
    language?: string,
    message: string,
    regex: string,
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
            readonly language: string,
            readonly message: string,
            readonly regex: RegExp,
            readonly severity: vscode.DiagnosticSeverity,
            readonly quickFix?: string) { }

    public static get all() : Rule[] {
        return this.rules;
    }

    public static loadAll() {
        Rule.rules = [];

        const vsconfig = vscode.workspace.getConfiguration(ConfigSection.Name);

        const rules = vsconfig.get<Config[]>(ConfigSection.Rules) ?? [];

        const globalFlags = vsconfig.get<string>(ConfigSection.Flags);
        const globalLanguage = vsconfig.get<string>(ConfigSection.Language) || 'plaintext';

        for (const { flags, language, regex, severity, ...info } of rules) {
            Rule.rules.push({
                ...info,
                language: language || globalLanguage,
                regex: new RegExp(regex, (flags || globalFlags)?.replace("g", "")),
                severity: SeverityMap[severity ?? "Warning"] ??
                            vscode.DiagnosticSeverity.Warning
            });
        }
    }
}
