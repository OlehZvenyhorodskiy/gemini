# NEXUS: Stop Typing. Start Talking.

## Inspiration
Current AI tools suffer from extreme fragmentation. You have one tab for code, another for image generation, a third for research, and a fourth for data. Modern UIs are cluttered with buttons, dropdowns, and dashboards. We realized that **the highest bandwidth interface between human and machine isn't a keyboard and mouse — it's voice and vision.** 

We built NEXUS to prove that a single, unified conversational interface powered by Gemini 2.5 Flash Native Audio can entirely replace complex, multi-tool dashboards.

## What it does
NEXUS is an intelligent orchestrator wrapping 14 specialized Agent Modes into a single continuous voice session. Instead of switching apps, you seamlessly switch **modes** while staying in the same fluid conversation. 

- **Live Mode**: Sub-second voice conversation with Gemini.
- **Navigator Mode**: Autonomous web browsing using Playwright (you see what the AI sees through bounded boxes on screenshots).
- **Creative Mode**: Generative UI and image generation interlaced with real-time audio storytelling.
- **Code Copilot**: Context-aware code reviews.
- **Security Scanner**: OWASP scanning analysis.
...and 9 others, including Research (powered by Google ADK), Data Analysis, and Meeting Facilitator.

**Key Features:**
1. **True Multimodality**: Streams audio, video (webcam/screenshare), and tool calls in real-time.
2. **Generative UI Design**: Instead of raw JSON, NEXUS renders beautifully glassmorphic widgets (timers, weather, polls, charts) directly onto an infinite spatial canvas.
3. **Smart Barge-In**: Employs real-time VAD (Voice Activity Detection) so you can interrupt the agent instantly.
4. **Agent Development Kit (ADK)**: Uses deeply grounded research fallback for complex factual inquiries.
5. **Chameleon UI**: The app's theme dynamically adapts based on the agent's actions and conversation tone.

## How we built it
- **Backend**: Python + FastAPI + Uvicorn + Websockets. 
- **AI Core**: Google GenAI SDK (`gemini-2.5-flash-native-audio-latest`), Google ADK.
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, Framer Motion for smooth spatial canvas manipulations.
- **Deployment**: containerized via Docker and deployed to Google Cloud Run for elastic scalability. 

We used the **Gemini Multimodal Live API** through a persistent WebSocket bridge. When you speak, raw PCM audio streams directly to Gemini. When Gemini speaks, base64 audio and text are concurrently streamed to the frontend, interlaced with `function_call` intercepts that we capture to trigger physical browser actions (via Playwright) or UI animations.

## Challenges we ran into
Handling **concurrent audio streams and interruptions** over a single WebSocket was incredibly tricky. The Gemini Live API sends audio chunks incredibly fast. If a user interrupts, not only did we need to send the interrupt signal to the backend, but we also had to forcefully flush the frontend's audio playback queue and the backend's `asyncio.Queue` simultaneously to avoid the agent "talking over itself" with buffered audio. 

Another major challenge was **UI routing for 14 different states** without overwhelming the user. We solved this by using an infinite spatial canvas where messages pop up organically, rather than an endless scrolling terminal.

## Accomplishments that we're proud of
1. Engineering a **zero-block asynchronous pipeline**: The frontend, backend router, and Gemini Live API all communicate with zero blocking, achieving <800ms voice-to-voice latency.
2. **The Visual Navigator**: We built a custom Playwright wrapper that intercepts Gemini's vision, draws bounding boxes over interactive elements, and returns it to the user in the UI. 
3. **Antigravity Aesthetics**: The UI looks like it belongs in 2030. Smooth spatial layouts, reactive audio visualizers, and premium glassmorphic overlays.

## What we learned
We learned the true power of **Function Calling** over the Live API. We initially thought of it just as a way to fetch data, but we realized function calls can be used to **drive the application state** itself (like the Chameleon UI dynamically changing the website's CSS theme based on what the agent thinks fits the mood). 

## What's next for NEXUS
- **Full Google ADK implementation**: Transitioning the remaining 10 agents to the ADK standard.
- **Local Memory & RAG**: Tying Firestore directly into the memory system for infinite context spanning across days.
- **Jedi Gestures Action**: Finalizing the MediaPipe vision integration so a hand swipe physically switches the agent mode.
