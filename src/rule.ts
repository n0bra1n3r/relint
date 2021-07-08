import * as vscode from 'vscode';

export const enum ConfigSection
{
    Name = 'relint',
    Flags = 'flags',
    Language = 'language',
    Rules = 'rules',
}

export type FixType = 'reorder_asc' | 'reorder_desc' | 'replace';

export type Severity = keyof typeof vscode.DiagnosticSeverity;

type Config = {
    id: string,
    fixType?: FixType,
    flags?: string,
    language?: string,
    message: string,
    regex: string,
    severity?: Severity,
    quickFix?: string
};

class Default
{
    static Language = 'plaintext';
    static FixType: FixType = 'replace';
    static Severity: Severity = 'Warning';
}

export default class Rule
{
    private static rules: Rule[] = [];

    private constructor(
            readonly id: string,
            readonly fixType: FixType,
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

        const globalFlags = vsconfig.get<string>(ConfigSection.Flags) || '';
        const globalLanguage = vsconfig.get<string>(ConfigSection.Language) || Default.Language;

        for (const { fixType, flags, language, quickFix, regex, severity, ...info } of rules) {
            const rule = {
                ...info, quickFix,
                fixType: fixType || Default.FixType,
                language: language || globalLanguage,
                regex: new RegExp(regex, (flags || globalFlags).replace(/[^dimsuy]/g, '') + 'g'),
                severity: vscode.DiagnosticSeverity[severity!] ??
                          vscode.DiagnosticSeverity[Default.Severity]
            };
            if (rule.fixType === 'reorder_asc' ||
                rule.fixType === 'reorder_desc') {
                rule.quickFix = rule.quickFix || '$&';
            }
            Rule.rules.push(rule);
        }
    }
}
