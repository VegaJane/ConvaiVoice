import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import axios from "axios";

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

// Ensure public directory exists
const PUBLIC_DIR = path.join(process.cwd(), "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Where we store the most recent audio
const AUDIO_FILE = path.join(PUBLIC_DIR, "output.mp3");

// Health check
app.get("/health", (_req, res) => res.send("ok"));

/**
 * POST /updateText
 * Body: { text: "string" }
 * -> Calls Convai getResponse with voiceResponse=true
 * -> Saves audio_base64 as /public/output.mp3
 * Response: { success: true, text: "<convai_text>", url: "/output.mp3" }
 *
 * Also supports Body: { base64: "<audio_base64>" } to directly save audio.
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

      // Call Convai to generate voice from text
      const apiKey = process.env.CONVAI_API_KEY;
      const charId = process.env.CHARACTER_ID;
      if (!apiKey || !charId) {
        return res.status(500).json({ error: "Server misconfigured: missing CONVAI_API_KEY or CHARACTER_ID." });
      }

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
          timeout: 30000
        }
      );

      convaiText = resp?.data?.response || null;
      audioBase64 = resp?.data?.audio_base64 || null;

      if (!audioBase64) {
        return res.status(502).json({ error: "Convai returned no audio_base64." });
      }
    }

    // Save audio
    const buf = Buffer.from(audioBase64, "base64");
    fs.writeFileSync(AUDIO_FILE, buf);

    return res.json({
      success: true,
      text: convaiText,
      url: "/output.mp3"
    });
  } catch (err) {
    console.error("updateText error:", err?.response?.data || err.message);
    return res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// Serve static files (including /output.mp3)
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Convai MP3 server running on port ${PORT}`);
});
