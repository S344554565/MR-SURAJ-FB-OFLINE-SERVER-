const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
//  IN-MEMORY CONFIG STORE (Owner: MR SURAJ)
// ============================================

const config = {
  PAGE_ACCESS_TOKEN: "",
  VERIFY_TOKEN: "",
  autoReplyText: "Hello! This is an automatic reply.",
  botActive: true,
  welcomeMessage: "Welcome! How can I help you today?",
  unidentifiedReply: "Sorry, I didn't understand that. Type 'help' for options.",
};

const messageLogs = [];
const stats = {
  totalReceived: 0,
  totalReplied: 0,
  totalErrors: 0,
  startTime: new Date(),
};

// ============================================
//  HELPER: Send Facebook Message
// ============================================

async function sendFBMessage(senderId, text) {
  if (!config.PAGE_ACCESS_TOKEN) {
    console.error("[BOT] PAGE_ACCESS_TOKEN not set!");
    stats.totalErrors++;
    return false;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v23.0/me/messages?access_token=${config.PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: senderId },
        message: { text: text },
      }
    );
    stats.totalReplied++;
    console.log(`[BOT] Message sent to ${senderId}`);
    return true;
  } catch (error) {
    stats.totalErrors++;
    const errMsg = error.response?.data || error.message;
    console.error("[BOT] Send error:", JSON.stringify(errMsg));
    return false;
  }
}

// ============================================
//  HELPER: Process Incoming Message
// ============================================

function processMessage(text) {
  if (!config.botActive) return null;

  const lower = text.toLowerCase().trim();

  if (lower === "help" || lower === "menu") {
    return (
      "📋 *Main Menu*\n\n" +
      "1️⃣ Type 'info' — About us\n" +
      "2️⃣ Type 'hours' — Business hours\n" +
      "3️⃣ Type 'contact' — Contact details\n" +
      "4️⃣ Type 'services' — Our services\n" +
      "5️⃣ Type 'hello' — Greet us\n\n" +
      "Or just type anything and we'll get back to you!"
    );
  }

  const responses = {
    hello: config.welcomeMessage,
    hi: config.welcomeMessage,
    hey: config.welcomeMessage,
    info: "ℹ️ We are a professional team dedicated to providing the best service. Founded by MR SURAJ, we believe in quality and commitment.",
    hours: "🕐 Business Hours:\n\nMonday - Friday: 9:00 AM - 6:00 PM\nSaturday: 10:00 AM - 4:00 PM\nSunday: Closed",
    contact: "📞 Contact Us:\n\nEmail: contact@example.com\nPhone: +92-XXX-XXXXXXX\nAddress: Your City, Your Country",
    services: "🛠️ Our Services:\n\n✅ Web Development\n✅ App Development\n✅ Graphic Design\n✅ Digital Marketing\n✅ SEO Optimization\n✅ Social Media Management",
    thanks: "You're welcome! 😊 Feel free to ask anything else.",
    thank you: "You're welcome! 😊 Feel free to ask anything else.",
    bye: "Goodbye! 👋 Have a great day! We're here whenever you need us.",
  };

  for (const [key, value] of Object.entries(responses)) {
    if (lower.includes(key)) return value;
  }

  return config.autoReplyText;
}

// ============================================
//  WEBHOOK: Verification (GET)
// ============================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.VERIFY_TOKEN && config.VERIFY_TOKEN) {
    console.log("[WEBHOOK] Verified successfully");
    res.status(200).send(challenge);
  } else {
    console.log("[WEBHOOK] Verification failed");
    res.sendStatus(403);
  }
});

