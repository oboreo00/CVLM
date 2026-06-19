# CVLM - Usage Guide

This document provides instructions on how to use **CVLM**, a sophisticated Retrieval-Augmented Generation (RAG) knowledge assistant designed to anchor your career history, skills, and personal data in verifiable ground truth.

## Overview

CVLM is not just a standard document parser; it is a smart, hybrid knowledge graph that understands complex queries about your career and background. It allows you to:
- Ingest resumes, cover letters, and career documents into an intelligent vector store.
- Query your professional history using natural language.
- Receive grounded, factual answers using a multi-layered AI retrieval architecture.
- Automatically break down complex career decisions into focused sub-questions.

### Key Features
- **Agentic Query Routing:** LLM intent classification on every question (`intentLabel`, `needsWeb`, `recoveryHint`), then a deterministic replan gate routes to local RAG, hybrid web+resume synthesis, or retrieval retry — no second router LLM.
- **Natural Answers:** Synthesis prompts produce direct prose; retrieved resume sections and web links appear in the UI **Sources** panel instead of "Document 1" / "chunk 2" labels in the answer text.
- **Supabase Authentication & Data Protection:** Integrates the `@supabase/supabase-js` client to issue anonymous JWTs, ensuring isolated sessions and robust data protection. Visitors can safely upload and query transient resumes without polluting the core knowledge graph, while preventing unauthorized bots or anonymous keys from reading cross-session data.
- **Automated Data Lifecycle:** Transient session vectors are aggressively cleaned up via an automated 24-hour TTL (Time-To-Live) background job.
- **Hybrid Search Architecture:** Leverages local `pgvector` embeddings alongside dynamic fallback to live web search for gaps in knowledge.
- **Context-Aware Query Rewriting:** Automatically injects your local context (e.g., location, seniority) into web search queries.
- **Semantic Response Caching:** Delivers lightning-fast responses for repeated or similar queries.
- **Multi-Provider Foundation:** Built primarily on Google Gemini with paved support for Anthropic models.

## Prerequisites

Before using CVLM, ensure you have:

1. **Node.js** (v18 or higher recommended)
2. **PostgreSQL Database** - A running PostgreSQL instance
3. **Google Gemini API Key** - Required for embeddings and text generation
4. **npm** or **yarn** package manager

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database connection string (Supabase local Postgres instance)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Supabase Auth Configuration
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long

# Google Gemini API Key (required for standard AI Studio RAG functionality)
GEMINI_API_KEY=your_gemini_api_key_here

# Vertex AI Toggle & Project Information
USE_VERTEX_AI=false
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=your-region

# Google Cloud Service Account JSON Key (Optional, paste entire JSON string for Serverless/Railway deployment)
GOOGLE_CREDS_JSON=

# Anthropic API Key (for future multi-provider support)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Server port (optional, defaults to 5000)
PORT=5000

# Node environment (development or production)
NODE_ENV=development

