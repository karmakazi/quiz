# Trivia Game

A real-time multiplayer trivia game similar to those found in bars. Uses WebSockets to connect a host screen with multiple player devices.

## Features

- Host view with QR code for players to join
- Real-time player list with scores
- Multiple-choice questions with instant feedback
- Score tracking and winner announcement
- Dark mode UI with blue accents
- Automatic reconnection if a player refreshes their browser

## Technology Stack

- Express.js server
- Socket.io for real-time communication
- Vanilla JavaScript for client-side logic
- Responsive design for various device sizes

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Run the server:

```bash
node server.js
```

4. Open the host view in your browser:
   - The console will show you the local URL to access
   - By default: http://localhost:3000

5. Players can connect by:
   - Scanning the QR code on the host screen
   - Visiting the client URL shown below the QR code

## How to Play

1. Host opens the host view and waits for players to join
2. Players scan the QR code or enter the URL
3. Once all players have joined, the host clicks "Start Game"
4. Players answer multiple-choice questions on their devices
5. Scores update after each question
6. After 5 rounds, winners are announced

## License

MIT 