import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.REACT_APP_BLUESMINDS_API_KEY,
  baseURL: process.env.REACT_APP_BLUESMINDS_BASE_URL,
  dangerouslyAllowBrowser: true,
});

async function sendMessage(question, signal) {   // ← signal added
  try {
    if (!question.trim()) {
      return "Please enter a message.";
    }

    const response = await openai.chat.completions.create(
      {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      { signal }   // ← passed here
    );

    return (
      response?.choices?.[0]?.message?.content ||
      "I couldn't generate a response."
    );

  } catch (error) {

    // ✅ If user clicked stop, silently return null (no error message in chat)
    if (error.name === "AbortError" || error.message?.includes("aborted")) {
      return null;
    }

    console.error("Error sending message:", error);

    switch (error.status) {
      case 401:
        return "Invalid API key. Please check your API key.";
      case 403:
        return "You don't have permission to access this model.";
      case 404:
        return "The requested model could not be found.";
      case 429:
        return "Rate limit exceeded. Please try again in a few moments.";
      default:
        if (error.status >= 500) {
          return "The AI server is temporarily unavailable. Please try again later.";
        }

        if (
          error.message?.toLowerCase().includes("network") ||
          error.message?.toLowerCase().includes("fetch")
        ) {
          return "Network error. Please check your internet connection.";
        }

        return "Something went wrong while generating the response. Please try again.";
    }
  }
}

export default sendMessage;