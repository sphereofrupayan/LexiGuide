export type Issue = {
  id: string;
  line: number;
  type: string;
  message: string;
  token: string;
  replacement: string;
  offset: number;
  append?: boolean;
  category: "lexical" | "syntax";
};

export type TreeNode = {
  label: string;
  children: TreeNode[];
};

export type Phase = {
  name: string;
  detail: string;
  description: string;
  status: "Passed" | "Needs correction" | "Preview" | "Blocked";
};

export type AnalysisResult = {
  language: string;
  lines: number;
  tokens: number;
  warnings: number;
  complexity: string;
  issues: Issue[];
};

export const LANGUAGES = [
  { id: "auto", label: "Auto" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "php", label: "PHP" },
  { id: "generic", label: "Generic" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const EXAMPLES: Record<Exclude<LanguageId, "auto">, string> = {
  c: `#include <stdio.h>

int main() {
    int student@name = 100;
    printf("%d", student@name);
    return 0;
}`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    string user@name = "LexiCura";
    cout << user@name;
    return 0;
}`,
  java: `public class Main {
    public static void main(String[] args) {
        String user@name = "LexiCura";
        System.out.println(user@name);
    }
}`,
  python: `def calculate_total(price, tax):
    total = price + tax
    print("Total:", total@)
    return total

calculate_total(100, 18)`,
  javascript: `function calculateTotal(price, tax) {
    const total = price + tax;
    console.log("Total:", total@);
    return total;
}

calculateTotal(100, 18);`,
  typescript: `function greet(name: string): string {
    const message = "Hello " + name@;
    return message;
}

console.log(greet("LexiCura"));`,
  csharp: `using System;

class Program {
    static void Main() {
        string user@name = "LexiCura";
        Console.WriteLine(user@name);
    }
}`,
  go: `package main

import "fmt"

func main() {
    user@name := "LexiCura"
    fmt.Println(user@name)
}`,
  rust: `fn main() {
    let user@name = "LexiCura";
    println!("{}", user@name);
}`,
  php: `<?php
$name = "LexiCura";
echo "Hello " . $name@;
?>`,
  generic: `function process(data) {
    result = data + 10;
    return result@;
}`,
};

export const DEFAULT_CODE = EXAMPLES.c;

export function displayLanguage(id: LanguageId, code: string): string {
  if (id !== "auto") {
    return LANGUAGES.find((language) => language.id === id)?.label ?? "Generic";
  }

  if (/^\s*#include\s*</m.test(code)) {
    return /\bcout\b|\bstd::|\bnamespace\s+std\b/.test(code) ? "C++" : "C";
  }
  if (/public\s+class\s+\w+|System\.out\.println|public\s+static\s+void\s+main/.test(code)) return "Java";
  if (/^\s*def\s+\w+\s*\(|^\s*import\s+\w+|^\s*print\s*\(/m.test(code)) return "Python";
  if (/interface\s+\w+|:\s*(string|number|boolean|any)\b|:\s*\w+\[\]/.test(code)) return "TypeScript";
  if (/console\.log|const\s+\w+|let\s+\w+|function\s+\w+/.test(code)) return "JavaScript";
  if (/package\s+main|fmt\.Println|func\s+main\s*\(/.test(code)) return "Go";
  if (/fn\s+main\s*\(|let\s+mut\s+\w+|println!\s*\(/.test(code)) return "Rust";
  if (/<\?php|\$\w+\s*=/.test(code)) return "PHP";
  if (/using\s+System|Console\.WriteLine|static\s+void\s+Main/.test(code)) return "C#";
  return "Generic";
}

function addIssue(
  issues: Issue[],
  issue: Omit<Issue, "id">,
): void {
  const key = `${issue.category}-${issue.line}-${issue.type}-${issue.offset}`;
  if (issues.some((existing) => existing.id === key)) return;
  issues.push({ ...issue, id: key });
}

function checkLexicalIssues(code: string): Issue[] {
  const issues: Issue[] = [];
  const lines = code.split("\n");
  let blockComment = false;
  let absoluteOffset = 0;

  lines.forEach((line, lineIndex) => {
    let quote = "";
    let escaped = false;
    let lineComment = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const next = line[index + 1];

      if (lineComment) break;
      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === "/" && next === "/") {
        lineComment = true;
        break;
      }
      if (character === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
      }
    }

    const codeBeforeComment = line.replace(/\/\/.*$/, "").replace(/\/\*.*$/, "");
    if (quote && !lineComment && !blockComment) {
      const trimmed = codeBeforeComment.trimEnd();
      const quoteOffset = line.lastIndexOf(quote);
      addIssue(issues, {
        line: lineIndex + 1,
        type: "UNTERMINATED STRING",
        message: "A string or character literal is missing its closing quote.",
        token: quote,
        replacement: quote,
        offset: absoluteOffset + Math.max(quoteOffset + 1, trimmed.length),
        category: "lexical",
      });
    }

    const patterns: Array<{ regex: RegExp; type: string; message: (token: string) => string; replace: (token: string) => string }> = [
      {
        regex: /\b[A-Za-z_][A-Za-z0-9_]*@[A-Za-z_][A-Za-z0-9_]*\b/g,
        type: "INVALID IDENTIFIER",
        message: (token) => `The identifier "${token}" contains an unsupported character.`,
        replace: (token) => token.replace("@", "_"),
      },
      {
        regex: /\b[A-Za-z_][A-Za-z0-9_]*@(?=\s|[;,.)\]}]|$)/g,
        type: "INVALID TOKEN",
        message: (token) => `The token "${token}" contains an unexpected symbol.`,
        replace: (token) => token.replace("@", ""),
      },
      {
        regex: /\b\d+\.\d+\.\d+\b/g,
        type: "MALFORMED NUMBER",
        message: (token) => `The numeric literal "${token}" contains multiple decimal points.`,
        replace: (token) => token.split(".").slice(0, 2).join("."),
      },
    ];

    if (!blockComment) {
      for (const pattern of patterns) {
        for (const match of codeBeforeComment.matchAll(pattern.regex)) {
          const token = match[0];
          addIssue(issues, {
            line: lineIndex + 1,
            type: pattern.type,
            message: pattern.message(token),
            token,
            replacement: pattern.replace(token),
            offset: absoluteOffset + (match.index ?? 0),
            category: "lexical",
          });
        }
      }

      const duplicate = codeBeforeComment.match(/([;,:+\-*\/=])\1+/);
      if (duplicate && duplicate.index !== undefined) {
        addIssue(issues, {
          line: lineIndex + 1,
          type: "SUSPICIOUS TOKEN",
          message: `Repeated operator "${duplicate[0]}" may be malformed.`,
          token: duplicate[0],
          replacement: duplicate[1],
          offset: absoluteOffset + duplicate.index,
          category: "lexical",
        });
      }
    }

    absoluteOffset += line.length + 1;
  });

  return issues;
}

function checkDelimiterIssues(code: string): Issue[] {
  const openings: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const closing = new Set(Object.values(openings));
  const stack: Array<{ token: string; line: number }> = [];
  const issues: Issue[] = [];
  let quote = "";
  let escaped = false;
  let line = 1;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    const next = code[index + 1];
    if (character === "\n") {
      line += 1;
      lineComment = false;
      if (quote && quote !== "`") quote = "";
      escaped = false;
      continue;
    }
    if (lineComment) continue;
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (openings[character]) {
      stack.push({ token: character, line });
      continue;
    }
    if (!closing.has(character)) continue;

    const expected = stack.length ? openings[stack[stack.length - 1].token] : "";
    if (character === expected) {
      stack.pop();
    } else {
      issues.push({
        id: `syntax-${line}-${index}`,
        line,
        type: "UNMATCHED DELIMITER",
        message: `The closing "${character}" does not match ${expected ? `"${expected}"` : "an opening delimiter"}.`,
        token: character,
        replacement: "",
        offset: index,
        category: "syntax",
      });
    }
  }

  if (stack.length) {
    const missing = stack.reverse().map(({ token }) => openings[token]).join("");
    issues.push({
      id: `syntax-unclosed-${code.length}`,
      line: code.split("\n").length,
      type: "UNCLOSED DELIMITER",
      message: `Add the missing closing delimiter${missing.length > 1 ? "s" : ""}: ${missing}.`,
      token: "",
      replacement: `\n${missing}`,
      offset: code.length,
      append: true,
      category: "syntax",
    });
  }

  return issues;
}

