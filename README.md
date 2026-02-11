## Healthcare Doctor–Patient Translation Web App

This project is a full‑stack web application that acts as a real‑time translation bridge between a **doctor** and a **patient**. It supports text chat, browser‑based audio recording, conversation logging & search, and AI‑powered summaries focused on medically relevant details.

### Core Features Implemented

- **Two roles (Doctor & Patient)**: Toggle active role and send messages from either side.
- **Real‑time translation**: Each text message is sent with a source and target language; the backend calls an LLM to translate and returns both original and translated text.
- **Text chat interface**:
  - Clear visual distinction between doctor and patient bubbles.
  - Original vs translated text sections inside each message.
  - Mobile‑friendly, modern UI.
- **Audio recording & playback**:
  - Record audio directly in the browser using MediaRecorder.
  - Upload audio to the backend; files are stored on disk and surfaced back in the conversation as playable clips.
- **Conversation logging & persistence**:
  - SQLite database (`conversations`, `messages` tables).
  - All text + audio messages are timestamped and associated to a conversation.
  - Conversation history is loaded on page refresh.
- **Conversation search**:
  - Keyword search across **all** messages (original + translated text).
  - Results show role, conversation title, timestamp, and highlight matched fragments.
- **AI‑powered summary**:
  - On demand, generate a concise clinical‑style summary of the current conversation.
  - Structured into sections like Symptoms, History, Diagnoses, Medications, Tests, Plan & Follow‑up.

### Tech Stack

- **Frontend**: React (Create React App, TypeScript), modern responsive CSS.
- **Backend**: Node.js, Express, TypeScript, SQLite (via `better-sqlite3`), `multer` for audio upload.
- **AI / LLM**: Supports multiple providers:
  - **Groq** (free tier, recommended) - set `GROQ_API_KEY`
  - **OpenAI** - set `OPENAI_API_KEY`
  - **Demo mode** - works without any API key (shows placeholder translations)

### Local Development

#### 1. Prerequisites

- Node.js 18+ and npm

#### 2. Install dependencies

From the project root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

#### 3. Configure environment variables (LLM)

In the `backend` directory, create a `.env` file with one of these options:

**Option A: Groq (free, recommended)**
Get a free API key at https://console.groq.com/
```bash
GROQ_API_KEY=gsk_your_groq_key_here
```

**Option B: OpenAI (paid)**
```bash
OPENAI_API_KEY=sk-your_openai_key_here
```

**Option C: No key (demo mode)**
The app still runs without any API key - translations show placeholder text so you can demo the UI flow.

#### 4. Run the backend

From `backend`:

```bash
npm run dev
```

This starts the API on `http://localhost:4000` and creates `data.db` + `uploads/` automatically.

#### 5. Run the frontend

From `frontend`:

```bash
npm start
```

The React app runs on `http://localhost:3000` and talks to the backend at `http://localhost:4000` (configurable via `REACT_APP_API_BASE`).

### Key API Endpoints (Backend)

- `POST /api/conversations`  
  Create a new conversation and return its record.

- `GET /api/conversations/:id`  
  Get a conversation and its ordered messages.

- `POST /api/conversations/:id/messages`  
  Create a text message. Request body:
  - `role`: `"doctor"` or `"patient"`
  - `text`: original text
  - `sourceLanguage`, `targetLanguage`: human‑readable language names

- `POST /api/conversations/:id/audio`  
  Multipart form upload of an audio clip, plus optional text.
  - `audio`: file (`audio/webm`)
  - `role`, `sourceLanguage`, `targetLanguage`, optional `text`

- `GET /api/search?q=...`  
  Search across text and translated text of all messages.

- `GET /api/conversations/:id/summary`  
  Generate and return an AI‑powered summary for a conversation.

### How It Works (High Level)

- The frontend creates a new conversation on initial load and keeps its `id`.
- For each message:
  - Frontend sends `role`, `text`, and language pair to the backend.
  - Backend calls the LLM to translate and stores both `text` and `translated_text` in SQLite.
  - The saved message (with timestamp, role, optional `audio_path`) is returned and rendered in the chat.
- Audio messages:
  - The browser records audio → sends it as a `FormData` upload.
  - Backend saves the file under `uploads/` and stores a relative path in the `messages` row.
  - The frontend uses that path as the `src` for an `<audio>` element in the conversation.
- For summaries:
  - Backend fetches all messages in the conversation.
  - It prompts the LLM to produce a structured clinical summary.

### Deployment Notes

- **Backend**: Can be deployed on Render / Railway / Fly.io / similar:
  - Ensure `OPENAI_API_KEY` is set in environment variables.
  - Make sure a writable directory exists for `data.db` and `uploads/`.
- **Frontend**: Can be deployed on Netlify / Vercel / GitHub Pages:
  - Build with `npm run build` inside `frontend`.
  - Configure `REACT_APP_API_BASE` at build time to point to the deployed backend URL.

For a quick demo under time constraints, you can:

- Deploy backend to Render (Node web service).
- Deploy frontend to Vercel and set `REACT_APP_API_BASE` to the Render URL.

### Known Limitations / Future Improvements

- **Authentication**: No user accounts; sessions are anonymous and single‑conversation for now.
- **Multiple conversations UI**: Backend supports multiple conversations, but the frontend currently creates one per page load rather than offering a list / switcher.
- **Error handling**: Basic toast/alert style; could be improved with more granular UX and retry logic.
- **Audio transcription**: Audio is stored and playable, but not automatically transcribed; text must be entered manually for translation.
- **LLM provider**: Currently assumes OpenAI‑compatible API; a more abstract provider layer would make swapping models/providers trivial.

Despite these constraints, all core assignment requirements are covered with a clean, end‑to‑end working flow.


