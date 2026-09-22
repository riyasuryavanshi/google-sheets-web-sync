import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json());

async function pythonRequest(path, options = {}) {
  const response = await fetch(`${PYTHON_SERVICE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }

  if (!response.ok) {
    const error = new Error(body.detail || "Python service error");
    error.status = response.status;
    throw error;
  }

  return body;
}

app.get("/api/health", async (req, res) => {
  try {
    const python = await pythonRequest("/health");
    res.json({
      status: "ok",
      service: "node-api",
      python,
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      service: "node-api",
      detail: error.message,
    });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const data = await pythonRequest("/data");
    res.json(data);
  } catch (error) {
    res.status(error.status || 502).json({
      detail: error.message,
    });
  }
});

app.put("/api/data", async (req, res) => {
  try {
    const rows = req.body?.rows;

    if (!Array.isArray(rows) || rows.length < 1) {
      return res.status(400).json({
        detail: "rows must be a non-empty array.",
      });
    }

    if (rows.some((row) => !Array.isArray(row) || row.length !== 3)) {
      return res.status(400).json({
        detail: "Every row must contain exactly 3 columns: A, B and C.",
      });
    }

    const data = await pythonRequest("/data", {
      method: "PUT",
      body: JSON.stringify({ rows }),
    });

    res.json(data);
  } catch (error) {
    res.status(error.status || 502).json({
      detail: error.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Node API running on port ${PORT}`);
});
