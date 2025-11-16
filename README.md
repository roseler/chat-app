# Secure Chat Application

A secure, end-to-end encrypted chat application with user authentication, featuring a simple black-themed UI for pure text messaging.

## Features

- 🔐 **User Authentication** - Secure registration and login with JWT tokens
- 🔒 **End-to-End Encryption** - Messages encrypted client-side using AES-256
- 💬 **Real-time Messaging** - WebSocket-based instant messaging
- 🎨 **Simple Black UI** - Minimalist dark theme interface
- 📱 **Pure Text Messages** - Text-only messaging (no media/files)

## Technology Stack

### Frontend
- React 18
- Socket.io-client
- Crypto-JS (AES encryption)
- React Router

### Backend
- Node.js + Express
- Socket.io (WebSocket)
- SQLite (database)
- JWT (authentication)
- bcrypt (password hashing)

## Project Structure

```
chat-app/
├── frontend/          # React frontend application
├── backend/           # Node.js backend server
├── PROJECT_PLAN.md    # Detailed project plan
└── README.md          # This file
```

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Install all dependencies:**
   ```bash
   npm run install-all
   ```

2. **Set up backend environment:**
   ```bash
   cd backend
   cp .env.example .env
   ```
   Edit `.env` and set your `JWT_SECRET` (use a strong random string in production)

3. **Initialize the database:**
   ```bash
   cd backend
   npm run init-db
   ```
   (The database will be created automatically on first server start)

4. **Start the development servers:**
   ```bash
   # From root directory
   npm run dev
   ```
   
   Or start them separately:
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend
   cd frontend
   npm start
   ```

5. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## Usage

1. **Register a new account** or **login** with existing credentials
2. **Select a user** from the sidebar to start chatting
3. **Type and send messages** - they are automatically encrypted
4. Messages are stored encrypted in the database (server cannot decrypt)

## Security Features

- Passwords are hashed using bcrypt
- Messages encrypted with AES-256-CBC before sending
- JWT tokens for authentication
- End-to-end encryption (server cannot read messages)
- Keys stored client-side in localStorage

## Development

### Backend Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run init-db` - Initialize database (auto-creates on first run)

### Frontend Scripts
- `npm start` - Start development server
- `npm run build` - Build for production

## Environment Variables

### Backend (.env)
```
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
DB_PATH=./database.sqlite
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Frontend
Create `.env` in frontend directory:
```
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_SOCKET_URL=http://localhost:3001
```

## Database Schema

- **users** - User accounts and public keys
- **messages** - Encrypted messages
- **sessions** - Active sessions (optional)

See `PROJECT_PLAN.md` for detailed schema.

## Notes

- Encryption keys are stored in browser localStorage
- For production, consider using more secure key storage
- Use HTTPS in production
- Change JWT_SECRET to a strong random value
- Consider migrating to PostgreSQL for production use

## License

MIT