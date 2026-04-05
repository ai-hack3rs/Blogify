import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes can go here
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/subscribe", async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const API_KEY = process.env.MAILCHIMP_API_KEY;
    const LIST_ID = process.env.MAILCHIMP_LIST_ID;
    const SERVER_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX;

    if (!API_KEY || !LIST_ID || !SERVER_PREFIX) {
      // In development, simulate success if keys are missing
      console.warn("Mailchimp credentials missing. Simulating success.");
      return res.status(200).json({ message: "Simulated subscription success" });
    }

    try {
      const response = await fetch(
        `https://${SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
          },
          body: JSON.stringify({
            email_address: email,
            status: "subscribed",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.title === "Member Exists") {
          return res.status(400).json({ error: "You are already subscribed!" });
        }
        throw new Error(data.detail || "Failed to subscribe");
      }

      res.status(200).json({ message: "Successfully subscribed!" });
    } catch (error: any) {
      console.error("Newsletter subscription error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
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
