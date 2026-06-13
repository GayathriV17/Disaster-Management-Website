const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3001;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const zoneMeta = {
  delhi: { label: "Delhi Response Zone", center: [28.6139, 77.209], zoom: 13 },
  mumbai: { label: "Mumbai Coastal Zone", center: [19.076, 72.8777], zoom: 12 },
  chennai: { label: "Chennai Flood Zone", center: [13.0827, 80.2707], zoom: 12 },
  bengaluru: { label: "Bengaluru Support Zone", center: [12.9716, 77.5946], zoom: 12 },
};

const defaultDb = () => ({
  users: [
    {
      id: "user-admin",
      name: "Admin User",
      email: "admin@rescuehub.com",
      passwordHash: hashPassword("Admin@123"),
      role: "admin",
      profile: {
        phone: "+91 99999 00000",
        zone: "delhi",
        medical: "Control room access only",
        language: "English",
      },
    },
  ],
  sessions: [],
  alerts: [
    { id: "alert-1", type: "Flood", severity: "critical", location: "Chennai, Tamil Nadu", description: "Move to higher ground immediately and avoid flood waters.", createdAt: "2026-03-14T09:10:00" },
    { id: "alert-2", type: "Earthquake", severity: "high", location: "Kathmandu Region, Nepal", description: "Drop, cover, and hold on. Move to open areas after shaking stops.", createdAt: "2026-03-14T08:35:00" },
    { id: "alert-3", type: "Cyclone", severity: "high", location: "Odisha Coast, India", description: "Stay indoors, secure loose objects, and stock essentials.", createdAt: "2026-03-14T07:40:00" },
    { id: "alert-4", type: "Fire", severity: "medium", location: "California, USA", description: "Evacuate if ordered and stay low to avoid smoke inhalation.", createdAt: "2026-03-14T06:15:00" },
    { id: "alert-5", type: "Flood", severity: "low", location: "Mumbai, Maharashtra", description: "Monitor weather alerts and avoid low-lying roads.", createdAt: "2026-03-13T18:20:00" },
  ],
  shelters: [
    { id: "delhi-community-center", zone: "delhi", name: "City Community Center", type: "shelter", area: "Central Civic District", coords: [28.6139, 77.209], support: "Food, water, rest space, and family shelter support.", status: "Available now" },
    { id: "delhi-government-hospital", zone: "delhi", name: "Government Hospital", type: "hospital", area: "North Medical Corridor", coords: [28.6229, 77.219], support: "Trauma intake, emergency beds, and ambulance access.", status: "High readiness" },
    { id: "delhi-red-cross", zone: "delhi", name: "Red Cross Relief Camp", type: "shelter", area: "West Relief Sector", coords: [28.6049, 77.199], support: "Supply pickup, volunteer desk, and temporary rest space.", status: "Supply distribution active" },
    { id: "delhi-district-medical", zone: "delhi", name: "District Medical Center", type: "hospital", area: "East Triage Zone", coords: [28.61, 77.21], support: "Critical care, triage, and ambulance coordination.", status: "Critical care open" },
    { id: "delhi-relief-shelter", zone: "delhi", name: "Emergency Relief Shelter", type: "shelter", area: "Northeast Family Zone", coords: [28.62, 77.215], support: "Family space, charging points, and overnight shelter.", status: "Accepting arrivals" },
    { id: "mumbai-coastal-shelter", zone: "mumbai", name: "Coastal Relief Shelter", type: "shelter", area: "Marine Drive Safe Belt", coords: [19.0748, 72.8774], support: "Temporary shelter, food kits, and family rest zone.", status: "Storm intake active" },
    { id: "mumbai-emergency-hospital", zone: "mumbai", name: "Harbor Emergency Hospital", type: "hospital", area: "South Harbor Medical Zone", coords: [19.0682, 72.8808], support: "Emergency beds, ambulance intake, and trauma support.", status: "High readiness" },
    { id: "chennai-flood-shelter", zone: "chennai", name: "Riverbank Shelter Hub", type: "shelter", area: "North Flood Evacuation Zone", coords: [13.0878, 80.2785], support: "Dry shelter, food supply, and child-safe area.", status: "Evacuation support active" },
    { id: "chennai-medical-center", zone: "chennai", name: "Chennai Medical Relief Center", type: "hospital", area: "Central Medical Corridor", coords: [13.0814, 80.2718], support: "Flood response triage and urgent medical care.", status: "Critical care open" },
    { id: "bengaluru-support-shelter", zone: "bengaluru", name: "Bengaluru Support Shelter", type: "shelter", area: "City Support Sector", coords: [12.9734, 77.5945], support: "Family shelter, food counter, and charging stations.", status: "Available now" },
    { id: "bengaluru-response-hospital", zone: "bengaluru", name: "Bengaluru Response Hospital", type: "hospital", area: "South Response Zone", coords: [12.9685, 77.5995], support: "Emergency care, triage, and ambulance routing.", status: "Ready for intake" },
  ],
  activities: [
    { id: "activity-1", title: "Flood response units redirected", text: "Field teams were moved toward low-lying evacuation zones after rising water reports.", createdAt: "2026-03-14T09:05:00" },
    { id: "activity-2", title: "Hospital capacity confirmed", text: "Medical support teams verified bed availability at two nearby hospitals.", createdAt: "2026-03-14T08:40:00" },
    { id: "activity-3", title: "Shelter network synced", text: "Shelter availability and routing data were updated across all response zones.", createdAt: "2026-03-14T07:55:00" },
  ],
  notes: [
    { id: "note-1", text: "Weather watch remains active with risk of rising water levels in coastal sectors.", createdAt: "2026-03-14T09:20:00" },
    { id: "note-2", text: "Medical support teams confirmed bed availability at two nearby hospitals.", createdAt: "2026-03-14T08:52:00" },
    { id: "note-3", text: "Relief supplies have been redirected to the west support corridor.", createdAt: "2026-03-14T08:10:00" },
  ],
  reports: [],
  sosRequests: [],
  emergencyContacts: {},
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "user",
    profile: user.profile || { zone: "delhi", medical: "No medical needs added" },
  };
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return "";
}

