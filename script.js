document.addEventListener("DOMContentLoaded", async () => {
  const SESSION_KEY = "rescuehub-session-token";
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const protectedPage = currentPage !== "index.html";

  const zoneMeta = {
    delhi: { label: "Delhi Response Zone", center: [28.6139, 77.209], zoom: 13 },
    mumbai: { label: "Mumbai Coastal Zone", center: [19.076, 72.8777], zoom: 12 },
    chennai: { label: "Chennai Flood Zone", center: [13.0827, 80.2707], zoom: 12 },
    bengaluru: { label: "Bengaluru Support Zone", center: [12.9716, 77.5946], zoom: 12 },
  };

  const state = {
    user: null,
    appData: { alerts: [], shelters: [], activities: [], notes: [], reports: [], sosRequests: [] },
    contacts: [],
  };

  const toastStack = document.createElement("div");
  toastStack.className = "toast-stack";
  document.body.appendChild(toastStack);

  const showToast = (title, message, type = "info") => {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><div class="toast-text">${escapeHtml(message)}</div>`;
    toastStack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  };

  const chatbotWidget = document.createElement("section");
  chatbotWidget.className = "chatbot-widget";
  chatbotWidget.innerHTML = `
    <div class="chatbot-panel" id="chatbotPanel" hidden>
      <div class="chatbot-head">
        <div>
          <strong>RescueHub AI</strong>
          <p>Emergency help, quick guidance, and page support.</p>
        </div>
        <button type="button" class="chatbot-close" id="chatbotClose" aria-label="Close chatbot">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="chatbot-body">
        <div class="chatbot-messages" id="chatbotMessages"></div>
        <div class="chatbot-quick-actions" id="chatbotQuickActions">
          <button type="button" class="chatbot-quick" data-prompt="How do I send an SOS?">SOS Help</button>
          <button type="button" class="chatbot-quick" data-prompt="Show me shelter guidance.">Shelters</button>
          <button type="button" class="chatbot-quick" data-prompt="What can I do on this page?">This Page</button>
        </div>
        <form class="chatbot-form" id="chatbotForm">
          <textarea id="chatbotInput" class="chatbot-input" rows="2" placeholder="Ask about alerts, shelters, SOS, reports, or navigation..."></textarea>
          <button type="submit" class="chatbot-send" aria-label="Send message">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </form>
      </div>
    </div>
    <button type="button" class="chatbot-toggle" id="chatbotToggle" aria-label="Open AI chatbot">
      <i class="fa-solid fa-robot"></i>
    </button>
  `;
  document.body.appendChild(chatbotWidget);

  const authShell = document.getElementById("authShell");
  const appShell = document.getElementById("appShell");
  const heroTitle = document.getElementById("heroTitle");
  const heroText = document.getElementById("heroText");
  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const loginToggle = document.getElementById("loginToggle");
  const signupToggle = document.getElementById("signupToggle");
  const loginMessage = document.getElementById("loginMessage");
  const signupMessage = document.getElementById("signupMessage");
  const loginSubmit = document.getElementById("loginSubmit");
  const signupSubmit = document.getElementById("signupSubmit");
  const dashboardSubtitle = document.getElementById("dashboardSubtitle");

  const chatbotPanel = document.getElementById("chatbotPanel");
  const chatbotToggle = document.getElementById("chatbotToggle");
  const chatbotClose = document.getElementById("chatbotClose");
  const chatbotMessages = document.getElementById("chatbotMessages");
  const chatbotForm = document.getElementById("chatbotForm");
  const chatbotInput = document.getElementById("chatbotInput");
  const chatbotQuickActions = document.getElementById("chatbotQuickActions");

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(value) {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getToken() {
    return localStorage.getItem(SESSION_KEY) || "";
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  async function apiRequest(path, options = {}) {
    const { method = "GET", body, auth = true } = options;
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const message = payload.error || "Request failed";
      if (response.status === 401 && auth) {
        setToken("");
        state.user = null;
        if (protectedPage) window.location.href = "index.html";
      }
      throw new Error(message);
    }
    return payload;
  }

  function setLoadingButton(button, loadingText, isLoading) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function addChatMessage(role, text) {
    if (!chatbotMessages) return;
    const node = document.createElement("div");
    node.className = `chatbot-message ${role}`;
    node.textContent = text;
    chatbotMessages.appendChild(node);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function getPageHint() {
    const hints = {
      "index.html": "You can open alerts, shelters, SOS, reporting, and safety tools directly from the dashboard cards.",
      "alerts.html": "Use the search bar and severity filters to narrow the live alert feed from the backend.",
      "report.html": "Submit a disaster report to create a real record in the server data store.",
      "shelters.html": "Change the response zone, filter shelter types, click a directory card, and use your location for route guidance.",
      "sos.html": "Trigger SOS, save emergency contacts, and review the messages generated for your saved contacts.",
      "safety.html": "Review the safety steps and use them during active emergencies.",
      "admin.html": "Admin users can review real user, report, and SOS records from the local backend.",
    };
    return hints[currentPage] || "Use the navigation bar to move across RescueHub tools.";
  }

  function getChatbotReply(prompt) {
    const text = prompt.toLowerCase();
    const alerts = state.appData.alerts || [];
    const shelters = state.appData.shelters || [];
    const zone = document.getElementById("zoneSelector")?.value || state.user?.profile?.zone || "delhi";
    const zoneShelters = shelters.filter((item) => item.zone === zone);
    const firstShelter = zoneShelters.find((item) => item.type === "shelter");
    const firstHospital = zoneShelters.find((item) => item.type === "hospital");

    if (text.includes("sos")) {
      return "Open the SOS page, press the SOS button, allow location access, and the app will create a live SOS record plus notify your saved emergency contacts.";
    }
    if (text.includes("shelter") || text.includes("hospital")) {
      return `In ${zoneMeta[zone]?.label || "the selected zone"}, there are ${zoneShelters.length} listed safe locations. Try ${firstShelter?.name || "the available shelter"} for family support and ${firstHospital?.name || "the listed hospital"} for medical intake.`;
    }
    if (text.includes("alert")) {
      return `There are currently ${alerts.length} alerts in the system. Open the Alerts page to filter them by severity or search by type and location.`;
    }
    if (text.includes("report")) {
      return "The Report page sends a new incident to the backend, then updates alerts, notes, and recent activity.";
    }
    if (text.includes("contact")) {
      return state.contacts.length
        ? `You currently have ${state.contacts.filter((contact) => contact.name && contact.phone).length} saved emergency contacts.`
        : "You do not have any saved emergency contacts yet. Open the SOS page to add them.";
    }
    if (text.includes("page") || text.includes("here") || text.includes("this")) return getPageHint();
    return "I can help with alerts, shelters, SOS, reports, contacts, and navigation. Try asking about SOS steps, shelter guidance, or this page.";
  }

  function submitChatbotPrompt(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    addChatMessage("user", trimmed);
    window.setTimeout(() => addChatMessage("bot", getChatbotReply(trimmed)), 220);
  }

  function registerSharedUi() {
    document.querySelectorAll(".profile-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        button.parentElement?.querySelector(".profile-menu")?.classList.toggle("open");
      });
    });

    document.addEventListener("click", (event) => {
      document.querySelectorAll(".profile").forEach((profile) => {
        if (!profile.contains(event.target)) {
          profile.querySelector(".profile-menu")?.classList.remove("open");
        }
      });
    });

    document.querySelectorAll(".nav-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        button.parentElement?.querySelector(".nav-menu")?.classList.toggle("open");
      });
    });

    document.querySelectorAll(".notification-btn").forEach((button) => {
      button.addEventListener("click", () => {
        showToast("Notifications", "Check alerts, reports, and SOS updates for the latest activity.", "info");
      });
    });

    document.querySelectorAll(".card[data-href]").forEach((card) => {
      const href = card.getAttribute("data-href");
      const go = () => href && (window.location.href = href);
      card.addEventListener("click", go);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go();
        }
      });
    });

    document.querySelectorAll(".password-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.target || "");
        const icon = button.querySelector("i");
        if (!target || !icon) return;
        const reveal = target.type === "password";
        target.type = reveal ? "text" : "password";
        icon.className = reveal ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
      });
    });

    document.querySelectorAll(".tabs button").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach((item) => item.classList.remove("active"));
        tab.classList.add("active");
      });
    });

    chatbotToggle?.addEventListener("click", () => {
      if (!chatbotPanel) return;
      const shouldOpen = chatbotPanel.hidden;
      chatbotPanel.hidden = !shouldOpen;
      if (shouldOpen) chatbotInput?.focus();
    });

    chatbotClose?.addEventListener("click", () => {
      if (chatbotPanel) chatbotPanel.hidden = true;
    });

    chatbotForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitChatbotPrompt(chatbotInput?.value || "");
      if (chatbotInput) chatbotInput.value = "";
    });

    chatbotInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatbotForm?.requestSubmit();
      }
    });

    chatbotQuickActions?.querySelectorAll(".chatbot-quick").forEach((button) => {
      button.addEventListener("click", () => submitChatbotPrompt(button.dataset.prompt || ""));
    });
  }

  function switchAuthMode(mode) {
    if (!loginForm || !signupForm || !loginToggle || !signupToggle) return;
    const loginActive = mode === "login";
    loginForm.hidden = !loginActive;
    signupForm.hidden = loginActive;
    loginToggle.classList.toggle("active", loginActive);
    signupToggle.classList.toggle("active", !loginActive);
    if (heroTitle && heroText) {
      heroTitle.textContent = loginActive ? "Login to access RescueHub." : "Create your RescueHub account.";
      heroText.textContent = loginActive
        ? "Enter your email and password to open the emergency dashboard and continue with your response tools."
        : "Create an account to access alerts, shelters, SOS, reports, and your emergency profile.";
    }
    if (authTitle && authSubtitle) {
      authTitle.textContent = loginActive ? "Login" : "Sign Up";
      authSubtitle.textContent = loginActive ? "Sign in with your existing account to continue." : "Create a new account to get started.";
    }
  }

  function getProfileInfo() {
    if (!state.user) {
      return {
        initials: "RH",
        name: "Rescue User",
        email: "user@rescuehub.com",
        zone: zoneMeta.delhi.label,
        emergencyContact: "Add a saved contact",
        medical: "No medical needs added",
        shelter: "No shelter assigned",
      };
    }

    const zone = state.user.profile?.zone || "delhi";
    const userZoneLabel = zoneMeta[zone]?.label || zoneMeta.delhi.label;
    const primaryContact = state.contacts.find((contact) => contact.name && contact.phone);
    const shelters = (state.appData.shelters || []).filter((item) => item.zone === zone);
    const nearestShelter = shelters.find((item) => item.type === "shelter") || shelters[0];
    const initials = (state.user.name || state.user.email)
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return {
      initials,
      name: state.user.name,
      email: state.user.email,
      zone: userZoneLabel,
      emergencyContact: primaryContact ? `${primaryContact.name} - ${primaryContact.phone}` : "Add a saved contact",
      medical: state.user.profile?.medical || "No medical needs added",
      shelter: nearestShelter?.name || "No shelter assigned",
    };
  }

  function renderProfile() {
    const profile = getProfileInfo();
    document.querySelectorAll("#profileAvatar").forEach((node) => (node.textContent = profile.initials));
    document.querySelectorAll("#profileName").forEach((node) => (node.textContent = profile.name));
    document.querySelectorAll("#profileRole").forEach((node) => (node.textContent = profile.zone));
    document.querySelectorAll("#profileMenuName").forEach((node) => (node.textContent = profile.name));
    document.querySelectorAll("#profileMenuRole").forEach((node) => (node.textContent = `Zone: ${profile.zone}`));
    document.querySelectorAll("#profileMenuEmail").forEach((node) => (node.textContent = `Contact: ${profile.email}`));
    document.querySelectorAll("#profileZone").forEach((node) => (node.textContent = profile.zone));
    document.querySelectorAll("#profileEmergencyContact").forEach((node) => (node.textContent = profile.emergencyContact));
    document.querySelectorAll("#profileMedical").forEach((node) => (node.textContent = profile.medical));
    document.querySelectorAll("#profileShelter").forEach((node) => (node.textContent = profile.shelter));
  }

  function renderAuthState() {
    if (!authShell || !appShell) return;
    const loggedIn = Boolean(state.user);
    authShell.hidden = loggedIn;
    appShell.hidden = !loggedIn;
    if (dashboardSubtitle) {
      dashboardSubtitle.textContent = loggedIn
        ? `Welcome ${state.user.name}. Track alerts, report incidents, find shelters, and send SOS updates from one emergency dashboard.`
        : "Real-time disaster monitoring and emergency response at your fingertips.";
    }
  }

  async function loadCurrentUser() {
    if (!getToken()) return null;
    try {
      const payload = await apiRequest("/api/auth/me");
      state.user = payload.user;
      return payload.user;
    } catch {
      state.user = null;
      return null;
    }
  }

  async function refreshSharedData() {
    if (!state.user) return;
    const [appDataPayload, contactsPayload] = await Promise.all([
      apiRequest("/api/app-data"),
      apiRequest("/api/contacts"),
    ]);
    state.appData = appDataPayload;
    state.contacts = Array.isArray(contactsPayload.contacts) ? contactsPayload.contacts : [];
    renderProfile();
  }

  function bindAuthHandlers() {
    if (loginToggle && signupToggle) {
      loginToggle.addEventListener("click", () => switchAuthMode("login"));
      signupToggle.addEventListener("click", () => switchAuthMode("signup"));
    }

    signupForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("signupName")?.value.trim() || "";
      const email = document.getElementById("signupEmail")?.value.trim().toLowerCase() || "";
      const password = document.getElementById("signupPassword")?.value || "";
      const confirmPassword = document.getElementById("confirmPassword")?.value || "";
      signupMessage.textContent = "";
      signupMessage.className = "auth-message";

      if (!name || !email || !password || !confirmPassword) {
        signupMessage.textContent = "Please fill in all sign-up fields.";
        signupMessage.classList.add("error");
        return;
      }
      if (!isValidEmail(email)) {
        signupMessage.textContent = "Please enter a valid email address.";
        signupMessage.classList.add("error");
        return;
      }
      if (password.length < 6) {
        signupMessage.textContent = "Password must be at least 6 characters.";
        signupMessage.classList.add("error");
        return;
      }
      if (password !== confirmPassword) {
        signupMessage.textContent = "Passwords do not match.";
        signupMessage.classList.add("error");
        return;
      }

      try {
        setLoadingButton(signupSubmit, "Creating account...", true);
        const payload = await apiRequest("/api/auth/signup", {
          method: "POST",
          body: { name, email, password },
          auth: false,
        });
        setToken(payload.token);
        state.user = payload.user;
        await refreshSharedData();
        signupForm.reset();
        renderAuthState();
        renderDashboard();
        showToast("Account ready", "Your RescueHub account has been created.", "success");
      } catch (error) {
        signupMessage.textContent = error.message;
        signupMessage.classList.add("error");
      } finally {
        setLoadingButton(signupSubmit, "", false);
      }
    });

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("loginEmail")?.value.trim().toLowerCase() || "";
      const password = document.getElementById("loginPassword")?.value || "";
      loginMessage.textContent = "";
      loginMessage.className = "auth-message";

      if (!isValidEmail(email)) {
        loginMessage.textContent = "Please enter a valid email address.";
        loginMessage.classList.add("error");
        return;
      }

      try {
        setLoadingButton(loginSubmit, "Signing in...", true);
        const payload = await apiRequest("/api/auth/login", {
          method: "POST",
          body: { email, password },
          auth: false,
        });
        setToken(payload.token);
        state.user = payload.user;
        await refreshSharedData();
        loginForm.reset();
        renderAuthState();
        renderDashboard();
        showToast("Welcome back", "Dashboard access restored successfully.", "success");
      } catch (error) {
        loginMessage.textContent = error.message;
        loginMessage.classList.add("error");
      } finally {
        setLoadingButton(loginSubmit, "", false);
      }
    });

    document.querySelectorAll("#logoutButton").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await apiRequest("/api/auth/logout", { method: "POST" });
        } catch {
          // Best-effort logout
        }
        setToken("");
        state.user = null;
        state.contacts = [];
        renderAuthState();
        renderProfile();
        if (protectedPage) window.location.href = "index.html";
      });
    });
  }

  function renderDashboard() {
    const metricAlerts = document.getElementById("metricAlerts");
    const metricShelters = document.getElementById("metricShelters");
    const priorityLabel = document.getElementById("priorityLabel");
    const priorityText = document.getElementById("priorityText");
    const notesState = document.getElementById("dashboardNotesState");
    const notesContainer = document.getElementById("dashboardNotes");
    const activityState = document.getElementById("activityState");
    const activityContainer = document.getElementById("activityTimeline");
    const dashboardAlertsState = document.getElementById("dashboardAlertsState");
    const dashboardAlerts = document.getElementById("dashboardAlerts");
    if (!metricAlerts || !metricShelters || !notesContainer || !activityContainer || !dashboardAlerts) return;

    const alerts = [...(state.appData.alerts || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const shelters = state.appData.shelters || [];
    const notes = [...(state.appData.notes || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
    const activities = [...(state.appData.activities || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    metricAlerts.textContent = String(alerts.length).padStart(2, "0");
    metricShelters.textContent = String(shelters.length).padStart(2, "0");

    if (priorityLabel && priorityText && alerts[0]) {
      priorityLabel.textContent = `${alerts[0].type} Monitoring`;
      priorityText.textContent = `${alerts[0].location} is the highest-priority event in the current emergency feed.`;
    }

    if (notesState) notesState.hidden = true;
    notesContainer.hidden = false;
    notesContainer.innerHTML = notes.map((note) => `<div class="note-item"><span class="note-time">${formatTime(note.createdAt)}</span><p>${escapeHtml(note.text)}</p></div>`).join("");

    if (activityState) activityState.hidden = true;
    activityContainer.hidden = false;
    activityContainer.innerHTML = activities.map((activity) => `<div class="timeline-item"><span class="timeline-time">${formatTime(activity.createdAt)}</span><strong>${escapeHtml(activity.title)}</strong><p>${escapeHtml(activity.text)}</p></div>`).join("");

    if (dashboardAlertsState) dashboardAlertsState.hidden = true;
    dashboardAlerts.hidden = false;
    dashboardAlerts.innerHTML = alerts.slice(0, 3).map((alert) => `
      <div class="alert-item">
        <div class="alert-head">
          <strong>${escapeHtml(alert.type)}</strong>
          <span class="badge badge-${escapeHtml(alert.severity)}">${escapeHtml(alert.severity)}</span>
        </div>
        <p>${escapeHtml(alert.location)}</p>
        <p>${escapeHtml(alert.description)}</p>
        <span class="timeline-time">${formatTime(alert.createdAt)}</span>
      </div>
    `).join("");
  }

  function initAlertsPage() {
    const loading = document.getElementById("alertsLoading");
    const error = document.getElementById("alertsError");
    const empty = document.getElementById("alertsEmpty");
    const grid = document.getElementById("alertsGrid");
    const search = document.getElementById("alertSearch");
    const filterButtons = document.querySelectorAll(".alert-filter");
    if (!grid) return;

    let activeFilter = "all";

    const render = async () => {
      loading && (loading.hidden = false);
      error && (error.hidden = true);
      empty && (empty.hidden = true);
      grid.hidden = true;
      try {
        const payload = await apiRequest(`/api/alerts?severity=${encodeURIComponent(activeFilter)}&search=${encodeURIComponent(search?.value.trim() || "")}`);
        const alerts = payload.alerts || [];
        loading && (loading.hidden = true);
        if (!alerts.length) {
          empty.hidden = false;
          return;
        }
        const icons = { flood: "fa-water", earthquake: "fa-mountain", cyclone: "fa-wind", fire: "fa-fire", landslide: "fa-hill-rockslide" };
        grid.hidden = false;
        grid.innerHTML = alerts.map((alert) => `
          <article class="alert-card">
            <div class="alert-top">
              <div class="icon"><i class="fa-solid ${icons[alert.type.toLowerCase()] || "fa-circle-exclamation"}"></i></div>
              <div>
                <h3>${escapeHtml(alert.type)}</h3>
                <p class="directory-meta">${escapeHtml(alert.location)}</p>
              </div>
            </div>
            <span class="badge badge-${escapeHtml(alert.severity)}">${escapeHtml(alert.severity)}</span>
            <p>${escapeHtml(alert.description)}</p>
            <span class="timeline-time">${formatTime(alert.createdAt)}</span>
          </article>
        `).join("");
      } catch {
        loading && (loading.hidden = true);
        error && (error.hidden = false);
      }
    };

    search?.addEventListener("input", render);
    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        filterButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        activeFilter = button.dataset.filter || "all";
        render();
      });
    });

    render();
  }

  function initReportPage() {
    const reportForm = document.getElementById("reportForm");
    const reportSubmit = document.getElementById("reportSubmit");
    if (!reportForm || !reportSubmit) return;

    reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const type = document.getElementById("reportType")?.value || "";
      const severity = document.getElementById("reportSeverity")?.value || "";
      const location = document.getElementById("reportLocation")?.value.trim() || "";
      const description = document.getElementById("reportDescription")?.value.trim() || "";

      try {
        setLoadingButton(reportSubmit, "Submitting...", true);
        await apiRequest("/api/reports", {
          method: "POST",
          body: { type, severity, location, description },
        });
        reportForm.reset();
        await refreshSharedData();
        renderDashboard();
        showToast("Report submitted", "The incident was saved and the live feed was updated.", "success");
      } catch (error) {
        showToast("Report failed", error.message, "error");
      } finally {
        setLoadingButton(reportSubmit, "", false);
      }
    });
  }

  function initContactsAndSosPage() {
    const saveContactsButton = document.getElementById("saveContactsButton");
    const contactSaveMessage = document.getElementById("contactSaveMessage");
    const contactInputs = document.querySelectorAll(".emergency-contact-input");
    const sosTrigger = document.getElementById("sosTrigger");
    const sosLoading = document.getElementById("sosLoading");
    const locationInfo = document.getElementById("locationInfo");
    const sosMessages = document.getElementById("sosMessages");

    if (contactInputs.length) {
      contactInputs.forEach((input) => {
        const index = Number(input.dataset.contactIndex);
        const field = input.dataset.contactField;
        const contact = state.contacts[index];
        if (contact && field && field in contact) input.value = contact[field];
      });
    }

    saveContactsButton?.addEventListener("click", async () => {
      const contacts = Array.from({ length: 5 }, (_, index) => ({
        name: document.querySelector(`.emergency-contact-input[data-contact-index="${index}"][data-contact-field="name"]`)?.value.trim() || "",
        phone: document.querySelector(`.emergency-contact-input[data-contact-index="${index}"][data-contact-field="phone"]`)?.value.trim() || "",
      }));
      try {
        const payload = await apiRequest("/api/contacts", { method: "PUT", body: { contacts } });
        state.contacts = payload.contacts || [];
        renderProfile();
        if (contactSaveMessage) contactSaveMessage.textContent = "Emergency contacts saved to your account.";
        showToast("Contacts saved", "Emergency contacts were updated successfully.", "success");
      } catch (error) {
        showToast("Save failed", error.message, "error");
      }
    });

    sosTrigger?.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showToast("Location unavailable", "Geolocation is not supported on this device.", "error");
        return;
      }
      sosLoading.hidden = false;
      sosTrigger.disabled = true;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const payload = await apiRequest("/api/sos", {
              method: "POST",
              body: { latitude, longitude },
            });
            const notified = payload.sos?.contactsNotified || [];
            if (locationInfo) {
              locationInfo.innerHTML = `SOS sent from your location.<br>Latitude: ${latitude.toFixed(5)}<br>Longitude: ${longitude.toFixed(5)}`;
            }
            if (sosMessages) {
              sosMessages.innerHTML = notified.length
                ? notified.map((contact) => `<div class="message-card"><span class="timeline-time">Message sent</span><strong>${escapeHtml(contact.name)}</strong><p>Emergency alert sent to ${escapeHtml(contact.phone)} with your latest location and rescue status.</p></div>`).join("")
                : `<div class="message-card"><span class="timeline-time">No saved contacts</span><p>Your SOS record was created, but there are no saved emergency contacts to notify.</p></div>`;
            }
            await refreshSharedData();
            showToast("SOS sent", "Emergency teams and your saved contacts were notified.", "success");
          } catch (error) {
            showToast("SOS failed", error.message, "error");
          } finally {
            sosLoading.hidden = true;
            sosTrigger.disabled = false;
          }
        },
        () => {
          sosLoading.hidden = true;
          sosTrigger.disabled = false;
          showToast("Location failed", "Unable to retrieve your current location.", "error");
        }
      );
    });
  }

  function initSheltersPage() {
    const mapElement = document.getElementById("shelterMap");
    const directory = document.getElementById("shelterDirectory");
    const loading = document.getElementById("shelterLoading");
    const error = document.getElementById("shelterError");
    const empty = document.getElementById("shelterEmpty");
    if (!mapElement || !directory) return;

    const zoneSelector = document.getElementById("zoneSelector");
    const search = document.getElementById("shelterSearch");
    const filterButtons = document.querySelectorAll(".shelter-filter");
    const zoneBadge = document.getElementById("zoneBadge");
    const shelterBadge = document.getElementById("shelterBadge");
    const hospitalBadge = document.getElementById("hospitalBadge");
    const countMetric = document.getElementById("shelterCountMetric");
    const countText = document.getElementById("shelterCountText");
    const nearestShelterText = document.getElementById("nearestShelterText");
    const medicalStandbyText = document.getElementById("medicalStandbyText");
    const recommendedActionText = document.getElementById("recommendedActionText");
    const infoTitle = document.getElementById("infoTitle");
    const infoType = document.getElementById("infoType");
    const infoArea = document.getElementById("infoArea");
    const infoSupport = document.getElementById("infoSupport");
    const infoStatus = document.getElementById("infoStatus");
    const routeOutput = document.getElementById("routeOutput");
    const locateButton = document.getElementById("locateUserButton");
    const heroInfoTitle = document.getElementById("heroInfoTitle");
    const heroInfoText = document.getElementById("heroInfoText");

    const heroInfoContent = {
      family: { title: "Family shelters", text: "Safe zones prepared for families, children, and elderly evacuees with food, water, rest areas, and overnight shelter support." },
      medical: { title: "Medical support", text: "Hospitals and triage points provide ambulance intake, trauma care, emergency beds, and urgent treatment routing." },
      readiness: { title: "24/7 response ready", text: "These locations maintain rapid intake readiness with power backup, volunteer coordination, and continuous response coverage." },
    };

    let selectedZone = state.user?.profile?.zone || zoneSelector?.value || "delhi";
    let activeFilter = "all";
    let selectedShelterId = "";
    let userLocation = null;
    let markersLayer = null;
    let map = null;

    if (zoneSelector) zoneSelector.value = selectedZone;

    if (typeof L !== "undefined") {
      map = L.map(mapElement, { scrollWheelZoom: true, zoomControl: true }).setView(zoneMeta[selectedZone].center, zoneMeta[selectedZone].zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      markersLayer = L.layerGroup().addTo(map);
    } else {
      loading.hidden = true;
      error.hidden = false;
      error.querySelector("p").textContent = "Map library is unavailable right now.";
    }

    const updateHeroInfo = (key) => {
      const content = heroInfoContent[key];
      if (!content) return;
      heroInfoTitle.textContent = content.title;
      heroInfoText.textContent = content.text;
    };

    const renderDirections = (shelter) => {
      if (!routeOutput) return;
      if (!userLocation) {
        routeOutput.innerHTML = `<div class="timeline-item"><span class="timeline-time">Awaiting Route</span><p>Select a shelter and click \`Use My Location\` to calculate directions.</p></div>`;
        return;
      }
      const km = Math.sqrt(Math.pow(userLocation[0] - shelter.coords[0], 2) + Math.pow(userLocation[1] - shelter.coords[1], 2)) * 111;
      routeOutput.innerHTML = `<div class="timeline-item"><span class="timeline-time">Route Ready</span><strong>${escapeHtml(shelter.name)}</strong><p>Travel approximately ${km.toFixed(1)} km toward ${escapeHtml(shelter.area)}. Follow the main response corridor and local safety signage.</p></div>`;
    };

    const updateShelterInfo = (shelter) => {
      infoTitle.textContent = shelter.name;
      infoType.textContent = shelter.type === "hospital" ? "Hospital" : "Shelter";
      infoArea.textContent = `Area: ${shelter.area}`;
      infoSupport.textContent = `Support: ${shelter.support}`;
      infoStatus.textContent = `Status: ${shelter.status}`;
      renderDirections(shelter);
    };

    const syncZoneToProfile = async () => {
      if (!state.user || !state.user.profile || state.user.profile.zone === selectedZone) return;
      try {
        const payload = await apiRequest("/api/profile", {
          method: "PUT",
          body: {
            zone: selectedZone,
            phone: state.user.profile.phone || "",
            medical: state.user.profile.medical || "No medical needs added",
            language: state.user.profile.language || "English",
          },
        });
        state.user = payload.user;
        renderProfile();
      } catch {
        // Keep page usable if the profile zone update fails.
      }
    };

    const render = async () => {
      loading.hidden = false;
      error.hidden = true;
      empty.hidden = true;
      directory.hidden = true;
      try {
        const payload = await apiRequest(`/api/shelters?zone=${encodeURIComponent(selectedZone)}&type=${encodeURIComponent(activeFilter)}&search=${encodeURIComponent(search?.value.trim() || "")}`);
        const allZoneShelters = (state.appData.shelters || []).filter((item) => item.zone === selectedZone);
        const filtered = payload.shelters || [];
        const shelterCount = allZoneShelters.filter((item) => item.type === "shelter").length;
        const hospitalCount = allZoneShelters.filter((item) => item.type === "hospital").length;

        loading.hidden = true;
        shelterBadge.innerHTML = `<i class="fa-solid fa-building"></i> ${shelterCount} Shelters`;
        hospitalBadge.innerHTML = `<i class="fa-solid fa-plus"></i> ${hospitalCount} Hospitals`;
        zoneBadge.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> ${zoneMeta[selectedZone].label}`;
        countMetric.textContent = String(allZoneShelters.length);
        countText.textContent = `safe locations currently listed in ${zoneMeta[selectedZone].label}`;
        nearestShelterText.textContent = allZoneShelters.find((item) => item.type === "shelter")?.name || "No shelter available";
        medicalStandbyText.textContent = allZoneShelters.find((item) => item.type === "hospital")?.name || "No hospital available";
        recommendedActionText.textContent = `Use ${zoneMeta[selectedZone].label} data to route evacuees toward available shelters and medical support.`;

        if (!filtered.length) {
          empty.hidden = false;
          return;
        }

        directory.hidden = false;
        directory.innerHTML = filtered.map((item) => `
          <article class="directory-card" data-shelter="${item.id}" tabindex="0">
            <div class="directory-top">
              <div class="card-icon ${item.type === "hospital" ? "red-bg" : "blue"}">
                <i class="fa-solid ${item.type === "hospital" ? "fa-plus" : "fa-building"}"></i>
              </div>
              <div>
                <h3>${escapeHtml(item.name)}</h3>
                <span class="badge ${item.type === "hospital" ? "badge-high" : "badge-low"}">${escapeHtml(item.type)}</span>
              </div>
            </div>
            <p class="directory-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(item.area)}</p>
            <p class="directory-meta">${escapeHtml(item.support)}</p>
          </article>
        `).join("");

        if (map && markersLayer) {
          markersLayer.clearLayers();
          const bounds = L.latLngBounds([]);
          filtered.forEach((item) => {
            bounds.extend(item.coords);
            const marker = L.marker(item.coords).addTo(markersLayer);
            marker.bindPopup(`<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.area)}<br>${escapeHtml(item.support)}`);
            marker.on("click", () => {
              selectedShelterId = item.id;
              updateShelterInfo(item);
            });
          });
          if (userLocation) {
            L.marker(userLocation).addTo(markersLayer).bindPopup("Your current location");
          }
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
        }

        directory.querySelectorAll(".directory-card").forEach((card) => {
          const item = filtered.find((shelter) => shelter.id === card.dataset.shelter);
          if (!item) return;
          const open = () => {
            selectedShelterId = item.id;
            updateShelterInfo(item);
            if (map) map.setView(item.coords, 15, { animate: true });
            if (markersLayer) {
              markersLayer.eachLayer((layer) => {
                if (layer.getLatLng && layer.getLatLng().lat === item.coords[0] && layer.getLatLng().lng === item.coords[1]) {
                  layer.openPopup();
                }
              });
            }
          };
          card.addEventListener("click", open);
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open();
            }
          });
        });

        const selectedShelter = filtered.find((item) => item.id === selectedShelterId) || filtered[0];
        if (selectedShelter) updateShelterInfo(selectedShelter);
      } catch {
        loading.hidden = true;
        error.hidden = false;
      }
    };

    zoneSelector?.addEventListener("change", async () => {
      selectedZone = zoneSelector.value;
      selectedShelterId = "";
      userLocation = null;
      await syncZoneToProfile();
      await render();
    });
    search?.addEventListener("input", render);
    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        filterButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        activeFilter = button.dataset.filter || "all";
        render();
      });
    });
    document.querySelectorAll(".hero-info-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".hero-info-chip").forEach((item) => item.classList.remove("active"));
        chip.classList.add("active");
        updateHeroInfo(chip.dataset.info || "family");
      });
    });
    locateButton?.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showToast("Location unavailable", "Geolocation is not supported on this device.", "error");
        return;
      }
      locateButton.disabled = true;
      locateButton.textContent = "Finding location...";
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          userLocation = [position.coords.latitude, position.coords.longitude];
          locateButton.disabled = false;
          locateButton.textContent = "Use My Location";
          await render();
          showToast("Location updated", "Your current location is available for route guidance.", "success");
        },
        () => {
          locateButton.disabled = false;
          locateButton.textContent = "Use My Location";
          showToast("Location failed", "Unable to retrieve your current location.", "error");
        }
      );
    });

    render();
  }

  function initAdminPage() {
    const userTable = document.getElementById("adminUserTable");
    const accessMessage = document.getElementById("adminAccessMessage");
    const usersCount = document.getElementById("adminUsersCount");
    const reportsCount = document.getElementById("adminReportsCount");
    const sosCount = document.getElementById("adminSosCount");
    if (!userTable) return;

    const render = async () => {
      try {
        const payload = await apiRequest("/api/admin/overview");
        accessMessage.hidden = true;
        usersCount.textContent = String(payload.stats?.users || 0);
        reportsCount.textContent = String(payload.stats?.reports || 0);
        sosCount.textContent = String(payload.stats?.sosRequests || 0);
        userTable.innerHTML = payload.users.map((user) => `
          <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.profile?.phone || "Not added")}</td>
            <td><span class="role ${user.role === "admin" ? "admin" : "user"}">${escapeHtml(user.role)}</span></td>
          </tr>
        `).join("");
      } catch (error) {
        accessMessage.hidden = false;
        userTable.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
      }
    };

    render();
  }

  function registerConnectivityHelpers() {
    if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        // Silent fallback
      });
    }
    window.addEventListener("offline", () => {
      showToast("Offline mode", "Cached pages remain available. New live actions may wait for reconnect.", "info");
    });
    window.addEventListener("online", () => {
      showToast("Back online", "Connection restored and live data is available again.", "success");
    });
  }

  registerSharedUi();
  bindAuthHandlers();
  registerConnectivityHelpers();
  addChatMessage("bot", "I am your RescueHub assistant. Ask for help with alerts, shelters, SOS, reports, or this page.");
  switchAuthMode("login");

  await loadCurrentUser();

  if (!state.user && protectedPage) {
    window.location.href = "index.html";
    return;
  }

  if (state.user) {
    try {
      await refreshSharedData();
    } catch (error) {
      showToast("Load failed", error.message, "error");
    }
  }

  renderProfile();
  renderAuthState();
  renderDashboard();
  initAlertsPage();
  initReportPage();
  initContactsAndSosPage();
  initSheltersPage();
  initAdminPage();
});
