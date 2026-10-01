import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  remove,
  serverTimestamp
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
// PAGINA TYPE
// --------------------------------------------------

if (isDisplay) {
  hide("join");
  hide("waiting");
  hide("admin");
  show("display");
}
else if (isAdmin) {
  hide("join");
  hide("waiting");
  hide("display");
  show("admin");
}
else {
  hide("display");
  hide("admin");
  show("join");
}

// --------------------------------------------------
// FIREBASE AUTH
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

  if (!game.status) {
    return;
  }

  if (game.status === "open") {

    const endTime =
      Number(game.startedAt) +
      Number(game.duration) * 1000;

    const remaining =
      endTime - Date.now();

    if (remaining <= 0) {
      closeParticipantForm();
      return;
    }

    show("join");
    hide("waiting");

    startParticipantTimer(endTime);

  } else {

    // Ronde is niet open
    closeParticipantForm();
  }
}

function startParticipantTimer(endTime) {

  clearInterval(timerHandle);

  const update = () => {

    const remaining =
      Math.max(0, endTime - Date.now());

    const seconds =
      Math.ceil(remaining / 1000);

    const message = $("joinMsg");

    if (message) {
      message.textContent =
        `Nog ${seconds} seconden om mee te doen.`;
    }

    if (remaining <= 0) {
      clearInterval(timerHandle);
      closeParticipantForm();
    }
  };

  update();

  timerHandle = setInterval(update, 200);
}

function closeParticipantForm() {

  clearInterval(timerHandle);

  hide("join");
  hide("waiting");

  // Maak een aparte melding zichtbaar
  let closed = document.getElementById("closedMessage");

  if (!closed) {

    closed = document.createElement("section");

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

    document.getElementById("app").appendChild(closed);
  }

  show("closedMessage");
}


// --------------------------------------------------
// MEEDOEN
// --------------------------------------------------

$("joinBtn")?.addEventListener("click", async () => {

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

    // Eerst lokaal controleren
    const gameSnapshot =
      await new Promise(resolve =>
        onValue(
          gameRef,
          resolve,
          { onlyOnce: true }
        )
      );

    const game =
      gameSnapshot.val();

    if (!game ||
        game.status !== "open") {

      throw new Error(
        "ROUND_CLOSED"
      );
    }

    const endTime =
      Number(game.startedAt) +
      Number(game.duration) * 1000;

    if (Date.now() >= endTime) {

      throw new Error(
        "ROUND_CLOSED"
      );
    }

    // Inzending opslaan
    const item =
      push(entriesRef);

    await set(item, {

      name: name,

      guess: Number(guess),

      createdAt: serverTimestamp()

    });

    hide("join");

    $("savedGuess").textContent =
      `${name}, jouw gok is ${guess}.`;

    hide("closedMessage");
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
        "De inschrijving is gesloten of er ging iets mis.";

    }
  }
});


// --------------------------------------------------
// ADMIN: RONDE STARTEN
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

      // Eerst oude inzendingen verwijderen
      await remove(entriesRef);

      // startedAt wordt door Firebase
      // zelf bepaald met de serverklok
      await set(gameRef, {

        status: "open",

        duration: duration,

        startedAt: serverTimestamp()

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
// ADMIN: CODE + WINNAAR
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

      // 000000 t/m 999999
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

  if (!game.status) {
    return;
  }

  if (game.status === "open") {

    const endTime =
      Number(game.startedAt) +
      Number(game.duration) * 1000;

    $("displayText").textContent =
      "Vul je gok in op je telefoon!";

    $("result").classList.add("hidden");

    startDisplayTimer(endTime);

  }

  else if (
    game.status === "revealed"
  ) {

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

      $("timer").textContent =
        "0";

    }

  };

  tick();

  timerHandle =
    setInterval(tick, 200);
}


// --------------------------------------------------
// INZENDINGEN OP GROOT SCHERM
// --------------------------------------------------

onValue(entriesRef, snapshot => {

  const data =
    snapshot.val() || {};

  const entries =
    Object.values(data);

  if (isDisplay) {

    $("entriesCount").textContent =
      `${entries.length} deelnemer${
        entries.length === 1 ? "" : "s"
      } hebben meegedaan`;

    $("entries").innerHTML =
      entries
        .map(entry => `
          <div class="entry">
            ${escapeHtml(entry.name)}
            —
            <b>
              ${String(entry.guess).padStart(6, "0")}
            </b>
          </div>
        `)
        .join("");

  }

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

  for (
    let i = 0;
    i < 90;
    i++
  ) {

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
