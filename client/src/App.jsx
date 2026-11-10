import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './state.jsx';
import Auth from './pages/Auth.jsx';
import Layout from './pages/Layout.jsx';
import Chat from './pages/Chat.jsx';
import Meet from './pages/Meet.jsx';
import Library from './pages/Library.jsx';
import DocEditor from './pages/DocEditor.jsx';
import DeckEditor from './pages/DeckEditor.jsx';
import logo from './logo.png';

export default function App() {
  const { user, booting } = useApp();
  if (booting) return <div className="splash"><div className="logo big">
  <img src={logo} alt="Huddle Logo" />
</div></div>;
  if (!user) return <Auth />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat/:channelId?" element={<Chat />} />
        <Route path="/meet/:room?" element={<Meet />} />
        <Route path="/docs" element={<Library kind="docs" />} />
        <Route path="/slides" element={<Library kind="decks" />} />
      </Route>
      <Route path="/docs/:id" element={<DocEditor />} />
      <Route path="/slides/:id" element={<DeckEditor />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
