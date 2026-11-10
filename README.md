# Huddle

A Microsoft Teams–style workspace on the MERN stack: real-time chat, video meetings, collaborative documents and a slide editor.

## Features

- **Chat**: teams, channels, DMs, replies, emoji reactions, edit/delete, typing indicators, search, `@mentions`, `**bold**`, `` `code` ``, online presence, one-click "Meet" from any channel
- **Meet**: WebRTC video calls (up to 8 people), mic/camera toggles, screen sharing, shareable invite link
- **Docs**: rich-text editor (Quill) with live multi-user editing, autosave, who's-editing avatars, HTML export, print
- **Slides**: drag/resize text, shapes and images, slide thumbnails, backgrounds, full-screen present mode, live sync, **export to .pptx**
- Auth with JWT, light and dark theme, mobile-friendly layout

## Run it

You need Node 18+ and MongoDB (local, or an Atlas URI).

```bash
# 1. server
cd server
cp .env.example .env      # set MONGO_URI and JWT_SECRET
npm install
npm run dev               # http://localhost:5000

# 2. client (new terminal)
cd client
npm install
npm run dev               # http://localhost:5173
```

Open http://localhost:5173 and sign up. Create a team, then share its invite code with teammates so they can sign up and join. Start a meeting and share the meeting link; attendees must be signed in to Huddle. Use separate browsers or devices to test calls.

