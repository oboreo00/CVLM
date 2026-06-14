import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  prepDisplayForModeSwitch,
  prepDisplayFromPayload,
} from "@/lib/prepDisplayState";
import {
  clearQueryOptionsForModeChange,
  clearQueryOptionsForNewQuery,
  type ClearQueryOptions,
} from "@/lib/queryUiState";
import {
  consumePrepStatusStream,
  fetchPrepStatusSnapshot,
  shouldConnectPrepStatusStream,
  type PrepStatusPayload,
} from "@/lib/prepStatusStream";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import About from "@/components/About";
import AboutButton from "@/components/AboutButton";
import { AnswerMarkdown } from "@/components/AnswerMarkdown";
import "./home.css";

export default function Home() {
  const [ingestText, setIngestText] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loadingIngest, setLoadingIngest] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [queryMode, setQueryMode] = useState<"core" | "session">("core");
  const [hasResume, setHasResume] = useState(false);
  const [showIngestField, setShowIngestField] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [showReadmeModal, setShowReadmeModal] = useState(false);
  const [prepStatus, setPrepStatus] = useState<"none" | "pending" | "ready" | "failed">("none");
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState<{ count: number; sections: string[] } | null>(null);
  const [prepStreamNonce, setPrepStreamNonce] = useState(0);
  const prepSyncGenRef = useRef(0);

  const { toast } = useToast();

  const applyPrepPayload = useCallback((data: PrepStatusPayload | null) => {
    const next = prepDisplayFromPayload(data);
    if (!next) return;
    setPrepStatus(next.prepStatus);
    setChunkIndex(next.chunkIndex);
    setStarterQuestions(next.starterQuestions);
  }, []);

  const clearQueryResults = useCallback((options?: ClearQueryOptions) => {
    if (options?.clearQuestion) {
      setQuestion("");
    }
    setAnswer(null);
    setSources([]);
    setSuggestedQuestions([]);
    setHint(null);
    setAnswerExpanded(false);
    if (options?.clearHighlight) {
      setIsHighlighting(false);
    }
    if (options?.clearError) {
      setError(null);
    }
  }, []);

  const handleQueryModeChange = useCallback(
    (mode: "core" | "session") => {
      const clearOpts = clearQueryOptionsForModeChange(queryMode, mode);
      if (!clearOpts) return;
      clearQueryResults(clearOpts);
      const prepReset = prepDisplayForModeSwitch();
      setPrepStatus(prepReset.prepStatus);
      setChunkIndex(prepReset.chunkIndex);
      setStarterQuestions(prepReset.starterQuestions);
      setQueryMode(mode);
    },
    [queryMode, clearQueryResults],
  );

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const res = await fetch(`/api/rag/session-status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (data.hasDocument) {
          setHasResume(true);
        }
      } catch (err) {
        console.error("Failed to check session status", err);
      }
    };
    void checkSession();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const syncGen = ++prepSyncGenRef.current;
    const applyIfCurrent = (data: PrepStatusPayload | null) => {
      if (syncGen !== prepSyncGenRef.current) return;
      applyPrepPayload(data);
    };

    const runStream = async () => {
      try {
        let snapshot = await fetchPrepStatusSnapshot(queryMode, controller.signal);
        if (syncGen !== prepSyncGenRef.current) return;
        if (snapshot) {
          applyIfCurrent(snapshot);
        }

        if (shouldConnectPrepStatusStream(snapshot)) {
          await consumePrepStatusStream(queryMode, applyIfCurrent, controller.signal);
          if (syncGen !== prepSyncGenRef.current) return;
          snapshot = await fetchPrepStatusSnapshot(queryMode, controller.signal);
          if (snapshot) {
            applyIfCurrent(snapshot);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Prep status stream error", err);
        }
      }
    };

    void runStream();
    return () => controller.abort();
  }, [queryMode, prepStreamNonce, applyPrepPayload]);

  async function handleIngest() {
    if (!ingestText.trim()) return;
    setLoadingIngest(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch("/api/rag/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: ingestText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to ingest document");
      }
      setIngestText("");
      setHasResume(true);
      clearQueryResults({
        clearQuestion: true,
        clearHighlight: true,
        clearError: true,
      });
      setQueryMode("session");
      setPrepStatus("pending");
      setStarterQuestions([]);
      setChunkIndex(null);
      setPrepStreamNonce((n) => n + 1);

      toast({
        title: "Resume received",
        description: "Analyzing and indexing your resume in the background.",
      });
    } catch (e: any) {
      const message = e.message ?? "Failed to ingest document";
      setError(message);
      toast({
        variant: "destructive",
        title: "Upload Error",
        description: message,
      });
    } finally {
      setLoadingIngest(false);
    }
  }

  async function handleQuery(overrideQuestion?: string) {
    const q = (typeof overrideQuestion === "string") ? overrideQuestion : question;
    if (!q || typeof q !== "string" || !q.trim()) return;
    setLoadingQuery(true);
    setError(null);
    clearQueryResults(clearQueryOptionsForNewQuery());
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers,
        body: JSON.stringify({ question: q, queryMode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to query documents");
      }
      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources ?? []);
      setSuggestedQuestions(data.suggestedQuestions ?? []);
      setHint(data.hint ?? null);
    } catch (e: any) {
      setError(e.message ?? "Failed to query documents");
    } finally {
      setLoadingQuery(false);
    }
  }

  function handleSuggestedQuestion(suggestedQ: string) {
    setQuestion(suggestedQ);
    setIsHighlighting(true);
    setTimeout(() => setIsHighlighting(false), 500);
    handleQuery(suggestedQ); // Automatically trigger the query
  }

  return (
    <>
      <div className="rag-root">
        <div className="rag-card">
          <div className="rag-header">
            <div className="rag-header-title-row">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h1 className="rag-title" style={{ cursor: 'help', margin: 0 }}>CV<span>LM</span></h1>
                  </TooltipTrigger>
                  <TooltipContent className="rag-tooltip-content" side="top">
                    <p>
                      <span className="rag-tooltip-highlight">Career Vector Language Model</span>
                      <br />
                      An intelligent assistant that anchors your career history in a verifiable vector store for grounded, factual analysis.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AboutButton onClick={() => setShowReadmeModal(true)} />
            </div>
            <p className="rag-subtitle">Career Knowledge Graph · Grounded Answers · Hybrid Search</p>
          </div>

          <div className="rag-section">
            <button
              className="rag-collapsible-toggle"
              onClick={() => setShowIngestField(!showIngestField)}
              type="button"
            >
              <div className="rag-collapsible-toggle-left">
                <span className="rag-collapsible-title">
                  {hasResume ? "✓ Custom Resume" : "Custom Resume"}
                </span>
                <span className="rag-collapsible-desc">
                  {hasResume
                    ? "Resume uploaded — click to update"
                    : "Author's resume is pre-loaded in CVLM Core. Upload yours to compare or query separately."}
                </span>
              </div>
              <span className={`rag-collapsible-chevron${showIngestField ? " open" : ""}`}>▼</span>
            </button>
            <div className={`rag-collapsible-body${showIngestField ? " open" : ""}`}>
              <textarea
                className="rag-textarea"
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                placeholder="Paste your resume as plain text..."
                style={{ minHeight: "100px" }}
              />
              <br />
              <button
                className={`rag-btn${loadingIngest ? " rag-btn-loading" : ""}`}
                onClick={handleIngest}
                disabled={loadingIngest || !ingestText.trim()}
              >
                {loadingIngest ? "Uploading" : hasResume ? "Update Resume" : "Upload Resume"}
              </button>
            </div>
          </div>

          <hr className="rag-divider" />

          <div className="rag-section">
            <div className="rag-section-header">
              <div className="rag-label">Query</div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <label style={{ cursor: 'pointer', color: queryMode === 'core' ? '#86c598' : '#51795a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input 
                    type="radio" 
                    name="queryMode" 
                    value="core" 
                    checked={queryMode === 'core'} 
                    onChange={() => handleQueryModeChange("core")}
                  />
                  <span>Author's Resume</span>
                </label>
                <label style={{ cursor: 'pointer', color: queryMode === 'session' ? '#86c598' : '#51795a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input 
                    type="radio" 
                    name="queryMode" 
                    value="session" 
                    checked={queryMode === 'session'} 
                    onChange={() => handleQueryModeChange("session")}
                  />
                  <span>Custom Resume</span>
                </label>
              </div>
            </div>
            <p className="rag-hint">
              {queryMode === "session" && prepStatus === "pending"
                ? "Analyzing your resume — you can ask questions once indexing finishes."
                : "Ask a question about the resume"}
            </p>
            {prepStatus === "pending" && (
              <p className="rag-chunk-status" aria-live="polite">
                Indexing resume sections…
              </p>
            )}
            {chunkIndex && prepStatus === "ready" && (
              <p className="rag-chunk-status rag-chunk-status--ready" aria-live="polite">
                {chunkIndex.count} segment{chunkIndex.count === 1 ? "" : "s"} indexed
                {chunkIndex.sections.length > 0 && (
                  <> · {chunkIndex.sections.join(" · ")}</>
                )}
              </p>
            )}
            <input
              className={`rag-input${isHighlighting ? " animate-query-pop" : ""}`}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to know?"
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            />
            <br />
            <button
              className={`rag-btn${loadingQuery ? " rag-btn-loading" : ""}`}
              onClick={() => void handleQuery()}
              disabled={loadingQuery || !question.trim()}
            >
              {loadingQuery ? "Thinking" : "Ask"}
            </button>
          </div>

          {error && (
            <div className="rag-error">⚠ {error}</div>
          )}

          {answer && (
            <>
              <hr className="rag-divider" />
              <div className="rag-answer-block">
                <div className="rag-label">Answer</div>
                <div className={`rag-answer-wrapper${!answerExpanded ? " capped" : ""}`}>
                  <AnswerMarkdown content={answer} />
                </div>
                <button
                  className="rag-answer-toggle"
                  onClick={() => setAnswerExpanded(!answerExpanded)}
                  type="button"
                >
                  {answerExpanded ? "▲ Show less" : "▼ Show full answer"}
                </button>
                {sources.length > 0 && (
                  <>
                    <p className="rag-sources-label">Sources</p>
                    <ul className="rag-sources-list">
                      {sources.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {suggestedQuestions.length > 0 && (
                  <div className="rag-suggestions">
                    {hint && <p className="rag-suggestions-label">{hint}</p>}
                    {!hint && <p className="rag-suggestions-label">Try these refined questions:</p>}
                    <div>
                      {suggestedQuestions.map((sq, i) => (
                        <button
                           key={i}
                           className="rag-suggestion-btn"
                           onClick={() => handleSuggestedQuestion(sq)}
                        >
                          {sq}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {starterQuestions.length > 0 && prepStatus === "ready" && (
            <div className="rag-suggestions" style={{ marginTop: answer ? "1.5rem" : "1rem" }}>
              <p className="rag-suggestions-label">Suggested questions:</p>
              <div>
                {starterQuestions.map((sq, i) => (
                  <button
                    key={i}
                    className="rag-suggestion-btn"
                    onClick={() => handleSuggestedQuestion(sq)}
                    type="button"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="rag-footer-note">Query text and usage metadata (model, token, cache status) are logged for performance monitoring</p>
        </div>
        <About open={showReadmeModal} onOpenChange={setShowReadmeModal} />
      </div>
    </>
  );
} 