export function analyzeSource(code: string, languageId: LanguageId): AnalysisResult {
  const issues = [...checkLexicalIssues(code), ...checkDelimiterIssues(code)]
    .sort((first, second) => first.offset - second.offset);
  const lines = code.split("\n");
  const cleanCode = code
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const tokenMatches = cleanCode.match(
    /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|<=|>=|&&|\|\||=>|[{}()[\];,.:+\-*/%=<>!&|?$@]/g,
  );
  const branching = (code.match(/\b(if|else|for|while|switch|case|catch|try|function|def|fn|match)\b/g) ?? []).length;

  return {
    language: displayLanguage(languageId, code),
    lines: lines.length,
    tokens: tokenMatches?.length ?? 0,
    warnings: Number(code.length > 1500) +
      Number(/\bTODO\b/i.test(code)) +
      Number(/\bdebugger\b/.test(code)) +
      Number((code.match(/console\.log/g) ?? []).length > 2) +
      Number(issues.length > 3),
    complexity: branching <= 4 ? "Low" : branching <= 9 ? "Medium" : "High",
    issues,
  };
}

function classifyStatement(tokens: string[], hasCall: boolean): string {
  if (tokens.some((token) => ["function", "def", "fn"].includes(token))) return "Function declaration";
  if (tokens.includes("class")) return "Class declaration";
  if (tokens[0] === "if" || tokens[0] === "else") return "Conditional statement";
  if (["for", "while", "do"].includes(tokens[0])) return "Loop statement";
  if (["import", "using", "package"].includes(tokens[0])) return "Import / package";
  if (tokens[0] === "return") return "Return statement";
  if (["const", "let", "var", "int", "float", "double", "String", "string", "auto"].includes(tokens[0])) {
    return "Variable declaration";
  }
  if (hasCall) return "Function / method declaration";
  return "Expression statement";
}

