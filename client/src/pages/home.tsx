import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import About from "@/components/About";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap');

  .rag-root {
    min-height: 100vh;
    width: 100%;
    background-color: #050706;
    background-image:
      radial-gradient(ellipse 80% 60% at 50% -10%, rgba(74, 122, 85, 0.18) 0%, transparent 70%),
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    padding: 2rem 1rem;
    font-family: 'Outfit', sans-serif;
  }

  .rag-card {
    width: 100%;
    max-width: 680px;
    background: rgba(10, 14, 12, 0.97);
    border: 1px solid rgba(122, 179, 138, 0.15);
    border-radius: 2px;
    padding: 2.5rem;
    box-shadow: 0 0 60px rgba(74, 122, 85, 0.08), 0 0 0 1px rgba(122, 179, 138, 0.05);
    animation: fadeUp 0.6s ease both;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .rag-header {
    margin-bottom: 2.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid rgba(122, 179, 138, 0.1);
    animation: fadeUp 0.6s 0.05s ease both;
  }

  .rag-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 2rem;
    font-weight: 300;
    color: #c8dccb;
    letter-spacing: 0.02em;
    margin: 0 0 0.25rem;
    line-height: 1;
  }

  .rag-title span {
    color: #7ab38a;
  }

  .rag-subtitle {
    font-size: 0.65rem;
    color: #4a6e52;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin: 0;
  }

  .rag-section {
    margin-bottom: 2rem;
    animation: fadeUp 0.6s ease both;
  }

  .rag-section:nth-child(2) { animation-delay: 0.1s; }
  .rag-section:nth-child(3) { animation-delay: 0.2s; }
  .rag-section:nth-child(4) { animation-delay: 0.3s; }

  .rag-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7ab38a;
    margin-bottom: 0.6rem;
  }

  .rag-label::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 4px;
    background: #7ab38a;
    border-radius: 50%;
  }

  .rag-hint {
    font-size: 0.8rem;
    color: #3d5e45;
    margin-bottom: 0.75rem;
    letter-spacing: 0.03em;
    font-weight: 300;
  }

  .rag-textarea {
    width: 100%;
    min-height: 120px;
    background: rgba(10, 15, 11, 0.8);
    border: 1px solid rgba(122, 179, 138, 0.12);
    border-radius: 2px;
    color: #a8c4ac;
    font-family: 'Outfit', sans-serif;
    font-size: 0.85rem;
    font-weight: 300;
    padding: 0.85rem 1rem;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    line-height: 1.6;
    caret-color: #7ab38a;
  }

  .rag-textarea::placeholder { color: #2e4a35; }

  .rag-textarea:focus {
    border-color: rgba(122, 179, 138, 0.35);
    box-shadow: 0 0 0 3px rgba(74, 122, 85, 0.08), inset 0 0 20px rgba(74, 122, 85, 0.03);
  }

  .rag-input {
    width: 100%;
    background: rgba(10, 15, 11, 0.8);
    border: 1px solid rgba(122, 179, 138, 0.12);
    border-radius: 2px;
    color: #a8c4ac;
    color: #a8c4ac;
    font-family: 'Outfit', sans-serif;
    font-size: 0.85rem;
    font-weight: 300;
    padding: 0.75rem 1rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    caret-color: #7ab38a;
  }

  .rag-input::placeholder { color: #2e4a35; }

  .rag-input:focus {
    border-color: rgba(122, 179, 138, 0.35);
    box-shadow: 0 0 0 3px rgba(74, 122, 85, 0.08);
  }

  .rag-btn {
    margin-top: 0.75rem;
    padding: 0.6rem 1.4rem;
    background: transparent;
    border: 1px solid rgba(122, 179, 138, 0.3);
    border-radius: 2px;
    color: #7ab38a;
    color: #7ab38a;
    font-family: 'Outfit', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.1s;
  }

  .rag-btn:hover:not(:disabled) {
    background: rgba(122, 179, 138, 0.08);
    border-color: rgba(122, 179, 138, 0.5);
    box-shadow: 0 0 16px rgba(74, 122, 85, 0.12);
  }

  .rag-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .rag-btn:disabled {
    opacity: 0.45;
    border-color: rgba(122, 179, 138, 0.25);
    color: rgba(122, 179, 138, 0.4);
    cursor: not-allowed;
    transform: none;
  }

  .rag-btn-loading::after {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border: 1px solid #7ab38a;
    border-top-color: transparent;
    border-radius: 50%;
    margin-left: 8px;
    vertical-align: middle;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .rag-divider {
    border: none;
    border-top: 1px solid rgba(122, 179, 138, 0.08);
    margin: 2rem 0;
  }

  .rag-error {
    font-size: 0.7rem;
    color: #c47a7a;
    padding: 0.6rem 0.85rem;
    background: rgba(180, 80, 80, 0.06);
    border: 1px solid rgba(180, 80, 80, 0.15);
    border-radius: 2px;
    letter-spacing: 0.03em;
  }

  /* Tooltip Customization */
  .rag-tooltip-content {
    background: #141d16 !important;
    border: 1px solid rgba(122, 179, 138, 0.3) !important;
    color: #c8dccb !important;
    font-family: 'Outfit', sans-serif !important;
    font-size: 0.75rem !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
    max-width: 280px;
    line-height: 1.5;
    padding: 0.75rem 1rem !important;
  }

  .rag-tooltip-highlight {
    color: #7ab38a;
    font-weight: 500;
  }

  .rag-answer-block {
    animation: fadeUp 0.4s ease both;
  }

  .rag-answer-wrapper {
    position: relative;
  }

  .rag-answer-wrapper.capped .rag-answer-text {
    max-height: 400px;
    overflow: hidden;
  }

  .rag-answer-wrapper.capped::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    background: linear-gradient(to bottom, transparent, rgba(10, 15, 11, 0.95));
    pointer-events: none;
  }

  .rag-answer-toggle {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.35rem 0.8rem;
    background: none;
    border: 1px solid rgba(122, 179, 138, 0.2);
    border-radius: 2px;
    color: #5a9a6a;
    font-family: 'Outfit', sans-serif;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
  }

  .rag-answer-toggle:hover {
    color: #7ab38a;
    border-color: rgba(122, 179, 138, 0.4);
  }

  .rag-answer-text {
    font-size: 0.8rem;
    color: #b8d4bc;
    line-height: 1.85;
    white-space: pre-wrap;
    font-weight: 300;
    padding: 1rem;
    background: rgba(10, 15, 11, 0.6);
    border-left: 2px solid rgba(122, 179, 138, 0.3);
    font-family: 'Outfit', sans-serif;
  }

  .rag-sources-label {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #4a6e52;
    margin: 1rem 0 0.4rem;
  }

  .rag-sources-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .rag-sources-list li {
    font-size: 0.68rem;
    color: #4a6e52;
    padding: 0.2rem 0;
    font-weight: 300;
  }

  .rag-sources-list li::before {
    content: '↳ ';
    color: #3a5e42;
  }

  .rag-suggestions {
    margin: 1.5rem 0 0;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(122, 179, 138, 0.1);
  }

  .rag-suggestions-label {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #4a6e52;
    margin-bottom: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .rag-suggestions-label::before {
    content: '💡';
    font-size: 0.75rem;
  }

  .rag-suggestion-btn {
    display: inline-block;
    padding: 0.5rem 0.85rem;
    margin: 0.35rem 0.35rem 0.35rem 0;
    background: rgba(74, 122, 85, 0.1);
    border: 1px solid rgba(122, 179, 138, 0.25);
    border-radius: 2px;
    color: #7ab38a;
    font-family: 'Outfit', sans-serif;
    font-size: 0.7rem;
    font-weight: 400;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.1s;
    line-height: 1.4;
    text-align: left;
    max-width: 100%;
  }

  .rag-mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .rag-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
  }

  .rag-collapsible-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: 1px solid rgba(122, 179, 138, 0.1);
    border-radius: 2px;
    padding: 0.7rem 1rem;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .rag-collapsible-toggle:hover {
    background: rgba(74, 122, 85, 0.06);
    border-color: rgba(122, 179, 138, 0.25);
  }

  .rag-collapsible-toggle-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
  }

  .rag-collapsible-title {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7ab38a;
    font-family: 'Outfit', sans-serif;
    font-weight: 500;
  }

  .rag-collapsible-desc {
    font-size: 0.72rem;
    color: #3d5e45;
    font-weight: 300;
    letter-spacing: 0.02em;
  }

  .rag-collapsible-chevron {
    font-size: 0.7rem;
    color: #4a6e52;
    transition: transform 0.25s ease;
  }

  .rag-collapsible-chevron.open {
    transform: rotate(180deg);
  }

  .rag-collapsible-body {
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition: max-height 0.35s ease, opacity 0.25s ease, margin 0.25s ease;
    margin-top: 0;
  }

  .rag-collapsible-body.open {
    max-height: 300px;
    opacity: 1;
    margin-top: 0.75rem;
  }

  .rag-suggestion-btn:hover {
    background: rgba(74, 122, 85, 0.2);
    border-color: rgba(122, 179, 138, 0.4);
  }

  .rag-suggestion-btn:active {
    transform: scale(0.98);
  }

  @keyframes queryPop {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); border-color: rgba(122, 179, 138, 0.5); }
    100% { transform: scale(1); }
  }

  .animate-query-pop {
    animation: queryPop 0.4s ease-out;
  }

  .rag-intel-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 28px;
    margin-left: 1rem;
    background: transparent;
    border: 1px solid rgba(122, 179, 138, 0.25);
    border-radius: 2px;
    color: #7ab38a;
    font-family: 'Outfit', sans-serif;
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.1s;
  }

  .rag-intel-btn:hover {
    background: rgba(122, 179, 138, 0.08);
    border-color: rgba(122, 179, 138, 0.5);
    box-shadow: 0 0 12px rgba(74, 122, 85, 0.12);
  }

  .rag-intel-btn:active {
    transform: scale(0.95);
  }

  .rag-readme-modal {
    background: rgba(10, 14, 12, 0.98) !important;
    border: 1px solid rgba(122, 179, 138, 0.15) !important;
  }

  /* Dialog Close Button Styling */
  .rag-readme-modal .absolute.right-4.top-4 {
    color: #c8dccb !important;
    opacity: 0.8 !important;
    border: none !important;
    background: transparent !important;
  }

  .rag-readme-modal .absolute.right-4.top-4:hover {
    color: #ffffff !important;
    opacity: 1 !important;
    border: none !important;
    background: transparent !important;
  }

  .rag-readme-modal-header {
    border-bottom: 1px solid rgba(122, 179, 138, 0.1) !important;
  }

  .rag-readme-modal-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.5rem;
    font-weight: 300;
    color: #c8dccb;
    letter-spacing: 0.02em;
  }

  .rag-readme-modal-content {
    font-family: 'Outfit', sans-serif;
    color: #b8d4bc;
    font-size: 0.8rem;
    line-height: 1.7;
    max-height: 70vh;
    overflow-y: auto;
  }

  .rag-readme-modal-content h2 {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.1rem;
    font-weight: 400;
    color: #c8dccb;
    margin-top: 1.25rem;
    margin-bottom: 0.6rem;
    letter-spacing: 0.01em;
  }

  .rag-readme-modal-content h3 {
    font-family: 'Outfit', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    color: #7ab38a;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .rag-readme-modal-content ul, .rag-readme-modal-content ol {
    margin-left: 1.5rem;
    margin-bottom: 0.8rem;
  }

  .rag-readme-modal-content li {
    margin-bottom: 0.4rem;
    color: #a8c4ac;
  }

  .rag-readme-modal-content code {
    background: rgba(74, 122, 85, 0.1);
    color: #7ab38a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    padding: 0.2rem 0.4rem;
    border-radius: 2px;
  }

  .rag-readme-modal-content pre {
    background: rgba(10, 15, 11, 0.8);
    border: 1px solid rgba(122, 179, 138, 0.12);
    border-radius: 2px;
    padding: 1rem;
    overflow-x: auto;
    margin: 0.8rem 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: #7ab38a;
  }

  .rag-readme-modal-content strong {
    color: #c8dccb;
    font-weight: 500;
  }
`;

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
  const [ingestSuccess, setIngestSuccess] = useState(false);
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
    setIngestSuccess(false);
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
      <style dangerouslySetInnerHTML={{ __html: styles }} />
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
                {loadingIngest ? "Saving" : ingestSuccess ? "✓ Saved" : hasResume ? "Update Resume" : "Upload Resume"}
              </button>
            </div>
          </div>

          <hr className="rag-divider" />

          <div className="rag-section">
            <div className="rag-section-header">
              <div className="rag-label">Query</div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <label style={{ cursor: 'pointer', color: queryMode === 'core' ? '#7ab38a' : '#4a6e52', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input 
                    type="radio" 
                    name="queryMode" 
                    value="core" 
                    checked={queryMode === 'core'} 
                    onChange={() => setQueryMode('core')}
                  />
                  <span>Author's Resume</span>
                </label>
                <label style={{ cursor: 'pointer', color: queryMode === 'session' ? '#7ab38a' : '#4a6e52', display: 'flex', alignItems: 'center', gap: '4px' }}>
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