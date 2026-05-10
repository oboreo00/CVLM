import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import About from "@/components/About";
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
  const [sessionId, setSessionId] = useState<string>("");
  const [queryMode, setQueryMode] = useState<"core" | "session">("core");
  const [hasResume, setHasResume] = useState(false);
  const [showIngestField, setShowIngestField] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [showReadmeModal, setShowReadmeModal] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    let storedSessionId = localStorage.getItem("cvlm_session_id");
    if (!storedSessionId) {
      storedSessionId = "sess_" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("cvlm_session_id", storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    
    // Check if session already has a resume
    fetch(`/api/rag/session-status/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.hasDocument) setHasResume(true);
      })
      .catch(err => console.error("Failed to check session status", err));
  }, [sessionId]);

  async function handleIngest() {
    if (!ingestText.trim()) return;
    setLoadingIngest(true);
    setError(null);
    try {
      const res = await fetch("/api/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ingestText, sessionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to ingest document");
      }
      setIngestText("");
      setHasResume(true);

      toast({
        title: "Success",
        description: "Your resume has been processed and indexed.",
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to ingest document");
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

  async function handleQuery(overrideQuestion?: any) {
    const q = (typeof overrideQuestion === "string") ? overrideQuestion : question;
    if (!q || typeof q !== "string" || !q.trim()) return;
    setLoadingQuery(true);
    setError(null);
    setAnswer(null); // Clear old answer for instant feedback
    setAnswerExpanded(false);
    setSuggestedQuestions([]);
    setHint(null);
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sessionId, queryMode }),
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
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
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
              <button
                className="rag-intel-btn"
                onClick={() => setShowReadmeModal(true)}
                title="Learn about CVLM"
              >
                About
              </button>
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
                {loadingIngest ? "Saving" : hasResume ? "Update Resume" : "Upload Resume"}
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
                    onChange={() => setQueryMode('core')}
                  />
                  <span>Author's Resume</span>
                </label>
                <label style={{ cursor: 'pointer', color: queryMode === 'session' ? '#86c598' : '#51795a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input 
                    type="radio" 
                    name="queryMode" 
                    value="session" 
                    checked={queryMode === 'session'} 
                    onChange={() => setQueryMode('session')}
                  />
                  <span>Custom Resume</span>
                </label>
              </div>
            </div>
            <p className="rag-hint">Ask a question about the resume</p>
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
              onClick={handleQuery}
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
                  <div className="rag-answer-text">{answer}</div>
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
        </div>
        <About open={showReadmeModal} onOpenChange={setShowReadmeModal} />
      </div>
    </>
  );
} 