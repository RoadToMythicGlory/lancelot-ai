import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, Plus, MessageSquare, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import PageHeader from "@/components/ui/PageHeader";

const suggestions = [
  "Suggest a stream title for Valorant",
  "Plan my streaming schedule for next week",
  "What equipment should I upgrade next?",
  "Give me content ideas for growing my channel",
  "Help me write a collab proposal",
  "What are the best streaming hours?",
];

export default function AI() {
  const [conversations, setConversations] = useState([{ id: "1", name: "New Chat", messages: [] }]);
  const [activeConv, setActiveConv] = useState("1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef(null);

  const current = conversations.find(c => c.id === activeConv) || conversations[0];

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [current?.messages?.length, loading]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    setConversations(prev => prev.map(c =>
      c.id === activeConv ? { ...c, messages: [...c.messages, userMsg] } : c
    ));
    setInput("");
    setLoading(true);

    let responseText;
    try {
      const historyContext = current.messages.slice(-10).map(m => `${m.role}: ${m.content}`).join("\n");
      const prompt = `You are Lancelot AI, a helpful assistant for content creators and streamers. You help with stream planning, content ideas, equipment advice, growth strategies, and more. Be concise, friendly, and actionable.\n\nConversation history:\n${historyContext}\nuser: ${text}\nassistant:`;

      // TODO: Replace with a proper GraphQL mutation or dedicated AI endpoint
      const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiBase}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt }),
      });

      if (res.ok) {
        const data = await res.json();
        responseText = data.response || data.text || data.content || "No response received.";
      } else {
        responseText = "AI endpoint not available yet. This feature will be connected soon.";
      }
    } catch {
      responseText = "AI endpoint not available yet. This feature will be connected soon.";
    }

    const aiMsg = { role: "assistant", content: responseText };
    setConversations(prev => prev.map(c =>
      c.id === activeConv
        ? { ...c, messages: [...c.messages, aiMsg], name: c.messages.length === 0 ? text.slice(0, 30) : c.name }
        : c
    ));
    setLoading(false);
  };

  const newConversation = () => {
    const id = Date.now().toString();
    setConversations(prev => [...prev, { id, name: "New Chat", messages: [] }]);
    setActiveConv(id);
  };

  return (
    <div className="max-w-7xl mx-auto flex gap-4 h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 hidden lg:flex flex-col rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
        <div className="p-3 border-b border-[#2A2A4A]">
          <Button onClick={newConversation} variant="outline" className="w-full border-[#2A2A4A] text-white hover:bg-white/5 text-xs gap-1.5 h-8">
            <Plus size={14} />New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveConv(c.id)}
              className={`w-full text-left px-3 py-2 text-xs truncate transition-smooth ${
                c.id === activeConv ? "bg-[#6C63FF]/10 text-[#6C63FF]" : "text-[#A0A0B0] hover:text-white hover:bg-white/5"
              }`}
            >
              <MessageSquare size={10} className="inline mr-1.5" />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col rounded-xl border border-[#2A2A4A] bg-[#1A1A2E] overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {current.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 rounded-2xl bg-[#6C63FF]/10 mb-4">
                <Sparkles size={28} className="text-[#6C63FF]" />
              </div>
              <h3 className="text-lg font-semibold text-white">Lancelot AI</h3>
              <p className="text-sm text-[#6B6B80] mt-1 mb-6 max-w-sm">Your AI assistant for streaming. Ask about content ideas, schedules, equipment, and more.</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-3 py-1.5 rounded-full border border-[#2A2A4A] text-xs text-[#A0A0B0] hover:text-white hover:border-[#6C63FF]/50 hover:bg-[#6C63FF]/5 transition-smooth"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            current.messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-[#6C63FF]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={14} className="text-[#6C63FF]" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  msg.role === "user"
                    ? "bg-[#6C63FF] text-white"
                    : "bg-[#16213E] border border-[#2A2A4A] text-white"
                }`}>
                  {msg.role === "user" ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <ReactMarkdown className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-[#00D4AA]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={14} className="text-[#00D4AA]" />
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#6C63FF]/20 flex items-center justify-center shrink-0">
                <Bot size={14} className="text-[#6C63FF]" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-[#16213E] border border-[#2A2A4A]">
                <Loader2 size={16} className="text-[#6C63FF] animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#2A2A4A]">
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(input); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask Lancelot AI..."
              className="bg-[#16213E] border-[#2A2A4A] text-white text-sm"
              disabled={loading}
            />
            <Button type="submit" disabled={!input.trim() || loading} className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white px-3">
              <Send size={16} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
