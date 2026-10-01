import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const gameRef = ref(db, "game");
const entriesRef = ref(db, "entries");

const $ = id => document.getElementById(id);

const params = new URLSearchParams(location.search);
const isDisplay = params.get("screen") === "display";
const isAdmin = params.get("admin") === "1";

function show(id) {
  $(id)?.classList.remove("hidden");
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

// --------------------------------------------------
// PAGINA
// --------------------------------------------------

if (isDisplay) {
  hide("join");
  hide("waiting");
  hide("admin");
  show("display");
} else if (isAdmin) {
  hide("join");
  hide("waiting");
  hide("display");
  show("admin");
} else {
  hide("display");
  hide("admin");
  show("join");
}

// --------------------------------------------------
// AUTH
// --------------------------------------------------

let currentUid = null;

onAuthStateChanged(auth, user => {
  if (!user) return;

  currentUid = user.uid;

  if (isAdmin) {
    $("adminUid").textContent =
      "Jouw admin-ID: " + currentUid;
  }
});

signInAnonymously(auth).catch(error => {
  console.error("Firebase login fout:", error);
});

// --------------------------------------------------
// GAME STATUS
// --------------------------------------------------

let currentGame = null;
let timerHandle = null;

onValue(gameRef, snapshot => {

  const game = snapshot.val() || {};

  currentGame = game;

  if (isDisplay) {
    renderDisplay(game);
  }

  if (!isAdmin && !isDisplay) {
    renderParticipant(game);
  }
});

// --------------------------------------------------
// DEELNEMER
// --------------------------------------------------

function renderParticipant(game) {

  if (!game || game.status !== "open") {
    closeParticipantForm();
    return;
  }

  const startedAt = Number(game.startedAt);
  const duration = Number(game.duration);

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(duration)
  ) {
    return;
  }

  const endTime =
    startedAt + duration * 1000;

  if (Date.now() >= endTime) {
    closeParticipantForm();
    return;
  }

  // Nieuwe ronde is gestart:
  // oude status/meldingen verwijderen
  hide("closedMessage");
  hide("waiting");

  // Naam behouden
  // Code leegmaken
  if ($("guess")) {
    $("guess").value = "";
  }

  // Knop weer beschikbaar maken
  if ($("joinBtn")) {
    $("joinBtn").disabled = false;
  }

  // Melding leegmaken
  if ($("joinMsg")) {
    $("joinMsg").textContent = "";
  }

  show("join");

  startParticipantTimer(endTime);
}


function startParticipantTimer(endTime) {

  clearInterval(timerHandle);

  const update = () => {

    const remaining =
      Math.max(0, endTime - Date.now());

    const seconds =
      Math.ceil(remaining / 1000);

    if ($("joinMsg")) {
      $("joinMsg").textContent =
        `Nog ${seconds} seconden om mee te doen.`;
    }

    if (remaining <= 0) {

      clearInterval(timerHandle);

      closeParticipantForm();
    }
  };

  update();

  timerHandle =
    setInterval(update, 200);
}


function closeParticipantForm() {

  clearInterval(timerHandle);

  hide("join");
  hide("waiting");

  let closed =
    document.getElementById("closedMessage");

  if (!closed) {

    closed =
      document.createElement("section");

    closed.id = "closedMessage";
    closed.className = "card";

    closed.innerHTML = `
      <div class="lock">🔒</div>
      <h1>Inschrijving gesloten</h1>
      <p class="subtitle">
        De tijd is voorbij!
      </p>
      <p>
        Wacht op de uitslag op het grote scherm.
      </p>
    `;

    document
      .getElementById("app")
      .appendChild(closed);
  }

  show("closedMessage");
}

// --------------------------------------------------
// MEEDOEN
// --------------------------------------------------

