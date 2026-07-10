# 🚀 ChatGPT Clone

[![React](https://img.shields.io/badge/React-v18.2.0-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai&logoColor=white)](https://openai.com/)
[![React Markdown](https://img.shields.io/badge/React_Markdown-v10.1.0-blue)](https://github.com/remarkjs/react-markdown)
[![Remark GFM](https://img.shields.io/badge/Remark_GFM-v4.0.1-green)](https://github.com/remarkjs/remark-gfm)
[![Syntax Highlighter](https://img.shields.io/badge/React_Syntax_Highlighter-v16.1.1-orange)](https://github.com/react-syntax-highlighter/react-syntax-highlighter)
[![CSS3](https://img.shields.io/badge/CSS3-v3.0-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

# 🤖 ChatGPT Clone

A modern ChatGPT-inspired AI chatbot built with **React** and powered by the **OpenAI GPT-4o API**. The application delivers real-time AI conversations with markdown rendering, syntax-highlighted code blocks, responsive design, and an intuitive user experience.

## 🌐 Live Demo

**https://chatgptclonee.vercel.app/**

---

# ✨ Features / Highlights

### 🤖 AI Chat

- Real-time conversations powered by OpenAI GPT-4o
- Maintains complete conversation history
- Separate layouts for user and AI messages
- Smooth loading indicator while generating responses

### 💻 Rich Markdown & Code Rendering

- GitHub Flavored Markdown (GFM) support
- Beautiful syntax-highlighted code blocks
- Prism One Dark theme
- Supports tables, lists, headings, links, and inline code

### 🎨 User Experience

- Auto-resizing textarea (up to 200px)
- Automatic scrolling to the latest message
- Responsive ChatGPT-inspired interface
- Clean UI built with custom CSS

### ⚡ Productivity Features

- Copy AI responses with one click
- Visual confirmation after copying
- Stop response generation using AbortController
- New Chat button
- Quick predefined prompts
- GitHub profile shortcut

### 🛡️ Robust Error Handling

- Invalid API Keys (401)
- Permission / Model Access Errors (403)
- Rate Limits (429)
- Server Errors (500+)
- Network Failures
- Silent cancellation of aborted requests

---

# 📸 Screenshots

### 🏠 Home

![Home](./screenshots/Home.png)

### 💬 AI Conversation

![Conversation](./screenshots/Conversation.png)

### 💻 Code Generation

![Code Generation](./screenshots/CodeGeneration.png)

### 📱 Responsive Design

![Responsive](./screenshots/Responsive.png)

---

# 🛠️ Tech Stack

### Frontend

- React 18.2.0
- JavaScript (ES6+)
- Custom CSS

### AI Integration

- OpenAI Node SDK (v5.12.2)
- GPT-4o

### Markdown & Code Rendering

- react-markdown
- remark-gfm
- react-syntax-highlighter
- Prism (One Dark Theme)

### Deployment

- Vercel

---

# ⚙️ Setup & Installation

## 1. Clone the repository

```bash
git clone https://github.com/your-username/chatgpt-clone.git
```

## 2. Navigate to the project

```bash
cd chatgpt-clone
```

## 3. Install dependencies

```bash
npm install
```

## 4. Create a `.env` file

```env
REACT_APP_BLUESMINDS_API_KEY=your_api_key
```

## 5. Start the development server

```bash
npm start
```

Open your browser and visit:

```text
http://localhost:3000
```

---

# 📁 Project Structure

```text
chatgpt-clone/
│
├── public/
├── src/
│   ├── Components/
│   ├── assets/
│   ├── App.js
│   ├── openai.js
│   ├── index.js
│   └── App.css
│
├── screenshots/
├── .env
├── package.json
└── README.md
```

---

## ⭐ Support

If you found this project helpful, consider giving it a ⭐ on GitHub.