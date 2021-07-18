import * as vscode from 'vscode';

export const ConfigSectionName = 'relint';

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
    maxLines?: number,
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
    static MaxLines = 1;
    static Severity: Severity = 'Warning';
}

export default class Rule
{
    private static rules: Partial<Record<string, Rule[]>> = {};

    private constructor(
            readonly id: string,
            readonly fixType: FixType,
            readonly language: string,
            readonly maxLines: number,
            readonly message: string,
            readonly name: string,
            readonly regex: RegExp,
            readonly severityCode: vscode.DiagnosticSeverity,
            readonly fix?: string) { }

    public static get all(): Partial<Record<string, Rule[]>> {
        return this.rules;
    }

    public static loadAll() {
        this.rules = this.getRules();
        this.monitorRules();
    }

    static monitorRules() {
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigSectionName)) {
                this.rules = this.getRules();
            }
        });
    }

    static getRules(): Partial<Record<string, Rule[]>> {
        const configuration = vscode.workspace.getConfiguration(ConfigSectionName);
        const globalLanguage = configuration.get<string>('language') || Default.Language;
        const ruleList = configuration.get<Config[]>('rules') ?? [];

        return ruleList
            .filter(({
                fix,
                fixType,
                language,
                maxLines,
                message,
                name,
                pattern,
                severity }) => (
                (fixType === undefined || FixTypes[fixType] !== undefined) &&
                (maxLines === undefined || maxLines >= 0) &&
                (!!message) &&
                (language === undefined || !!language) &&
                (!!name) &&
                (!!pattern) &&
                (severity === undefined || vscode.DiagnosticSeverity[severity] !== undefined) &&
                (fix === undefined || fix !== null)
            ))
            .map(({
                fixType,
                language = globalLanguage,
                ...info
            }) => ({
                ...info,
                fixType: fixType || Default.FixType,
                language: language || Default.Language
            }))
            .reduce((rules, {
                fix,
                fixType,
                language,
                maxLines,
                pattern,
                severity,
                ...info }) => ({
                    ...rules, [language]: [
                        ...(rules[language] ?? []), {
                            ...info,
                            id: `/${pattern}/`,
                            fixType,
                            fix: fixType === 'replace'
                                        ? fix
                                        : fix || Default.Fix,
                            language,
                            maxLines: fixType === 'replace'
                                        ? (maxLines ?? Default.MaxLines)
                                        : (maxLines ?? 0),
                            regex: new RegExp(pattern, 'gim'),
                            severityCode: vscode.DiagnosticSeverity[severity!] ??
                                    vscode.DiagnosticSeverity[Default.Severity]
                        }
                    ]
                }), <Partial<Record<string, Rule[]>>>{});
    }
}