$("joinBtn")?.addEventListener(
  "click",
  async () => {

    const name =
      $("name").value.trim();

    const guess =
      $("guess").value.trim();

    if (!name) {
      $("joinMsg").textContent =
        "Vul je naam in.";
      return;
    }

    if (!/^\d{6}$/.test(guess)) {
      $("joinMsg").textContent =
        "Vul precies 6 cijfers in.";
      return;
    }

    $("joinBtn").disabled = true;

    $("joinMsg").textContent =
      "Inzending controleren...";

    try {

      // Huidige spelstatus ophalen
      const snapshot =
        await new Promise(resolve =>
          onValue(
            gameRef,
            resolve,
            { onlyOnce: true }
          )
        );

      const game =
        snapshot.val();

      if (!game ||
          game.status !== "open") {

        throw new Error(
          "ROUND_CLOSED"
        );
      }

      const startedAt =
        Number(game.startedAt);

      const duration =
        Number(game.duration);

      if (
        !Number.isFinite(startedAt) ||
        !Number.isFinite(duration)
      ) {

        throw new Error(
          "INVALID_GAME"
        );
      }

      const endTime =
        startedAt + duration * 1000;

      if (Date.now() >= endTime) {

        throw new Error(
          "ROUND_CLOSED"
        );
      }

      // Inzending maken
      const item =
        push(entriesRef);

      await set(item, {

        name: name,

        guess: Number(guess),

        createdAt: Date.now()

      });

      hide("join");

      hide("closedMessage");

      $("savedGuess").textContent =
        `${name}, jouw gok is ${guess}.`;

      show("waiting");

    }
    catch (error) {

      console.error(
        "Inzending mislukt:",
        error
      );

      $("joinBtn").disabled = false;

      if (
        error.message ===
        "ROUND_CLOSED"
      ) {

        closeParticipantForm();

      } else {

        $("joinMsg").textContent =
          "Er ging iets mis bij het versturen. Probeer opnieuw.";

      }
    }
  }
);

// --------------------------------------------------
// ADMIN: START
// --------------------------------------------------

$("startBtn")?.addEventListener(
  "click",
  async () => {

    const duration =
      Math.max(
        5,
        Math.min(
          300,
          Number($("duration").value) || 30
        )
      );

    try {

      // Oude inzendingen verwijderen
      await remove(entriesRef);

      // Normale milliseconde-tijd opslaan
      const startedAt =
        Date.now();

      await set(gameRef, {

        status: "open",

        duration: duration,

        startedAt: startedAt

      });

      $("adminStatus").textContent =
        `Ronde gestart voor ${duration} seconden.`;

    }
    catch (error) {

      console.error(error);

      $("adminStatus").textContent =
        "Fout bij starten van de ronde.";

    }
  }
);

// --------------------------------------------------
// ADMIN: WINNAAR
// --------------------------------------------------

$("revealBtn")?.addEventListener(
  "click",
  async () => {

    try {

      const snapshot =
        await new Promise(resolve =>
          onValue(
            entriesRef,
            resolve,
            { onlyOnce: true }
          )
        );

      const data =
        snapshot.val() || {};

      const entries =
        Object.values(data);

      if (!entries.length) {

        $("adminStatus").textContent =
          "Er zijn nog geen deelnemers.";

        return;
      }

      const code =
        Math.floor(
          Math.random() * 1000000
        );

      let winner = null;

      for (const entry of entries) {

        const diff =
          Math.abs(
            Number(entry.guess) -
            code
          );

        if (
          !winner ||
          diff < winner.diff
        ) {

          winner = {
            name: entry.name,
            guess: Number(entry.guess),
            diff: diff
          };
        }
      }

      await set(gameRef, {

        status: "revealed",

        code: code,

        winner: winner

      });

      $("adminStatus").textContent =
        `Code: ${String(code).padStart(6, "0")}`;

    }
    catch (error) {

      console.error(error);

      $("adminStatus").textContent =
        "Fout bij tonen van de winnaar.";

    }
  }
);

// --------------------------------------------------
// ADMIN: NIEUWE RONDE
// --------------------------------------------------