# Agentic routing toggles (optional)
QUERY_INTENT_LLM=true          # LLM intent classifier; set false for heuristics only
REPLAN_GATE_ENABLED=true       # Single-step replan on uncertain local answers; set false to skip
```

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the key and add it to your `.env` file

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local Supabase stack:**
   ```bash
   npx supabase start
   ```

3. **Apply database migrations:**
   ```bash
   npm run db:migrate
   ```
   Creates tables, enables RLS, and applies policies from `migrations/` (generated from `shared/schema.ts`).

## Database schema changes

Schema lives in `shared/schema.ts`. When you change it:

1. **Generate** a migration (dev only):
   ```bash
   npm run db:generate -- --name describe_your_change
   ```
2. **Review** the new SQL under `migrations/`, then commit it.
3. **Apply** locally: `npm run db:migrate`
4. **Deploy:** `npm run build` runs `db:migrate` automatically when `DATABASE_URL` is set (same as Railway today). Only pending migrations run; no manual prod step unless you deploy outside that pipeline.

Do **not** use `npm run db:push` for prod — it can create RLS policies without `USING`/`WITH CHECK` clauses. `db:push` remains available for quick local experiments only.

## Running the Application

### Development Mode

Start the development server with hot-reloading:

```bash
npm run dev
```

The server will start on port 5000 (or the port specified in your `PORT` environment variable). The application will be available at:
- **Frontend:** http://localhost:5000
- **API:** http://localhost:5000/api

### Production Mode

1. **Build the application** (bundles client/server and applies pending DB migrations when `DATABASE_URL` is set):
   ```bash
   npm run build
   ```

2. **Start the production server:**
   ```bash
   npm start
   ```

## API Endpoints

The backend provides two main endpoints:

### 1. Ingest Career Documents

**Endpoint:** `POST /api/rag/ingest`

**Description:** Adds text (like resume bullet points or project descriptions) to the vector store.

**Request Body:**
```json
{
  "text": "Your document text content here...",
  "sessionId": "optional_session_identifier"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Document ingested successfully"
}
```

### 2. Query Knowledge Base

**Endpoint:** `POST /api/rag/query`

**Description:** Queries the ingested documents. CVLM will automatically determine if it should answer locally, rewrite your query for a web search, or suggest a decomposition of your question.

**Request Body:**
```json
{
  "question": "What is my expected salary as a senior developer?",
  "sessionId": "optional_session_identifier",
  "queryMode": "core" // or "session"
}
```

**Response:**
```json
{
  "answer": "The answer generated by the AI based on your local context and web sources...",
  "sources": [
    "Your resume context...",
    "Web Search Source (e.g., https://salary.com/...)"
  ],
  "suggestedQuestions": [
    "What is the average salary for a senior developer in Canada?",
    "What specific skills from my resume increase my market value?"
  ],
  "hint": "Your question appears complex. Try these simpler questions instead:"
}
```

## How It Works Under the Hood

1. **Secure Session Management & Data Isolation:**
   - The React frontend uses the `@supabase/supabase-js` client to automatically issue anonymous JWTs upon arrival.
   - The backend natively validates these JWTs using the local Supabase GoTrue container to securely extract the authenticated `user_id`.
   - All private `documents` and `query_logs` are tied directly to this `user_id`. This prevents unauthorized bots with just an `anon_key` from snooping on telemetry or reading cross-session documents, laying the foundation for strict Postgres Row-Level Security (RLS).

2. **Document Ingestion:**
   - Text is converted into an embedding vector using Google's `gemini-embedding-2` model. This specific model is used to ensure all vectors in the store are comparable and high-dimensional.
   - If a `userId` is provided, the vectors are tagged and given a 24-hour TTL (Time-To-Live) for automatic cleanup.
   - Vectors are stored in PostgreSQL using the `pgvector` extension for efficient and accurate cosine similarity searches. An in-memory LRU cache also tracks active session vectors for sub-millisecond lookups.

3. **Agentic Query Routing:**
   - **Intent classification:** Each question is classified (`factual_personal`, `career_advice`, `multi_part`, `off_domain`) via an LLM-first classifier with heuristic fallback (`QUERY_INTENT_LLM=false` for rollback). The classifier also sets `needsWeb` and a soft `recoveryHint` (`hybrid_web`, `retry_retrieval`, or `local_rag`).
   - **Primary path:** Cache → vector retrieval → local synthesis when intent says resume-only is enough. Answers are written in natural language; context blocks use resume section/company metadata internally, not numbered chunk labels echoed to the user.
   - **Replan gate:** Deterministic policy tree (`REPLAN_GATE_ENABLED`, default on): `needsWeb → hybrid_web`; else low retrieval relevance or failed local synthesis → hybrid or retry by intent; the gate may override a conflicting `recoveryHint`. No second LLM router.
   - CVLM explicitly segments the vector search based on `queryMode` and `sessionId` to prevent cross-contamination of resumes.
   - It performs a cosine similarity search against the isolated vector graph.
   - **Hybrid Web Search:** When `needsWeb` is set or the gate chooses hybrid recovery, CVLM rewrites your query using local context and queries the web.
   - A final synthesis step combines your local ground truth with web search results to provide a comprehensive, context-aware answer.

4. **Multi-Platform GeminiAdapter:**
   - CVLM orchestrates all generative, embedding, and web search operations through a unified **`GeminiAdapter`** layer.
   - By simply toggling `USE_VERTEX_AI=true/false` in your `.env` file, the adapter dynamically routes requests through either the **Google AI Studio Developer API** (using `@google/genai`) or **Google Cloud Vertex AI** (using `@google-cloud/vertexai`).
   - The adapter normalizes all platform-specific differences (such as model-naming prefixes, tool configuration arrays, and response schemas) into a single standard format. 
   - Additionally, it features a dynamic credentials bootstrap designed for containerized/serverless environments (like **Railway**): pasting a Google Cloud service account JSON into the `GOOGLE_CREDS_JSON` environment variable will automatically bootstrap and authenticate your container at startup without checking any secrets into git!

## Observability & Telemetry

CVLM is built with a "Production-First" mindset regarding observability. Every query execution is traced and logged into a dedicated telemetry table, providing a rich foundation for performance tuning.

### Key Telemetry Data
- **Step Latency Breakdown:** Identifies bottlenecks by measuring individual durations for Analysis, Embedding, Web Search, Synthesis, and Replan Gate.
- **Model Attribution:** Records exactly which model handled each stage of the orchestration (e.g., Flash for analysis vs. Pro for answering).
- **Intent & Replan:** Logs `intentLabel`, `intentSource`, `intentConfidence`, `recoveryHint`, and when triggered `replanTool`, `replanSource`, `replanReason`.
- **Token Accounting:** Captures precise prompt and completion token counts to enable cost-per-query analysis.
- **Retrieval Quality:** Logs the `relevanceScore` of every vector search to help fine-tune retrieval thresholds and chunking strategies.
- **Cache Performance:** Tracks hit/miss status for the multi-layer caching system.
- **Query Route:** Records which path handled the request (`cache`, `local_rag`, `hybrid_web_fallback`, `web_fallback_failed`, or `suggest_breakdown`).

This detailed instrumentation serves as a foundation for any observability specialist to understand the internal decision-making of the RAG engine. While the current implementation persists raw data to PostgreSQL, the architecture is designed to eventually integrate with aggregated data analysis tools like **Datadog**, **LangSmith**, or **Honeycomb** for long-term trend analysis and anomaly detection.

## Usage Workflow

1. **Start the server:** `npm run dev`
2. **Ingest your career history:** Paste your resume, cover letters, and project summaries into the UI.
3. **Query your profile:** Ask about your strengths, salary expectations, or career path options.

## Frontend Usage

The project includes a sleek React frontend (`client/src/pages/home.tsx`).
Once the server is running, navigate to `http://localhost:5000` to interact with CVLM visually.

