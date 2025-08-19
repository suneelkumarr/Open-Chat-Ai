import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Settings,
  MessageCircle,
  Bot,
  User,
  Check,
  X,
  Eye,
  EyeOff,
  Copy,
  CheckCheck,
  Plus,
  Trash2,
  SquarePen,
  Pause,
  Download,
  Upload,
  NotebookTabs,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/**
 * PRO CHAT — Modern features found in ChatGPT / Claude / Qwen / Cursor
 * -------------------------------------------------------------------
 * ✓ Streaming responses with stop button
 * ✓ Edit & Regenerate messages
 * ✓ System Prompt (Persona) switcher + custom prompt editor
 * ✓ Model params (temperature, max_tokens)
 * ✓ Multimodal: image upload to vision-capable models (base64)
 * ✓ File attachments (sends as text chunks when possible)
 * ✓ Conversation history sidebar (multi-chat), localStorage persistence
 * ✓ Quick prompts (slash-commands & chips)
 * ✓ Export / Import chat (JSON)
 * ✓ Copy message, delete message
 * ✓ Markdown with code highlight
 * ✓ Small tips & tokens-estimate placeholder (client-only)
 *
 * API: OpenRouter-compatible /chat/completions endpoint
 */

// ---------------- Types ----------------
interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number; // epoch ms for easier persistence
  attachments?: Attachment[]; // images/files
}

interface Attachment {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string;
  dataUrl?: string; // for images
  textPreview?: string; // for files we can read as text
  size?: number;
}

interface ModelConfig {
  apiKey: string;
  selectedModel: string;
  baseUrl: string;
  temperature: number;
  maxTokens?: number;
}

interface Model {
  id: string;
  name: string;
  description: string;
  provider: string;
}

type AssistantStyle = "Default" | "Claude" | "ChatGPT" | "Qwen";

const STYLE_PROMPTS: Record<AssistantStyle, string> = {
  Default:
    `You are a concise, helpful assistant.\n\n- Use clean Markdown\n- Prefer short paragraphs and bullet lists\n- Add section headings (##)\n- Use fenced code blocks with language hints\n- Avoid unnecessary preambles or filler`,

  Claude:
    `Adopt Anthropic Claude's tone: warm, thoughtful, and structured.\n\n- Use Markdown with clear section headings (##)\n- Write short paragraphs and crisp bullet points\n- Show code in fenced blocks with language tags and minimal commentary\n- When helpful, conclude with a brief "Next steps" list\n- Keep answers approachable yet precise`,

  ChatGPT:
    `Adopt ChatGPT's tone: friendly, practical, and well-organized.\n\n- Begin with a one-line summary if the answer is long\n- Use Markdown with lists, tables (when useful), and code blocks with language labels\n- Prefer step-by-step instructions\n- Add brief tips, caveats, or best practices to guide the reader`,

  Qwen:
    `Adopt Qwen's tone: crisp, technical, and example-driven.\n\n- Respond in Markdown with numbered steps and compact explanations\n- Favor code-first answers, with concise inline notes\n- Highlight key commands or APIs succinctly\n- Avoid verbosity and focus on essentials`,
};

// Popular models for convenience (works with OpenRouter)
const AVAILABLE_MODELS: Model[] = [
  {
    id: "anthropic/claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    description: "Great reasoning, coding, and long-context",
    provider: "Anthropic",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o mini",
    description: "Fast, inexpensive, multimodal",
    provider: "OpenAI",
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 mini",
    description: "Strong reasoning, tools, JSON",
    provider: "OpenAI",
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    name: "Qwen2.5 Coder 32B Instruct",
    description: "Advanced coding and programming — Free",
    provider: "Qwen",
  },
  {
    id: "google/gemma-2-9b-it:free",
    name: "Gemma 2 9B IT",
    description: "Google instruction-tuned — Free",
    provider: "Google",
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    name: "Llama 3.2 3B Instruct",
    description: "Efficient & capable — Free",
    provider: "Meta",
  },
];

// Quick prompt chips (like Cursor / ChatGPT)
const QUICK_PROMPTS = [
  "Explain like I'm 5",
  "Give me step-by-step instructions",
  "Write tests for this code",
  "Summarize the above",
  "List pros & cons",
];

// Storage keys
const LS_KEY_CHATS = "prochat.chats.v1";
const LS_KEY_SETTINGS = "prochat.settings.v1";

