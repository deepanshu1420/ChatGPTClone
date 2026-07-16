import OpenAI from "openai";

// ─── OpenAI Client (BluesMinds-compatible) ──────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_BLUESMINDS_API_KEY,
  baseURL: process.env.REACT_APP_BLUESMINDS_BASE_URL,
  dangerouslyAllowBrowser: true,
});

// ─── Model Cache State ──────────────────────────────────────────────────────
let cachedModels = null;        // Sorted list of model IDs from BluesMinds
let lastWorkingModelId = null;  // Last model that successfully returned a response
let modelsFetchedAt = null;     // Timestamp of last fetch
const failedModels = new Set(); // Models that failed this session

const CACHE_TTL_MS = 5 * 60 * 1000; // Re-fetch model list every 5 minutes

// ─── Model Preference Scoring ───────────────────────────────────────────────
// Higher score = tried first. Automatically adapts to any new models BluesMinds adds.
function scoreModel(modelId) {
  const id = modelId.toLowerCase();
  let score = 0;

  // ✅ Tier 1 — OpenAI (newest first)
  const gptMatch = id.match(/gpt-(\d+)/); // version number extract karo
  if (gptMatch) {
    const version = parseInt(gptMatch[1]);
    score += Math.min(110, 60 + version * 10); // gpt-3→90, gpt-4→100, gpt-5→110, gpt-6→120 ✅
    if (id.includes("gpt-4o")) score += 5; // gpt-4o slightly above plain gpt-4
  }
  else if (/^o\d/.test(id)) {
    const oMatch = id.match(/^o(\d+)/);
    const oVersion = oMatch ? parseInt(oMatch[1]) : 1;
    score += 80 + (oVersion * 5); // o1→85, o3→95, o5→105, o7→115 ✅
  }
  else if (id.includes("gpt"))     score += 78; // koi bhi gpt jo match na ho
  else if (id.includes("openai"))  score += 75;

  // ✅ Tier 2 — Claude (version-aware)
  else {
    const claudeMatch = id.match(/claude-(\d+)[.-](\d+)/) || id.match(/claude-(\d+)/);
    if (claudeMatch) {

  const version = claudeMatch[2]
    ? parseFloat(`${claudeMatch[1]}.${claudeMatch[2]}`)
    : parseInt(claudeMatch[1]);
  score += 30 + (version * 10);
  
  } else if (id.includes("claude")) {
      score += 50; // catch-all
  }

  // ✅ Tier 3 — Gemini (version-aware)
  const geminiMatch = id.match(/gemini-(\d+(?:\.\d+)?)/);
    if (geminiMatch) {
      const version = parseFloat(geminiMatch[1]);
      score += 10 + (version * 10);
      // gemini-1.5 → 25, gemini-2 → 30, gemini-2.5 → 35, gemini-3 → 40 ✅
    } else if (id.includes("gemini")) {
      score += 25; // catch-all
    }
  }

  // Specialized models (coding, instruct, etc.)
  if (id.includes("coding"))   score += 10;
  if (id.includes("instruct")) score += 5;

  // Prefer larger parameter counts (better quality)
  if (id.includes("70b") || id.includes("72b")) score += 9;
  if (id.includes("35b") || id.includes("34b")) score += 8;
  if (id.includes("13b") || id.includes("14b")) score += 5;
  if (id.includes("7b") || id.includes("8b"))   score += 2;

  // Prefer newer model families
  if (id.includes("qwen3"))    score += 7;
  if (id.includes("qwen2.5"))  score += 5;
  if (id.includes("qwen2"))    score += 4;
  if (id.includes("qwen"))     score += 2;
  if (id.includes("llama"))    score += 3;

  // Slight penalty for quantized models (fp8 = lossy compression)
  if (id.includes("fp8"))      score -= 1;
  if (id.includes("fp4"))      score -= 2;

  // Penalty for smaller/lighter models
  if (id.includes("mini"))     score -= 3;
  if (id.includes("small"))    score -= 3;
  if (id.includes("tiny"))     score -= 5;

  return score;
}

