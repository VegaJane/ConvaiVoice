// server.js — Render service for SL + Discord (keeps SL working, adds /discordSay)

import express from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Public dir and output file (SL expects MP3 path; we keep that)
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
const OUTPUT_MP3 = path.join(PUBLIC_DIR, "output.mp3");

// Health
app.get("/health", (_req, res) => res.status(200).send("ok"));

// Static (serves /output.mp3 if it exists)
app.use(express.static(PUBLIC_DIR));

/* -------------------------------
   KEEP YOUR EXISTING SL ENDPOINT
   -------------------------------
   POST /updateText
   Accepts:
     A) { base64: "<audio_base64>" }  -> saves output.mp3 (this is what your SL HUD uses)
     B) { text: "hello" }             -> optional helper; will try Convai then save output.mp3
*/
app.post("/updateText", async (req, res) => {
  try {
    let { text, base64 } = req.body || {};
    let convaiText = null;

    if (!text && !base64) {
      return res.status(400).json({ error: "Missing 'text' or 'base64'." });
    }

    // If SL sends the audio directly, just save it
    if (base64) {
      fs.writeFileSync(OUTPUT_MP3, Buffer.from(base64, "base64"));
      return res.json({ success: true, text: null, url: "/output.mp3" });
    }

    // If text is provided, try Convai (kept for compatibility)
    const apiKey = process.env.CONVAI_API_KEY;
    const charId = process.env.CONVAI_CHAR_ID || process.env.CHARACTER_ID;
    if (!apiKey || !charId) {
      return res.status(500).json({ error: "Missing CONVAI_API_KEY or CONVAI_CHAR_ID/CHARACTER_ID." });
    }

    // JSON first
    let audioBase64 = null;
    try {
      const r = await axios.post(
        "https://api.convai.com/character/getResponse",
        { userText: text, charID: charId, sessionID: "-1", voiceResponse: true },
        { headers: { "CONVAI-API-KEY": apiKey, "Content-Type": "application/json" }, timeout: 45000 }
      );
      convaiText = r?.data?.response ?? null;
      audioBase64 = r?.data?.audio_base64 || r?.data?.audio || null;
    } catch (e) {
      // (Optional) You could add a multipart fallback here if needed
    }

    if (!audioBase64) {
      return res.status(502).json({ error: "Convai returned no audio." });
    }

    fs.writeFileSync(OUTPUT_MP3, Buffer.from(audioBase64, "base64"));
    return res.json({ success: true, text: convaiText, url: "/output.mp3" });
  } catch (err) {
    console.error("updateText error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: err?.response?.data || err.message || "unknown error" });
  }
});

/* -----------------------------------------
   NEW: Discord-only endpoint (safe & additive)
   -----------------------------------------
   POST /discordSay
   Body: { text: "hello" }
   Calls Convai itself and writes public/output.mp3.
   Does NOT change SL behavior.
*/
app.post("/discordSay", async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing 'text'." });

    const apiKey = process.env.CONVAI_API_KEY;
    const charId = process.env.CONVAI_CHAR_ID || process.env.CHARACTER_ID;
    if (!apiKey || !charId) {
      return res.status(500).json({ error: "Missing CONVAI_API_KEY or CONVAI_CHAR_ID/CHARACTER_ID." });
    }

    let convaiText = null;
    let audioBase64 = null;

    // JSON request to Convai
    const r = await axios.post(
      "https://api.convai.com/character/getResponse",
      { userText: text, charID: charId, sessionID: "-1", voiceResponse: true },
      { headers: { "CONVAI-API-KEY": apiKey, "Content-Type": "application/json" }, timeout: 45000 }
    );
    convaiText = r?.data?.response ?? null;
    audioBase64 = r?.data?.audio_base64 || r?.data?.audio || null;

    if (!audioBase64) {
      return res.status(502).json({ error: "Convai returned no audio." });
    }

    fs.writeFileSync(OUTPUT_MP3, Buffer.from(audioBase64, "base64"));
    return res.json({ success: true, text: convaiText, url: "/output.mp3" });
  } catch (err) {
    console.error("discordSay error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: err?.response?.data || err.message || "unknown error" });
  }
});

// Optional aliases so your bot can GET either path
app.get("/output.wav", (req, res) => {
  if (!fs.existsSync(OUTPUT_MP3)) return res.status(404).send("Audio not ready yet.");
  res.sendFile(OUTPUT_MP3);
});
app.get("/output", (req, res) => {
  if (!fs.existsSync(OUTPUT_MP3)) return res.status(404).send("Audio not ready yet.");
  res.sendFile(OUTPUT_MP3);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Convai server listening on port ${PORT}`);
  console.log("Public dir:", PUBLIC_DIR);
  console.log("Output file:", OUTPUT_MP3);
});
