import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "tutorial_data.json");
const ANALYSIS_HISTORY_FILE = path.join(process.cwd(), "analysis_history.json");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/tutorial", (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  });

  app.post("/api/tutorial", (req, res) => {
    const data = req.body;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  });

  app.get("/api/analysis-history", (req, res) => {
    if (fs.existsSync(ANALYSIS_HISTORY_FILE)) {
      const data = fs.readFileSync(ANALYSIS_HISTORY_FILE, "utf-8");
      res.json(JSON.parse(data));
    } else {
      res.json({ history: [] });
    }
  });

  app.post("/api/analysis-history", (req, res) => {
    const data = req.body;
    fs.writeFileSync(ANALYSIS_HISTORY_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
