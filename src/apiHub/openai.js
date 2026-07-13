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

function sortModelsByPreference(modelIds) {
  return [...modelIds].sort((a, b) => scoreModel(b) - scoreModel(a));
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

// ─── Pre-fetch models as soon as the app loads ──────────────────────────────
fetchModels();

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