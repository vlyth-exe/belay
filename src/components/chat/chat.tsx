import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Sparkles } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";

// ── Types ──────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── Mock AI response (replace with real API call) ──────────────────────

async function getAIResponse(userMessage: string): Promise<string> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

  const lower = userMessage.toLowerCase();

  if (
    lower.includes("hello") ||
    lower.includes("hi") ||
    lower.includes("hey")
  ) {
    return "Hey there! 👋 How can I help you today?";
  }

  if (lower.includes("help")) {
    return "I'm here to assist you! You can ask me questions about programming, brainstorm ideas, draft text, analyze data, or just have a conversation. What would you like to do?";
  }

  if (lower.includes("thank")) {
    return "You're welcome! Let me know if there's anything else I can help with.";
  }

  const responses = [
    "That's a great question. Let me think about that...\n\nBased on what you've described, I'd suggest breaking the problem down into smaller steps. Start with the core requirement and iterate from there.",
    "I'd be happy to help with that! Here's my take:\n\nThe key thing to consider is the overall architecture. Once you have a solid foundation, the details tend to fall into place more naturally.",
    "Interesting point! There are a few ways to approach this:\n\n1. **The straightforward approach** — just get it working first\n2. **The elegant approach** — design for extensibility\n3. **The pragmatic approach** — a bit of both\n\nI'd usually recommend option 3 for most cases.",
    "Let me work through that with you.\n\nThe main thing to keep in mind is that simplicity wins. Don't over-engineer early on — you can always refine later once you understand the problem space better.",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// ── Suggested prompts for empty state ──────────────────────────────────

const suggestions = [
  "Explain how closures work in JavaScript",
  "Help me design a REST API",
  "Write a function that validates emails",
  "What are the best practices for React state management?",
];

// ── Chat Component ─────────────────────────────────────────────────────

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll to bottom on new messages ──────────────────────────
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, scrollToBottom]);

  // ── Send a message ─────────────────────────────────────────────────
  const handleSend = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isThinking) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);

      try {
        const response = await getAIResponse(trimmed);

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking],
  );

  // ── Empty state ────────────────────────────────────────────────────
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="size-7 text-primary" />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              How can I help you?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Ask me anything — code, ideas, writing, analysis, and more.
            </p>
          </div>

          <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSend(suggestion)}
                className="rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <ChatInput onSend={handleSend} disabled={isThinking} />
      </div>
    );
  }

  // ── Conversation view ──────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="space-y-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Typing indicator */}
            {isThinking && (
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input pinned to bottom */}
      <ChatInput onSend={handleSend} disabled={isThinking} />
    </div>
  );
}
