const editor = document.getElementById("codeEditor");
const lineNumbers = document.getElementById("lineNumbers");
const typewriter = document.getElementById("typewriter");
const languageSelect = document.getElementById("language");

let detectedIssues = [];
let selectedIssue = null;
let correctionReady = false;
let compilerPhaseData = [];
let typeIndex = 0;
let charIndex = 0;
let deleting = false;

const typeTexts = [
    "An agent harness for lexical intelligence.",
    "Understand errors. Repair code. Verify results.",
    "From lexical error to validated correction.",
    "Context-aware analysis for modern source code."
];

const examples = {
    c: `#include <stdio.h>

int main() {
    int student@name = 100;
    printf("%d", student@name);
    return 0;
}`,

    cpp: `#include <iostream>
using namespace std;

int main() {
    string user@name = "Rupayan";
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
}`
};

const defaultCode = examples.c;

document.addEventListener("DOMContentLoaded", () => {
    editor.value = defaultCode;
    try {
        const savedCode = localStorage.getItem("lexiguide-draft");
        const savedLanguage = localStorage.getItem("lexiguide-language");
        const savedTheme = localStorage.getItem("lexiguide-theme");

        if (savedCode !== null) {
            editor.value = savedCode;
        }
        if (savedLanguage && Array.from(languageSelect.options).some(option => option.value === savedLanguage)) {
            languageSelect.value = savedLanguage;
        }
        if (savedTheme === "dark" || savedTheme === "light") {
            document.documentElement.dataset.theme = savedTheme;
        }
    } catch (error) {
        console.error("Unable to restore LexiCura preferences.", error);
        showToast("Could not restore saved preferences");
    }
    updateThemeButtons();
    updateEditor();
    startTypewriter();

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.16 });

    document.querySelectorAll(".reveal").forEach((section) => {
        revealObserver.observe(section);
    });

    document.getElementById("aiOrb").addEventListener("click", toggleAI);
});

function startTypewriter() {
    const current = typeTexts[typeIndex];

    if (!deleting) {
        typewriter.textContent = current.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === current.length) {
            deleting = true;
            setTimeout(startTypewriter, 1800);
            return;
        }
    } else {
        typewriter.textContent = current.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
            deleting = false;
            typeIndex = (typeIndex + 1) % typeTexts.length;
        }
    }

    setTimeout(startTypewriter, deleting ? 35 : 55);
}

function launchApp() {
    document.getElementById("landing").style.display = "none";
    document.getElementById("navbar").style.display = "none";
    document.getElementById("app").style.display = "block";
    window.scrollTo({ top: 0, behavior: "instant" });
    updateEditor();
}

function showLanding() {
    document.getElementById("app").style.display = "none";
    document.getElementById("landing").style.display = "block";
    document.getElementById("navbar").style.display = "flex";
    window.scrollTo({ top: 0, behavior: "instant" });
}

function toggleMenu() {
    document.querySelector(".nav-links").classList.toggle("mobile-open");
}

function updateEditor() {
    const lines = editor.value.split("\n");

    lineNumbers.innerHTML = lines
        .map((_, index) => index + 1)
        .join("<br>");

    document.getElementById("lineCount").textContent =
        `${lines.length} lines`;

    document.getElementById("charCount").textContent =
        `${editor.value.length} chars`;

    document.getElementById("languageBadge").textContent =
        languageSelect.value.toUpperCase();

    saveDraft();
}

function saveDraft() {
    try {
        localStorage.setItem("lexiguide-draft", editor.value);
        localStorage.setItem("lexiguide-language", languageSelect.value);
        document.getElementById("draftStatus").textContent = "Draft saved locally";
    } catch (error) {
        document.getElementById("draftStatus").textContent = "Draft not saved";
        console.error("Unable to save the LexiCura draft.", error);
    }
}

function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark"
        ? "light"
        : "dark";

    document.documentElement.dataset.theme = nextTheme;
    updateThemeButtons();

    try {
        localStorage.setItem("lexiguide-theme", nextTheme);
    } catch (error) {
        console.error("Unable to save the LexiCura theme preference.", error);
        showToast("Theme changed, but could not be saved");
        return;
    }

    showToast(`${nextTheme === "dark" ? "Dark" : "Light"} theme enabled`);
}