// ============================================
//  WEBHOOK: Receive Messages (POST)
// ============================================

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    res.sendStatus(200);

    for (const entry of body.entry) {
      const webhookEvent = entry.messaging?.[0];
      if (!webhookEvent?.sender) continue;

      const senderId = webhookEvent.sender.id;
      const messageText = webhookEvent.message?.text;

      // Skip echoes and non-text messages
      if (webhookEvent.message?.is_echo || !messageText) continue;

      stats.totalReceived++;

      // Log message
      const logEntry = {
        id: crypto.randomBytes(8).toString("hex"),
        timestamp: new Date().toISOString(),
        senderId: senderId,
        receivedText: messageText,
        sentText: null,
        status: "pending",
      };

      const replyText = processMessage(messageText);

      if (replyText) {
        const success = await sendFBMessage(senderId, replyText);
        logEntry.sentText = replyText;
        logEntry.status = success ? "sent" : "failed";
      } else {
        logEntry.status = "bot_off";
      }

      messageLogs.unshift(logEntry);
      if (messageLogs.length > 200) messageLogs.pop();
    }
  } else {
    res.sendStatus(404);
  }
});

// ============================================
//  API: Get Status
// ============================================

app.get("/api/status", (req, res) => {
  res.json({
    botActive: config.botActive,
    tokenSet: !!config.PAGE_ACCESS_TOKEN,
    verifyTokenSet: !!config.VERIFY_TOKEN,
    totalReceived: stats.totalReceived,
    totalReplied: stats.totalReplied,
    totalErrors: stats.totalErrors,
    uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000),
    lastActivity: messageLogs[0]?.timestamp || null,
  });
});

// ============================================
//  API: Get Config
// ============================================

app.get("/api/config", (req, res) => {
  res.json({
    autoReplyText: config.autoReplyText,
    welcomeMessage: config.welcomeMessage,
    unidentifiedReply: config.unidentifiedReply,
    botActive: config.botActive,
    tokenSet: !!config.PAGE_ACCESS_TOKEN,
    verifyTokenSet: !!config.VERIFY_TOKEN,
    pageTokenPreview: config.PAGE_ACCESS_TOKEN
      ? config.PAGE_ACCESS_TOKEN.slice(0, 8) + "..." + config.PAGE_ACCESS_TOKEN.slice(-4)
      : "",
    verifyTokenPreview: config.VERIFY_TOKEN
      ? config.VERIFY_TOKEN.slice(0, 3) + "***"
      : "",
  });
});

// ============================================
//  API: Update Config
// ============================================

app.post("/api/config", (req, res) => {
  const { pageAccessToken, verifyToken, autoReplyText, welcomeMessage, unidentifiedReply, botActive } = req.body;

  if (pageAccessToken !== undefined && pageAccessToken !== "") {
    config.PAGE_ACCESS_TOKEN = pageAccessToken;
  }
  if (verifyToken !== undefined && verifyToken !== "") {
    config.VERIFY_TOKEN = verifyToken;
  }
  if (autoReplyText !== undefined) {
    config.autoReplyText = autoReplyText;
  }
  if (welcomeMessage !== undefined) {
    config.welcomeMessage = welcomeMessage;
  }
  if (unidentifiedReply !== undefined) {
    config.unidentifiedReply = unidentifiedReply;
  }
  if (botActive !== undefined) {
    config.botActive = botActive;
  }

  res.json({ success: true, message: "Configuration updated successfully!" });
});

// ============================================
//  API: Toggle Bot
// ============================================

app.post("/api/toggle", (req, res) => {
  config.botActive = !config.botActive;
  res.json({ success: true, botActive: config.botActive });
});

// ============================================
//  API: Get Logs
// ============================================

app.get("/api/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(messageLogs.slice(0, limit));
});

// ============================================
//  API: Clear Logs
// ============================================

app.post("/api/logs/clear", (req, res) => {
  messageLogs.length = 0;
  res.json({ success: true, message: "Logs cleared" });
});

// ============================================
//  API: Test Send Message
// ============================================

app.post("/api/test-send", async (req, res) => {
  const { recipientId, message } = req.body;
  if (!recipientId || !message) {
    return res.status(400).json({ error: "recipientId and message are required" });
  }
  const success = await sendFBMessage(recipientId, message);
  res.json({ success });
});

