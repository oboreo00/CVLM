import {
  formatStatModel,
  truncateQuestion,
  type QueryLogStatRow,
} from "@/lib/queryLogs";

interface QueryStatsPanelProps {
  rows: QueryLogStatRow[];
  loading: boolean;
  error: string | null;
}

export default function QueryStatsPanel({ rows, loading, error }: QueryStatsPanelProps) {
  if (loading) {
    return <p className="rag-stats-message">Loading recent query stats…</p>;
  }

  if (error) {
    return <p className="rag-stats-message rag-stats-message--error">⚠ {error}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="rag-stats-message">
        No query logs for this session yet. Ask a question first.
      </p>
    );
  }

  return (
    <div className="rag-stats-table-wrap">
      <table className="rag-stats-table">
        <thead>
          <tr>
            <th>Query</th>
            <th>Intent</th>
            <th>Tokens</th>
            <th>Model</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.createdAt ?? i}>
              <td className="rag-stats-query" title={row.question}>
                {truncateQuestion(row.question)}
              </td>
              <td>{row.intentLabel ?? "—"}</td>
              <td className="rag-stats-num">
                {row.totalTokens != null ? row.totalTokens.toLocaleString() : "—"}
              </td>
              <td className="rag-stats-model">{formatStatModel(row.modelsUsed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
