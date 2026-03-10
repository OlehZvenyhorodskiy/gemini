# NEXUS — The Multimodal AI Agent Platform

> 🏆 **Built for the Gemini Live Agent Challenge**
>
> *Authentication: Bi-directional WebSocket Streaming | Vision: Real-time PCM/Video Processing | Architecture: Multi-Agent Swarm*

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.12%2B-blue)
![Next.js](https://img.shields.io/badge/next.js-15.1-black)
![Gemini](https://img.shields.io/badge/AI-Gemini%202.5-4285F4)

## 💡 Problem Statement

**Who is this for?** Developers, creators, and knowledge workers who are drowning in context-switching between dozens of specialized tools — one for code, one for design, one for research, one for meetings, one for security audits.

**The pain:** Today's AI assistants are text-only chat windows. They can't *see* your screen, *hear* your voice in real time, *navigate* websites for you, or *generate* visual content on the fly. You're constantly copy-pasting context between tools, losing your flow state, and fighting against interfaces that weren't designed for multimodal interaction.

**NEXUS solves this** by providing a single, always-present AI companion that unifies 11 specialized agent personas into one real-time voice-and-vision interface. Instead of switching tabs, you switch *modes* — talk to a Code Copilot, pivot to a Security Scanner, then ask the Creative Storyteller to illustrate your idea, all without leaving the conversation. The agent sees what you see, hears what you say, and acts on your behalf through tools like browser automation, web search, and image generation.

**NEXUS** is a next-generation multimodal AI agent that doesn't just chat—it **sees**, **hears**, **navigates**, and **creates** alongside you. 

Powered by **Google Gemini 2.5 Flash & Pro**, NEXUS operates as a real-time WebSocket relay, bridging a sleek Next.js frontend with a powerful Python backend to deliver a "JARVIS-like" experience. It features a **Swarm Architecture** where specialized sub-agents (Coder, Navigator, Storyteller, Security Analyst) are dynamically consulted based on your needs.

---

## 🌟 Key Features

### 1. 🗣️ **Live Agent (The Core)**
*   **Real-time Voice Conversation:** Low-latency, bi-directional audio streaming using raw PCM data.
*   **Vision-Capable:** Sees what you see via camera or screen sharing.
*   **Barge-in Support:** You can interrupt the agent naturally, and it stops speaking immediately.
*   **Memory & Context:** Remembers facts about you and your environment across the session.

### 2. 🧠 **Multi-Agent Swarm (11+ Specialized Modes)**
NEXUS isn't just one bot; it's a team of experts. The system routes your intent to the best suited persona:

| Mode | Icon | Specialization |
| :--- | :--- | :--- |
| **Live** | 🗣️ | General-purpose assistant, witty and helpful. |
| **Creative** | ✍️ | **Storyteller & Artist.** Generates interleaved text + images + audio. |
| **Navigator** | ☸️ | **Browser Copilot.** Uses Playwright to click, scroll, and type on websites. |
| **Code** | 💻 | **10x Engineer.** Reads your local files, debugs code, and architects solutions. |
| **Security** | 🛡️ | **InfoSec Analyst.** Scans URLs/screens for phishing and vulnerabilities. |
| **Research** | 🔬 | **Deep Search.** Synthesizes data from the web with citations. |
| **Data** | 📊 | **Statistician.** Analyzes charts and datasets visually. |
| **Meeting** | 📝 | **Chief of Staff.** Listens to meetings and outputs structured minutes. |
| **Game** | 🎲 | **Dungeon Master.** Runs interactive RPG campaigns. |
| **Music** | 🎵 | **Producer.** Analyzes theory, suggests chord progressions. |
| **Language** | 🈯 | **Tutor.** Immersive language learning coach. |

### 3. 🛠️ **Advanced Tool Use**
*   **Screen Navigation:** Can physically interact with websites (click, type, scroll) using Computer Vision and DOM analysis.
*   **Media Generation:** Creates images and storyboards on the fly.
*   **Local File Access:** The 'Code' agent can read your project files to give context-aware advice.
*   **UI Mutation:** The agent can change its own frontend theme (Dark, Light, Midnight, etc.) and render interactive widgets (timers, polls) based on the conversation.

---

## 🏗️ Architecture

The system uses a **WebSocket Relay** pattern to maintain a persistent, stateful connection between the user and the Gemini Live API.

```mermaid
graph LR
    User[User / Browser] <-->|WebSocket (Audio/Video/JSON)| NextJS[Next.js Frontend]
    NextJS <-->|WebSocket Relay| FastAPI[FastAPI Backend]
    
    subgraph "Backend Core"
        FastAPI --> SessionMgr[Session Manager]
        SessionMgr --> Router[Agent Router]
        Router -->|Live Mode| LiveAgent[Gemini Live API]
        Router -->|Tool Call| Tools[Tool Engine]
    end
    
    subgraph "Tool Ecosystem"
        Tools -->|Browser Control| Playwright[Playwright]
        Tools -->|File System| FS[Local Files]
        Tools -->|Image Gen| Imagen[Imagen 3]
        Tools -->|Search| Google[Google Search]
    end
```

---

## 🛠️ Tech Stack

### **Frontend**
*   **Framework:** Next.js 15 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS 4, Framer Motion (Animations)
*   **State:** Zustand
*   **Icons:** Lucide React
*   **Audio/Video:** Native Web Audio API + MediaStream

### **Backend**
*   **Server:** FastAPI + Uvicorn
*   **AI SDK:** `google-genai` (Official Gemini SDK)
*   **Browser Automation:** Playwright
*   **Image Processing:** Pillow
*   **Database:** Firestore (for session persistence)

---

## 🚀 Getting Started

### Prerequisites
*   **Python 3.12+**
*   **Node.js 22+**
*   **Google Cloud Project** with the **Gemini API** enabled.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/nexus-agent.git
cd nexus-agent
```

### 2. Backend Setup
Create a virtual environment and install dependencies.

```bash
# Create venv
python -m venv venv

# Activate venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browsers (for Navigator mode)
playwright install chromium
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cd ..
```

### 4. Configuration
Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your keys:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
PORT=8080
```

### 5. Running the App

**Option A: Using Helper Scripts (Windows)**
```powershell
# Run the backend
.\run_backend.ps1

# In a new terminal, run the frontend
.\run_frontend.ps1
```

**Option B: Manual Start**
```bash
# Terminal 1: Backend
uvicorn backend.main:app --reload --port 8080

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open your browser to **[http://localhost:3000](http://localhost:3000)** (or the port shown in your frontend terminal).

---

## 📂 Project Structure

```
C:\Projects\GEMINI-hackaton\
├── backend/
│   ├── agents/           # Agent definitions (Nexus, Specialized modes)
│   ├── streaming/        # WebSocket & Audio/Video handling
│   ├── tools/            # Tool implementations (Code, Creative, Navigator)
│   ├── main.py           # FastAPI entry point
│   └── nexus_agent.py    # Core agent logic
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js App Router pages
│   │   ├── components/   # React components (Visualizer, Chat, UI)
│   │   └── lib/          # Utilities
│   └── package.json
├── .env                  # Environment variables
├── Dockerfile            # Production build
├── cloudbuild.yaml       # CI/CD configuration
└── requirements.txt      # Python dependencies
```

---

## ☁️ Deployment (Google Cloud Run)

NEXUS is designed to run statelessly on Cloud Run.

1.  **Build with Cloud Build:**
    ```bash
    gcloud builds submit --config cloudbuild.yaml
    ```

2.  **Deploy:**
    ```bash
    gcloud run deploy nexus-agent \
      --image gcr.io/YOUR_PROJECT_ID/nexus-agent \
      --platform managed \
      --allow-unauthenticated
    ```

---

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.
1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
