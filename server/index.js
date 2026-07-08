import { createServer } from "node:http";
import {
  addGuestbookEntry,
  deleteGuestbookEntry,
  editGuestbookEntry,
  getGuestbookEntries,
  getTopEntries,
  incrementVisitCount,
  insertEntry,
} from "./db.js";

const PORT = 4001;
const GUESTBOOK_ID_PATH = /^\/api\/guestbook\/(\d+)$/;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/leaderboard") {
    send(res, 200, getTopEntries());
    return;
  }

  if (req.method === "POST" && req.url === "/api/leaderboard") {
    readJsonBody(req)
      .then((payload) => {
        const { name, message, score, speed, difficulty, bgm } = payload;
        if (
          typeof name !== "string" ||
          typeof message !== "string" ||
          typeof score !== "number" ||
          typeof speed !== "string" ||
          typeof difficulty !== "string" ||
          typeof bgm !== "string"
        ) {
          send(res, 400, { error: "name, message, speed, difficulty, bgm (string) and score (number) are required" });
          return;
        }
        send(
          res,
          200,
          insertEntry({
            name: name.slice(0, 20),
            message: message.slice(0, 80),
            score,
            speed: speed.slice(0, 10),
            difficulty: difficulty.slice(0, 10),
            bgm: bgm.slice(0, 10),
          }),
        );
      })
      .catch(() => send(res, 400, { error: "invalid JSON body" }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/visits") {
    send(res, 200, { count: incrementVisitCount() });
    return;
  }

  if (req.method === "GET" && req.url === "/api/guestbook") {
    send(res, 200, getGuestbookEntries());
    return;
  }

  if (req.method === "POST" && req.url === "/api/guestbook") {
    readJsonBody(req)
      .then((payload) => {
        const { name, message, password } = payload;
        if (typeof name !== "string" || typeof message !== "string" || typeof password !== "string" || !name.trim() || !message.trim() || !password) {
          send(res, 400, { error: "name, message and password (non-empty strings) are required" });
          return;
        }
        send(res, 200, addGuestbookEntry({ name: name.slice(0, 20), message: message.slice(0, 200), password }));
      })
      .catch(() => send(res, 400, { error: "invalid JSON body" }));
    return;
  }

  const guestbookIdMatch = req.url.match(GUESTBOOK_ID_PATH);

  if (guestbookIdMatch && req.method === "PUT") {
    const id = Number(guestbookIdMatch[1]);
    readJsonBody(req)
      .then((payload) => {
        const { message, password } = payload;
        if (typeof message !== "string" || typeof password !== "string" || !message.trim() || !password) {
          send(res, 400, { error: "message and password (non-empty strings) are required" });
          return;
        }
        const result = editGuestbookEntry(id, message.slice(0, 200), password);
        if (result === "not_found") return send(res, 404, { error: "not found" });
        if (result === "wrong_password") return send(res, 403, { error: "wrong password" });
        send(res, 200, result);
      })
      .catch(() => send(res, 400, { error: "invalid JSON body" }));
    return;
  }

  if (guestbookIdMatch && req.method === "DELETE") {
    const id = Number(guestbookIdMatch[1]);
    readJsonBody(req)
      .then((payload) => {
        const { password } = payload;
        if (typeof password !== "string" || !password) {
          send(res, 400, { error: "password (non-empty string) is required" });
          return;
        }
        const result = deleteGuestbookEntry(id, password);
        if (result === "not_found") return send(res, 404, { error: "not found" });
        if (result === "wrong_password") return send(res, 403, { error: "wrong password" });
        send(res, 200, result);
      })
      .catch(() => send(res, 400, { error: "invalid JSON body" }));
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[leaderboard-api] listening on http://localhost:${PORT}`);
});
