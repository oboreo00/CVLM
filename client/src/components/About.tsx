import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AboutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function About({ open, onOpenChange }: AboutProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rag-readme-modal w-full max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="rag-readme-modal-header">
          <DialogTitle className="rag-readme-modal-title">About CVLM</DialogTitle>
        </DialogHeader>
        <div className="rag-readme-modal-content">
          <h2>What is CVLM?</h2>
            <p>
              CVLM is a <strong>career knowledge assistant</strong> that reasons over your verified resume data — pulling in live web search when the question calls for it — to give you grounded answers about your experience, skills, and career direction.
            </p>
          <h2>Key Features</h2>
          <h3>Smart Query Analysis</h3>
          <p>Detects complex questions and suggests logical breakdowns for thorough answers.</p>

          <h3>Supabase Auth & Session Isolation</h3>
          <p>Secured with anonymous sign-ins and Postgres Row-Level Security (RLS) to ensure recruiters' transient resumes remain completely isolated, private, and out of reach from unauthorized bots or cross-session access.</p>

          <h3>Hybrid Search Architecture</h3>
          <p>Leverages local vector embeddings alongside dynamic fallback to live web search for gaps in knowledge.</p>

          <h3>Context-Aware Query Rewriting</h3>
          <p>Automatically injects your local context (e.g., location, seniority) into web search queries for more relevant results.</p>

          <h3>Semantic Response Caching</h3>
          <p>Delivers lightning-fast responses for repeated or similar queries with LRU (Least Recently Used) caching.</p>

          <h3>Multi-Provider Foundation</h3>
          <p>Built primarily on Google Gemini with paved support for Anthropic models.</p>

          <h2>How to Use</h2>
          <h3>Author's Resume (Core)</h3>
          <p>Query against Boris's pre-loaded resume. This provides grounded answers about his career, skills, and experience with live web search fallback.</p>

          <h3>Custom Resume (Session)</h3>
          <p>Upload your own resume to compare, benchmark, or explore your own career path. Your data is isolated to your session and automatically cleaned up after 24 hours.</p>

          <h3>Asking Questions</h3>
          <p>Use natural language to ask anything about the resume. CVLM will:</p>
          <ul>
            <li>Provide grounded answers from the document</li>
            <li>Link relevant sources</li>
            <li>Suggest follow-up questions for deeper exploration</li>
            <li>Break down complex queries into focused sub-questions</li>
          </ul>
          <h3>Example Questions</h3>
          <ul>
            <li>"What did I do in my last job?" — a simple grounded lookup from your resume data</li>
            <li>"How does my background prepare me for a role in fintech?" — triggers career mapping and web search on what fintech roles actually require</li>
            <li>"What's the biggest gap in my resume for a Staff Engineer role, and how would I close it?" — grounded self-assessment with external market context</li>
            <li>"If I wanted to pivot into climate tech, what transferable skills do I already have?" — personal data combined with live web context on the domain</li>
          </ul>
          <h2>Architecture Highlights</h2>
          <ul>
            <li><strong>Vector Store:</strong> PostgreSQL with pgvector for semantic search</li>
            <li><strong>AI Foundation:</strong> Google Gemini API via Google AI Studio, with a unified adapter designed to seamlessly pivot to enterprise Google Cloud Vertex AI</li>
            <li><strong>Web Integration:</strong> Fallback to live web search for out-of-domain queries</li>
            <li><strong>Session & Security:</strong> Anonymous Supabase authentication paired with strict database-level Postgres Row-Level Security (RLS) and automatic 24-hour TTL document deletion</li>
            <li><strong>Response Caching:</strong> Semantic cache for repeated queries</li>
            <li><strong>Hosting:</strong> Hosted on Railway as a Node.js app connecting to a Supabase database</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}