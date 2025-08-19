import React, { useState, useRef, useEffect } from 'react';
import { Send, Settings, MessageCircle, Bot, User, Check, X, Eye, EyeOff, Copy, CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ModelConfig {
  apiKey: string;
  selectedModel: string;
  baseUrl: string;
}

interface Model {
  id: string;
  name: string;
  description: string;
  provider: string;
}

// NEW: Assistant persona styles
type AssistantStyle = 'Default' | 'Claude' | 'ChatGPT' | 'Qwen';

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


const AVAILABLE_MODELS: Model[] = [
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: 'Qwen2.5 Coder 32B Instruct',
    description: 'Advanced coding and programming capabilities - Free tier',
    provider: 'Qwen'
  },
  {
    id: 'qwen/qwen-2-7b-instruct:free',
    name: 'Qwen2 7B Instruct',
    description: 'General purpose model with good performance - Free tier',
    provider: 'Qwen'
  },
  {
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    name: 'Llama 3.2 3B Instruct',
    description: 'Efficient and capable model from Meta - Free tier',
    provider: 'Meta'
  },
  {
    id: 'meta-llama/llama-3.2-1b-instruct:free',
    name: 'Llama 3.2 1B Instruct',
    description: 'Lightweight but capable model - Free tier',
    provider: 'Meta'
  },
  {
    id: 'huggingface/zephyr-7b-beta:free',
    name: 'Zephyr 7B Beta',
    description: 'Fine-tuned for helpful, harmless, and honest responses - Free tier',
    provider: 'HuggingFace'
  },
  {
    id: 'google/gemma-2-9b-it:free',
    name: 'Gemma 2 9B IT',
    description: "Google's instruction-tuned model - Free tier",
    provider: 'Google'
  },
  {
    id: 'microsoft/phi-3-mini-128k-instruct:free',
    name: 'Phi-3 Mini 128K Instruct',
    description: 'Compact model with large context window - Free tier',
    provider: 'Microsoft'
  },
  {
    id: 'nousresearch/nous-capybara-7b:free',
    name: 'Nous Capybara 7B',
    description: 'Conversational AI model with good reasoning - Free tier',
    provider: 'Nous Research'
  },
  {
    id: 'openai/gpt-oss-20b:free',
    name: 'Sample code and API for gpt-oss-20b',
    description: 'Conversational AI model with good reasoning - Free tier',
    provider: 'openai'
  }
];

const HuggingFaceChatApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<'setup' | 'chat'>('setup');
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    apiKey: '',
    selectedModel: '',
    baseUrl: 'https://openrouter.ai/api/v1'
  });
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [assistantStyle, setAssistantStyle] = useState<AssistantStyle>('Claude');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const testConnection = async (config = modelConfig): Promise<boolean> => {
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'OpenRouter Chat Interface',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.selectedModel,
          messages: [
            { role: 'system', content: STYLE_PROMPTS[assistantStyle] },
            {
              role: 'user',
              content: "Reply with exactly: Connection successful",
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim?.();
      return text && /Connection successful/i.test(text);
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  };

  const handleConnect = async () => {
    const modelToUse = isCustomModel ? customModelId : modelConfig.selectedModel;

    if (!modelConfig.apiKey || !modelToUse) {
      alert('Please fill in all required fields');
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('idle');

    const configToTest = { ...modelConfig, selectedModel: modelToUse };

    const isConnected = await testConnection(configToTest);

    if (isConnected) {
      setModelConfig((prev) => ({ ...prev, selectedModel: modelToUse }));
      setConnectionStatus('success');
      setTimeout(() => {
        setCurrentView('chat');
        const modelName = isCustomModel
          ? customModelId
          : AVAILABLE_MODELS.find((m) => m.id === modelToUse)?.name || modelToUse;
        setMessages([
          {
            id: '1',
            role: 'assistant',
            content: `## Connected\n\nYou're good to go. I'm running on **${modelName}** with the **${assistantStyle}** persona.\n\n> Tip: Ask a question and I'll answer in clean, structured Markdown.`,
            timestamp: new Date(),
          },
        ]);
      }, 600);
    } else {
      setConnectionStatus('error');
    }

    setIsConnecting(false);
  };

  const buildPayloadMessages = (userMessage: Message) => {
    // Always include a system message for persona formatting
    const history = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
    return [{ role: 'system', content: STYLE_PROMPTS[assistantStyle] }, ...history];
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${modelConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${modelConfig.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'OpenRouter Chat Interface',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelConfig.selectedModel,
          messages: buildPayloadMessages(userMessage),
          // You can expose temperature/top_p here if needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();

      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error('Invalid response format from OpenRouter API');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `## Uh‑oh!\n\nI hit an error: **${error instanceof Error ? error.message : 'Unknown error'}**.\n\n**Try**\n- Re-check your API key\n- Confirm the model ID\n- Ensure your base URL is correct`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      console.error('Failed to copy text');
    }
  };

  if (currentView === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">OpenRouter Chat Interface</h1>
            <p className="text-gray-600">Connect to powerful AI models with free tier access</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">OpenRouter API Key *</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={modelConfig.apiKey}
                  onChange={(e) => setModelConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-or-v1-..."
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  title={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Get your free API key from{' '}
                <a
                  href="https://openrouter.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  openrouter.ai
                </a>
                . Format: sk-or-v1-...
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assistant Style</label>
              <select
                value={assistantStyle}
                onChange={(e) => setAssistantStyle(e.target.value as AssistantStyle)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              >
                {(['Claude', 'ChatGPT', 'Qwen', 'Default'] as AssistantStyle[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Controls tone + formatting of responses using a system prompt.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Model Selection *</label>

              {/* Model Type Toggle */}
              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modelType"
                    checked={!isCustomModel}
                    onChange={() => setIsCustomModel(false)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Popular Models</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modelType"
                    checked={isCustomModel}
                    onChange={() => setIsCustomModel(true)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Custom Model</span>
                </label>
              </div>

              {/* Model Selection */}
              {!isCustomModel ? (
                <select
                  value={modelConfig.selectedModel}
                  onChange={(e) => setModelConfig((prev) => ({ ...prev, selectedModel: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                >
                  <option value="">Choose a model...</option>
                  {AVAILABLE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.provider}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    placeholder="Enter model ID (e.g., anthropic/claude-3-opus, openai/gpt-4)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-yellow-800 mb-1">Custom Model Examples:</h4>
                    <div className="text-xs text-yellow-700 space-y-1">
                      <div>
                        • <code className="bg-yellow-100 px-1 rounded">anthropic/claude-3-opus</code>
                      </div>
                      <div>
                        • <code className="bg-yellow-100 px-1 rounded">openai/gpt-4-turbo</code>
                      </div>
                      <div>
                        • <code className="bg-yellow-100 px-1 rounded">cohere/command-r-plus</code>
                      </div>
                      <div>
                        • <code className="bg-yellow-100 px-1 rounded">perplexity/llama-3-sonar-large-32k-online</code>
                      </div>
                    </div>
                    <p className="text-xs text-yellow-600 mt-2">
                      ⚠️ Note: Custom models may require credits. Check <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="underline">OpenRouter models page</a> for pricing.
                    </p>
                  </div>
                </div>
              )}

              {/* Model Description */}
              {!isCustomModel && modelConfig.selectedModel && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    {AVAILABLE_MODELS.find((m) => m.id === modelConfig.selectedModel)?.description}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
              <input
                type="url"
                value={modelConfig.baseUrl}
                onChange={(e) => setModelConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://openrouter.ai/api/v1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={isConnecting || !modelConfig.apiKey || (!modelConfig.selectedModel && !customModelId)}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Testing Connection...
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5" />
                  Connect & Start Chatting
                </>
              )}
            </button>

            {connectionStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <Check className="w-5 h-5" />
                <span>Connection successful! Redirecting to chat...</span>
              </div>
            )}

            {connectionStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
                <X className="w-5 h-5" />
                <span>Connection failed. Please check your API key and try again.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-800 truncate">
              {isCustomModel && customModelId
                ? customModelId
                : AVAILABLE_MODELS.find((m) => m.id === modelConfig.selectedModel)?.name || 'AI Assistant'}
            </h1>
            <p className="text-xs text-gray-500">Connected via OpenRouter • Persona: {assistantStyle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={assistantStyle}
            onChange={(e) => setAssistantStyle(e.target.value as AssistantStyle)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            title="Assistant persona"
          >
            {(['Claude', 'ChatGPT', 'Qwen', 'Default'] as AssistantStyle[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => setCurrentView('setup')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4 py-4 md:py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`group relative flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}

              <div
                className={`max-w-3xl rounded-2xl px-4 py-3 shadow-sm ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm md:prose-base max-w-none prose-pre:rounded-xl prose-pre:border prose-pre:border-gray-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
                <div className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}

              {message.role === 'assistant' && (
                <button
                  onClick={() => handleCopy(message.content, message.id)}
                  className="opacity-0 group-hover:opacity-100 absolute -right-2 -top-2 bg-white/90 border border-gray-200 rounded-lg p-1.5 shadow hover:bg-white transition"
                  title="Copy message"
                >
                  {copiedId === message.id ? <CheckCheck className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
                </button>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-8 h-8 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  <span className="text-gray-600">Thinking…</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-3 md:px-4 py-3 md:py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message…"
                rows={1}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none transition-all"
                style={{ minHeight: '48px', maxHeight: '140px' }}
                disabled={isLoading}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
              title="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
};

export default HuggingFaceChatApp;
