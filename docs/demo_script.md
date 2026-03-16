# 🎬 Сценарий демо-видео проекта NEXUS (Тайминг: ~3:45)

**Формат:** Запись экрана с вашим закадровым голосом (voiceover)
**Разрешение:** Оптимально 1080p или 4K
**Стиль:** Динамичный, живой, без "роботизированных" пауз
**Язык озвучки:** Английский (написан так, чтобы звучать максимально естественно и "по-человечески")

> Внимание: Читайте текст непринужденно, делайте легкие паузы, как будто рассказываете это другу-программисту.

---

### [0:00 - 0:20] THE HOOK (Вступление)

**🎥 Действия на экране:**
1. Покажите полностью черный экран, который плавно переходит в загрузку главной страницы (Landing Page) NEXUS.
2. Обратите внимание зрителя на эффект анимации курсора и частиц на фоне.
3. Медленно проскролльте вниз через плашки фичей ("See, Hear, Speak, Create").
4. Спуститесь к карусели агентов (Agent Carousel) и кликните по 3-4 разным карточкам агентов, чтобы показать их разнообразие.
5. Нажмите кнопку "Get Started", чтобы войти в основной интерфейс чата.

**🗣️ Текст для озвучки (Narration):**
> "Stop endlessly typing, honestly. Start talking instead. Right now, think about it... if you need some code help, you pop open one tool. Need an image? You switch tabs. Research? Another app entirely. It's a disjointed mess. So, we kinda took a step back and asked ourselves—what if just one, voice-centered AI companion could handle literally all of that? Right in real time. Well, this is NEXUS."

---

### [0:20 - 0:45] LIVE AGENT & VISION (Общение и зрение)

**🎥 Действия на экране:**
1. Покажите состояние подключения во вкладке "Live" (должна быть активна).
2. Обратите внимание на аудио-визуализатор (AudioVisualizer) — он должен плавно "дышать" в ожидании.
3. Естественным тоном скажите (обращаясь к приложению): *"Hey NEXUS, what do you see right now?"*
4. Включите трансляцию с камеры в интерфейсе. Дайте агенту секунду, чтобы он описал ваше лицо, предмет в руке или обстановку вокруг.

**🗣️ Текст для озвучки (Narration):**
> "So first up, we have the Live Agent. We're connecting straight into Gemini's native audio streaming API using a persistent WebSocket here. There's zero clunky text-to-speech going on. No speech-to-text middlemen. It’s just pure, end-to-end audio flowing back and forth—clocking in under 200 milliseconds, which is crazy fast. Just watch this for a sec."

---

### [0:45 - 1:10] INSTANT BARGE-IN (Перебивание агента)

**🎥 Действия на экране:**
1. Пока агент всё ещё рассказывает о том, что видит на камере, физически перебейте его, громко сказав: *"Actually, hold on—"*
2. Продемонстрируйте, как агент мгновенно замолкает, а визуализатор переключается обратно в режим "слушания".

**🗣️ Текст для озвучки (Narration):**
> "Did you catch that instant barge-in? The millisecond I interrupted, NEXUS completely flushed the buffered audio—suspended the AudioContext, and pivoted right back to listening mode. No annoying overlap. Not an ounce of echo. It genuinely feels like a natural conversation. As for the visualizer you see right there... that's a 64-bar radial waveform. It is literally reacting to the raw speech frequency data in real time, not just some random animation."

---

### [1:10 - 1:30] CREATIVE STORYTELLER (Креативный режим)

**🎥 Действия на экране:**
1. Кликните на вкладку "Creative Studio" (покажите плавную анимацию перехода Framer Motion).
2. Скажите голосом или напишите текстом: *"Tell me a short story about a robot who discovers music for the first time. Generate images for each scene."*
3. Подождите и покажите, как агент стримит текст, который тут же перемежается со сгенерированными картинками.

**🗣️ Текст для озвучки (Narration):**
> "Next up, let's look at the Creative Storyteller. The cool thing about NEXUS is it doesn't force you to pick between text and images. Thanks to Gemini's native interleaved output tricks, it actually weaves regular prose and visuals together. The result? A perfectly seamless narrative stream."

---

### [1:30 - 1:55] STORY CHOICES (Интерактивные сюжеты)

**🎥 Действия на экране:**
1. Прокрутите вниз ответа агента, чтобы показать появившиеся красивые кнопки выбора сюжета ("Story Choice").
2. Нажмите на один из предложенных вариантов сюжета.
3. Покажите, как история мгновенно продолжает развиваться по выбранному вами пути.