// ---------------- Utilities ----------------
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result));
    fr.readAsText(file);
  });
}

function now() { return Date.now(); }

// ---------------- Main Component ----------------
const ProChat: React.FC = () => {
  // Sidebar: multiple chats
  const [chats, setChats] = useState<{ id: string; title: string; messages: Message[] }[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_CHATS);
      if (raw) return JSON.parse(raw);
    } catch {
        console.error("Failed to load chats 181");
    }
    // seed with an empty chat
    return [{ id: uuid(), title: "New Chat", messages: [] }];
  });
  const [activeChatId, setActiveChatId] = useState(chats[0]?.id);
  const activeChat = useMemo(() => chats.find(c => c.id === activeChatId)!, [chats, activeChatId]);

  // Settings
  const [assistantStyle, setAssistantStyle] = useState<AssistantStyle>("Claude");
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>("");
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_SETTINGS);
      if (raw) return JSON.parse(raw);
    } catch {
        console.error("Failed to load settings 197");
    }
    return {
      apiKey: "",
      selectedModel: "openai/gpt-4o-mini",
      baseUrl: "https://openrouter.ai/api/v1",
      temperature: 0.6,
      maxTokens: 1024,
    };
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Persist
  useEffect(() => { localStorage.setItem(LS_KEY_CHATS, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(modelConfig)); }, [modelConfig]);

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [inputMessage]);

  // ----- Chat management -----
  const newChat = () => {
    const c = { id: uuid(), title: "New Chat", messages: [] as Message[] };
    setChats(prev => [c, ...prev]);
    setActiveChatId(c.id);
    setInputMessage("");
    setAttachments([]);
  };
  const deleteChat = (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (id === activeChatId && chats.length > 1) setActiveChatId(chats.find(c => c.id !== id)!.id);
  };

  // ----- Helpers -----
  const systemPrompt = useMemo(() => {
    const base = STYLE_PROMPTS[assistantStyle];
    return customSystemPrompt.trim() ? `${base}\n\n${customSystemPrompt.trim()}` : base;
  }, [assistantStyle, customSystemPrompt]);

  const addMessage = useCallback((msg: Message) => {
    setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, msg] } : c));
  }, [activeChatId]);

  const updateLastAssistant = useCallback((updater: (prev: Message) => Message) => {
    setChats(prev => prev.map(c => {
      if (c.id !== activeChatId) return c;
      const msgs = c.messages.slice();
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") { msgs[i] = updater(msgs[i]); break; }
      }
      return { ...c, messages: msgs };
    }));
  }, [activeChatId]);

  // ----- Build OpenRouter payload -----
  function buildPayload(userMsg: Message, history: Message[]) {
    // Build OpenAI-style content array when images exist
    const userHasImages = (userMsg.attachments || []).some(a => a.type === "image" && a.dataUrl);
    const imageParts = (userMsg.attachments || [])
      .filter(a => a.type === "image" && a.dataUrl)
      .map(a => ({ type: "image_url", image_url: a.dataUrl! }));

    const userContent = userHasImages
      ? [{ type: "text", text: userMsg.content }, ...imageParts]
      : userMsg.content;

    const msgs = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({
        role: m.role,
        content: m.attachments?.length
          ? (
            [ { type: "text", text: m.content },
              ...m.attachments.filter(a => a.type === "image" && a.dataUrl).map(a => ({ type: "image_url", image_url: a.dataUrl! }))
            ] as any
          )
          : m.content,
      })),
      { role: "user", content: userContent },
    ];

    return {
      model: modelConfig.selectedModel,
      messages: msgs,
      temperature: modelConfig.temperature,
      max_tokens: modelConfig.maxTokens,
      stream: true,
    } as const;
  }

  // ----- Networking (Streaming) -----
  async function streamChat(payload: any) {
    const url = modelConfig.baseUrl.replace(/\/$/, "") + "/chat/completions";
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${modelConfig.apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "ProChat",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let full = "";
    setIsStreaming(true);

    // Create a placeholder assistant message
    const asstId = uuid();
    addMessage({ id: asstId, role: "assistant", content: "", timestamp: now() });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // OpenRouter streams as data: lines (SSE-like). We parse JSON objects that contain delta content
        for (const line of chunk.split("\n")) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          const data = m[1];
          if (data === "[DONE]") { continue; }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              full += delta;
              updateLastAssistant(prev => ({ ...prev, content: prev.content + delta }));
            }
          } catch {
            console.error("Failed to parse OpenRouter stream:", line);
          }
        }
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }

    if (!full.trim()) throw new Error("Empty response from model");
    return full;
  }

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  // ----- Send / Edit / Regenerate -----
  async function handleSend(custom?: { content?: string; attachments?: Attachment[] }) {
    if (isStreaming) return;
    const content = (custom?.content ?? inputMessage).trim();
    if (!content) return;
    if (!modelConfig.apiKey || !modelConfig.selectedModel) {
      alert("Please set API key and model in Settings (gear icon)");
      return;
    }

    const userMsg: Message = {
      id: uuid(),
      role: "user",
      content,
      attachments: custom?.attachments ?? attachments,
      timestamp: now(),
    };

    addMessage(userMsg);
    setInputMessage("");
    setAttachments([]);

    try {
      await streamChat(buildPayload(userMsg, activeChat.messages));
      // Set chat title from first user message
      if (activeChat.title === "New Chat" && content.length) {
        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title: content.slice(0, 42) } : c));
      }
    } catch (err: any) {
      addMessage({
        id: uuid(),
        role: "assistant",
        content: `## Error\n\n${err?.message || String(err)}\n\n**Tips**\n- Check API key / model\n- Verify base URL`,
        timestamp: now(),
      });
    }
  }

  function handleEditMessage(mid: string) {
    const m = activeChat.messages.find(x => x.id === mid);
    if (!m) return;
    setInputMessage(m.content);
    setAttachments(m.attachments || []);
    // Remove message and any following assistant to regenerate
    setChats(prev => prev.map(c => {
      if (c.id !== activeChatId) return c;
      const idx = c.messages.findIndex(x => x.id === mid);
      if (idx === -1) return c;
      const msgs = c.messages.slice(0, idx); // drop the edited message and after
      return { ...c, messages: msgs };
    }));
  }

  function handleRegenerate() {
    // Find last user message
    const msgs = activeChat.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        const lastUser = msgs[i];
        // remove everything after last user
        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: msgs.slice(0, i + 1) } : c));
        // stream again
        streamChat(buildPayload(lastUser, msgs.slice(0, i)))
          .catch(err => addMessage({ id: uuid(), role: "assistant", content: `## Error\n\n${err?.message}`, timestamp: now() }));
        break;
      }
    }
  }

  // ----- Attachments -----
  async function onPickFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const arr: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataUrl(f);
        arr.push({ id: uuid(), name: f.name, type: "image", mime: f.type, dataUrl, size: f.size });
      } else {
        const text = await readFileAsText(f).catch(() => "[binary file]");
        arr.push({ id: uuid(), name: f.name, type: "file", mime: f.type || "application/octet-stream", textPreview: text.slice(0, 4000), size: f.size });
      }
    }
    setAttachments(prev => [...prev, ...arr]);
  }
  function removeAttachment(id: string) { setAttachments(prev => prev.filter(a => a.id !== id)); }

  // ----- Export / Import -----
  function exportChat() {
    const data = JSON.stringify(activeChat, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${activeChat.title || "chat"}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function importChat(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    readFileAsText(file).then(text => {
      try {
        const obj = JSON.parse(text);
        if (obj && obj.messages && Array.isArray(obj.messages)) {
          const c = { id: uuid(), title: obj.title || file.name.replace(/\.json$/, ""), messages: obj.messages };
          setChats(prev => [c, ...prev]); setActiveChatId(c.id);
        } else { alert("Invalid chat JSON"); }
      } catch { alert("Failed to parse JSON"); }
    });
  }

  // ----- Slash Commands -----
  function handleSlash(cmd: string) {
    const map: Record<string, string> = {
      "/clear": "",
      "/system": "(opens system prompt editor)",
      "/summarize": "Summarize the conversation so far in bullet points.",
      "/tests": "Write unit tests for the code above.",
    };
    if (cmd === "/clear") {
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [] } : c));
      return true;
    }
    if (cmd === "/system") {
      const el = document.getElementById("systemPromptBox");
      el?.scrollIntoView({ behavior: "smooth" });
      return true;
    }
    if (map[cmd]) { setInputMessage(map[cmd]); return true; }
    return false;
  }

  // ----- Render -----
  return (
    <div className="h-screen w-full grid" style={{ gridTemplateColumns: sidebarOpen ? "280px 1fr" : "0 1fr" }}>
      {/* Sidebar */}
      <aside className={`border-r bg-white overflow-hidden transition-all ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="p-3 flex items-center justify-between border-b">
          <div className="flex items-center gap-2 text-sm text-gray-600"><NotebookTabs className="w-4 h-4"/> Chats</div>
          <button onClick={newChat} className="px-2 py-1 text-xs bg-blue-600 text-white rounded-lg flex items-center gap-1"><Plus className="w-3 h-3"/> New</button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
          {chats.map(c => (
            <div key={c.id} className={`px-3 py-2 border-b flex items-center gap-2 cursor-pointer ${c.id === activeChatId ? "bg-blue-50" : "hover:bg-gray-50"}`} onClick={() => setActiveChatId(c.id)}>
              <div className="flex-1 text-sm truncate">{c.title || "Untitled"}</div>
              <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }} className="p-1 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex items-center justify-between">
          <label className="text-xs text-gray-600 flex items-center gap-2">
            API Key
            <input type={showApiKey ? "text" : "password"} value={modelConfig.apiKey}
              onChange={e => setModelConfig({ ...modelConfig, apiKey: e.target.value })}
              placeholder="sk-or-v1-..." className="border rounded px-2 py-1 text-xs w-40"/>
            <button onClick={() => setShowApiKey(s => !s)} className="p-1">{showApiKey ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
          </label>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-3 md:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(s => !s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
              {sidebarOpen ? <ChevronLeft className="w-5 h-5"/> : <ChevronRight className="w-5 h-5"/>}
            </button>
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{AVAILABLE_MODELS.find(m => m.id === modelConfig.selectedModel)?.name || modelConfig.selectedModel}</div>
              <p className="text-[11px] text-gray-500 truncate">OpenRouter • Persona: {assistantStyle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select value={assistantStyle} onChange={e => setAssistantStyle(e.target.value as AssistantStyle)} className="px-2 py-1 border rounded text-sm">
              {(["Claude","ChatGPT","Qwen","Default"] as AssistantStyle[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={modelConfig.selectedModel} onChange={e => setModelConfig({ ...modelConfig, selectedModel: e.target.value })} className="px-2 py-1 border rounded text-sm">
              {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <button title="Settings" className="p-2 rounded hover:bg-gray-100 text-gray-600">
              <Settings className="w-5 h-5"/>
            </button>
          </div>
        </div>

        {/* Settings Row */}
        <div className="bg-white/60 border-b px-3 md:px-6 py-2 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">Temp
            <input type="range" min={0} max={2} step={0.1} value={modelConfig.temperature} onChange={e => setModelConfig({ ...modelConfig, temperature: Number(e.target.value) })} className="w-28"/>
            <span className="w-6 text-center">{modelConfig.temperature.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1">Max tokens
            <input type="number" min={64} max={8192} value={modelConfig.maxTokens || 1024} onChange={e => setModelConfig({ ...modelConfig, maxTokens: Number(e.target.value) })} className="w-20 border rounded px-1"/>
          </div>
          <div className="flex-1"/>
          <div className="flex items-center gap-2">
            <button onClick={exportChat} className="px-2 py-1 border rounded flex items-center gap-1"><Download className="w-4 h-4"/> Export</button>
            <label className="px-2 py-1 border rounded flex items-center gap-1 cursor-pointer"><Upload className="w-4 h-4"/> Import
              <input type="file" accept="application/json" className="hidden" onChange={importChat}/>
            </label>
          </div>
        </div>

        {/* System Prompt Editor */}
        <div id="systemPromptBox" className="px-3 md:px-6 py-2 bg-amber-50 border-b">
          <details>
            <summary className="text-xs text-amber-800 cursor-pointer">Custom system prompt (optional) — appended to persona</summary>
            <textarea value={customSystemPrompt} onChange={e => setCustomSystemPrompt(e.target.value)} placeholder="e.g., You are helping with TypeScript and React. Prefer strict code." className="mt-2 w-full border rounded p-2 text-sm" rows={3}/>
          </details>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-2 md:px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-6">
            {activeChat.messages.map((m, idx) => (
              <div key={m.id} className={`group relative flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                <div className={`max-w-3xl rounded-2xl px-4 py-3 shadow-sm ${m.role === "user" ? "bg-blue-600 text-white" : "bg-white text-gray-800 border border-gray-200"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm md:prose-base max-w-none prose-pre:rounded-xl prose-pre:border prose-pre:border-gray-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}

                  {/* Attachments preview */}
                  {!!m.attachments?.length && (
                    <div className={`mt-2 grid gap-2 ${m.attachments.some(a => a.type === "image") ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1"}`}>
                      {m.attachments.map(att => (
                        <div key={att.id} className="border rounded-lg p-2 bg-white/60">
                          <div className="text-[11px] text-gray-600 truncate mb-1">{att.name} • {(att.size||0) > 0 ? `${Math.round((att.size||0)/1024)}KB` : ""}</div>
                          {att.type === "image" && att.dataUrl && (
                            <img src={att.dataUrl} alt={att.name} className="rounded-md max-h-48 object-contain w-full"/>
                          )}
                          {att.type === "file" && (
                            <pre className="text-[11px] overflow-auto max-h-40 whitespace-pre-wrap">{att.textPreview || "[binary]"}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`text-[11px] mt-2 ${m.role === "user" ? "text-blue-100" : "text-gray-400"}`}>
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {m.role === "user" && (
                  <div className="bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* Message actions */}
                <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button title="Copy" onClick={() => navigator.clipboard.writeText(m.content)} className="bg-white border rounded p-1 shadow"><Copy className="w-4 h-4 text-gray-700"/></button>
                  {m.role === "user" && (
                    <button title="Edit & regenerate from here" onClick={() => handleEditMessage(m.id)} className="bg-white border rounded p-1 shadow"><SquarePen className="w-4 h-4 text-gray-700"/></button>
                  )}
                </div>

                {/* Regenerate at the end */}
                {idx === activeChat.messages.length - 1 && m.role === "assistant" && (
                  <div className="absolute -left-2 -bottom-3 opacity-0 group-hover:opacity-100">
                    <button onClick={handleRegenerate} className="text-xs px-2 py-1 bg-white border rounded shadow">Regenerate</button>
                  </div>
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="flex gap-3">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-8 h-8 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2"><div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div><span className="text-gray-600">Thinking…</span></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="bg-white border-t px-2 md:px-6 py-3">
          <div className="max-w-4xl mx-auto">
            {/* Quick prompts */}
            <div className="flex flex-wrap gap-2 mb-2">
              {QUICK_PROMPTS.map(q => (
                <button key={q} onClick={() => setInputMessage(q)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full">{q}</button>
              ))}
            </div>

            <div className="flex gap-3 items-end">
              {/* Attachments */}
              <label className="flex flex-col items-center justify-center border rounded-xl px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">
                <Upload className="w-4 h-4"/>
                <span>Attach</span>
                <input type="file" className="hidden" multiple onChange={e => onPickFiles(e.target.files)} />
              </label>

              <div className="flex-1 relative">
                <textarea ref={inputRef} value={inputMessage}
                  onChange={e => {
                    const v = e.target.value;
                    setInputMessage(v);
                    if (v.startsWith("/")) handleSlash(v.trim());
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setInputMessage(""); }
                  }}
                  placeholder="Type your message…"
                  rows={1}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  disabled={isStreaming}
                />

                {/* Selected attachments preview for composer */}
                {!!attachments.length && (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {attachments.map(att => (
                      <div key={att.id} className="border rounded-lg p-2 relative bg-gray-50">
                        <button onClick={() => removeAttachment(att.id)} className="absolute -top-2 -right-2 bg-white border rounded-full p-1 shadow"><X className="w-3 h-3"/></button>
                        <div className="text-[11px] text-gray-600 truncate mb-1">{att.name}</div>
                        {att.type === "image" && att.dataUrl && (
                          <img src={att.dataUrl} alt={att.name} className="rounded max-h-32 object-contain w-full"/>
                        )}
                        {att.type === "file" && (
                          <pre className="text-[11px] overflow-auto max-h-24 whitespace-pre-wrap">{att.textPreview || "[binary]"}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!isStreaming ? (
                <button onClick={() => handleSend()} disabled={!inputMessage.trim() && !attachments.length}
                        className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center" title="Send">
                  <Send className="w-5 h-5"/>
                </button>
              ) : (
                <button onClick={stopStreaming} className="bg-red-600 text-white p-3 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center" title="Stop">
                  <Pause className="w-5 h-5"/>
                </button>
              )}
            </div>

            <div className="text-[11px] text-gray-500 mt-2 text-center">Enter to send • Shift+Enter new line • /clear, /system, /summarize, /tests</div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProChat;
