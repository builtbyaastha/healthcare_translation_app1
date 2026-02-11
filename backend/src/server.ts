import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 4000;

// --- DB SETUP ---
const db = new Database(path.join(__dirname, "..", "data.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    role TEXT,
    source_language TEXT,
    target_language TEXT,
    text TEXT,
    translated_text TEXT,
    audio_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
  );
`);

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname || ".webm"));
  },
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadsDir));

// --- TYPES ---
type Role = "doctor" | "patient";

// --- AI HELPERS ---
// Supports: GROQ_API_KEY (free tier), OPENAI_API_KEY, or fallback demo mode
async function callLLM(prompt: string): Promise<string> {
  // Try Groq first (free tier), then OpenAI, then fallback
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (groqKey) {
    return callGroq(prompt, groqKey);
  } else if (openaiKey) {
    return callOpenAI(prompt, openaiKey);
  } else {
    // Fallback: return a mock translation for demo purposes
    return `[Demo mode - no API key] Original: "${prompt.slice(0, 100)}..."`;
  }
}

async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const body = {
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Groq API error:", res.status, text);
    return `[Translation failed] ${prompt.slice(0, 80)}`;
  }

  const json: any = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("OpenAI API error:", res.status, text);
    return `[Translation failed] ${prompt.slice(0, 80)}`;
  }

  const json: any = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!text.trim()) return "";
  if (sourceLang === targetLang) return text;

  const prompt = `You are a medical translation assistant.\n` +
    `Translate the following text from ${sourceLang} to ${targetLang}.\n` +
    `Only return the translated text, without quotes.\n\n` +
    `Text: """${text}"""`;

  return callLLM(prompt);
}

async function summarizeConversation(
  messages: { role: string; text: string; translated_text: string }[]
): Promise<string> {
  const conversationText = messages
    .map(
      (m) =>
        `${m.role.toUpperCase()} original: ${m.text}\n${m.role.toUpperCase()} translated: ${m.translated_text}`
    )
    .join("\n\n");

  const prompt =
    `You are a clinical assistant. Summarize the following doctor–patient conversation.\n` +
    `Highlight these sections clearly with headings: Symptoms, History, Findings/Diagnoses, Medications, Tests/Results, Plan & Follow‑up.\n` +
    `Use concise bullet points.\n\n` +
    conversationText;

  return callLLM(prompt);
}

// --- ROUTES ---

// Create or fetch a conversation
app.post("/api/conversations", (req: Request, res: Response) => {
  const { title } = req.body || {};
  const stmt = db.prepare(
    "INSERT INTO conversations (title) VALUES (?)"
  );
  const info = stmt.run(title || "Doctor–Patient Session");
  const conversation = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(info.lastInsertRowid as number);
  res.json(conversation);
});

app.get("/api/conversations", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      "SELECT id, title, created_at FROM conversations ORDER BY created_at DESC"
    )
    .all();
  res.json(rows);
});

app.get("/api/conversations/:id", (req: Request, res: Response) => {
  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(req.params.id);
  if (!convo) return res.status(404).json({ error: "Not found" });
  const messages = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
    .all(req.params.id);
  res.json({ conversation: convo, messages });
});

// Add a text message with translation
app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const conversationId = Number(req.params.id);
    const { role, text, sourceLanguage, targetLanguage } = req.body as {
      role: Role;
      text: string;
      sourceLanguage: string;
      targetLanguage: string;
    };

    const translated = await translateText(text, sourceLanguage, targetLanguage);

    const stmt = db.prepare(
      `INSERT INTO messages 
        (conversation_id, role, source_language, target_language, text, translated_text)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      conversationId,
      role,
      sourceLanguage,
      targetLanguage,
      text,
      translated
    );

    const message = db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(info.lastInsertRowid as number);

    res.json(message);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to add message" });
  }
});

// Upload an audio message (optionally with text and translation)
app.post(
  "/api/conversations/:id/audio",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const conversationId = Number(req.params.id);
      const { role, text, sourceLanguage, targetLanguage } = req.body as any;
      const file = (req as any).file as Express.Multer.File | undefined;

      const audioPath = file ? `/uploads/${file.filename}` : null;

      let translated = "";
      if (text) {
        translated = await translateText(text, sourceLanguage, targetLanguage);
      }

      const stmt = db.prepare(
        `INSERT INTO messages 
          (conversation_id, role, source_language, target_language, text, translated_text, audio_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(
        conversationId,
        role,
        sourceLanguage,
        targetLanguage,
        text || "",
        translated,
        audioPath
      );

      const message = db
        .prepare("SELECT * FROM messages WHERE id = ?")
        .get(info.lastInsertRowid as number);

      res.json(message);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to upload audio" });
    }
  }
);

// Search within all conversations
app.get("/api/search", (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT m.*, c.title 
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.text LIKE ? OR m.translated_text LIKE ?
       ORDER BY m.created_at DESC
       LIMIT 100`
    )
    .all(like, like);

  res.json(rows);
});

// Summary endpoint
app.get("/api/conversations/:id/summary", async (req: Request, res: Response) => {
  try {
    const messages = db
      .prepare(
        "SELECT role, text, translated_text FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(req.params.id) as any[];

    if (!messages.length) {
      return res.json({ summary: "No messages yet." });
    }

    const summary = await summarizeConversation(messages);
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});