**🗣️ Текст для озвучки (Narration):**
> "Now, this right here is where the magic happens—interactive story branching. The agent pulls down a custom tool to render these sleek UI buttons straight into our chat. I just click one, and boom, the story adapts instantly. Calling this a chatbot? That'd be an insult. This is essentially a collaborative storytelling engine."

---

### [1:55 - 2:35] UI NAVIGATOR & PLAYWRIGHT (Навигация в браузере)

**🎥 Действия на экране:**
1. Переключитесь на вкладку "UI Navigator". Включите функцию "Screen Share" (Демонстрация экрана).
2. Скажите агенту: *"Navigate to GitHub and search for 'gemini live agent challenge'."*
3. Подождите пару секунд, пока NEXUS на бэкенде использует Playwright, открывает Chrome, заходит на GitHub, вводит запрос и делает скриншот.
4. Покажите, как скриншот появляется в боковой панели (Workspace Canvas), а агент комментирует то, что видит.

**🗣️ Текст для озвучки (Narration):**
> "Moving on—the UI Navigator. NEXUS doesn't just sit there describing screens to you, it actually *acts* on them. Underneath the hood, we're leveraging Playwright to steer a headless Chromium browser around. Whenever Gemini issues a function call—say, `navigate` or `click_element`—our tool router dispatches it immediately, snaps a screenshot, and feeds that right back. Honestly, the agent looks at the page through this cool Terminator Vision, finds interactive elements, and just handles the actions entirely on its own."

---

### [2:35 - 3:00] GENERATIVE UI & CHAMELEON THEME (Генеративный интерфейс)

**🎥 Действия на экране:**
1. Переключитесь обратно в режим "Live".
2. Скажите: *"Set a 5-minute timer for my coffee break."* → Покажите, как в чате красиво появляется виджет таймера.
3. Скажите: *"Create a quick poll — what's better: React or Vue?"* → Покажите, как рендерится интерактивный опрос с кнопками.
4. Наконец, скажите: *"Can you change the theme to sunset?"* → Продемонстрируйте, как вся цветовая схема приложения мгновенно меняется.

**🗣️ Текст для озвучки (Narration):**
> "But honestly, it's way more than just the conversation. NEXUS spits out generative UI straight into our chat canvas. Things like timers, simple polls, or charts—they're all spun up as fully interactive React components, triggered purely by function calls. Oh, and you have to see this—the Chameleon UI. The agent proactively shifts the entire app's theme based on whatever mood the chat happens to be in. It's incredibly fluid."

---

### [3:00 - 3:30] UNDER THE HOOD (Что под капотом / Google Cloud)

**🎥 Действия на экране:**
1. Быстро покажите файл кода `tool_router.py` (с блоком dict-dispatch) или `cloudbuild.yaml` (для демонстрации CI/CD).
2. Откройте панель **Google Cloud Console** на буквально 5-6 секунд. Покажите, что сервис Cloud Run называется "NEXUS", работает и светится зелёным (принимает трафик).
3. Вернитесь в интерфейс самого чата.

**🗣️ Текст для озвучки (Narration):**
> "Curious about what's under the hood? We've got a Python FastAPI backend relaying the WebSocket traffic right between the browser and Gemini's Multimodal Live API. There are fourteen highly specialized agent personas, and they're all carefully orchestrated through a dict-dispatch tool router. On the frontend side, we're running Next.js alongside a custom Web Audio pipeline—that's what makes the instant barge-in work so well. The whole thing is properly containerized using Docker, and we've got it deployed out to Google Cloud Run, backed by automated CI/CD via Cloud Build. It just works."

---

### [3:30 - 3:45] THE CLOSE (Завершение)

**🎥 Действия на экране:**
1. Вернитесь на страницу приветствия (Landing Page) NEXUS или сделайте красивое приближение (зум) на плавно двигающийся в режиме ожидания AudioVisualizer.
2. Экран плавно затухает (Fade to black) и появляется текст: **"NEXUS — Built for #GeminiLiveAgentChallenge"**.
3. Добавьте на финальный кадр ссылки: URL на Live Demo приложения и URL на GitHub репозиторий.

**🗣️ Текст для озвучки (Narration):**
> "Look, NEXUS isn't just another flavor-of-the-month chatbot. You're getting fourteen distinct, specialized agents crammed into a single voice. It peers through your camera, drives your web browsing, spins up beautiful visual stories, and renders interactive UI elements on the fly—and it does all of this within one, uninterrupted, real-time conversation. This is NEXUS. Proudly built for the Gemini Live Agent Challenge."
