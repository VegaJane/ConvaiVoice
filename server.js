import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

// Ensure public directory exists
const PUBLIC_DIR = path.join(process.cwd(), "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const AUDIO_FILE = path.join(PUBLIC_DIR, "output.wav");

// Health check
app.get("/health", (_req, res) => res.send("ok"));

/**
 * POST /updateText
 * Body options:
 *   A) { text: "hello" }  -> server calls Convai with voiceResponse=true and saves output.wav
 *   B) { base64: "<audio_base64>" } -> directly saves output.wav
 *
 * Response: { success: true, text: "<convai_text_or_null>", url: "/output.wav" }
 */
app.post("/updateText", async (req, res) => {
  try {
    const { text, base64 } = req.body || {};

    let convaiText = null;
    let audioBase64 = base64 || null;

    if (!audioBase64) {
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Missing 'text' or 'base64' in body." });
      }

      const apiKey = process.env.CONVAI_API_KEY;
      const charId = process.env.CHARACTER_ID;
      if (!apiKey || !charId) {
        return res.status(500).json({ error: "Server misconfigured: missing CONVAI_API_KEY or CHARACTER_ID." });
      }

      // First try JSON body
      try {
        const resp = await axios.post(
          "https://api.convai.com/character/getResponse",
          {
            userText: text,
            charID: charId,
            sessionID: "-1",
            voiceResponse: true
          },
          {
            headers: {
              "CONVAI-API-KEY": apiKey,
              "Content-Type": "application/json"
            },
            timeout: 45000
          }
        );
        convaiText = resp?.data?.response ?? null;
        audioBase64 = resp?.data?.audio_base64 || resp?.data?.audio || null;
      } catch (jsonErr) {
        // Retry with multipart/form-data
        const fd = new FormData();
        fd.append("userText", text);
        fd.append("charID", charId);
        fd.append("sessionID", "-1");
        fd.append("voiceResponse", "true");

        const resp2 = await axios.post(
          "https://api.convai.com/character/getResponse",
          fd,
          {
            headers: {
              ...fd.getHeaders(),
              "CONVAI-API-KEY": apiKey
            },
            timeout: 45000
          }
        );
        convaiText = resp2?.data?.response ?? null;
        audioBase64 = resp2?.data?.audio_base64 || resp2?.data?.audio || null;
      }

      if (!audioBase64) {
        return res.status(502).json({ error: "Convai returned no audio in response." });
      }
    }

    // Save as WAV
    const buf = Buffer.from(audioBase64, "base64");
    fs.writeFileSync(AUDIO_FILE, buf);

    return res.json({
      success: true,
      text: convaiText,
      url: "/output.wav"
    });
  } catch (err) {
    console.error("updateText error:", err?.response?.data || err.message);
    return res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// Serve static files (including /output.wav)
app.use(express.static("public"));

// If the file isn't there yet, show a friendly message rather than a generic 404
app.get("/output.wav", (req, res, next) => {
  if (!fs.existsSync(AUDIO_FILE)) {
    return res.status(404).send("No audio saved yet. POST text or base64 to /updateText first.");
  }
  return res.sendFile(AUDIO_FILE);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Convai WAV server running on port ${PORT}`);
});
