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

          <h3>Multi-Tenant Session Isolation</h3>
          <p>Allows visitors to safely upload and query their own transient resumes without polluting the core knowledge graph.</p>

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

          <h2>Architecture Highlights</h2>
          <ul>
            <li><strong>Vector Store:</strong> PostgreSQL with pgvector for semantic search</li>
            <li><strong>AI Models:</strong> Google Gemini for embeddings and text generation</li>
            <li><strong>Web Integration:</strong> Fallback to live web search for out-of-domain queries</li>
            <li><strong>Session Management:</strong> 24-hour TTL for transient documents</li>
            <li><strong>Response Caching:</strong> Semantic cache for repeated queries</li>
            <li><strong>Hosting:</strong> Hosted on Railway as a Node.js app connecting to a Supabase database</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}