$("resetBtn")?.addEventListener(
  "click",
  async () => {

    try {

      await remove(entriesRef);

      await set(gameRef, {

        status: "idle",

        duration:
          Number($("duration").value) || 30

      });

      $("adminStatus").textContent =
        "Nieuwe ronde klaar.";

    }
    catch (error) {

      console.error(error);

      $("adminStatus").textContent =
        "Fout bij starten van nieuwe ronde.";

    }
  }
);

// --------------------------------------------------
// GROOT SCHERM
// --------------------------------------------------

function renderDisplay(game) {

  if (!game || !game.status) {
    return;
  }

  if (game.status === "open") {

    const startedAt =
      Number(game.startedAt);

    const duration =
      Number(game.duration);

    if (
      !Number.isFinite(startedAt) ||
      !Number.isFinite(duration)
    ) {
      return;
    }

    const endTime =
      startedAt + duration * 1000;

    $("displayText").textContent =
      "Vul je gok in op je telefoon!";

    $("result").classList.add("hidden");

    startDisplayTimer(endTime);

  }

  else if (game.status === "revealed") {

    clearInterval(timerHandle);

    $("timer").textContent =
      String(game.code).padStart(6, "0");

    $("displayText").textContent =
      "DE 2FA-CODE IS...";

    $("result").classList.remove("hidden");

    if (game.winner) {

      $("result").innerHTML = `
        🎉 ${escapeHtml(game.winner.name)} WINT! 🎉
        <br>
        <small>
          Gok:
          ${String(game.winner.guess).padStart(6, "0")}
          · Verschil:
          ${game.winner.diff}
        </small>
      `;

      confetti();
    }

  }

  else {

    clearInterval(timerHandle);

    $("timer").textContent =
      game.duration || 30;

    $("displayText").textContent =
      "Doe mee via je telefoon!";

    $("result").classList.add("hidden");

  }
}


function startDisplayTimer(endTime) {

  clearInterval(timerHandle);

  const tick = () => {

    const left =
      Math.max(
        0,
        Math.ceil(
          (endTime - Date.now()) / 1000
        )
      );

    $("timer").textContent =
      left;

    if (left <= 0) {

      clearInterval(timerHandle);

      $("displayText").textContent =
        "🔒 INSCHRIJVING GESLOTEN";

    }
  };

  tick();

  timerHandle =
    setInterval(tick, 200);
}

// --------------------------------------------------
// INZENDINGEN
// --------------------------------------------------

onValue(entriesRef, snapshot => {

  const data =
    snapshot.val() || {};

  const entries =
    Object.values(data);

  if (!isDisplay) {
    return;
  }

  $("entriesCount").textContent =
    `${entries.length} deelnemer${
      entries.length === 1 ? "" : "s"
    } hebben meegedaan`;

  $("entries").innerHTML =
    entries.map(entry => `
      <div class="entry">
        ${escapeHtml(entry.name)}
        —
        <b>
          ${String(entry.guess).padStart(6, "0")}
        </b>
      </div>
    `).join("");

});

// --------------------------------------------------
// HTML VEILIG MAKEN
// --------------------------------------------------

function escapeHtml(value) {

  return String(value).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );
}

// --------------------------------------------------
// CONFETTI
// --------------------------------------------------

function confetti() {

  for (let i = 0; i < 90; i++) {

    const el =
      document.createElement("div");

    el.textContent =
      ["🎉", "✨", "🎊", "⭐"][
        Math.floor(
          Math.random() * 4
        )
      ];

    el.style.position = "fixed";
    el.style.left =
      Math.random() * 100 + "vw";
    el.style.top = "-40px";
    el.style.fontSize =
      18 + Math.random() * 28 + "px";
    el.style.zIndex = 9999;

    el.style.transition =
      `transform ${
        2 + Math.random() * 2
      }s linear,
       top ${
        2 + Math.random() * 2
      }s linear`;

    document.body.appendChild(el);

    requestAnimationFrame(() => {

      el.style.top = "110vh";

      el.style.transform =
        `rotate(${
          Math.random() * 900 - 450
        }deg)`;

    });

    setTimeout(
      () => el.remove(),
      4500
    );
  }
}