function updateThemeButtons() {
    const nextTheme = document.documentElement.dataset.theme === "dark"
        ? "light"
        : "dark";

    document.querySelectorAll(".theme-toggle").forEach(button => {
        button.textContent = `${nextTheme === "dark" ? "Dark" : "Light"} mode`;
        button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    });
}

async function copySource() {
    try {
        await navigator.clipboard.writeText(editor.value);
        showToast("Source copied to clipboard");
    } catch (error) {
        console.error("Unable to copy source to the clipboard.", error);
        showToast("Clipboard access is unavailable");
    }
}

function downloadSource() {
    const extensions = {
        c: "c",
        cpp: "cpp",
        "c++": "cpp",
        java: "java",
        python: "py",
        javascript: "js",
        typescript: "ts",
        csharp: "cs",
        "c#": "cs",
        go: "go",
        rust: "rs",
        php: "php",
        generic: "txt",
        auto: "txt"
    };
    const language = languageSelect.value === "auto"
        ? detectLanguage(editor.value).toLowerCase()
        : languageSelect.value;
    const extension = extensions[language] || "txt";
    const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `lexicura-source.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Source file downloaded");
}

function loadExample() {
    const language = languageSelect.value === "auto"
        ? "java"
        : languageSelect.value;

    editor.value = examples[language] || examples.generic;
    updateEditor();
    clearAnalysis();
    showToast("Example source loaded");
}

function resetCode() {
    editor.value = defaultCode;
    languageSelect.value = "auto";
    updateEditor();
    clearAnalysis();
    showToast("Source reset");
}

languageSelect.addEventListener("change", updateEditor);

document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && document.activeElement === editor) {
        event.preventDefault();
        analyzeCode();
    }
});

function detectLanguage(code) {
    const selected = languageSelect.value;

    if (selected !== "auto") {
        return selected;
    }

    if (/^\s*#include\s*</m.test(code)) {
        if (/\bcout\b|\bstd::|\bnamespace\s+std\b/.test(code)) {
            return "C++";
        }
        return "C";
    }

    if (/public\s+class\s+\w+|System\.out\.println|public\s+static\s+void\s+main/.test(code)) {
        return "Java";
    }

    if (/^\s*def\s+\w+\s*\(|^\s*import\s+\w+|^\s*print\s*\(/m.test(code)) {
        return "Python";
    }

    if (/interface\s+\w+|:\s*(string|number|boolean|any)\b|:\s*\w+\[\]/.test(code)) {
        return "TypeScript";
    }

    if (/console\.log|const\s+\w+|let\s+\w+|function\s+\w+/.test(code)) {
        return "JavaScript";
    }

    if (/package\s+main|fmt\.Println|func\s+main\s*\(/.test(code)) {
        return "Go";
    }

    if (/fn\s+main\s*\(|let\s+mut\s+\w+|println!\s*\(/.test(code)) {
        return "Rust";
    }

    if (/<\?php|\$\w+\s*=/.test(code)) {
        return "PHP";
    }

    if (/using\s+System|Console\.WriteLine|static\s+void\s+Main/.test(code)) {
        return "C#";
    }

    return "Generic";
}

function normalizeLanguage(language) {
    const map = {
        c: "C",
        cpp: "C++",
        java: "Java",
        python: "Python",
        javascript: "JavaScript",
        typescript: "TypeScript",
        csharp: "C#",
        go: "Go",
        rust: "Rust",
        php: "PHP",
        generic: "Generic"
    };

    return map[language] || language;
}

function detectLexicalIssues(code) {
    const lines = code.split("\n");
    const issues = [];

    lines.forEach((line, index) => {
        const lineNumber = index + 1;

        if (!line.trim()) {
            return;
        }

        const stringMatches = line.match(/(["'`])(?:\\.|(?!\1).)*$/);

        if (stringMatches && !hasBalancedQuotes(line)) {
            issues.push({
                line: lineNumber,
                type: "UNTERMINATED STRING",
                message: "A string or character literal appears to remain open.",
                token: stringMatches[0].trim(),
                replacement: getStringReplacement(line)
            });
        }

        const identifierMatch = line.match(/\b[A-Za-z_][A-Za-z0-9_]*@[A-Za-z_][A-Za-z0-9_]*\b/);

        if (identifierMatch) {
            const token = identifierMatch[0];

            issues.push({
                line: lineNumber,
                type: "INVALID IDENTIFIER",
                message: `The identifier "${token}" contains an unsupported character.`,
                token,
                replacement: token.replace("@", "_")
            });
        }

        const trailingAt = line.match(/\b[A-Za-z_][A-Za-z0-9_]*@\b/);

        if (trailingAt) {
            const token = trailingAt[0];

            issues.push({
                line: lineNumber,
                type: "INVALID TOKEN",
                message: `The token "${token}" contains an unexpected symbol.`,
                token,
                replacement: token.replace("@", "")
            });
        }

        const numberMatch = line.match(/\b\d+\.\d+\.\d+\b/);

        if (numberMatch) {
            const token = numberMatch[0];

            issues.push({
                line: lineNumber,
                type: "MALFORMED NUMBER",
                message: `The numeric literal "${token}" contains multiple decimal points.`,
                token,
                replacement: token.split(".").slice(0, 2).join(".")
            });
        }

        const unsupportedMatch = line.match(/[^\w\s"'`.,;:{}()[\]<>+\-*\/=%!&|?$#@\\]/);

        if (unsupportedMatch) {
            const token = unsupportedMatch[0];

            issues.push({
                line: lineNumber,
                type: "INVALID CHARACTER",
                message: `The character "${token}" may not belong to the supported lexical alphabet.`,
                token,
                replacement: ""
            });
        }

        if (/[;,:+\-*\/=]\s*[;,:+\-*\/=]/.test(line)) {
            const duplicate = line.match(/([;,:+\-*\/=])\1+/);

            if (duplicate) {
                issues.push({
                    line: lineNumber,
                    type: "SUSPICIOUS TOKEN",
                    message: `Repeated operator "${duplicate[0]}" may represent a malformed token.`,
                    token: duplicate[0],
                    replacement: duplicate[1]
                });
            }
        }
    });

    return removeDuplicateIssues(issues);
}