## Database Schema

The application uses a unified document storage schema:

- **documents** table:
  - `id` (serial, primary key)
  - `content` (text, required)
  - `metadata` (jsonb, optional)
  - `embedding` (vector(3072)) — Stores high-precision embeddings from the `gemini-embedding-2` model for `pgvector` comparison.

- **query_logs** table:
  - `id` (serial, primary key)
  - `question` (text) — The raw user query.
  - `query_mode` (text) — Whether the query was against 'core' or 'session' data.
  - `total_duration_ms` (integer) — Total end-to-end response time.
  - `relevance_score` (numeric) — The blended retrieval confidence score.
  - `models_used` (jsonb) — Mapping of steps to specific AI models.
  - `step_durations` (jsonb) — Micro-latencies for each phase of execution.
  - `cache_status` (jsonb) — Hit/miss data for the caching layers.
  - `prompt_tokens` / `completion_tokens` (integer) — Usage metrics for cost tracking.
  - `created_at` (timestamp) — Temporal marker for log analysis.

## Troubleshooting

### Database Connection Issues (ECONNREFUSED)
- Ensure PostgreSQL is running and port 5432 is listening.
- If using Homebrew on macOS, clear stale lock files: `rm /usr/local/var/postgresql@18/postmaster.pid` and restart the service.

### API Key Issues
- Verify your `GEMINI_API_KEY` is set correctly.
- Ensure the API key has the necessary permissions and quota limits are not exceeded.

### Missing Dependencies
- Run `npm install` if you see `MODULE_NOT_FOUND` errors.
