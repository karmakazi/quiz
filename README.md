# Trivia App

A real-time multiplayer trivia game with host and client views, using Socket.io for WebSocket communication.

## Features

- Host view with QR code for players to join
- Client view for answering multiple-choice questions
- Real-time player list with scores
- Game over screen showing winners
- Automatic reconnection if players refresh their browser
- Random question selection from a pool of 30 questions

## Tech Stack

- Node.js with Express for the server
- Socket.io for real-time communication
- Vanilla JavaScript for the client side
- QR code generation for easy joining

## Local Development

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```
4. Open your browser to http://localhost:3000 for the host view
5. Scan the QR code or visit http://localhost:3000/client from another device to join as a player

## Deployment Options

### Render (Recommended)

1. Create a Render account at https://render.com
2. Create a new Web Service
3. Connect your GitHub repository
4. Use the following settings:
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Deploy

### Railway

1. Create a Railway account at https://railway.app
2. Create a new project
3. Add a Node.js service
4. Connect your GitHub repository
5. Set the Start Command to `node server.js`
6. Deploy

### Fly.io

1. Install the Fly CLI:
   ```
   curl -L https://fly.io/install.sh | sh
   ```
2. Login:
   ```
   fly auth login
   ```
3. Launch the app:
   ```
   fly launch
   ```
4. Deploy:
   ```
   fly deploy
   ```

### Glitch

1. Create a Glitch account at https://glitch.com
2. Create a new project
3. Import from GitHub or upload the files
4. Glitch will automatically start your app

## Notes

- The app requires WebSocket support from the hosting provider
- Vercel, Netlify, and similar static site hosts do not support WebSockets and cannot run this app 