function hasBalancedQuotes(line) {
    let single = 0;
    let double = 0;
    let backtick = 0;

    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'" && line[i - 1] !== "\\") single++;
        if (line[i] === '"' && line[i - 1] !== "\\") double++;
        if (line[i] === "`" && line[i - 1] !== "\\") backtick++;
    }

    return single % 2 === 0 &&
        double % 2 === 0 &&
        backtick % 2 === 0;
}

function getStringReplacement(line) {
    const trimmed = line.trim();

    if (trimmed.includes('"')) {
        return line + '"';
    }

    if (trimmed.includes("'")) {
        return line + "'";
    }

    if (trimmed.includes("`")) {
        return line + "`";
    }

    return line;
}

function removeDuplicateIssues(issues) {
    const seen = new Set();

    return issues.filter(issue => {
        const key = `${issue.line}-${issue.type}-${issue.token}`;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function checkStructure(code) {
    const opening = new Map([["(", ")"], ["{", "}"], ["[", "]"]]);
    const closing = new Set(opening.values());
    const stack = [];
    const issues = [];
    let quote = "";
    let escaped = false;
    let line = 1;
    let inLineComment = false;
    let inBlockComment = false;

    for (let index = 0; index < code.length; index++) {
        const character = code[index];
        const next = code[index + 1];

        if (character === "\n") {
            line++;
            inLineComment = false;
            if (quote && quote !== "`") {
                quote = "";
            }
            escaped = false;
            continue;
        }

        if (inLineComment) continue;
        if (inBlockComment) {
            if (character === "*" && next === "/") {
                inBlockComment = false;
                index++;
            }
            continue;
        }

        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                quote = "";
            }
            continue;
        }

        if (character === "/" && next === "/") {
            inLineComment = true;
            index++;
            continue;
        }
        if (character === "/" && next === "*") {
            inBlockComment = true;
            index++;
            continue;
        }
        if (character === "'" || character === '"' || character === "`") {
            quote = character;
            continue;
        }
        if (opening.has(character)) {
            stack.push({ token: character, line });
            continue;
        }
        if (!closing.has(character)) continue;

        const expected = stack.length
            ? opening.get(stack[stack.length - 1].token)
            : null;

        if (character === expected) {
            stack.pop();
        } else {
            issues.push({
                line,
                type: "UNMATCHED DELIMITER",
                message: `The closing delimiter "${character}" has no matching "${expected || "opening delimiter"}".`,
                token: character,
                replacement: "",
                offset: index
            });
        }
    }

    if (stack.length) {
        const missingClosers = stack
            .reverse()
            .map(item => opening.get(item.token))
            .join("");

        issues.push({
            line: code.split("\n").length,
            type: "UNCLOSED DELIMITER",
            message: `The source is missing closing delimiter${missingClosers.length > 1 ? "s" : ""}: ${missingClosers}.`,
            token: "",
            replacement: missingClosers,
            append: true
        });
    }

    return issues;
}

function buildStructureTree(code) {
    const withoutComments = code
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/.*$/gm, " ")
        .replace(/^\s*#.*$/gm, " ");
    const tokens = withoutComments.match(
        /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|<=|>=|&&|\|\||=>|[{}()[\];,.:+\-*/%=<>!&|?$@]/g
    ) || [];
    const pairs = { "(": ")", "[": "]", "{": "}" };
    const closers = new Set(Object.values(pairs));
    let position = 0;

    function leaf(token) {
        const type = /^[A-Za-z_$]/.test(token)
            ? "Identifier"
            : /^\d/.test(token)
                ? "Number"
                : /^["'`]/.test(token)
                    ? "Literal"
                    : "Token";

        return { label: `${type}: ${token}`, children: [] };
    }

    function classifyStatement(entries) {
        const words = entries
            .filter(entry => entry.kind === "token")
            .map(entry => entry.value);
        const hasCallGroup = entries.some(entry =>
            entry.kind === "group" && entry.node.label === "Call Arguments"
        );

        if (words.some(word => ["function", "def", "fn"].includes(word))) return "Function Declaration";
        if (words.includes("class")) return "Class Declaration";
        if (words[0] === "if" || words[0] === "else") return "Conditional Statement";
        if (["for", "while", "do"].includes(words[0])) return "Loop Statement";
        if (words[0] === "import" || words[0] === "using" || words[0] === "package") return "Import / Package";
        if (words[0] === "return") return "Return Statement";
        if (["const", "let", "var", "int", "float", "double", "String", "string", "auto"].includes(words[0])) {
            return "Variable Declaration";
        }
        if (hasCallGroup) return "Function / Method Declaration";
        return "Expression Statement";
    }

    function entriesToNodes(entries) {
        return entries.map(entry => entry.kind === "group"
            ? entry.node
            : leaf(entry.value));
    }

    function parseScope(expectedClose) {
        const statements = [];
        let entries = [];

        function flushStatement() {
            if (!entries.length) return;
            statements.push({
                label: classifyStatement(entries),
                children: entriesToNodes(entries)
            });
            entries = [];
        }

        while (position < tokens.length) {
            const token = tokens[position++];
            if (expectedClose && token === expectedClose) break;
            if (closers.has(token)) continue;

            if (pairs[token]) {
                const children = parseScope(pairs[token]);

                if (token === "{") {
                    const body = { label: "Block", children };
                    if (entries.length) {
                        statements.push({
                            label: classifyStatement(entries),
                            children: [...entriesToNodes(entries), body]
                        });
                        entries = [];
                    } else {
                        statements.push(body);
                    }
                    continue;
                }

                const priorToken = [...entries].reverse().find(entry => entry.kind === "token");
                const isFunctionParameters = token === "(" &&
                    entries.some(entry => entry.kind === "token" && ["function", "def", "fn"].includes(entry.value));
                const label = token === "["
                    ? "Array / Index"
                    : isFunctionParameters
                        ? "Parameters"
                        : priorToken && /^[A-Za-z_$]/.test(priorToken.value)
                            ? "Call Arguments"
                            : "Grouped Expression";
                entries.push({
                    kind: "group",
                    node: { label, children }
                });
                continue;
            }

            if (token === ";") {
                flushStatement();
                continue;
            }
            if (token === ",") continue;
            entries.push({ kind: "token", value: token });
        }

        flushStatement();
        return statements;
    }

    return { label: "Program", children: parseScope(null) };
}

function renderTreeNode(node) {
    const children = node.children.length
        ? `<ul>${node.children.map(renderTreeNode).join("")}</ul>`
        : "";

    return `<li><span class="tree-node">${escapeHTML(node.label)}</span>${children}</li>`;
}

function renderCompilerPreview(code) {
    const lexicalIssues = detectedIssues.filter(issue => issue.type !== "UNMATCHED DELIMITER" && issue.type !== "UNCLOSED DELIMITER");
    const syntaxIssues = detectedIssues.filter(issue => issue.type === "UNMATCHED DELIMITER" || issue.type === "UNCLOSED DELIMITER");
    const isClean = detectedIssues.length === 0;
    const failedPhase = lexicalIssues.length ? "lexical" : syntaxIssues.length ? "syntax" : null;
    const tokenCount = countTokens(code);
    const phaseData = [
        {
            name: "Lexical analysis",
            key: "lexical",
            detail: `${tokenCount} token${tokenCount === 1 ? "" : "s"} scanned`,
            description: "Converts source characters into tokens such as identifiers, literals, keywords and operators."
        },
        {
            name: "Syntax analysis",
            key: "syntax",
            detail: syntaxIssues.length
                ? `${syntaxIssues.length} delimiter issue${syntaxIssues.length === 1 ? "" : "s"} found`
                : "Delimiter structure checked",
            description: "Checks token grouping and structural delimiters. This preview does not implement each language's complete grammar."
        },
        {
            name: "Semantic analysis",
            key: "semantic",
            detail: "Requires a language-specific compiler",
            description: "A real compiler checks meaning, including declarations, types, scopes and valid operations. LexiCura does not run this phase."
        },
        {
            name: "Intermediate code generation",
            key: "intermediate",
            detail: isClean ? "Preview available" : "Waiting for valid structure",
            description: "Compilers commonly translate validated syntax into an intermediate form for later optimization and target-specific output."
        },
        {
            name: "Optimization",
            key: "optimization",
            detail: "Not run in this browser preview",
            description: "A compiler may simplify or improve intermediate code while preserving program behavior. No optimization is performed here."
        },
        {
            name: "Target code generation",
            key: "generation",
            detail: "Requires a compiler backend",
            description: "A target-specific backend converts the intermediate form into machine code, bytecode or another output. LexiCura has no backend."
        }
    ];

    compilerPhaseData = phaseData.map((phase, index) => {
        let status = "Preview";
        let state = "preview";

        if (failedPhase === phase.key) {
            status = "Needs correction";
            state = "failed";
        } else if (failedPhase && index > (failedPhase === "lexical" ? 0 : 1)) {
            status = "Blocked";
            state = "blocked";
        } else if (phase.key === "lexical" && !lexicalIssues.length) {
            status = "Passed";
            state = "passed";
        } else if (phase.key === "syntax" && !lexicalIssues.length && !syntaxIssues.length) {
            status = "Passed";
            state = "passed";
        } else if (phase.key === "intermediate" && isClean) {
            status = "Passed";
            state = "passed";
        }

        return { ...phase, index, status, state };
    });

    const phases = compilerPhaseData.map(phase => `
        <div class="phase-flow-item">
            <button
                class="compiler-phase ${phase.state}"
                type="button"
                aria-pressed="false"
                onclick="selectCompilerPhase(${phase.index})"
            >
                <span class="phase-number">0${phase.index + 1}</span>
                <span class="phase-copy">
                    <strong>${escapeHTML(phase.name)}</strong>
                    <span>${escapeHTML(phase.detail)}</span>
                </span>
                <span class="phase-status">${escapeHTML(phase.status)}</span>
            </button>
        </div>
    `).join("");

    document.getElementById("compilerStatus").textContent = isClean
        ? "STRUCTURE CHECK PASSED"
        : "CORRECTION NEEDED";
    document.getElementById("compilerDetails").hidden = false;
    document.getElementById("compilerPhases").innerHTML = phases;
    selectCompilerPhase(0);

    if (isClean) {
        document.getElementById("compilerResult").innerHTML =
            `<p>Structure looks balanced. Here is a token-grouping parse tree preview for <strong>${escapeHTML(detectLanguage(code))}</strong>.</p>`;
        document.getElementById("parseTree").innerHTML =
            `<ul class="tree-root">${renderTreeNode(buildStructureTree(code))}</ul>`;
        document.getElementById("repairAndBuildButton").hidden = true;
    } else {
        const issueCount = detectedIssues.length;
        document.getElementById("compilerResult").innerHTML =
            `<p>${issueCount} issue${issueCount === 1 ? "" : "s"} ${issueCount === 1 ? "prevents" : "prevent"} a clean structure preview. Review the detected issues, then use the correction action.</p>`;
        document.getElementById("parseTree").innerHTML =
            `<div class="tree-placeholder">The parse tree will appear after the source passes the available checks.</div>`;
        document.getElementById("repairAndBuildButton").hidden = false;
    }
}

function selectCompilerPhase(index) {
    const phase = compilerPhaseData[index];
    if (!phase) return;

    document.querySelectorAll(".compiler-phase").forEach((button, buttonIndex) => {
        button.classList.toggle("selected", buttonIndex === index);
        button.setAttribute("aria-pressed", String(buttonIndex === index));
    });

    document.getElementById("phaseDetails").innerHTML = `
        <span class="phase-detail-kicker">STAGE 0${phase.index + 1} · ${escapeHTML(phase.status.toUpperCase())}</span>
        <strong>${escapeHTML(phase.name)}</strong>
        <p>${escapeHTML(phase.description)}</p>
    `;
}

function countTokens(code) {
    const cleaned = code
        .replace(/\/\/.*$/gm, "")
        .replace(/#.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

    const matches = cleaned.match(
        /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|==|!=|<=|>=|&&|\|\||=>|[{}()[\];,.:+\-*/%=<>!&|?$@]/g
    );

    return matches ? matches.length : 0;
}

function calculateComplexity(code) {
    const keywords = (
        code.match(
            /\b(if|else|for|while|switch|case|catch|try|function|def|fn|match)\b/g
        ) || []
    ).length;

    if (keywords <= 4) return "Low";
    if (keywords <= 9) return "Medium";
    return "High";
}

function calculateWarnings(code, issues) {
    let warnings = 0;

    if (code.length > 1500) warnings++;
    if ((code.match(/\bTODO\b/gi) || []).length) warnings++;
    if ((code.match(/\bdebugger\b/g) || []).length) warnings++;
    if ((code.match(/console\.log/g) || []).length > 2) warnings++;
    if (issues.length > 3) warnings++;

    return warnings;
}

function analyzeCode() {
    const code = editor.value;

    if (!code.trim()) {
        showToast("Enter source code first");
        return;
    }

    clearPipeline();

    const language = detectLanguage(code);
    detectedIssues = [
        ...detectLexicalIssues(code),
        ...checkStructure(code)
    ];

    document.getElementById("analysisState").textContent = "Analyzing";
    document.getElementById("pipelineState").textContent = "RUNNING";

    activatePipeline("detect");

    setTimeout(() => {
        activatePipeline("context");

        setTimeout(() => {
            activatePipeline("correction");

            setTimeout(() => {
                activatePipeline("validation");
                finishAnalysis(language, code);
            }, 500);
        }, 500);
    }, 500);
}

function finishAnalysis(language, code) {
    document.getElementById("metricLanguage").textContent = language;
    document.getElementById("metricLines").textContent =
        code.split("\n").length;
    document.getElementById("metricTokens").textContent =
        countTokens(code);
    document.getElementById("metricErrors").textContent =
        detectedIssues.length;
    document.getElementById("metricWarnings").textContent =
        calculateWarnings(code, detectedIssues);
    document.getElementById("metricComplexity").textContent =
        calculateComplexity(code);

    document.getElementById("issueCount").textContent =
        detectedIssues.length;

    renderIssues();
    renderCompilerPreview(code);

    if (detectedIssues.length > 0) {
        selectedIssue = detectedIssues[0];
        renderContext(selectedIssue);
        renderCorrection(selectedIssue);

        document.getElementById("analysisState").textContent =
            `${detectedIssues.length} issue${detectedIssues.length > 1 ? "s" : ""} found`;

        correctionReady = true;
        document.getElementById("applyButton").disabled = false;
        document.getElementById("repairAndBuildButton").disabled = false;
        document.getElementById("repairAndBuildButton").textContent =
            "Click here to correct the code";
        document.getElementById("correctionStatus").textContent = "READY";

        addLog(`${detectedIssues.length} source issue${detectedIssues.length > 1 ? "s" : ""} detected.`);
    } else {
        selectedIssue = null;
        correctionReady = false;

        document.getElementById("applyButton").disabled = true;
        document.getElementById("repairAndBuildButton").disabled = true;
        document.getElementById("correctionStatus").textContent = "CLEAN";

        document.getElementById("contextBox").innerHTML = `
            <div class="context-icon">✓</div>
            <div>
                <strong>No lexical anomalies detected</strong>
                <p>
                    The current source passed LexiCura's lexical checks.
                    The source may still contain syntactic or semantic issues
                    that require a language compiler or interpreter.
                </p>
            </div>
        `;

        document.getElementById("correctionBox").innerHTML = `
            <p>
                No correction is required. The source is lexically clean.
            </p>
        `;

        document.getElementById("analysisState").textContent = "Lexically Clean";
        addLog("Source passed lexical analysis.");
    }

    document.getElementById("pipelineState").textContent = "COMPLETE";
}

function renderIssues() {
    const container = document.getElementById("issuesList");

    if (!detectedIssues.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <p>No lexical issues were detected.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = detectedIssues.map((issue, index) => `
        <div class="issue" onclick="selectIssue(${index})">
            <div class="issue-top">
                <span class="issue-type">${issue.type}</span>
                <span class="issue-line">LINE ${issue.line}</span>
            </div>
            <div class="issue-message">${escapeHTML(issue.message)}</div>
        </div>
    `).join("");
}

function selectIssue(index) {
    selectedIssue = detectedIssues[index];
    renderContext(selectedIssue);
    renderCorrection(selectedIssue);
    correctionReady = true;
    document.getElementById("applyButton").disabled = false;
}

function renderContext(issue) {
    const lines = editor.value.split("\n");

    const start = Math.max(0, issue.line - 3);
    const end = Math.min(lines.length, issue.line + 2);

    const context = lines
        .slice(start, end)
        .map((line, index) => {
            const number = start + index + 1;
            return `${number}  ${line}`;
        })
        .join("\n");

    document.getElementById("contextBox").innerHTML = `
        <div class="context-icon">◎</div>
        <div>
            <strong>Issue localized around line ${issue.line}</strong>
            <p>
                LexiCura inspected the nearby source context to determine
                whether the token is likely intentional or anomalous.
            </p>
            <div class="correction-box" style="margin-top:10px;">
                <code>${escapeHTML(context)}</code>
            </div>
        </div>
    `;
}

function renderCorrection(issue) {
    if (issue.append) {
        document.getElementById("correctionBox").innerHTML = `
            <p>
                Append the missing closing delimiter${issue.replacement.length > 1 ? "s" : ""} to balance the source structure.
            </p>
            <code>End of source → ${escapeHTML(issue.replacement)}</code>
        `;
        return;
    }

    document.getElementById("correctionBox").innerHTML = `
        <p>
            Suggested correction for line ${issue.line}.
            The agent identified <strong>${escapeHTML(issue.token)}</strong>
            as the suspicious token.
        </p>
        <code>${escapeHTML(issue.token)} → ${escapeHTML(issue.replacement)}</code>
    `;
}

function applyCorrection() {
    if (!selectedIssue || !correctionReady) {
        return;
    }

    if (selectedIssue.append) {
        editor.value += selectedIssue.replacement;
    } else if (Number.isInteger(selectedIssue.offset)) {
        editor.value =
            editor.value.slice(0, selectedIssue.offset) +
            selectedIssue.replacement +
            editor.value.slice(selectedIssue.offset + selectedIssue.token.length);
    } else {
        const lines = editor.value.split("\n");
        const index = selectedIssue.line - 1;

        if (index < 0 || index >= lines.length) {
            showToast("The selected issue is no longer in the source");
            return;
        }

        const correctedLine = lines[index].replace(
            selectedIssue.token,
            selectedIssue.replacement
        );

        if (correctedLine === lines[index]) {
            showToast("The selected issue could not be corrected");
            return;
        }

        lines[index] = correctedLine;
        editor.value = lines.join("\n");
    }

    const correctedLine = selectedIssue.line;
    updateEditor();
    addLog(`Suggested correction applied near line ${correctedLine}.`);

    setTimeout(() => {
        analyzeCode();
    }, 400);
}

function activatePipeline(name) {
    const element = document.getElementById(`pipeline-${name}`);

    if (!element) return;

    element.classList.add("active");

    const steps = ["detect", "context", "correction", "validation"];
    const currentIndex = steps.indexOf(name);

    steps.forEach((step, index) => {
        const el = document.getElementById(`pipeline-${step}`);

        if (index < currentIndex) {
            el.classList.remove("active");
            el.classList.add("complete");
        }
    });
}

function clearPipeline() {
    ["detect", "context", "correction", "validation"].forEach(step => {
        const el = document.getElementById(`pipeline-${step}`);
        el.classList.remove("active", "complete");
    });
}

function addLog(message) {
    const log = document.getElementById("activityLog");

    const item = document.createElement("div");
    item.className = "log-item";

    const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    item.innerHTML = `
        <span class="log-dot"></span>
        <span>${escapeHTML(message)}</span>
        <time>${time}</time>
    `;

    log.prepend(item);
}

function clearAnalysis() {
    detectedIssues = [];
    selectedIssue = null;
    correctionReady = false;

    document.getElementById("analysisState").textContent = "Ready";
    document.getElementById("pipelineState").textContent = "IDLE";

    document.getElementById("metricLanguage").textContent = "—";
    document.getElementById("metricLines").textContent = "—";
    document.getElementById("metricTokens").textContent = "—";
    document.getElementById("metricErrors").textContent = "—";
    document.getElementById("metricWarnings").textContent = "—";
    document.getElementById("metricComplexity").textContent = "—";

    document.getElementById("issueCount").textContent = "0";
    document.getElementById("correctionStatus").textContent = "PENDING";
    document.getElementById("applyButton").disabled = true;
    document.getElementById("repairAndBuildButton").disabled = true;
    document.getElementById("repairAndBuildButton").hidden = true;
    document.getElementById("repairAndBuildButton").textContent =
        "Click here to correct the code";
    document.getElementById("compilerStatus").textContent = "WAITING FOR ANALYSIS";
    document.getElementById("compilerResult").innerHTML =
        "<p>Analyze your source to see its structure and compiler phase preview.</p>";
    document.getElementById("compilerDetails").hidden = true;
    document.getElementById("compilerPhases").innerHTML = "";
    document.getElementById("parseTree").innerHTML = "";

    document.getElementById("issuesList").innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⌁</div>
            <p>Run the analyzer to inspect your source.</p>
        </div>
    `;

    document.getElementById("contextBox").innerHTML = `
        <div class="context-icon">◎</div>
        <div>
            <strong>Waiting for source analysis</strong>
            <p>
                LexiCura will inspect surrounding lines,
                token patterns and probable intent.
            </p>
        </div>
    `;

    document.getElementById("correctionBox").innerHTML = `
        <p>No correction has been generated yet.</p>
    `;

    clearPipeline();
}

function toggleAI() {
    document.getElementById("aiPanel").classList.toggle("open");
}

function handleAIKey(event) {
    if (event.key === "Enter") {
        sendAIMessage();
    }
}

function sendAIMessage() {
    const input = document.getElementById("aiInput");
    const message = input.value.trim();

    if (!message) return;

    addUserMessage(message);
    input.value = "";

    setTimeout(() => {
        const response = generateAIResponse(message);
        addAIMessage(response);
    }, 400);
}

function askAI(question) {
    addUserMessage(question);

    setTimeout(() => {
        addAIMessage(generateAIResponse(question));
    }, 400);
}

function generateAIResponse(question) {
    const lower = question.toLowerCase();

    if (!detectedIssues.length) {
        return "The current source has no lexical anomalies detected by the frontend analyzer. Run Analyze Source after making changes, and I can explain the resulting analysis.";
    }

    const issue = selectedIssue || detectedIssues[0];

    if (lower.includes("why")) {
        return `The token "${issue.token}" was flagged on line ${issue.line} because its character pattern does not match a normal lexical token for the detected source. LexiCura then examines the surrounding context before suggesting a correction.`;
    }

    if (lower.includes("change") || lower.includes("fix")) {
        return `The suggested change is "${issue.token}" → "${issue.replacement}" on line ${issue.line}. You can review the contextual analysis and use Apply Agent Correction to test the repair.`;
    }

    return `I found ${detectedIssues.length} lexical issue${detectedIssues.length > 1 ? "s" : ""}. The currently selected issue is ${issue.type} on line ${issue.line}. ${issue.message}`;
}

function addUserMessage(message) {
    const container = document.getElementById("aiMessages");

    const element = document.createElement("div");
    element.className = "ai-message user";

    element.innerHTML = `
        <span class="message-tag">YOU</span>
        <p>${escapeHTML(message)}</p>
    `;

    container.appendChild(element);
    container.scrollTop = container.scrollHeight;
}

function addAIMessage(message) {
    const container = document.getElementById("aiMessages");

    const element = document.createElement("div");
    element.className = "ai-message";

    element.innerHTML = `
        <span class="message-tag">LEXI AI</span>
        <p>${escapeHTML(message)}</p>
    `;

    container.appendChild(element);
    container.scrollTop = container.scrollHeight;
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}