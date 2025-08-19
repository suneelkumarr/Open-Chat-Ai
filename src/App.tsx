import React, { Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";

// Lazy-load chat screens
const ProChat = lazy(() => import("./components/ProChat"));
const HuggingFaceChatApp = lazy(() => import("./components/HuggingFaceChatApp"));

// Simple Home page
function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-100">
      <div className="bg-white shadow-xl rounded-2xl p-10 max-w-lg w-full text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Choose Your Chat</h1>
        <p className="text-gray-600 mb-8">Pick which chat experience you’d like to use.</p>
        <div className="space-y-4">
          <NavLink
            to="/pro"
            className="block w-full py-3 px-6 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-all text-center"
          >
            🚀 Pro Chat (Modern Features)
          </NavLink>
          <NavLink
            to="/huggingface"
            className="block w-full py-3 px-6 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition-all text-center"
          >
            🤖 HuggingFace Chat
          </NavLink>
        </div>
      </div>
    </div>
  );
}

// Optional: layout with a top bar + nav links
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b px-4 py-3">
        <nav className="max-w-6xl mx-auto flex items-center gap-4 text-sm">
          <NavLink to="/" className={({ isActive }) => isActive ? "text-blue-600 font-semibold" : "text-gray-700"}>
            Home
          </NavLink>
          <NavLink to="/pro" className={({ isActive }) => isActive ? "text-blue-600 font-semibold" : "text-gray-700"}>
            ProChat
          </NavLink>
          <NavLink to="/huggingface" className={({ isActive }) => isActive ? "text-blue-600 font-semibold" : "text-gray-700"}>
            HuggingFaceChat
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="p-10 text-center text-gray-600">
            Loading…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pro" element={<ProChat />} />
          <Route path="/huggingface" element={<HuggingFaceChatApp />} />

          {/* Redirect legacy/unknown paths to home or 404 */}
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

// Simple 404
function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-3xl font-semibold mb-2">404</h2>
        <p className="text-gray-600 mb-6">Page not found.</p>
        <NavLink
          to="/"
          className="inline-block px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Go Home
        </NavLink>
      </div>
    </div>
  );
}