// ============================================
//  DASHBOARD HTML (Professional UI)
// ============================================

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Messenger Bot Dashboard — MR SURAJ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  /* ===== CSS VARIABLES ===== */
  :root {
    --bg-primary: #0a0e17;
    --bg-secondary: #111827;
    --bg-card: #1a2235;
    --bg-card-hover: #1f2a40;
    --bg-input: #0d1321;
    --border: #2a3550;
    --border-focus: #00e68a;
    --text-primary: #e8ecf4;
    --text-secondary: #8892a8;
    --text-muted: #5a6478;
    --accent: #00e68a;
    --accent-dim: rgba(0,230,138,0.15);
    --accent-glow: rgba(0,230,138,0.3);
    --danger: #ff4757;
    --danger-dim: rgba(255,71,87,0.15);
    --warning: #ffa502;
    --warning-dim: rgba(255,165,2,0.15);
    --info: #3b82f6;
    --info-dim: rgba(59,130,246,0.15);
    --sidebar-w: 260px;
    --radius: 12px;
    --radius-sm: 8px;
    --transition: 0.3s cubic-bezier(0.4,0,0.2,1);
  }

  /* ===== RESET ===== */
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  html { scroll-behavior: smooth; }

  body {
    font-family: 'Space Grotesk', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ===== ANIMATED BACKGROUND ===== */
  .bg-glow {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    overflow: hidden;
  }
  .bg-glow::before {
    content: '';
    position: absolute;
    top: -30%; left: -20%;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(0,230,138,0.06) 0%, transparent 70%);
    animation: floatBlob 20s ease-in-out infinite;
  }
  .bg-glow::after {
    content: '';
    position: absolute;
    bottom: -20%; right: -15%;
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%);
    animation: floatBlob 25s ease-in-out infinite reverse;
  }
  @keyframes floatBlob {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(80px, -60px) scale(1.1); }
    66% { transform: translate(-40px, 40px) scale(0.95); }
  }

  /* ===== SIDEBAR ===== */
  .sidebar {
    position: fixed; top: 0; left: 0;
    width: var(--sidebar-w); height: 100vh;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    z-index: 100;
    display: flex; flex-direction: column;
    transition: transform var(--transition);
  }
  .sidebar-header {
    padding: 28px 24px 20px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: 12px;
  }
  .sidebar-logo .logo-icon {
    width: 42px; height: 42px;
    background: linear-gradient(135deg, var(--accent), #00b368);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; color: #0a0e17; font-weight: 700;
    box-shadow: 0 4px 20px var(--accent-glow);
  }
  .sidebar-logo .logo-text h2 {
    font-size: 16px; font-weight: 700; letter-spacing: 0.5px;
    color: var(--text-primary);
  }
  .sidebar-logo .logo-text span {
    font-size: 11px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 1px; text-transform: uppercase;
  }

  .sidebar-nav {
    flex: 1; padding: 16px 12px; overflow-y: auto;
  }
  .sidebar-nav .nav-label {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.5px;
    color: var(--text-muted); padding: 16px 12px 8px;
  }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-radius: var(--radius-sm);
    color: var(--text-secondary); cursor: pointer;
    transition: all var(--transition); font-size: 14px;
    font-weight: 500; position: relative; overflow: hidden;
    border: 1px solid transparent;
    margin-bottom: 2px;
  }
  .nav-item:hover {
    color: var(--text-primary);
    background: var(--bg-card);
    border-color: var(--border);
  }
  .nav-item.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-color: rgba(0,230,138,0.2);
  }
  .nav-item.active::before {
    content: '';
    position: absolute; left: 0; top: 50%;
    transform: translateY(-50%);
    width: 3px; height: 60%; border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .nav-item i { width: 20px; text-align: center; font-size: 15px; }

  .sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    text-align: center;
  }

  /* ===== MAIN CONTENT ===== */
  .main {
    margin-left: var(--sidebar-w);
    min-height: 100vh;
    position: relative; z-index: 1;
  }

  /* ===== TOP BAR ===== */
  .topbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(10,14,23,0.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .topbar-left h1 {
    font-size: 20px; font-weight: 700;
    background: linear-gradient(135deg, var(--text-primary), var(--accent));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .topbar-left p {
    font-size: 12px; color: var(--text-muted); margin-top: 2px;
  }
  .topbar-right {
    display: flex; align-items: center; gap: 16px;
  }
  .status-badge {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 50px;
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.5px;
  }
  .status-badge.online {
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid rgba(0,230,138,0.25);
  }
  .status-badge.offline {
    background: var(--danger-dim);
    color: var(--danger);
    border: 1px solid rgba(255,71,87,0.25);
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }
  .online .status-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .offline .status-dot { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  /* ===== PAGE CONTENT ===== */
  .page-content {
    padding: 32px;
  }
  .page-section {
    display: none;
  }
  .page-section.active {
    display: block;
    animation: fadeUp 0.4s ease-out;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== STAT CARDS ===== */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px; margin-bottom: 32px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    position: relative; overflow: hidden;
    transition: all var(--transition);
  }
  .stat-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  .stat-card .card-icon {
    width: 44px; height: 44px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; margin-bottom: 16px;
  }
  .stat-card .card-icon.green { background: var(--accent-dim); color: var(--accent); }
  .stat-card .card-icon.blue { background: var(--info-dim); color: var(--info); }
  .stat-card .card-icon.orange { background: var(--warning-dim); color: var(--warning); }
  .stat-card .card-icon.red { background: var(--danger-dim); color: var(--danger); }
  .stat-card .card-value {
    font-size: 32px; font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 4px;
  }
  .stat-card .card-label {
    font-size: 13px; color: var(--text-muted); font-weight: 500;
  }
  .stat-card::after {
    content: '';
    position: absolute; top: 0; right: 0;
    width: 120px; height: 120px;
    border-radius: 50%;
    opacity: 0.03; pointer-events: none;
    transform: translate(30%, -30%);
  }
  .stat-card:nth-child(1)::after { background: var(--accent); }
  .stat-card:nth-child(2)::after { background: var(--info); }
  .stat-card:nth-child(3)::after { background: var(--warning); }
  .stat-card:nth-child(4)::after { background: var(--danger); }

  /* ===== PANELS / CARDS ===== */
  .panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 24px;
    overflow: hidden;
  }
  .panel-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .panel-header h3 {
    font-size: 16px; font-weight: 600;
    display: flex; align-items: center; gap: 10px;
  }
  .panel-header h3 i { color: var(--accent); font-size: 15px; }
  .panel-body {
    padding: 24px;
  }

  /* ===== FORM ELEMENTS ===== */
  .form-group {
    margin-bottom: 24px;
  }
  .form-group label {
    display: block;
    font-size: 13px; font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }
  .form-group label .required {
    color: var(--danger); margin-left: 2px;
  }
  .form-group .hint {
    font-size: 11px; color: var(--text-muted);
    margin-top: 6px; line-height: 1.5;
  }
  .form-input {
    width: 100%;
    padding: 14px 16px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    transition: all var(--transition);
    outline: none;
  }
  .form-input:focus {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  .form-input::placeholder {
    color: var(--text-muted); font-size: 13px;
  }
  textarea.form-input {
    resize: vertical; min-height: 100px;
    line-height: 1.6;
  }
  .input-with-icon {
    position: relative;
  }
  .input-with-icon .form-input {
    padding-right: 44px;
  }
  .input-with-icon .toggle-vis {
    position: absolute; right: 12px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--text-muted); cursor: pointer;
    font-size: 16px;
    transition: color var(--transition);
  }
  .input-with-icon .toggle-vis:hover {
    color: var(--text-primary);
  }

  /* ===== BUTTONS ===== */
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 24px;
    border-radius: var(--radius-sm);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px; font-weight: 600;
    cursor: pointer; border: 1px solid transparent;
    transition: all var(--transition);
    letter-spacing: 0.3px;
  }
  .btn-primary {
    background: linear-gradient(135deg, var(--accent), #00b368);
    color: #0a0e17;
    box-shadow: 0 4px 16px var(--accent-glow);
  }
  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px va