function isTextModel(modelId) {
  const id = modelId.toLowerCase();

  // ❌ Filter OUT these — they never return text chat responses
  if (id.includes("embed"))            return false; // embedding models
  if (id.includes("embedding"))        return false;
  if (id.includes("dall-e"))           return false; // image generation
  if (id.includes("stable-diffusion")) return false;
  if (id.includes("imagen"))           return false;
  if (id.includes("tts"))              return false; // text-to-speech
  if (id.includes("whisper"))          return false; // speech-to-text
  if (id.includes("speech"))           return false;
  if (id.includes("audio"))            return false;
  if (id.includes("transcri"))         return false; // transcription
  if (id.includes("clip"))             return false; // image-text matching
  if (id.includes("bge"))              return false; // embedding models
  if (id.includes("reward"))           return false; // reward/RLHF models
  if (id.includes("retriev"))          return false; // retriever models
  if (id.includes("detector"))         return false; // classifier/detector
  if (id.includes("video"))            return false; // video models
  if (id.includes("deplot"))           return false; // chart/plot models
  if (id.includes("pii"))              return false; // PII detection models
  if (id.includes("vision"))           return false;
  if (id.includes("multimodal"))       return false;
  if (id.includes("-vl"))              return false;
  if (id.includes("guard"))            return false;
  if (id.includes("safety"))           return false;
  if (id.includes("translate"))        return false;
  if (id.includes("parse"))            return false;
  if (id.includes("kosmos"))           return false;
  if (id.includes("fuyu"))             return false;
  if (id.includes("calibration"))      return false;

  return true;   // ✅ everything else assumed text
  
}

function sortModelsByPreference(modelIds) {
  return [...modelIds]
    .filter(isTextModel) // ✅ remove non-text models first
    .sort((a, b) => scoreModel(b) - scoreModel(a));
}

// ─── Fetch Models from BluesMinds ───────────────────────────────────────────
async function fetchModels() {
  const now = Date.now();

  // Return cached list if still fresh
  if (
    cachedModels &&
    modelsFetchedAt &&
    now - modelsFetchedAt < CACHE_TTL_MS
  ) {
    return cachedModels;
  }

  try {
    // Strip trailing slash to avoid double-slash in URL
    const baseURL = (
      process.env.REACT_APP_BLUESMINDS_BASE_URL || ""
    ).replace(/\/$/, "");

    const res = await fetch(`${baseURL}/models`, {
      headers: {
        Authorization: `Bearer ${process.env.REACT_APP_BLUESMINDS_API_KEY}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Model fetch failed with status ${res.status}`);
    }

    const data = await res.json();

    if (!data?.data || data.data.length === 0) {
      // API responded but returned no models
      return null;
    }

    const modelIds = data.data.map((m) => m.id);
    cachedModels = sortModelsByPreference(modelIds);
    modelsFetchedAt = now;

    // If the last working model was removed from BluesMinds, reset it
    if (lastWorkingModelId && !cachedModels.includes(lastWorkingModelId)) {
      lastWorkingModelId = null;
    }

    console.log("BluesMinds models loaded (in preference order):", cachedModels);
    return cachedModels;

  } catch (error) {
    console.error("Failed to fetch models from BluesMinds:", error);
    // Return stale cache if available — better than nothing
    return cachedModels || null;
  }
}

// ─── Health check on app load ────────────────────────────────────────────────
async function healthCheck() {
  const models = await fetchModels(); // fetch + sort (OpenAI first)
  if (!models || models.length === 0) return;

  // Ping top 10 models silently to find first working one
  const toCheck = models.slice(0, 10);

  for (const modelId of toCheck) {
    try {
      await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1, // super lightweight ping
      });
      lastWorkingModelId = modelId; // ✅ ready before first user message
      console.log(`Health check passed: ${modelId}`);
      break;
    } catch {
      console.warn(`Health check failed: ${modelId}, trying next...`);
    }
  }
}

healthCheck(); // runs silently on app load

