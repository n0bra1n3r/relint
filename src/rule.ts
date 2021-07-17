import * as vscode from 'vscode';

export const enum ConfigSection
{
    Name = 'relint',
    Language = 'language',
    Rules = 'rules'
}

enum FixTypes
{
    reorder_asc,
    reorder_desc,
    replace
}

export type FixType = keyof typeof FixTypes;

export type Severity = keyof typeof vscode.DiagnosticSeverity;

type Config = {
    fix?: string,
    fixType?: FixType,
    language?: string,
    message: string,
    name: string,
    pattern: string,
    severity?: Severity
};

class Default
{
    static Fix = '$&';
    static FixType: FixType = 'replace';
    static Language = 'plaintext';
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
            readonly name: string,
            readonly regex: RegExp,
            readonly severityCode: vscode.DiagnosticSeverity,
            readonly fix?: string) { }

    public static get all(): Rule[] {
        return this.rules;
    }

    public static loadAll() {
        this.rules = this.getRules();
        this.monitorRules();
    }

    static monitorRules() {
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigSection.Name)) {
                this.rules = this.getRules();
            }
        });
    }

    static getRules(): Rule[] {
        const config = vscode.workspace.getConfiguration(ConfigSection.Name);

        const ruleConfigs = config.get<Config[]>(ConfigSection.Rules) ?? [];
        const globalLanguage = config.get<string>(ConfigSection.Language) || Default.Language;

        return ruleConfigs
            .filter(({
                fix,
                fixType,
                language,
                message,
                name,
                pattern,
                severity }) => (
                (fixType === undefined || FixTypes[fixType] !== undefined) &&
                (!!message) &&
                (language === undefined || !!language) &&
                (!!name) &&
                (!!pattern) &&
                (severity === undefined || vscode.DiagnosticSeverity[severity] !== undefined) &&
                (fix === undefined || fix !== null)
            ))
            .map(({
                fix,
                fixType,
                language = globalLanguage,
                pattern,
                severity,
                ...info }) => ({
                ...info,
                id: `/${pattern}/`,
                fixType: fixType || Default.FixType,
                language: language || Default.Language,
                fix: (fixType || Default.FixType) === 'replace'
                          ? fix
                          : fix || Default.Fix,
                regex: new RegExp(pattern, 'gim'),
                severityCode: vscode.DiagnosticSeverity[severity!] ??
                          vscode.DiagnosticSeverity[Default.Severity]
            }));
    }
}