function tokenTreeNode(token: string): TreeNode {
  const category = /^[A-Za-z_$]/.test(token)
    ? "Identifier"
    : /^\d/.test(token)
      ? "Number"
      : /^["'`]/.test(token)
        ? "Literal"
        : "Token";
  return { label: `${category}: ${token}`, children: [] };
}

export function buildParseTree(code: string): TreeNode {
  const source = code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/^\s*#.*$/gm, " ");
  const tokens = source.match(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|<=|>=|&&|\|\||=>|[{}()[\];,.:+\-*/%=<>!&|?$@]/g,
  ) ?? [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closing = new Set(Object.values(pairs));
  let position = 0;

  function parseScope(expectedClose?: string): TreeNode[] {
    const statements: TreeNode[] = [];
    let entries: TreeNode[] = [];
    let words: string[] = [];
    let hasCall = false;

    const flush = () => {
      if (!entries.length) return;
      statements.push({ label: classifyStatement(words, hasCall), children: entries });
      entries = [];
      words = [];
      hasCall = false;
    };

    while (position < tokens.length) {
      const token = tokens[position++];
      if (expectedClose && token === expectedClose) break;
      if (closing.has(token)) continue;

      if (pairs[token]) {
        const nested = parseScope(pairs[token]);
        if (token === "{") {
          const block: TreeNode = { label: "Block", children: nested };
          if (entries.length) {
            entries.push(block);
            flush();
          } else {
            statements.push(block);
          }
        } else {
          const before = words[words.length - 1];
          const functionParams = words.some((word) => ["function", "def", "fn"].includes(word));
          const groupLabel = token === "["
            ? "Array / index"
            : functionParams
              ? "Parameters"
              : before && /^[A-Za-z_$]/.test(before)
                ? "Call arguments"
                : "Grouped expression";
          entries.push({ label: groupLabel, children: nested });
          hasCall = hasCall || groupLabel === "Call arguments";
        }
        continue;
      }

      if (token === ";") {
        flush();
        continue;
      }
      if (token === ",") continue;
      entries.push(tokenTreeNode(token));
      words.push(token);
    }

    flush();
    return statements;
  }

  return { label: "Program", children: parseScope() };
}

export function getCompilerPhases(result: AnalysisResult): Phase[] {
  const lexicalIssues = result.issues.filter((issue) => issue.category === "lexical");
  const syntaxIssues = result.issues.filter((issue) => issue.category === "syntax");
  const failedPhase = lexicalIssues.length ? "lexical" : syntaxIssues.length ? "syntax" : "";
  const clean = result.issues.length === 0;
  const definitions = [
    {
      name: "Lexical analysis",
      key: "lexical",
      detail: `${result.tokens} token${result.tokens === 1 ? "" : "s"} scanned`,
      description: "Converts source characters into tokens such as identifiers, literals, keywords and operators.",
    },
    {
      name: "Syntax analysis",
      key: "syntax",
      detail: syntaxIssues.length
        ? `${syntaxIssues.length} delimiter issue${syntaxIssues.length === 1 ? "" : "s"} found`
        : "Delimiter structure checked",
      description: "Checks token grouping and delimiter structure. A complete grammar check requires a language-specific parser.",
    },
    {
      name: "Semantic analysis",
      key: "semantic",
      detail: "Requires a language-specific compiler",
      description: "A real compiler checks declarations, types, scope and valid operations. LexiCura does not run this phase.",
    },
    {
      name: "Intermediate code generation",
      key: "intermediate",
      detail: clean ? "Structural preview available" : "Waiting for valid structure",
      description: "Compilers translate validated syntax into an intermediate form for optimization and target-specific output.",
    },
    {
      name: "Optimization",
      key: "optimization",
      detail: "Not run in this mobile preview",
      description: "A compiler may optimize its intermediate representation while preserving program behavior. No optimization is performed here.",
    },
    {
      name: "Target code generation",
      key: "generation",
      detail: "Requires a compiler backend",
      description: "A target backend emits machine code, bytecode or other output. LexiCura does not include a compiler backend.",
    },
  ];

  return definitions.map((phase, index) => {
    let status: Phase["status"] = "Preview";
    if (phase.key === failedPhase) status = "Needs correction";
    else if (
      failedPhase &&
      index > (failedPhase === "lexical" ? 0 : 1)
    ) status = "Blocked";
    else if (phase.key === "lexical" && !lexicalIssues.length) status = "Passed";
    else if (phase.key === "syntax" && !lexicalIssues.length && !syntaxIssues.length) status = "Passed";
    else if (phase.key === "intermediate" && clean) status = "Passed";
    return { name: phase.name, detail: phase.detail, description: phase.description, status };
  });
}

export function makeAssistantReply(question: string, result: AnalysisResult | null, selectedIssue: Issue | null): string {
  if (!result) return "Paste or load source code and run analysis first. I can then explain issues, fixes, and compiler stages.";
  if (!result.issues.length) {
    return "The current source passed LexiCura's lexical and delimiter checks. The parse tree is a structural preview; a language compiler is still needed to validate full syntax and meaning.";
  }
  const issue = selectedIssue ?? result.issues[0];
  const lower = question.toLowerCase();
  if (lower.includes("why")) return `${issue.type} on line ${issue.line}: ${issue.message}`;
  if (lower.includes("fix") || lower.includes("change")) {
    return issue.append
      ? `Add the missing closing delimiter${issue.replacement.length > 2 ? "s" : ""} at the end of the source: ${issue.replacement.trim()}.`
      : `Suggested change on line ${issue.line}: "${issue.token}" → "${issue.replacement}". Review it before applying.`;
  }
  return `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found. The selected issue is ${issue.type} on line ${issue.line}. ${issue.message}`;
}
