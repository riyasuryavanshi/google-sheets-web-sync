import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function App() {
  const [rows, setRows] = useState([]);
  const [draftRows, setDraftRows] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Connecting…");

  const loadData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/data`);

      let body;

      try {
        body = await response.json();
      } catch {
        throw new Error("Server returned an invalid response");
      }

      if (!response.ok) {
        throw new Error(body.detail || "Could not load data");
      }

      const serverRows = Array.isArray(body.rows) ? body.rows : [];

      if (!editing) {
        setRows(serverRows);
        setDraftRows(serverRows.map((row) => [...row]));
      }

      setStatus(`Synced • ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error("Sync error:", error);
      setStatus(`Sync error: ${error.message}`);
    }
  }, [editing]);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadData]);

  function startEditing() {
    setDraftRows(rows.map((row) => [...row]));
    setEditing(true);
    setStatus("Editing — changes are not saved yet");
  }

  function cancelEditing() {
    setDraftRows(rows.map((row) => [...row]));
    setEditing(false);
    setStatus("Edit cancelled");
  }

  function updateCell(rowIndex, colIndex, value) {
    setDraftRows((current) =>
      current.map((row, r) =>
        r === rowIndex
          ? row.map((cell, c) => (c === colIndex ? value : cell))
          : row
      )
    );
  }

  async function submit() {
    setSaving(true);
    setStatus("Saving to Google Sheet…");

    try {
      const response = await fetch(`${API_BASE_URL}/api/data`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: draftRows,
        }),
      });

      let body;

      try {
        body = await response.json();
      } catch {
        throw new Error("Server returned an invalid response");
      }

      if (!response.ok) {
        throw new Error(body.detail || "Save failed");
      }

      const savedRows = Array.isArray(body.rows) ? body.rows : draftRows;

      setRows(savedRows);
      setDraftRows(savedRows.map((row) => [...row]));
      setEditing(false);
      setStatus("Saved to Google Sheet ✓");
    } catch (error) {
      console.error("Save error:", error);
      setStatus(`Save error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = editing ? draftRows : rows;

  return (
    <main className="page">
      <section className="card">
        <div className="header">
          <div>
            <p className="eyebrow">Technical Task</p>

            <h1>Google Sheets ↔ Web Sync</h1>

            <p className="subtitle">
              React + Node.js + Python • near-real-time polling
            </p>
          </div>

          <div className="sync-badge">
            <span className="dot" />
            {status}
          </div>
        </div>

        <div className="toolbar">
          <div>
            <strong>Live table</strong>

            <span className="hint">
              Changes made directly in Google Sheets appear automatically.
            </span>
          </div>

          {!editing ? (
            <button onClick={startEditing} disabled={rows.length === 0}>
              Edit
            </button>
          ) : (
            <div className="actions">
              <button
                className="secondary"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </button>

              <button onClick={submit} disabled={saving}>
                {saving ? "Submitting…" : "Submit"}
              </button>
            </div>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>A</th>
                <th>B</th>
                <th>C</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan="3">Loading Google Sheet data…</td>
                </tr>
              ) : (
                visibleRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {[0, 1, 2].map((colIndex) => (
                      <td key={colIndex}>
                        {editing ? (
                          <input
                            value={row[colIndex] ?? ""}
                            onChange={(event) =>
                              updateCell(
                                rowIndex,
                                colIndex,
                                event.target.value
                              )
                            }
                            aria-label={`Row ${rowIndex + 1}, column ${
                              colIndex + 1
                            }`}
                          />
                        ) : (
                          row[colIndex] ?? ""
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="footer">
          <span>Polling interval: 2 seconds</span>

          <span>Google Sheet is the source of truth</span>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);