function findSession(db, token) {
  const now = Date.now();
  db.sessions = (db.sessions || []).filter((session) => now - session.createdAt < SESSION_TTL_MS);
  return db.sessions.find((session) => session.token === token);
}

function requireAuth(req, res, db) {
  const token = getToken(req);
  const session = findSession(db, token);
  if (!session) {
    sendJson(res, 401, { error: "Authentication required" });
    return null;
  }
  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) {
    sendJson(res, 401, { error: "User not found" });
    return null;
  }
  return user;
}

function createSession(db, userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions.push({ token, userId, createdAt: Date.now() });
  return token;
}

function buildAppData(db) {
  return {
    alerts: db.alerts,
    shelters: db.shelters,
    activities: db.activities,
    notes: db.notes,
    reports: db.reports,
    sosRequests: db.sosRequests,
    zoneMeta,
  };
}

function routeRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const db = readDb();

  if (pathname === "/api/auth/signup" && req.method === "POST") {
    readBody(req).then((body) => {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email || !password) {
        sendJson(res, 400, { error: "Name, email, and password are required." });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { error: "Enter a valid email address." });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { error: "Password must be at least 6 characters." });
        return;
      }
      if (db.users.some((user) => user.email === email)) {
        sendJson(res, 409, { error: "An account with this email already exists." });
        return;
      }
      const user = {
        id: `user-${Date.now()}`,
        name,
        email,
        passwordHash: hashPassword(password),
        role: "user",
        profile: {
          zone: "delhi",
          phone: "",
          medical: "No medical needs added",
          language: "English",
        },
      };
      db.users.push(user);
      const token = createSession(db, user.id);
      writeDb(db);
      sendJson(res, 201, { token, user: safeUser(user) });
    }).catch((error) => sendJson(res, 400, { error: error.message }));
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    readBody(req).then((body) => {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = db.users.find((entry) => entry.email === email && entry.passwordHash === hashPassword(password));
      if (!user) {
        sendJson(res, 401, { error: "Invalid email or password." });
        return;
      }
      const token = createSession(db, user.id);
      writeDb(db);
      sendJson(res, 200, { token, user: safeUser(user) });
    }).catch((error) => sendJson(res, 400, { error: error.message }));
    return;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const token = getToken(req);
    db.sessions = (db.sessions || []).filter((session) => session.token !== token);
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    sendJson(res, 200, { user: safeUser(user) });
    return;
  }

  if (pathname === "/api/profile" && req.method === "PUT") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    readBody(req).then((body) => {
      const profile = user.profile || {};
      user.profile = {
        ...profile,
        zone: typeof body.zone === "string" && zoneMeta[body.zone] ? body.zone : profile.zone || "delhi",
        phone: typeof body.phone === "string" ? body.phone.trim() : profile.phone || "",
        medical: typeof body.medical === "string" ? body.medical.trim() || "No medical needs added" : profile.medical || "No medical needs added",
        language: typeof body.language === "string" ? body.language.trim() || "English" : profile.language || "English",
      };
      writeDb(db);
      sendJson(res, 200, { user: safeUser(user) });
    }).catch((error) => sendJson(res, 400, { error: error.message }));
    return;
  }

  if (pathname === "/api/app-data" && req.method === "GET") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    sendJson(res, 200, buildAppData(db));
    return;
  }

  if (pathname === "/api/alerts" && req.method === "GET") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    const severity = parsedUrl.searchParams.get("severity") || "all";
    const search = (parsedUrl.searchParams.get("search") || "").toLowerCase();
    const alerts = db.alerts
      .filter((alert) => severity === "all" || alert.severity === severity)
      .filter((alert) => !search || alert.type.toLowerCase().includes(search) || alert.location.toLowerCase().includes(search))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    sendJson(res, 200, { alerts });
    return;
  }

  if (pathname === "/api/shelters" && req.method === "GET") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    const zone = parsedUrl.searchParams.get("zone") || "delhi";
    const type = parsedUrl.searchParams.get("type") || "all";
    const search = (parsedUrl.searchParams.get("search") || "").toLowerCase();
    const shelters = db.shelters
      .filter((shelter) => shelter.zone === zone)
      .filter((shelter) => type === "all" || shelter.type === type)
      .filter((shelter) => !search || shelter.name.toLowerCase().includes(search) || shelter.area.toLowerCase().includes(search));
    sendJson(res, 200, { shelters, zoneMeta });
    return;
  }

  if (pathname === "/api/contacts" && req.method === "GET") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    sendJson(res, 200, { contacts: db.emergencyContacts[user.id] || [] });
    return;
  }

  if (pathname === "/api/contacts" && req.method === "PUT") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    readBody(req).then((body) => {
      const contacts = Array.isArray(body.contacts) ? body.contacts.slice(0, 5).map((contact) => ({
        name: String(contact?.name || "").trim(),
        phone: String(contact?.phone || "").trim(),
      })) : [];
      db.emergencyContacts[user.id] = contacts;
      writeDb(db);
      sendJson(res, 200, { contacts });
    }).catch((error) => sendJson(res, 400, { error: error.message }));
    return;
  }

  if (pathname === "/api/reports" && req.method === "POST") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    readBody(req).then((body) => {
      const type = String(body.type || "").trim();
      const severity = String(body.severity || "").trim().toLowerCase();
      const location = String(body.location || "").trim();
      const description = String(body.description || "").trim();
      if (!type || !severity || !location || !description) {
        sendJson(res, 400, { error: "All report fields are required." });
        return;
      }
      const createdAt = new Date().toISOString();
      const report = { id: `report-${Date.now()}`, userId: user.id, reporter: user.name, type, severity, location, description, createdAt };
      const alert = { id: `alert-${Date.now()}`, type, severity, location, description, createdAt };
      const activity = { id: `activity-${Date.now()}`, title: `New report received: ${type}`, text: `${location} was reported by ${user.name} with ${severity} severity.`, createdAt };
      const note = { id: `note-${Date.now()}`, text: `${user.name} reported ${type} near ${location}.`, createdAt };
      db.reports.unshift(report);
      db.alerts.unshift(alert);
      db.activities.unshift(activity);
      db.notes.unshift(note);
      writeDb(db);
      sendJson(res, 201, { report, alert });
    }).catch((error) => sendJson(res, 400, { error: error.message }));
    return;
  }

  if (pathname === "/api/sos" && req.method === "POST") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    readBody(req).then((body) => {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        sendJson(res, 400, { error: "Valid coordinates are required." });
        return;
      }
      const createdAt = new Date().toISOString();
      const contacts = db.emergencyContacts[user.id] || [];
      const sosRecord = {
        id: `sos-${Date.now()}`,
        userId: user.id,
        name: user.name,
        latitude,
        longitude,
        createdAt,
        contactsNotified: contacts.filter((contact) => contact.name && contact.phone),
      };
      db.sosRequests.unshift(sosRecord);
      db.activities.unshift({
        id: `activity-${Date.now()}`,
        title: "SOS signal received",
        text: `${user.name} triggered SOS near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.`,
        createdAt,
      });
      writeDb(db);
      sendJson(res, 201, { sos: sosRecord });
    }).catch((error) => sendJson(res, 400, { error: error.message }));
    return;
  }

  if (pathname === "/api/admin/overview" && req.method === "GET") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    if (user.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return;
    }
    sendJson(res, 200, {
      users: db.users.map(safeUser),
      reports: db.reports,
      sosRequests: db.sosRequests,
      stats: {
        users: db.users.length,
        reports: db.reports.length,
        sosRequests: db.sosRequests.length,
      },
    });
    return;
  }

  let filePath = pathname === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  sendFile(res, filePath);
}

const server = http.createServer(routeRequest);
server.listen(PORT, () => {
  ensureDb();
  console.log(`RescueHub server running at http://localhost:${PORT}`);
});
