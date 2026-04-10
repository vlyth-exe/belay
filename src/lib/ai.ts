/**
 * AI service module.
 *
 * Replace the body of `sendMessage` with a real API call
 * (e.g. OpenAI, Anthropic, local LLM) when ready.
 * The rest of the app only depends on the exported function signature.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Send a message history to the AI and get back a response string.
 *
 * @param history – the full conversation up to now
 * @param _abort – an optional AbortSignal (wired up by the caller)
 * @returns the assistant's reply text
 */
export async function sendMessage(
  history: ChatMessage[],
  _abort?: AbortSignal,
): Promise<string> {
  // ── Simulate network latency ────────────────────────────────────────
  await new Promise<void>((resolve) => {
    const delay = 800 + Math.random() * 1_200;
    setTimeout(resolve, delay);
  });

  // ── Canned responses ────────────────────────────────────────────────
  const last = history.at(-1)?.content.toLowerCase() ?? "";

  if (last.includes("hello") || last.includes("hi") || last.includes("hey")) {
    return "Hey there! 👋 How can I help you today?";
  }

  if (last.includes("weather")) {
    return "I'm a mock AI, so I can't check the weather right now — but once you wire me up to a real API, I'll be happy to help with that!";
  }

  if (last.includes("help")) {
    return "Sure! I'm currently running in mock mode. To connect me to a real AI, replace the `sendMessage` function in `src/lib/ai.ts` with an actual API call.";
  }

  if (last.includes("code") || last.includes("function") || last.includes("bug")) {
    return "That's a great question! In mock mode I can only give placeholder answers, but once connected to a real LLM I can help with code reviews, debugging, and writing new functions.";
  }

  const responses = [
    "That's an interesting thought. Tell me more!",
    "I'd love to help with that. Could you give me a bit more context?",
    "Great question! Once connected to a real AI backend, I'll be able to give you a much better answer.",
    "I'm currently running in demo mode. Replace my backend in `src/lib/ai.ts` to unlock my full potential! 🚀",
    "Hmm, let me think about that… Just kidding, I'm a mock response. But I'll be smart once you connect me to a real API!",
    "Thanks for chatting with me! This is a simulated response, but the UI is real and ready for a production AI backend.",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}
