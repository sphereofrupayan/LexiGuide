import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AnalysisResult,
  applySuggestedCorrections,
  analyzeSource,
  buildParseTree,
  DEFAULT_CODE,
  EXAMPLES,
  getCompilerPhases,
  Issue,
  LANGUAGES,
  LanguageId,
  makeAssistantReply,
  TreeNode,
} from "./src/analyzer";

type ThemeName = "light" | "dark";
type ScreenName = "code" | "analysis" | "compiler" | "assistant";
type ChatMessage = { role: "assistant" | "user"; text: string };
type Palette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  subtle: string;
  border: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  editor: string;
};

const STORAGE_KEYS = {
  code: "lexiguide-mobile-code",
  language: "lexiguide-mobile-language",
  theme: "lexiguide-mobile-theme",
};

const PALETTES: Record<ThemeName, Palette> = {
  light: {
    background: "#F5F6FA",
    surface: "#FFFFFF",
    surfaceAlt: "#F0F3F8",
    text: "#172033",
    muted: "#68748A",
    subtle: "#8C97AA",
    border: "#E4E9F1",
    accent: "#5269E8",
    accentSoft: "#E9EDFF",
    success: "#16845B",
    successSoft: "#E6F5EF",
    danger: "#D94B5B",
    dangerSoft: "#FFF0F1",
    warning: "#A46A16",
    editor: "#111827",
  },
  dark: {
    background: "#0C1019",
    surface: "#151B28",
    surfaceAlt: "#1C2433",
    text: "#F1F4FB",
    muted: "#A2ADC1",
    subtle: "#778399",
    border: "#293348",
    accent: "#91A0FF",
    accentSoft: "#242D4D",
    success: "#63D7A5",
    successSoft: "#19382F",
    danger: "#FF8793",
    dangerSoft: "#41252E",
    warning: "#E5BD75",
    editor: "#0B0F17",
  },
};

