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
  const maxAttempts = 3;
  const retryDelays = [1000, 2000, 4000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();

    // Prevent a request from hanging forever
    const timeout = setTimeout(() => {
      controller.abort();
    }, 20000);

    try {
      const response = await fetch(`${PYTHON_SERVICE_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });

      clearTimeout(timeout);

      const text = await response.text();

      let body;

      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { detail: text };
      }

      if (response.ok) {
        return body;
      }

      const error = new Error(
        body.detail ||
          body.error ||
          `Python service returned status ${response.status}`
      );

      error.status = response.status;

      // Temporary errors can happen when the free Render service
      // is waking up or restarting. Retry these automatically.
      if (
        [502, 503, 504, 429].includes(response.status) &&
        attempt < maxAttempts
      ) {
        console.log(
          `Python service returned ${response.status}. ` +
            `Retrying (${attempt + 1}/${maxAttempts})...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, retryDelays[attempt - 1])
        );

        continue;
      }

      throw error;
    } catch (error) {
      clearTimeout(timeout);

      // Retry network errors and timeout errors
      if (attempt < maxAttempts) {
        console.log(
          `Python service request failed: ${error.message}. ` +
            `Retrying (${attempt + 1}/${maxAttempts})...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, retryDelays[attempt - 1])
        );

        continue;
      }

      throw error;
    }
  }
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