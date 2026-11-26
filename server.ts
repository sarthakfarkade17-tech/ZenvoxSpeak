import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

function getAiClient(apiVersion?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function describeVoiceDelivery(voiceTone = "friendly", voicePace = "normal") {
  const toneMap: Record<string, string> = {
    friendly: "warm, approachable, encouraging, and conversational",
    formal: "polished, professional, courteous, and articulate",
    calm: "gentle, unhurried, patient, and reassuring",
    energetic: "upbeat, lively, enthusiastic, and expressive",
  };
  const paceMap: Record<string, string> = {
    slow: "Speak at a deliberate, slower pace with crisp word boundaries and clear pauses.",
    normal: "Speak at a natural, comfortable everyday pace.",
    fast: "Speak at a brisk, fluent, lively native conversational pace.",
  };
  const toneDesc = toneMap[voiceTone] ?? toneMap.friendly;
  const paceDesc = paceMap[voicePace] ?? paceMap.normal;
  return `Delivery tone: ${toneDesc}. ${paceDesc}`;
}

function buildTutorInstruction(
  scenario: string,
  level: string,
  personaName = "Maya",
  personaRole = "Warm Everyday Coach",
  personaVibe = "Friendly, empathetic & clear",
  voiceTone = "friendly",
  voicePace = "normal"
) {
  return [
    `You are ${personaName} (${personaRole}), a persona inside ZenvoxSpeak — a welcoming English conversation partner focused exclusively on fluent, standard, healthy two-way communication.`,
    `Personality & voice style: ${personaVibe}. ${describeVoiceDelivery(voiceTone, voicePace)}`,
    `Current learner CEFR level: ${level}.`,
    `Current conversation topic: ${scenario}.`,
    `Communication Rules:`,
    `1. Speak naturally in clear, standard English matching the requested delivery tone and pace. Keep replies conversational (2 to 3 concise sentences) and always end with an engaging, open-ended follow-up question so the two-way conversation flows smoothly.`,
    `2. Maintain healthy, fine, respectful, and uplifting communication at all times. If the user brings up any topic—daily life, work, travel, philosophy, health, hobbies, or complex ideas—explore it constructively with empathy, curiosity, and balanced perspective.`,
    `3. Gently coach the learner: if they make a noticeable grammar or phrasing mistake, warmly model the natural standard phrasing without sounding critical.`,
    `4. Stay strictly in English conversation coaching, fluency, natural idioms, tone, and clarity.`,
  ].join("\n");
}

function humanizeGeminiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("503") || raw.includes("UNAVAILABLE") || raw.includes("high demand")) {
    return "The AI coach is briefly busy right now. Please try again in a moment.";
  }
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
    return "Rate limit reached for now. Please wait a few seconds and try again.";
  }
  if (raw.includes("API_KEY_INVALID") || raw.includes("PERMISSION_DENIED")) {
    return "Please check your Gemini API key in Settings > Secrets.";
  }
  if (raw.includes("NOT_FOUND") || raw.includes("404")) {
    return `Speech/AI model unavailable (404): ${raw.slice(0, 140)}`;
  }
  if (raw.includes("INVALID_ARGUMENT") || raw.includes("400")) {
    return `AI request parameter rejected (400): ${raw.slice(0, 140)}`;
  }
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
) {
  const modelsToTry = [params.model, ...(params.model === "gemini-4-hydrogen" ? ["gemini-3.1-flash-lite"] : [])];
  let lastError: unknown;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const nextConfig =
          model === "gemini-3.1-flash-lite" && params.config && "thinkingConfig" in params.config
            ? { ...params.config, thinkingConfig: undefined }
            : params.config;
        return await ai.models.generateContent({ ...params, model, config: nextConfig });
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("429");
        if (!transient) throw err;
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "ZenvoxSpeak", hasKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Two-way text or recorded-audio conversational turn with persona & healthy tone coaching
  app.post("/api/tutor/turn", async (req, res) => {
    try {
      const {
        scenario = "Everyday Small Talk",
        level = "B1",
        personaName = "Maya",
        personaRole = "Warm Everyday Coach",
        personaVibe = "Friendly, empathetic & clear",
        voiceTone = "friendly",
        voicePace = "normal",
        history = [],
        userText = "",
        audioBase64,
        audioMimeType = "audio/webm",
      } = req.body ?? {};

      const ai = getAiClient();
      let transcript = typeof userText === "string" ? userText.trim() : "";

      if (audioBase64 && typeof audioBase64 === "string") {
        const transcribeRes = await generateWithRetry(ai, {
          model: "gemini-3.5-transcribe",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: audioMimeType,
                  data: audioBase64,
                },
              },
              { text: "Transcribe this spoken English sentence accurately. Return only the spoken words." },
            ],
          },
        });
        transcript = (transcribeRes.text ?? "").trim() || transcript;
      }

      if (!transcript) {
        res.status(400).json({ error: "No speech or text message was provided." });
        return;
      }

      const formattedHistory = Array.isArray(history)
        ? history
            .slice(-8)
            .map((m: { role?: string; text?: string }) => `${m.role === "tutor" ? personaName : "Learner"}: ${m.text ?? ""}`)
            .join("\n")
        : "";

      const prompt = [
        formattedHistory ? `Recent conversation:\n${formattedHistory}` : "",
        `Learner's latest message: "${transcript}"`,
        `Reply naturally in character as ${personaName} on the topic "${scenario}" (CEFR ${level}), keeping communication healthy, respectful, and engaging. Also evaluate the learner's English phrasing.`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await generateWithRetry(ai, {
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: buildTutorInstruction(
            scenario,
            level,
            personaName,
            personaRole,
            personaVibe,
            voiceTone,
            voicePace
          ),
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: "Natural 2-3 sentence spoken conversational response ending with an engaging follow-up question.",
              },
              correctedSentence: {
                type: Type.STRING,
                description: "A smoother, natural standard English rewrite of the learner's message, or empty string if already natural.",
              },
              feedbackTip: {
                type: Type.STRING,
                description: "One concise, encouraging coaching tip focusing on grammar, phrasing, or healthy conversational tone.",
              },
              toneNote: {
                type: Type.STRING,
                description: "Short 2-4 word label describing the conversational tone (e.g., 'Warm & natural', 'Polite & clear').",
              },
              naturalnessScore: {
                type: Type.INTEGER,
                description: "Conversational naturalness score from 60 to 100.",
              },
            },
            required: ["reply", "correctedSentence", "feedbackTip", "toneNote", "naturalnessScore"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({
        transcript,
        reply: parsed.reply ?? "That sounds wonderful! What part of that stood out to you the most?",
        correctedSentence: parsed.correctedSentence ?? "",
        feedbackTip: parsed.feedbackTip ?? "Clear, friendly, and easy to follow.",
        toneNote: parsed.toneNote ?? "Warm & clear",
        naturalnessScore: typeof parsed.naturalnessScore === "number" ? parsed.naturalnessScore : 88,
      });
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : "Failed to generate tutor response.";
      console.error("/api/tutor/turn error:", rawMsg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Infinite topic studio generator — creates a fresh healthy conversation topic & starter
  app.post("/api/tutor/topic", async (req, res) => {
    try {
      const {
        topicHint = "",
        domain = "Daily Life & Hobbies",
        themeTitle = "",
        themeContext = "",
        level = "B1",
        personaName = "Maya",
        personaRole = "Warm Everyday Coach",
        personaField = "Everyday & Social",
        personaSpecialty = "Natural everyday conversation",
        voiceTone = "friendly",
        voicePace = "normal",
      } = req.body ?? {};

      const ai = getAiClient();
      const requestLine = themeTitle.trim()
        ? `Seed an English speaking conversation starter specifically for the selected theme "${themeTitle.trim()}"${topicHint.trim() && topicHint.trim() !== themeTitle.trim() ? ` with focus "${topicHint.trim()}"` : ""}. Context: ${themeContext.trim() || domain}.`
        : topicHint.trim()
        ? `Create an English speaking conversation scenario based on the user's exact topic: "${topicHint.trim()}".`
        : `Invent a fresh, uplifting, realistic spoken English conversation scenario inside the theme "${domain}". Make it enjoyable to discuss in a healthy, constructive two-way voice call.`;

      const response = await generateWithRetry(ai, {
        model: "gemini-4-hydrogen",
        contents: `${requestLine} Target CEFR level: ${level}. The AI voice partner is ${personaName} (${personaRole}, field: ${personaField}, specialty: ${personaSpecialty}). ${describeVoiceDelivery(voiceTone, voicePace)} Keep the starterPrompt natural to speak aloud, respectful, and ending with an inviting open-ended question.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short 2-5 word topic title" },
              subtitle: { type: Type.STRING, description: "One crisp sentence describing the focus" },
              starterPrompt: { type: Type.STRING, description: "Warm 2-sentence opening line spoken by the AI persona, ending with a question" },
              keyPhrases: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 natural standard English phrases useful for this topic",
              },
              communicationGoal: {
                type: Type.STRING,
                description: "Short healthy communication goal (e.g., 'Practice active listening and polite opinions')",
              },
            },
            required: ["title", "subtitle", "starterPrompt", "keyPhrases", "communicationGoal"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({
        scenario: {
          id: `inf_${Date.now()}`,
          title: parsed.title || topicHint.trim() || domain,
          subtitle: parsed.subtitle || "Open-ended healthy English conversation practice.",
          level,
          starterPrompt: parsed.starterPrompt || `Hi! I'd love to chat with you about ${topicHint.trim() || domain}. What's your take on it?`,
          keyPhrases: Array.isArray(parsed.keyPhrases) && parsed.keyPhrases.length > 0
            ? parsed.keyPhrases.slice(0, 3)
            : ["From my perspective", "That makes sense", "I appreciate that"],
          communicationGoal: parsed.communicationGoal || "Keep a warm, thoughtful two-way exchange.",
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not create topic.";
      console.error("/api/tutor/topic error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Polish a learner's draft reply into healthy, polite, natural standard English
  app.post("/api/tutor/polish", async (req, res) => {
    try {
      const { draft = "", scenario = "Everyday Conversation", level = "B1" } = req.body ?? {};
      if (!draft || typeof draft !== "string" || !draft.trim()) {
        res.status(400).json({ error: "Enter a short draft sentence first." });
        return;
      }

      const ai = getAiClient();
      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: `Topic: "${scenario}" (CEFR ${level}). Learner draft: "${draft.trim()}". Provide 2 healthy, natural standard English rewrites (one Warm & Casual, one Polite & Clear) plus a 1-sentence reason why they sound great.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              casual: { type: Type.STRING },
              polite: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ["casual", "polite", "reason"],
          },
        },
      });

      res.json(JSON.parse((response.text ?? "{}").trim()));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not polish phrasing.";
      console.error("/api/tutor/polish error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Summarize a live or text conversation into strengths & takeaways
  app.post("/api/tutor/recap", async (req, res) => {
    try {
      const { scenario = "Conversation", level = "B1", history = [] } = req.body ?? {};
      const ai = getAiClient();
      const formatted = Array.isArray(history)
        ? history.slice(-12).map((m: { role?: string; text?: string }) => `${m.role}: ${m.text ?? ""}`).join("\n")
        : "";

      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: `Review this CEFR ${level} English conversation on "${scenario}":\n${formatted}\nGive an encouraging recap: one key strength, 2 natural expressions to keep using, and one next focus step.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              strength: { type: Type.STRING },
              phrasesToKeep: { type: Type.ARRAY, items: { type: Type.STRING } },
              nextStep: { type: Type.STRING },
            },
            required: ["strength", "phrasesToKeep", "nextStep"],
          },
        },
      });

      res.json(JSON.parse((response.text ?? "{}").trim()));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not summarize conversation.";
      console.error("/api/tutor/recap error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Post-call corrections & naturalness review for completed Live Voice calls
  app.post("/api/tutor/live-review", async (req, res) => {
    try {
      const {
        scenario = "Everyday Conversation",
        level = "B1",
        personaName = "Maya",
        utterances = [],
      } = req.body ?? {};

      const cleanUtterances = Array.isArray(utterances)
        ? utterances
            .filter(
              (u): u is { turnId: string; text: string } =>
                Boolean(u && typeof u.turnId === "string" && typeof u.text === "string" && u.text.trim())
            )
            .slice(-20)
            .map((u) => ({ turnId: u.turnId, text: u.text.trim().slice(0, 600) }))
        : [];

      if (cleanUtterances.length === 0) {
        res.status(400).json({ error: "No spoken utterances from the call were provided." });
        return;
      }

      const ai = getAiClient();
      const formattedList = cleanUtterances
        .map((u, idx) => `${idx + 1}. [${u.turnId}] "${u.text}"`)
        .join("\n");

      const response = await generateWithRetry(ai, {
        model: "gemini-4-hydrogen",
        contents: `Review these spoken English lines from a CEFR ${level} live voice call with ${personaName} on "${scenario}":\n\n${formattedList}\n\nFor each item, preserve its exact turnId. Note that live speech-to-text transcripts may lack punctuation—do NOT mark minor missing commas or periods as errors unless the grammar, word choice, verb tense, article, preposition, or phrasing is awkward or incorrect in spoken standard English.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            "You are a warm, precise standard English speaking coach reviewing a completed live voice call. Evaluate each spoken turn constructively, provide natural spoken corrections whenever phrasing or grammar can improve, and return empty string for correctedSentence only when the spoken sentence is already completely natural.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallSummary: {
                type: Type.STRING,
                description: "Encouraging 1-2 sentence post-call summary covering strengths and main correction pattern.",
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    turnId: { type: Type.STRING },
                    correctedSentence: {
                      type: Type.STRING,
                      description: "Natural standard English correction, or empty string if already natural.",
                    },
                    feedbackTip: {
                      type: Type.STRING,
                      description: "Concise 1-sentence explanation of the grammar/phrasing fix or why it sounded great.",
                    },
                    toneNote: {
                      type: Type.STRING,
                      description: "Short 2-4 word label (e.g., 'Clear & polite', 'Past tense fix').",
                    },
                    naturalnessScore: {
                      type: Type.INTEGER,
                      description: "Score from 60 to 100.",
                    },
                    needsCorrection: {
                      type: Type.BOOLEAN,
                    },
                  },
                  required: [
                    "turnId",
                    "correctedSentence",
                    "feedbackTip",
                    "toneNote",
                    "naturalnessScore",
                    "needsCorrection",
                  ],
                },
              },
            },
            required: ["overallSummary", "items"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const itemById = new Map<string, any>();
      for (const item of rawItems) {
        if (item && typeof item.turnId === "string") {
          itemById.set(item.turnId, item);
        }
      }

      const corrections = cleanUtterances.map((u, idx) => {
        const match = itemById.get(u.turnId) ?? rawItems[idx] ?? {};
        const correctedSentence =
          typeof match.correctedSentence === "string" ? match.correctedSentence.trim() : "";
        const needsCorrection =
          typeof match.needsCorrection === "boolean"
            ? match.needsCorrection && correctedSentence.length > 0
            : correctedSentence.length > 0 && correctedSentence.toLowerCase() !== u.text.toLowerCase();
        const score =
          typeof match.naturalnessScore === "number"
            ? Math.max(60, Math.min(100, Math.round(match.naturalnessScore)))
            : needsCorrection
            ? 82
            : 94;
        return {
          turnId: u.turnId,
          originalText: u.text,
          correctedSentence: needsCorrection ? correctedSentence : "",
          feedbackTip:
            typeof match.feedbackTip === "string" && match.feedbackTip.trim()
              ? match.feedbackTip.trim()
              : needsCorrection
              ? "Try this smoother phrasing next time."
              : "Natural, clear standard English.",
          toneNote:
            typeof match.toneNote === "string" && match.toneNote.trim()
              ? match.toneNote.trim()
              : needsCorrection
              ? "Phrasing tip"
              : "Natural & clear",
          naturalnessScore: score,
          needsCorrection,
        };
      });

      const averageScore = Math.round(
        corrections.reduce((sum, item) => sum + item.naturalnessScore, 0) / corrections.length
      );

      res.json({
        overallSummary:
          typeof parsed.overallSummary === "string" && parsed.overallSummary.trim()
            ? parsed.overallSummary.trim()
            : "Great live speaking practice! Review the phrasing tips below before your next call.",
        averageScore,
        corrections,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not review live call corrections.";
      console.error("/api/tutor/live-review error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // High-clarity standard English TTS via Gemini 3.8 Flash Lite TTS
  app.post("/api/speech/tts", async (req, res) => {
    try {
      const { text, voiceName = "Zephyr", style = "Clear, natural, encouraging standard English speaker" } = req.body ?? {};
      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Text is required for speech synthesis." });
        return;
      }

      const ai = getAiClient("v1beta");
      const clipped = text.slice(0, 600);
      const ttsConfig = {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      };

      let response;
      const attempts = [
        {
          model: "gemini-3.8-flash-lite-tts",
          contents: [{ role: "user", parts: [{ text: clipped, speechMetadata: { style } }] }],
        },
        {
          model: "gemini-3.8-flash-lite-tts",
          contents: [{ role: "user", parts: [{ text: clipped }] }],
        },
        {
          model: "gemini-3.8-flash-tts",
          contents: [{ role: "user", parts: [{ text: clipped }] }],
        },
      ];

      let lastTtsErr: unknown;
      for (const attempt of attempts) {
        try {
          response = await generateWithRetry(ai, {
            model: attempt.model,
            contents: attempt.contents,
            config: ttsConfig,
          });
          break;
        } catch (err) {
          lastTtsErr = err;
        }
      }
      if (!response) {
        throw lastTtsErr ?? new Error("Speech synthesis failed.");
      }

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: "No audio returned by speech model." });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: "audio/wav" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Speech synthesis failed.";
      console.error("/api/speech/tts error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Pronunciation speech recognition & coaching feedback
  app.post("/api/speech/pronunciation", async (req, res) => {
    try {
      const { targetPhrase, audioBase64, audioMimeType = "audio/webm", spokenTranscript } = req.body ?? {};
      if (!targetPhrase || typeof targetPhrase !== "string") {
        res.status(400).json({ error: "targetPhrase is required." });
        return;
      }

      const ai = getAiClient();
      let transcript = typeof spokenTranscript === "string" ? spokenTranscript.trim() : "";

      if (audioBase64 && typeof audioBase64 === "string") {
        const transcribeRes = await generateWithRetry(ai, {
          model: "gemini-3.5-transcribe",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: audioMimeType,
                  data: audioBase64,
                },
              },
              {
                text: "Transcribe exactly what the speaker said in English, without auto-correcting mispronounced words.",
              },
            ],
          },
        });
        transcript = (transcribeRes.text ?? "").trim() || transcript;
      }

      if (!transcript) {
        res.status(400).json({ error: "Could not hear speech clearly. Please try speaking closer to your microphone." });
        return;
      }

      const coachRes = await generateWithRetry(ai, {
        model: "gemini-4-hydrogen",
        contents: `Target standard English phrase: "${targetPhrase}"\nRecognized spoken words: "${transcript}"\nGive brief, actionable pronunciation and rhythm coaching in 1-2 encouraging sentences.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              coachFeedback: { type: Type.STRING },
              phoneticFocus: { type: Type.STRING },
            },
            required: ["coachFeedback", "phoneticFocus"],
          },
        },
      });

      const parsed = JSON.parse((coachRes.text ?? "{}").trim());
      res.json({
        transcript,
        coachFeedback: parsed.coachFeedback ?? "Good pace! Keep stressing the key content words naturally.",
        phoneticFocus: parsed.phoneticFocus ?? "Smooth linking between words",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Pronunciation analysis failed.";
      console.error("/api/speech/pronunciation error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Dynamic AI generation for daily vocabulary or conversational grammar quiz items
  app.post("/api/curriculum/generate", async (req, res) => {
    try {
      const { kind = "vocabulary", level = "B1", topic = "Everyday Conversation" } = req.body ?? {};
      const ai = getAiClient();

      if (kind === "grammar") {
        const response = await generateWithRetry(ai, {
          model: "gemini-3.1-flash-lite",
          contents: `Create 4 interactive conversational English grammar quiz questions for CEFR level ${level} on the theme "${topic}". Focus strictly on natural spoken English grammar (tenses, modals, prepositions, polite requests, conditionals).`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  category: { type: Type.STRING },
                  context: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ["id", "category", "context", "prompt", "options", "correctIndex", "explanation"],
              },
            },
          },
        });
        res.json({ items: JSON.parse((response.text ?? "[]").trim()) });
        return;
      }

      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: `Create 4 high-frequency standard English conversational phrases or words for CEFR level ${level} under topic "${topic}". Include IPA pronunciation, clear everyday meaning, a natural spoken dialogue example, and a fill-in-the-blank sentence with "___" where the phrase fits.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                term: { type: Type.STRING },
                phonetic: { type: Type.STRING },
                partOfSpeech: { type: Type.STRING },
                topic: { type: Type.STRING },
                meaning: { type: Type.STRING },
                example: { type: Type.STRING },
                blankSentence: { type: Type.STRING },
                distractors: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["id", "term", "phonetic", "partOfSpeech", "topic", "meaning", "example", "blankSentence", "distractors"],
            },
          },
        },
      });
      res.json({ items: JSON.parse((response.text ?? "[]").trim()) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to generate curriculum.";
      console.error("/api/curriculum/generate error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Personalized Daily AI Fluency Brief for TodayView
  app.post("/api/coach/brief", async (req, res) => {
    try {
      const { level = "B1", streakDays = 1, vocabMastered = 0, pronunciationAvg = 0 } = req.body ?? {};
      const ai = getAiClient();
      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: `Learner CEFR level: ${level}, streak: ${streakDays} days, phrases mastered: ${vocabMastered}, pronunciation clarity: ${Math.round(pronunciationAvg)}%. Create a motivating daily English conversation plan: a warm 1-sentence coaching focus, one fun infinite topic idea to talk about today, and a 1-sentence spoken warm-up question.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              focusMessage: { type: Type.STRING },
              suggestedTopic: { type: Type.STRING },
              warmupQuestion: { type: Type.STRING },
            },
            required: ["focusMessage", "suggestedTopic", "warmupQuestion"],
          },
        },
      });
      res.json(JSON.parse((response.text ?? "{}").trim()));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not load daily brief.";
      console.error("/api/coach/brief error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // Deep AI micro-coaching for vocabulary phrases or grammar rules
  app.post("/api/learn/explain", async (req, res) => {
    try {
      const { kind = "vocab", subject = "", level = "B1" } = req.body ?? {};
      const ai = getAiClient();
      const prompt =
        kind === "grammar"
          ? `Explain this spoken English grammar pattern for CEFR ${level}: "${subject}". Give one short everyday rule of thumb and 2 realistic two-person mini dialogue lines showing how native speakers say it warmly.`
          : `Coach a CEFR ${level} learner on using the English phrase "${subject}" naturally in healthy conversation. Give 1 nuance tip (tone/register) and 2 realistic spoken example lines.`;

      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nuanceTip: { type: Type.STRING },
              examples: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["nuanceTip", "examples"],
          },
        },
      });
      res.json(JSON.parse((response.text ?? "{}").trim()));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not generate explanation.";
      console.error("/api/learn/explain error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // AI conversational reply suggestions tailored to the active dialogue
  app.post("/api/tutor/suggest", async (req, res) => {
    try {
      const { scenario = "Everyday Small Talk", level = "B1", lastTutorMessage = "" } = req.body ?? {};
      const ai = getAiClient();
      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: `Scenario: "${scenario}" (CEFR ${level}). The English tutor just asked: "${lastTutorMessage}". Provide 3 natural, standard, healthy English reply ideas the learner could say next, each with a different conversational tone (Warm & Casual, Polite & Thoughtful, Detailed).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tone: { type: Type.STRING },
                phrase: { type: Type.STRING },
                tip: { type: Type.STRING },
              },
              required: ["tone", "phrase", "tip"],
            },
          },
        },
      });
      res.json({ suggestions: JSON.parse((response.text ?? "[]").trim()) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not generate suggestions.";
      console.error("/api/tutor/suggest error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  // AI pronunciation drill generator for targeted speech clarity
  app.post("/api/pronunciation/generate", async (req, res) => {
    try {
      const { focus = "Linking & Rhythm", level = "B1" } = req.body ?? {};
      const ai = getAiClient();
      const response = await generateWithRetry(ai, {
        model: "gemini-3.1-flash-lite",
        contents: `Create 4 practical spoken standard English pronunciation drills for CEFR level ${level} focusing on "${focus}". Each drill must be a realistic everyday conversational sentence with IPA transcription, syllable stress guidance, and a word-linking tip.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                category: { type: Type.STRING },
                phrase: { type: Type.STRING },
                ipa: { type: Type.STRING },
                stressHint: { type: Type.STRING },
                contextTip: { type: Type.STRING },
              },
              required: ["id", "category", "phrase", "ipa", "stressHint", "contextTip"],
            },
          },
        },
      });
      res.json({ prompts: JSON.parse((response.text ?? "[]").trim()) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not generate pronunciation drills.";
      console.error("/api/pronunciation/generate error:", msg);
      res.status(500).json({ error: humanizeGeminiError(error) });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const reqUrl = new URL(req.url ?? "/live", `http://${req.headers.host ?? "localhost"}`);
    const scenario = reqUrl.searchParams.get("scenario") || "Everyday Small Talk";
    const level = reqUrl.searchParams.get("level") || "B1";
    const rawVoice = reqUrl.searchParams.get("voice") || "Zephyr";
    const allowedVoices = new Set(["Zephyr", "Charon", "Kore", "Puck", "Fenrir"]);
    const voiceName = allowedVoices.has(rawVoice) ? rawVoice : "Zephyr";
    const personaName = reqUrl.searchParams.get("personaName") || "Maya";
    const personaRole = reqUrl.searchParams.get("personaRole") || "Warm Everyday Coach";
    const personaVibe = reqUrl.searchParams.get("personaVibe") || "Friendly, empathetic & clear";
    const voiceTone = reqUrl.searchParams.get("voiceTone") || "friendly";
    const voicePace = reqUrl.searchParams.get("voicePace") || "normal";

    let liveSession: Awaited<ReturnType<ReturnType<typeof getAiClient>["live"]["connect"]>> | null = null;
    let clientClosed = false;

    const cleanupUpstream = () => {
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
      liveSession = null;
    };

    clientWs.on("message", (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.audio && typeof msg.audio === "string") {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg.text && typeof msg.text === "string") {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch (e) {
        console.error("Live message parse error:", e);
      }
    });

    clientWs.on("close", () => {
      clientClosed = true;
      cleanupUpstream();
    });

    try {
      // Gemini Live BidiGenerateContent requires v1beta
      const ai = getAiClient("v1beta");
      const connectedSession = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: buildTutorInstruction(
            scenario,
            level,
            personaName,
            personaRole,
            personaVibe,
            voiceTone,
            voicePace
          ),
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "inputTranscript",
                  text: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "outputTranscript",
                  text: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: "audio",
                    audio: part.inlineData.data,
                  })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: "turnComplete" }));
            }
          },
          onerror: (err) => {
            const detail = err instanceof Error ? err.message : String(err ?? "Live voice error");
            console.error("Gemini Live error:", detail);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message: humanizeGeminiError(detail),
                })
              );
            }
          },
          onclose: () => {
            liveSession = null;
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close(1000, "Live session ended");
            }
          },
        },
      });

      if (clientClosed || clientWs.readyState !== WebSocket.OPEN) {
        connectedSession.close();
        return;
      }

      liveSession = connectedSession;
      clientWs.send(JSON.stringify({ type: "ready" }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not open Live voice session.";
      console.error("Live connect failed:", msg);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: humanizeGeminiError(error) }));
        clientWs.close();
      }
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const hmrDisabled = process.env.DISABLE_HMR === "true";
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        allowedHosts: true,
        hmr: !hmrDisabled,
        ws: { server },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`ZenvoxSpeak server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
