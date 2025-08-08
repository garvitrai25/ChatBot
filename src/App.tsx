import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hello! I'm your AI assistant. You can ask questions, get weather or time info, or even upload/paste reference content for me to answer from!",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReferenceExpanded, setIsReferenceExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const predefinedQueries = [
    "What is the status of my purchase order?",
    "Show my purchase order details",
    "Check my invoice status",
    "Get status of my invoice"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageOverride?: string) => {
    const content = messageOverride || inputMessage;
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      text: content,
      isUser: true,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post('/chat', {
        message: content,
        context: referenceText
      });

      const botMessage: Message = {
        id: Date.now() + 1,
        text: response.data.response,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: 'Sorry, an error occurred. Please make sure the backend is running.',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
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

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white relative">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto p-4">
          <div className="flex items-center justify-center space-x-4">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-slate-900 animate-pulse"></div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent tracking-tight">
                AI Chatbot Assistant
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-1">KPMG</p>
            </div>
          </div>

          {/* Reference Context */}
          <div className="mt-4">
            <button
              onClick={() => setIsReferenceExpanded(!isReferenceExpanded)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-white/90 font-medium text-sm">Reference Context</span>
                {referenceText && (
                  <div className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                    {referenceText.length} chars
                  </div>
                )}
              </div>
              <svg className={`w-5 h-5 text-white/60 transition-transform duration-300 ${isReferenceExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${isReferenceExpanded ? 'max-h-48 mt-3' : 'max-h-0'}`}>
              <textarea
                className="w-full p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 resize-none"
                placeholder="Paste your reference text here for context-aware responses..."
                rows={4}
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 overflow-y-auto pt-[420px] pb-[168px] px-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`flex items-end space-x-3 max-w-2xl ${message.isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`px-6 py-4 rounded-2xl shadow-xl backdrop-blur-sm border transition-all duration-300 hover:scale-[1.02] ${
                message.isUser
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-500/20 rounded-br-md shadow-blue-500/25'
                  : 'bg-white/10 text-white border-white/10 rounded-bl-md hover:bg-white/15'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{message.text}</p>
                <p className={`text-xs mt-3 font-medium ${message.isUser ? 'text-blue-100' : 'text-slate-400'}`}>{formatTime(message.timestamp)}</p>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Buttons at Bottom */}
      <div className="fixed bottom-[88px] left-0 right-0 z-20 bg-transparent">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex space-x-2 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {predefinedQueries.map((query, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(query)}
                className="whitespace-nowrap px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition text-xs sm:text-sm font-medium text-blue-200"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input Box */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/20 backdrop-blur-xl border-t border-white/10 p-4">
        <div className="flex max-w-5xl mx-auto space-x-4">
          <div className="flex-1 relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              className="w-full px-6 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/15 transition-all duration-300 resize-none text-sm font-medium"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!inputMessage.trim() || isLoading}
            className="group relative px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:hover:scale-100"
          >
            <div className="flex items-center space-x-2">
              <svg className={`w-5 h-5 transition-transform duration-300 ${isLoading ? 'animate-spin' : 'group-hover:translate-x-0.5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isLoading ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                )}
              </svg>
              <span className="font-medium text-sm hidden sm:block">{isLoading ? 'Sending...' : 'Send'}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