// ─── Error Classifier ───────────────────────────────────────────────────────
// Returns { type, message }
// type "retry"  → try the next model silently
// type "fatal"  → stop immediately and show message to user
// type "abort"  → user clicked Stop, return null silently
function classifyError(error) {

  // User clicked Stop — never show this as an error
  if (
    error.name === "AbortError" ||
    error.message?.includes("aborted")
  ) {
    return { type: "abort" };
  }

  // Network / connectivity issues
  if (
    error.message?.toLowerCase().includes("failed to fetch") ||
    error.message?.toLowerCase().includes("network") ||
    error.message?.toLowerCase().includes("fetch")
  ) {
    return {
      type: "fatal",
      message: "Network error. Please check your internet connection.",
    };
  }

  // HTTP status-based errors
  switch (error.status) {
    case 401:
      return {
        type: "fatal",
        message:
          "Unable to connect to the AI service. Please contact the administrator.",
      };
    case 403:
      return {
        type: "fatal",
        message:
          "The AI service is currently unavailable. Please contact the administrator.",
      };
    case 429:
      return {
        type: "fatal",
        message:
          "The AI service is currently busy. Please try again in a few moments.",
      };
    case 404:
      // Model not found — try the next one
      return { type: "retry" };
    case 410:
      return { type: "failed" };  
    default:
      break;
  }

  // Server-side errors (5xx)
  if (error.status >= 500) {
    return {
      type: "server_error", // treated as retry, becomes fatal on last model
      message:
        "The AI server is temporarily unavailable. Please try again later.",
    };
  }

  // BluesMinds-specific: "No available channel" means this model slot is busy
  const msg = (error.message || "").toLowerCase();
  if (
    msg.includes("no available channel") ||
    msg.includes("channel")
  ) {
    return { type: "retry" }; // silent retry with next model
  }

  // Catch-all unknown error
  return {
    type: "unknown", // treated as retry, becomes fatal on last model
    message:
      "Something went wrong while generating the response. Please try again.",
  };
}

// ─── Send Message ────────────────────────────────────────────────────────────
async function sendMessage(question, signal) {

  if (!question.trim()) {
    return "Please enter a message.";
  }

  // 1. Get models (from cache or fresh fetch)
  const models = await fetchModels();

  if (!models || models.length === 0) {
    return "No AI models are currently available. Please try again in a few minutes.";
  }

  // 2. Build attempt order:
  //    Start with last known working model (skips unnecessary retries),
  //    then try the rest in preference order.
  let attemptOrder;
  if (lastWorkingModelId && models.includes(lastWorkingModelId)) {
    attemptOrder = [
      lastWorkingModelId,
      ...models.filter((m) => m !== lastWorkingModelId),
    ];
  } else {
    attemptOrder = [...models];
  }

  attemptOrder = attemptOrder.filter(m => !failedModels.has(m));

  // 3. Try each model in order until one succeeds
  for (let i = 0; i < attemptOrder.length; i++) {
    const modelId = attemptOrder[i];
    const isLastModel = i === attemptOrder.length - 1;

    try {
      const response = await openai.chat.completions.create(
        {
          model: modelId,
          messages: [
            {
              role: "user",
              content: question,
            },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        },
        { signal }
      );

      const content = response?.choices?.[0]?.message?.content;

      if (content) {
        lastWorkingModelId = modelId; // Remember this working model
        return content;
      }

      // Response came back but was empty — treat as failure, try next
      console.warn(`Model "${modelId}" returned empty content, trying next...`);

    } catch (error) {
      const classified = classifyError(error);

      // User clicked Stop — return silently, no error shown
      if (classified.type === "abort") return null;

      if (classified.type === "failed") {
        failedModels.add(modelId);
        continue;
      }

      // Fatal errors — don't try other models, just show the message
      if (classified.type === "fatal") {
        return classified.message;
      }

      // Server error — show message only if this was the last model
      if (classified.type === "server_error") {
        if (isLastModel) return classified.message;
        console.warn(`Model "${modelId}" returned server error, trying next...`);
        continue;
      }

      // Unknown error — show message only if this was the last model
      if (classified.type === "unknown") {
        if (isLastModel) return classified.message;
        console.warn(`Model "${modelId}" failed with unknown error, trying next...`);
        continue;
      }

      // "retry" type (channel unavailable, 404, etc.)
      // If there are more models, move on silently
      if (!isLastModel) {
        console.warn(`Model "${modelId}" unavailable. Trying next model...`);
        continue;
      }
    }
  }

  // Every model was tried and all failed → force a fresh model list next time
  cachedModels = null;
  modelsFetchedAt = null;

  return "All AI models are temporarily unavailable. Please try again later.";
}

export { fetchModels };
export default sendMessage;