const SCREENS: Array<{ id: ScreenName; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = [
  { id: "code", label: "Code", icon: "code-slash-outline" },
  { id: "analysis", label: "Insights", icon: "analytics-outline" },
  { id: "compiler", label: "Compiler", icon: "git-network-outline" },
  { id: "assistant", label: "Lexi AI", icon: "chatbubble-ellipses-outline" },
];

const INITIAL_CHAT: ChatMessage[] = [
  {
    role: "assistant",
    text: "Hi, I’m Lexi AI. Analyze your source and I can explain the selected issue, its context, and the suggested correction.",
  },
];

function TreeBranch({
  node,
  palette,
  depth = 0,
}: {
  node: TreeNode;
  palette: Palette;
  depth?: number;
}) {
  return (
    <View style={[styles.treeBranch, depth > 0 && { borderLeftColor: palette.border }]}>
      <View
        style={[
          styles.treeNode,
          {
            backgroundColor: depth === 0 ? palette.accentSoft : palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <Text style={[styles.treeNodeText, { color: depth === 0 ? palette.accent : palette.text }]}>
          {node.label}
        </Text>
      </View>
      {node.children.map((child, index) => (
        <TreeBranch
          key={`${child.label}-${index}`}
          node={child}
          palette={palette}
          depth={depth + 1}
        />
      ))}
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  palette,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  palette: Palette;
}) {
  return (
    <View style={styles.sectionHeading}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow}</Text> : null}
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

export default function App() {
  const [themeName, setThemeName] = useState<ThemeName>("light");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [language, setLanguage] = useState<LanguageId>("auto");
  const [activeScreen, setActiveScreen] = useState<ScreenName>("code");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [question, setQuestion] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const palette = PALETTES[themeName];

  const selectedIssue = useMemo(
    () => analysis?.issues.find((issue) => issue.id === selectedIssueId) ?? analysis?.issues[0] ?? null,
    [analysis, selectedIssueId],
  );
  const phases = useMemo(() => (analysis ? getCompilerPhases(analysis) : []), [analysis]);
  const parseTree = useMemo(() => (
    analysis && analysis.issues.length === 0 ? buildParseTree(code) : null
  ), [analysis, code]);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const values = await AsyncStorage.multiGet([
          STORAGE_KEYS.code,
          STORAGE_KEYS.language,
          STORAGE_KEYS.theme,
        ]);
        if (!mounted) return;
        const stored = Object.fromEntries(values);
        if (stored[STORAGE_KEYS.code] !== null && stored[STORAGE_KEYS.code] !== undefined) {
          setCode(stored[STORAGE_KEYS.code] ?? DEFAULT_CODE);
        }
        const storedLanguage = LANGUAGES.find((item) => item.id === stored[STORAGE_KEYS.language]);
        if (storedLanguage) setLanguage(storedLanguage.id);
        const storedTheme = stored[STORAGE_KEYS.theme];
        if (storedTheme === "dark" || storedTheme === "light") {
          setThemeName(storedTheme);
        }
      } catch (error) {
        console.error("Unable to restore saved LexiCura data.", error);
        Alert.alert("Storage unavailable", "Your saved draft could not be restored.");
      } finally {
        if (mounted) setReady(true);
      }
    };
    void restore();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => {
      void AsyncStorage.multiSet([
        [STORAGE_KEYS.code, code],
        [STORAGE_KEYS.language, language],
        [STORAGE_KEYS.theme, themeName],
      ])
        .then(() => setSaved(true))
        .catch((error: unknown) => {
          setSaved(false);
          console.error("Unable to save the LexiCura draft.", error);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [code, language, themeName, ready]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const runAnalysis = () => {
    if (!code.trim()) {
      Alert.alert("Source is empty", "Add or load some source code before analyzing.");
      return;
    }
    const result = analyzeSource(code, language);
    setAnalysis(result);
    setSelectedIssueId(result.issues[0]?.id ?? null);
    setSelectedPhase(0);
    setActiveScreen("analysis");
    setToast(result.issues.length ? `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found` : "Structure checks passed");
  };

  const clearResults = () => {
    setAnalysis(null);
    setSelectedIssueId(null);
    setSelectedPhase(0);
  };

  const loadExample = () => {
    const exampleLanguage = language === "auto" ? "java" : language;
    setLanguage(exampleLanguage);
    setCode(EXAMPLES[exampleLanguage]);
    clearResults();
    setToast(`${LANGUAGES.find((item) => item.id === exampleLanguage)?.label ?? "Source"} example loaded`);
  };

  const resetSource = () => {
    setCode(DEFAULT_CODE);
    setLanguage("auto");
    clearResults();
    setToast("Source reset to the starter example");
  };

  const copySource = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setToast("Source copied to clipboard");
    } catch (error) {
      console.error("Unable to copy the source.", error);
      Alert.alert("Copy failed", "Clipboard access is unavailable.");
    }
  };

  const shareSource = async () => {
    if (!FileSystem.cacheDirectory) {
      Alert.alert("Export unavailable", "A temporary folder is not available on this device.");
      return;
    }
    setBusy(true);
    try {
      const languageId = language === "auto"
        ? (analysis?.language.toLowerCase() ?? "txt")
        : language;
      const extension: Record<string, string> = {
        c: "c",
        cpp: "cpp",
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
        "c++": "cpp",
      };
      const fileExtension = extension[languageId] ?? "txt";
      const fileUri = `${FileSystem.cacheDirectory}lexicura-source.${fileExtension}`;
      await FileSystem.writeAsStringAsync(fileUri, code);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device cannot open the share sheet for source files.");
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/plain",
        dialogTitle: "Share LexiCura source",
        UTI: "public.plain-text",
      });
    } catch (error) {
      console.error("Unable to export the source.", error);
      Alert.alert("Export failed", "LexiCura could not prepare the source file.");
    } finally {
      setBusy(false);
    }
  };

  const applySuggestedFix = () => {
    if (!selectedIssue || !analysis) return;
    const updatedCode = applySuggestedCorrections(code, [selectedIssue]);
    if (updatedCode === null) {
      setToast("The selected suggestion could not be applied safely");
      return;
    }
    updateAfterCorrection(updatedCode, "Line correction applied");
  };

  const applyAllSuggestedFixes = () => {
    if (!analysis || analysis.issues.length === 0) return;
    const updatedCode = applySuggestedCorrections(code, analysis.issues);
    if (updatedCode === null) {
      setToast("Some suggestions overlap or no longer match the source");
      return;
    }
    updateAfterCorrection(updatedCode, `${analysis.issues.length} corrections applied`);
  };

  const updateAfterCorrection = (updatedCode: string, successMessage: string) => {
    if (updatedCode === code) {
      setToast("No suggested edit could be applied");
      return;
    }
    setCode(updatedCode);
    const result = analyzeSource(updatedCode, language);
    setAnalysis(result);
    setSelectedIssueId(result.issues[0]?.id ?? null);
    setSelectedPhase(0);
    setToast(result.issues.length
      ? `${successMessage} — ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} remain`
      : `${successMessage} and checks passed`);
  };

  const sendQuestion = (text = question) => {
    const cleanQuestion = text.trim();
    if (!cleanQuestion) return;
    const answer = makeAssistantReply(cleanQuestion, analysis, selectedIssue);
    setChat((messages) => [
      ...messages,
      { role: "user", text: cleanQuestion },
      { role: "assistant", text: answer },
    ]);
    setQuestion("");
  };

  const selectLanguage = (id: LanguageId) => {
    setLanguage(id);
    clearResults();
  };

  const renderCard = (children: React.ReactNode, style?: object) => (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>
      {children}
    </View>
  );

  const renderPillButton = (
    label: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    onPress: () => void,
    secondary = true,
    disabled = false,
  ) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: secondary ? palette.surface : palette.accent,
          borderColor: secondary ? palette.border : palette.accent,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={secondary ? palette.text : "#FFFFFF"} />
      <Text style={[styles.actionText, { color: secondary ? palette.text : "#FFFFFF" }]}>{label}</Text>
    </Pressable>
  );

  const renderCodeScreen = () => (
    <>
      <View style={styles.welcomeBlock}>
        <View style={[styles.liveBadge, { backgroundColor: palette.successSoft }]}>
          <View style={[styles.liveDot, { backgroundColor: palette.success }]} />
          <Text style={[styles.liveText, { color: palette.success }]}>LEXICAL INTELLIGENCE</Text>
        </View>
        <Text style={[styles.heroTitle, { color: palette.text }]}>Make sense of your code.</Text>
        <Text style={[styles.heroSubtitle, { color: palette.muted }]}>
          Inspect tokens, understand context, and review a repair before applying it.
        </Text>
      </View>

      {renderCard(
        <>
          <View style={styles.cardTopRow}>
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>LANGUAGE</Text>
            <Pressable onPress={loadExample} style={styles.textAction}>
              <Ionicons name="sparkles-outline" size={15} color={palette.accent} />
              <Text style={[styles.textActionLabel, { color: palette.accent }]}>Load example</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.languageList}>
            {LANGUAGES.map((item) => {
              const chosen = language === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => selectLanguage(item.id)}
                  style={[
                    styles.languageChip,
                    { backgroundColor: chosen ? palette.accent : palette.surfaceAlt, borderColor: chosen ? palette.accent : palette.border },
                  ]}
                >
                  <Text style={[styles.languageText, { color: chosen ? "#FFFFFF" : palette.muted }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.editorShell, { backgroundColor: palette.editor }]}>
            <View style={styles.editorHeader}>
              <View style={styles.editorDots}>
                <View style={[styles.windowDot, { backgroundColor: "#FB7185" }]} />
                <View style={[styles.windowDot, { backgroundColor: "#FBBF24" }]} />
                <View style={[styles.windowDot, { backgroundColor: "#34D399" }]} />
              </View>
              <Text style={styles.editorLanguage}>
                {(LANGUAGES.find((item) => item.id === language)?.label ?? "Auto").toUpperCase()} · {code.split("\n").length} LINES
              </Text>
            </View>
            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(value);
                if (analysis) clearResults();
              }}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textAlignVertical="top"
              placeholder="Paste your source code here..."
              placeholderTextColor="#778399"
              selectionColor="#91A0FF"
              style={styles.codeInput}
              accessibilityLabel="Source code editor"
            />
            <View style={styles.editorFooter}>
              <Text style={styles.editorMeta}>{code.length} characters</Text>
              <Text style={styles.editorMeta}>{saved ? "Saved on device" : ready ? "Saving draft…" : "Loading draft…"}</Text>
            </View>
          </View>

          <Pressable
            onPress={runAnalysis}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.accent, opacity: pressed ? 0.84 : 1 }]}
          >
            <Ionicons name="scan-outline" size={19} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Analyze source</Text>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
          </Pressable>

          <View style={styles.actionRow}>
            {renderPillButton("Copy", "copy-outline", () => void copySource())}
            {renderPillButton("Export", "share-outline", () => void shareSource(), true, busy)}
            {renderPillButton("Reset", "refresh-outline", resetSource)}
          </View>
          {busy ? <ActivityIndicator color={palette.accent} style={styles.busyIndicator} /> : null}
        </>,
      )}

      <View style={styles.trustRow}>
        <Ionicons name="phone-portrait-outline" size={16} color={palette.subtle} />
        <Text style={[styles.trustText, { color: palette.subtle }]}>Your source and draft stay on this device.</Text>
      </View>
    </>
  );

  const renderAnalysisScreen = () => {
    if (!analysis) {
      return renderCard(
        <View style={styles.emptyPanel}>
          <View style={[styles.emptyIconWrap, { backgroundColor: palette.accentSoft }]}>
            <Ionicons name="analytics-outline" size={26} color={palette.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>Analysis starts here</Text>
          <Text style={[styles.emptyCopy, { color: palette.muted }]}>
            Run a source check to see token counts, issues, context and suggested fixes.
          </Text>
          <Pressable onPress={() => setActiveScreen("code")} style={[styles.primaryButton, { backgroundColor: palette.accent }]}>
            <Ionicons name="code-slash-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Open code editor</Text>
          </Pressable>
        </View>,
      );
    }

    return (
      <>
        <SectionHeading
          eyebrow="SOURCE REPORT"
          title={analysis.issues.length ? "Review your results" : "Looking good"}
          subtitle={`${analysis.language} · ${analysis.lines} lines · ${analysis.issues.length ? `${analysis.issues.length} issue${analysis.issues.length === 1 ? "" : "s"} to review` : "structure checks passed"}`}
          palette={palette}
        />
        <View style={styles.metricsGrid}>
          {[
            { label: "TOKENS", value: String(analysis.tokens), icon: "pricetags-outline" as const },
            { label: "ISSUES", value: String(analysis.issues.length), icon: "alert-circle-outline" as const },
            { label: "WARNINGS", value: String(analysis.warnings), icon: "warning-outline" as const },
            { label: "COMPLEXITY", value: analysis.complexity, icon: "git-branch-outline" as const },
          ].map((metric) => (
            <View key={metric.label} style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Ionicons name={metric.icon} size={17} color={palette.accent} />
              <Text style={[styles.metricValue, { color: palette.text }]}>{metric.value}</Text>
              <Text style={[styles.metricLabel, { color: palette.muted }]}>{metric.label}</Text>
            </View>
          ))}
        </View>

        {analysis.issues.length === 0 ? (
          renderCard(
            <View style={styles.successRow}>
              <View style={[styles.resultIcon, { backgroundColor: palette.successSoft }]}>
                <Ionicons name="checkmark" size={20} color={palette.success} />
              </View>
              <View style={styles.flexOne}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>No detected issues</Text>
                <Text style={[styles.bodyCopy, { color: palette.muted }]}>
                  LexiCura checked lexical patterns and balanced delimiters. Use a language compiler for full grammar and semantic checks.
                </Text>
              </View>
            </View>,
          )
        ) : (
          <>
            <SectionHeading title="Detected issues" subtitle="Tap an issue to inspect its source context." palette={palette} />
            {analysis.issues.map((issue) => {
              const selected = selectedIssue?.id === issue.id;
              return (
                <Pressable
                  key={issue.id}
                  onPress={() => setSelectedIssueId(issue.id)}
                  style={[
                    styles.issueCard,
                    {
                      backgroundColor: selected ? palette.dangerSoft : palette.surface,
                      borderColor: selected ? palette.danger : palette.border,
                    },
                  ]}
                >
                  <View style={styles.issueHeader}>
                    <View style={[styles.issueTypePill, { backgroundColor: palette.dangerSoft }]}>
                      <Text style={[styles.issueTypeText, { color: palette.danger }]}>{issue.type}</Text>
                    </View>
                    <Text style={[styles.issueLine, { color: palette.muted }]}>LINE {issue.line}</Text>
                  </View>
                  <Text style={[styles.issueMessage, { color: palette.text }]}>{issue.message}</Text>
                </Pressable>
              );
            })}

            {analysis.issues.length > 0 ? renderCard(
              <>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="flash-outline" size={18} color={palette.accent} />
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Batch correction</Text>
                </View>
                <Text style={[styles.bodyCopy, { color: palette.muted }]}>
                  Apply all {analysis.issues.length} suggested fixes in one pass, then recheck the source. You can still review and fix issues line by line below.
                </Text>
                <Pressable
                  onPress={applyAllSuggestedFixes}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: palette.accent,
                      opacity: pressed ? 0.84 : 1,
                    },
                  ]}
                >
                  <Ionicons name="checkmark-done-outline" size={19} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Correct entire code ({analysis.issues.length})</Text>
                </Pressable>
              </>,
            ) : null}

            {selectedIssue ? renderCard(
              <>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="locate-outline" size={18} color={palette.accent} />
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Nearby context</Text>
                </View>
                <Text style={[styles.bodyCopy, { color: palette.muted }]}>
                  Inspect a few lines around line {selectedIssue.line} before applying a suggestion.
                </Text>
                <View style={[styles.contextCode, { backgroundColor: palette.editor }]}>
                  {code.split("\n").slice(Math.max(0, selectedIssue.line - 3), selectedIssue.line + 2).map((line, index) => {
                    const lineNumber = Math.max(0, selectedIssue.line - 3) + index + 1;
                    return (
                      <Text key={`${lineNumber}-${line}`} style={[styles.contextLine, { color: lineNumber === selectedIssue.line ? "#FCA5A5" : "#D3D9E7" }]}>
                        <Text style={styles.contextLineNumber}>{String(lineNumber).padStart(2, " ")}  </Text>
                        {line || " "}
                      </Text>
                    );
                  })}
                </View>
                <View style={[styles.suggestionBox, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
                  <Text style={[styles.fieldLabel, { color: palette.muted }]}>SUGGESTED CHANGE</Text>
                  <Text style={[styles.suggestionText, { color: palette.text }]}>
                    {selectedIssue.append
                      ? `Append ${selectedIssue.replacement.trim()} at end of source`
                      : `${selectedIssue.token || "Selected token"}  →  ${selectedIssue.replacement || "remove token"}`}
                  </Text>
                </View>
                <Pressable onPress={applySuggestedFix} style={[styles.primaryButton, { backgroundColor: palette.accent }]}>
                  <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Apply this line & recheck</Text>
                </Pressable>
              </>,
            ) : null}
          </>
        )}

        {renderCard(
          <>
            <View style={styles.cardTitleRow}>
              <Ionicons name="git-network-outline" size={19} color={palette.accent} />
              <Text style={[styles.cardTitle, { color: palette.text }]}>Compiler progress</Text>
            </View>
            {phases.slice(0, 3).map((phase) => (
              <View key={phase.name} style={styles.progressRow}>
                <View style={[styles.progressDot, { backgroundColor: phase.status === "Passed" ? palette.success : phase.status === "Needs correction" ? palette.danger : palette.subtle }]} />
                <Text style={[styles.progressName, { color: palette.text }]}>{phase.name}</Text>
                <Text style={[styles.progressStatus, { color: phase.status === "Passed" ? palette.success : phase.status === "Needs correction" ? palette.danger : palette.muted }]}>{phase.status}</Text>
              </View>
            ))}
            <Pressable onPress={() => setActiveScreen("compiler")} style={styles.inlineLink}>
              <Text style={[styles.inlineLinkText, { color: palette.accent }]}>View all compiler stages and parse tree</Text>
              <Ionicons name="arrow-forward" size={15} color={palette.accent} />
            </Pressable>
          </>,
        )}
      </>
    );
  };

  const renderCompilerScreen = () => {
    if (!analysis) {
      return (
        <>
          <SectionHeading eyebrow="COMPILER WORKBENCH" title="Compiler flow & parse tree" subtitle="Run source analysis first to explore its compilation stages." palette={palette} />
          {renderCard(
            <View style={styles.emptyPanel}>
              <View style={[styles.emptyIconWrap, { backgroundColor: palette.accentSoft }]}>
                <Ionicons name="git-network-outline" size={26} color={palette.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: palette.text }]}>Ready when you are</Text>
              <Text style={[styles.emptyCopy, { color: palette.muted }]}>
                Lexical and delimiter checks will be shown as completed stages. Later compiler stages stay visible as educational previews.
              </Text>
              <Pressable onPress={() => setActiveScreen("code")} style={[styles.primaryButton, { backgroundColor: palette.accent }]}>
                <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Analyze source</Text>
              </Pressable>
            </View>,
          )}
        </>
      );
    }

    return (
      <>
        <SectionHeading
          eyebrow="COMPILER WORKBENCH"
          title="From source to output"
          subtitle="Select a stage to learn what it does. Preview labels reflect checks this app actually runs."
          palette={palette}
        />
        {renderCard(
          <>
            {phases.map((phase, index) => {
              const active = selectedPhase === index;
              const color = phase.status === "Passed"
                ? palette.success
                : phase.status === "Needs correction"
                  ? palette.danger
                  : phase.status === "Blocked"
                    ? palette.subtle
                    : palette.warning;
              return (
                <View key={phase.name} style={styles.phaseFlowItem}>
                  <Pressable
                    onPress={() => setSelectedPhase(index)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.phaseCard,
                      {
                        backgroundColor: active ? palette.accentSoft : palette.surface,
                        borderColor: active ? palette.accent : palette.border,
                      },
                    ]}
                  >
                    <View style={[styles.phaseNumber, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
                      <Text style={[styles.phaseNumberText, { color }]}>{String(index + 1).padStart(2, "0")}</Text>
                    </View>
                    <View style={styles.flexOne}>
                      <Text style={[styles.phaseTitle, { color: palette.text }]}>{phase.name}</Text>
                      <Text style={[styles.phaseCaption, { color: palette.muted }]}>{phase.detail}</Text>
                    </View>
                    <Text style={[styles.phaseStatus, { color }]}>{phase.status}</Text>
                  </Pressable>
                  {index < phases.length - 1 ? (
                    <View style={[styles.phaseConnector, { backgroundColor: palette.border }]}>
                      <View style={[styles.phaseArrow, { borderColor: palette.subtle }]} />
                    </View>
                  ) : null}
                </View>
              );
            })}

            <View style={[styles.phaseDescription, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
              <Text style={[styles.fieldLabel, { color: palette.accent }]}>
                STAGE {String(selectedPhase + 1).padStart(2, "0")} · {phases[selectedPhase]?.status.toUpperCase()}
              </Text>
              <Text style={[styles.phaseDescriptionTitle, { color: palette.text }]}>{phases[selectedPhase]?.name}</Text>
              <Text style={[styles.bodyCopy, { color: palette.muted }]}>{phases[selectedPhase]?.description}</Text>
            </View>
          </>,
        )}

        <SectionHeading
          title="Parse tree"
          subtitle={parseTree ? "A nested syntax-structure preview for the analyzed source." : "Resolve detected issues to generate the source tree."}
          palette={palette}
        />
        {renderCard(
          parseTree ? (
            <View>
              <TreeBranch node={parseTree} palette={palette} />
              <Text style={[styles.treeFootnote, { color: palette.muted }]}>
                Structural preview only. Full grammar and semantic validation requires the matching language compiler.
              </Text>
            </View>
          ) : (
            <View style={styles.treeEmpty}>
              <Ionicons name="git-branch-outline" size={21} color={palette.muted} />
              <Text style={[styles.bodyCopy, { color: palette.muted }]}>
                The tree appears after lexical and delimiter issues are corrected.
              </Text>
              <Pressable onPress={() => setActiveScreen("analysis")} style={styles.inlineLink}>
                <Text style={[styles.inlineLinkText, { color: palette.accent }]}>Review detected issues</Text>
                <Ionicons name="arrow-forward" size={15} color={palette.accent} />
              </Pressable>
            </View>
          ),
        )}
      </>
    );
  };

  const renderAssistantScreen = () => (
    <>
      <SectionHeading
        eyebrow="LEXI AI · LOCAL ASSISTANT"
        title="Ask about your code."
        subtitle="A private, on-device guide to the current analysis. It does not call an external AI service."
        palette={palette}
      />
      <View style={[styles.chatPanel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <ScrollView
          style={styles.chatMessages}
          contentContainerStyle={styles.chatMessageList}
          keyboardShouldPersistTaps="handled"
        >
          {chat.map((message, index) => (
            <View
              key={`${message.role}-${index}`}
              style={[
                styles.chatBubble,
                {
                  alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                  backgroundColor: message.role === "user" ? palette.accentSoft : palette.surfaceAlt,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.chatRole, { color: message.role === "user" ? palette.accent : palette.success }]}>
                {message.role === "user" ? "YOU" : "LEXI AI"}
              </Text>
              <Text style={[styles.chatText, { color: palette.text }]}>{message.text}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.suggestionChips}>
          {["Explain this issue", "Why is it invalid?", "How do I fix it?"].map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => sendQuestion(suggestion)}
              style={[styles.suggestionChip, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}
            >
              <Text style={[styles.suggestionChipText, { color: palette.muted }]}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.chatInputRow, { borderTopColor: palette.border }]}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => sendQuestion()}
            returnKeyType="send"
            placeholder="Ask about the current source…"
            placeholderTextColor={palette.subtle}
            style={[styles.chatInput, { color: palette.text, backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}
          />
          <Pressable onPress={() => sendQuestion()} style={[styles.sendButton, { backgroundColor: palette.accent }]}>
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </>
  );

  const currentTitle = SCREENS.find((item) => item.id === activeScreen)?.label ?? "Code";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={["top", "left", "right", "bottom"]}>
      <StatusBar style={themeName === "dark" ? "light" : "dark"} />
      <View style={styles.appShell}>
        <View style={[styles.topBar, { borderBottomColor: palette.border }]}>
          <Pressable onPress={() => setActiveScreen("code")} style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: palette.accent }]}>
              <Ionicons name="sparkles" size={17} color="#FFFFFF" />
            </View>
            <View>
              <Text style={[styles.brandName, { color: palette.text }]}>LexiCura</Text>
              <Text style={[styles.brandCaption, { color: palette.muted }]}>SOURCE INTELLIGENCE</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setThemeName((current) => current === "light" ? "dark" : "light")}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${themeName === "light" ? "dark" : "light"} mode`}
            style={[styles.themeButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <Ionicons name={themeName === "light" ? "moon-outline" : "sunny-outline"} size={19} color={palette.text} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={8}
        >
          {!ready ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.bodyCopy, { color: palette.muted }]}>Restoring your workspace…</Text>
            </View>
          ) : (
            <>
              <ScrollView
                key={activeScreen}
                style={styles.screenScroll}
                contentContainerStyle={styles.screenContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.screenTitleRow}>
                  <Text style={[styles.screenTitle, { color: palette.text }]}>{currentTitle}</Text>
                  <View style={[styles.savedBadge, { backgroundColor: palette.surfaceAlt }]}>
                    <View style={[styles.savedDot, { backgroundColor: saved ? palette.success : palette.warning }]} />
                    <Text style={[styles.savedText, { color: palette.muted }]}>{saved ? "On device" : "Saving"}</Text>
                  </View>
                </View>
                {activeScreen === "code" ? renderCodeScreen() : null}
                {activeScreen === "analysis" ? renderAnalysisScreen() : null}
                {activeScreen === "compiler" ? renderCompilerScreen() : null}
                {activeScreen === "assistant" ? renderAssistantScreen() : null}
              </ScrollView>

              <View style={[styles.tabBar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
                {SCREENS.map((item) => {
                  const active = item.id === activeScreen;
                  return (
                    <Pressable key={item.id} onPress={() => setActiveScreen(item.id)} style={styles.tabItem}>
                      <Ionicons name={item.icon} size={21} color={active ? palette.accent : palette.muted} />
                      <Text style={[styles.tabLabel, { color: active ? palette.accent : palette.muted, fontWeight: active ? "700" : "500" }]}>
                        {item.label}
                      </Text>
                      {active ? <View style={[styles.activeIndicator, { backgroundColor: palette.accent }]} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </KeyboardAvoidingView>

        {toast ? (
          <View style={[styles.toast, { backgroundColor: themeName === "dark" ? "#F1F4FB" : "#172033" }]}>
            <Text style={[styles.toastText, { color: themeName === "dark" ? "#172033" : "#FFFFFF" }]}>{toast}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appShell: { flex: 1 },
  flexOne: { flex: 1 },
  topBar: {
    height: 64,
    paddingHorizontal: 19,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 17, fontWeight: "800", letterSpacing: -0.4 },
  brandCaption: { fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginTop: 2 },
  themeButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  screenScroll: { flex: 1 },
  screenContent: { paddingHorizontal: 18, paddingTop: 21, paddingBottom: 30, gap: 17 },
  screenTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 1 },
  screenTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.8 },
  savedBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  savedDot: { width: 6, height: 6, borderRadius: 3 },
  savedText: { fontSize: 10, fontWeight: "600" },
  welcomeBlock: { gap: 10, paddingTop: 2, paddingBottom: 2 },
  liveBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  heroTitle: { fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.9 },
  heroSubtitle: { maxWidth: 360, fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.15 },
  textAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  textActionLabel: { fontSize: 12, fontWeight: "700" },
  languageList: { gap: 7, paddingRight: 4 },
  languageChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  languageText: { fontSize: 11, fontWeight: "700" },
  editorShell: { minHeight: 305, borderRadius: 15, overflow: "hidden" },
  editorHeader: { height: 42, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: "#273144", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editorDots: { flexDirection: "row", gap: 5 },
  windowDot: { width: 7, height: 7, borderRadius: 4 },
  editorLanguage: { color: "#95A0B4", fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  codeInput: { minHeight: 220, padding: 14, color: "#E4EAF5", fontSize: 13, lineHeight: 20, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), textAlignVertical: "top" },
  editorFooter: { minHeight: 34, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: "#273144", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editorMeta: { color: "#8792A7", fontSize: 10 },
  primaryButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { minHeight: 40, flex: 1, paddingHorizontal: 7, borderWidth: 1, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5 },
  actionText: { fontSize: 11, fontWeight: "700" },
  busyIndicator: { marginTop: -4 },
  trustRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, paddingBottom: 3 },
  trustText: { fontSize: 11 },
  sectionHeading: { gap: 6, paddingTop: 2 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  sectionTitle: { fontSize: 23, fontWeight: "800", letterSpacing: -0.55 },
  sectionSubtitle: { fontSize: 13, lineHeight: 19 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricCard: { width: "48%", flexGrow: 1, minHeight: 106, padding: 13, borderWidth: 1, borderRadius: 16, gap: 5 },
  metricValue: { fontSize: 21, fontWeight: "800", marginTop: 1 },
  metricLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  successRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  resultIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  bodyCopy: { fontSize: 13, lineHeight: 20 },
  issueCard: { padding: 14, borderWidth: 1, borderRadius: 15, gap: 9 },
  issueHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  issueTypePill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  issueTypeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  issueLine: { fontSize: 10, fontWeight: "700" },
  issueMessage: { fontSize: 13, lineHeight: 19 },
  contextCode: { padding: 12, borderRadius: 12, gap: 2 },
  contextLine: { fontSize: 11, lineHeight: 18, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  contextLineNumber: { color: "#748096" },
  suggestionBox: { padding: 12, borderWidth: 1, borderRadius: 12, gap: 7 },
  suggestionText: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  progressRow: { minHeight: 31, flexDirection: "row", alignItems: "center", gap: 9 },
  progressDot: { width: 7, height: 7, borderRadius: 4 },
  progressName: { flex: 1, fontSize: 12, fontWeight: "600" },
  progressStatus: { fontSize: 11, fontWeight: "700" },
  inlineLink: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingTop: 2 },
  inlineLinkText: { fontSize: 12, fontWeight: "800" },
  emptyPanel: { alignItems: "center", gap: 12, paddingVertical: 14 },
  emptyIconWrap: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyCopy: { fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 290 },
  phaseFlowItem: { alignItems: "stretch" },
  phaseCard: { minHeight: 77, padding: 12, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  phaseNumber: { width: 35, height: 35, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  phaseNumberText: { fontSize: 11, fontWeight: "800" },
  phaseTitle: { fontSize: 13, fontWeight: "800" },
  phaseCaption: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  phaseStatus: { fontSize: 10, fontWeight: "800", maxWidth: 80, textAlign: "right" },
  phaseConnector: { width: 1, height: 17, marginLeft: 29, alignItems: "center" },
  phaseArrow: { position: "absolute", bottom: 1, width: 6, height: 6, borderRightWidth: 1.5, borderBottomWidth: 1.5, transform: [{ rotate: "45deg" }] },
  phaseDescription: { marginTop: 8, borderWidth: 1, borderRadius: 15, padding: 14, gap: 8 },
  phaseDescriptionTitle: { fontSize: 16, fontWeight: "800" },
  treeBranch: { borderLeftWidth: 1, paddingLeft: 13, marginLeft: 7, marginTop: 10, gap: 4 },
  treeNode: { alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderRadius: 10 },
  treeNodeText: { fontSize: 11, fontWeight: "600", lineHeight: 16 },
  treeFootnote: { marginTop: 17, fontSize: 11, lineHeight: 17 },
  treeEmpty: { alignItems: "center", gap: 10, paddingVertical: 13 },
  chatPanel: { minHeight: 450, flex: 1, borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  chatMessages: { flex: 1, maxHeight: 420 },
  chatMessageList: { padding: 14, gap: 10 },
  chatBubble: { maxWidth: "88%", padding: 12, borderWidth: 1, borderRadius: 15, gap: 6 },
  chatRole: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  chatText: { fontSize: 13, lineHeight: 19 },
  suggestionChips: { flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingBottom: 10 },
  suggestionChip: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 9, paddingVertical: 7 },
  suggestionChipText: { fontSize: 9, fontWeight: "700" },
  chatInputRow: { borderTopWidth: 1, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  chatInput: { minHeight: 43, flex: 1, paddingHorizontal: 13, borderWidth: 1, borderRadius: 13, fontSize: 12 },
  sendButton: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  tabBar: { height: 68, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 5 },
  tabItem: { flex: 1, height: 62, alignItems: "center", justifyContent: "center", gap: 3 },
  tabLabel: { fontSize: 10 },
  activeIndicator: { position: "absolute", top: 0, width: 24, height: 2, borderRadius: 2 },
  loadingState: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  toast: { position: "absolute", bottom: 81, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, maxWidth: "90%" },
  toastText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
});
