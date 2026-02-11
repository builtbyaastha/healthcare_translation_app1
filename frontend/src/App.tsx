import React, { useEffect, useRef, useState } from "react";
import "./App.css";

type Role = "doctor" | "patient";

type Message = {
  id: number;
  role: Role;
  text: string;
  translated_text: string;
  audio_path?: string | null;
  created_at: string;
};

type Conversation = {
  id: number;
  title: string;
  created_at: string;
};

const API_BASE =
  process.env.REACT_APP_API_BASE || "http://localhost:4000";

const languages = [
  "English",
  "Spanish",
  "French",
  "Hindi",
  "Mandarin",
  "Arabic",
];

function App() {
  const [currentRole, setCurrentRole] = useState<Role>("doctor");
  const [doctorLanguage, setDoctorLanguage] = useState("English");
  const [patientLanguage, setPatientLanguage] = useState("Spanish");

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summary, setSummary] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // audio recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // create a new conversation on first load
    const createConversation = async () => {
      const res = await fetch(`${API_BASE}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Doctor–Patient Session" }),
      });
      const data = await res.json();
      setConversation(data);
    };
    createConversation().catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendText = async () => {
    if (!conversation || !input.trim()) return;
    setLoadingMessage(true);
    try {
      const sourceLanguage =
        currentRole === "doctor" ? doctorLanguage : patientLanguage;
      const targetLanguage =
        currentRole === "doctor" ? patientLanguage : doctorLanguage;

      const res = await fetch(
        `${API_BASE}/api/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: currentRole,
            text: input,
            sourceLanguage,
            targetLanguage,
          }),
        }
      );
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setInput("");
    } catch (e) {
      console.error(e);
      alert("Failed to send message");
    } finally {
      setLoadingMessage(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        await uploadAudio(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      alert("Could not access microphone");
    }
  };

  const uploadAudio = async (blob: Blob) => {
    if (!conversation) return;
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("role", currentRole);
    const sourceLanguage =
      currentRole === "doctor" ? doctorLanguage : patientLanguage;
    const targetLanguage =
      currentRole === "doctor" ? patientLanguage : doctorLanguage;
    form.append("sourceLanguage", sourceLanguage);
    form.append("targetLanguage", targetLanguage);
    // optional text transcription could be added later

    try {
      const res = await fetch(
        `${API_BASE}/api/conversations/${conversation.id}/audio`,
        {
          method: "POST",
          body: form,
        }
      );
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      console.error(e);
      alert("Failed to upload audio");
    }
  };

  const handleSummary = async () => {
    if (!conversation) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/conversations/${conversation.id}/summary`
      );
      const data = await res.json();
      setSummary(data.summary);
    } catch (e) {
      console.error(e);
      alert("Failed to generate summary");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/search?q=` + encodeURIComponent(q)
      );
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error(e);
      alert("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q) return text;
    const regex = new RegExp(`(${q})`, "ig");
    const parts = text.split(regex);
    return (
      <>
        {parts.map((p, i) =>
          regex.test(p) ? (
            <mark key={i}>{p}</mark>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </>
    );
  };

  const currentSourceLang =
    currentRole === "doctor" ? doctorLanguage : patientLanguage;
  const currentTargetLang =
    currentRole === "doctor" ? patientLanguage : doctorLanguage;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Healthcare Translation Bridge</h1>
          <p>Real-time doctor–patient translation with audio and summaries.</p>
        </div>
        <div className="role-toggle">
          <button
            className={
              currentRole === "doctor" ? "role-btn active" : "role-btn"
            }
            onClick={() => setCurrentRole("doctor")}
          >
            Doctor
          </button>
          <button
            className={
              currentRole === "patient" ? "role-btn active" : "role-btn"
            }
            onClick={() => setCurrentRole("patient")}
          >
            Patient
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="left-panel">
          <div className="card">
            <h2>Languages</h2>
            <div className="lang-row">
              <span>Doctor speaks</span>
              <select
                value={doctorLanguage}
                onChange={(e) => setDoctorLanguage(e.target.value)}
              >
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="lang-row">
              <span>Patient speaks</span>
              <select
                value={patientLanguage}
                onChange={(e) => setPatientLanguage(e.target.value)}
              >
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint">
              Active role: <strong>{currentRole}</strong> (
              {currentSourceLang} → {currentTargetLang})
            </p>
          </div>

          <div className="card">
            <h2>Conversation Search</h2>
            <div className="search-row">
              <input
                type="text"
                placeholder="Search across all conversations…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={handleSearch} disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            <div className="search-results">
              {searchResults.map((r) => (
                <div key={r.id} className="search-item">
                  <div className="search-meta">
                    <span className="badge">{r.role}</span>
                    <span>{r.title}</span>
                    <span className="timestamp">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="search-text">
                    <div>
                      {highlightMatch(r.text || "", searchQuery)}
                    </div>
                    <div className="search-translation">
                      {highlightMatch(
                        r.translated_text || "",
                        searchQuery
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!searchResults.length && searchQuery && !searching && (
                <p className="empty">No matches found.</p>
              )}
            </div>
          </div>
        </section>

        <section className="chat-panel">
          <div className="card chat-card">
            <div className="chat-header-row">
              <h2>Live Conversation</h2>
              <button onClick={handleSummary} disabled={loadingSummary}>
                {loadingSummary ? "Summarizing…" : "AI Summary"}
              </button>
            </div>
            <div className="chat-window">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    "chat-message " +
                    (m.role === "doctor" ? "doctor" : "patient")
                  }
                >
                  <div className="chat-meta">
                    <span className="badge">
                      {m.role === "doctor" ? "Doctor" : "Patient"}
                    </span>
                    <span className="timestamp">
                      {new Date(m.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {m.text && (
                    <div className="chat-text original">
                      <label>Original</label>
                      <p>{m.text}</p>
                    </div>
                  )}
                  {m.translated_text && (
                    <div className="chat-text translated">
                      <label>Translated</label>
                      <p>{m.translated_text}</p>
                    </div>
                  )}
                  {m.audio_path && (
                    <div className="chat-audio">
                      <audio
                        controls
                        src={`${API_BASE}${m.audio_path}`}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="input-area">
              <textarea
                placeholder={`Type as the ${currentRole}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
              />
              <div className="input-actions">
                <button
                  onClick={toggleRecording}
                  className={recording ? "record-btn recording" : "record-btn"}
                >
                  {recording ? "Stop Recording" : "Record Audio"}
                </button>
                <button
                  onClick={handleSendText}
                  disabled={loadingMessage || !input.trim()}
                >
                  {loadingMessage ? "Sending…" : "Send & Translate"}
                </button>
              </div>
            </div>
          </div>

          {summary && (
            <div className="card summary-card">
              <h2>AI Conversation Summary</h2>
              <pre>{summary}</pre>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
