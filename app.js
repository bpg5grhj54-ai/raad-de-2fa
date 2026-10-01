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


// ==================================================
// FIREBASE
// ==================================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const gameRef = ref(db, "game");
const entriesRef = ref(db, "entries");

const $ = id => document.getElementById(id);

const params = new URLSearchParams(location.search);

const isDisplay =
  params.get("screen") === "display";

const isAdmin =
  params.get("admin") === "1";


// ==================================================
// PAGINA'S
// ==================================================

function show(id) {
  $(id)?.classList.remove("hidden");
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

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


// ==================================================
// AUTHENTICATIE
// ==================================================

let currentUid = null;

onAuthStateChanged(auth, user => {

  if (!user) return;

  currentUid = user.uid;

  if (isAdmin && $("adminUid")) {

    $("adminUid").textContent =
      "Jouw admin-ID: " + currentUid;

  }

});

signInAnonymously(auth)
  .catch(error => {

    console.error(
      "Firebase login fout:",
      error
    );

  });


// ==================================================
// LOKALE RONDE-INFORMATIE
// ==================================================

let currentRoundId = null;

let currentGame = null;

let timerHandle = null;


// ==================================================
// GAME STATUS VOLGEN
// ==================================================

onValue(gameRef, snapshot => {

  const game =
    snapshot.val() || {};

  currentGame = game;


  // ------------------------------
  // GROOT SCHERM
  // ------------------------------

  if (isDisplay) {

    renderDisplay(game);

  }


  // ------------------------------
  // DEELNEMER
  // ------------------------------

  if (!isAdmin && !isDisplay) {

    renderParticipant(game);

  }

});


// ==================================================
// DEELNEMER
// ==================================================

function renderParticipant(game) {

  // Geen actieve ronde
  if (
    !game ||
    game.status !== "open"
  ) {

    closeParticipantForm();

    return;

  }


  const roundId =
    game.roundId;

  const startedAt =
    Number(game.startedAt);

  const duration =
    Number(game.duration);


  // Ongeldige game-data
  if (
    !roundId ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(duration)
  ) {

    return;

  }


  // ==================================================
  // NIEUWE RONDE HERKENNEN
  // ==================================================

  if (
    currentRoundId !== roundId
  ) {

    currentRoundId =
      roundId;

    prepareForNewRound();

  }


  const endTime =
    startedAt +
    duration * 1000;


  // ==================================================
  // TIMER AL VOORBIJ
  // ==================================================

  if (
    Date.now() >= endTime
  ) {

    closeParticipantForm();

    return;

  }


  show("join");

  hide("waiting");

  hide("closedMessage");


  startParticipantTimer(
    endTime
  );

}


// ==================================================
// NIEUWE RONDE OP TELEFOON
// ==================================================

function prepareForNewRound() {

  clearInterval(timerHandle);


  // Naam blijft behouden!


  // Code leegmaken
  if ($("guess")) {

    $("guess").value = "";

  }


  // Eventuele oude melding verwijderen
  if ($("joinMsg")) {

    $("joinMsg").textContent = "";

  }


  // Knop opnieuw activeren
  if ($("joinBtn")) {

    $("joinBtn").disabled = false;

  }


  // Wacht-scherm verbergen
  hide("waiting");


  // Gesloten-melding verwijderen
  hide("closedMessage");


  // Invoer tonen
  show("join");

}


// ==================================================
// DEELNEMER TIMER
// ==================================================

function startParticipantTimer(
  endTime
) {

  clearInterval(timerHandle);


  const update = () => {

    const remaining =
      Math.max(
        0,
        endTime - Date.now()
      );


    const seconds =
      Math.ceil(
        remaining / 1000
      );


    if ($("joinMsg")) {

      $("joinMsg").textContent =
        `Nog ${seconds} seconden om mee te doen.`;

    }


    if (
      remaining <= 0
    ) {

      clearInterval(
        timerHandle
      );

      closeParticipantForm();

    }

  };


  update();


  timerHandle =
    setInterval(
      update,
      200
    );

}


// ==================================================
// INSCHRIJVING SLUITEN
// ==================================================

function closeParticipantForm() {

  clearInterval(
    timerHandle
  );


  hide("join");

  hide("waiting");


  let closed =
    document.getElementById(
      "closedMessage"
    );


  if (!closed) {

    closed =
      document.createElement(
        "section"
      );

    closed.id =
      "closedMessage";

    closed.className =
      "card";


    closed.innerHTML = `
      <div class="lock">🔒</div>

      <h1>
        Inschrijving gesloten
      </h1>

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


  show(
    "closedMessage"
  );

}


// ==================================================
// MEEDOEN
// ==================================================

$("joinBtn")?.addEventListener(
  "click",
  async () => {

    const name =
      $("name")
        .value
        .trim();


    const guess =
      $("guess")
        .value
        .trim();


    // ------------------------------
    // NAAM
    // ------------------------------

    if (!name) {

      $("joinMsg").textContent =
        "Vul je naam in.";

      return;

    }


    // ------------------------------
    // CODE
    // ------------------------------

    if (
      !/^\d{6}$/.test(
        guess
      )
    ) {

      $("joinMsg").textContent =
        "Vul precies 6 cijfers in.";

      return;

    }


    $("joinBtn").disabled =
      true;


    $("joinMsg").textContent =
      "Inzending controleren...";


    try {

      // ============================================
      // ACTUELE GAME OPHALEN
      // ============================================

      const snapshot =
        await new Promise(
          resolve =>

            onValue(
              gameRef,
              resolve,
              {
                onlyOnce: true
              }
            )

        );


      const game =
        snapshot.val();


      // ============================================
      // CONTROLEREN
      // ============================================

      if (
        !game ||
        game.status !== "open"
      ) {

        throw new Error(
          "ROUND_CLOSED"
        );

      }


      const roundId =
        game.roundId;


      const startedAt =
        Number(
          game.startedAt
        );


      const duration =
        Number(
          game.duration
        );


      if (
        !roundId ||
        !Number.isFinite(
          startedAt
        ) ||
        !Number.isFinite(
          duration
        )
      ) {

        throw new Error(
          "INVALID_GAME"
        );

      }


      const endTime =
        startedAt +
        duration * 1000;


      // ============================================
      // TIMER CONTROLEREN
      // ============================================

      if (
        Date.now() >= endTime
      ) {

        throw new Error(
          "ROUND_CLOSED"
        );

      }


      // ============================================
      // INZENDING OPSLAAN
      // ============================================

      const item =
        push(
          entriesRef
        );


      await set(
        item,
        {

          name: name,

          guess:
            Number(guess),

          roundId:
            roundId,

          createdAt:
            Date.now()

        }
      );


      // ============================================
      // GELUKT
      // ============================================

      hide("join");

      hide(
        "closedMessage"
      );


      $("savedGuess")
        .textContent =
        `${name}, jouw gok is ${guess}.`;


      show(
        "waiting"
      );

    }


    catch (error) {

      console.error(
        "Inzending mislukt:",
        error
      );


      $("joinBtn")
        .disabled = false;


      if (
        error.message ===
        "ROUND_CLOSED"
      ) {

        closeParticipantForm();

      }

      else {

        $("joinMsg")
          .textContent =
          "Er ging iets mis bij het versturen. Probeer opnieuw.";

      }

    }

  }
);


// ==================================================
// ADMIN — START RONDE
// ==================================================

$("startBtn")?.addEventListener(
  "click",
  async () => {

    const duration =
      Math.max(
        5,
        Math.min(
          300,
          Number(
            $("duration").value
          ) || 30
        )
      );


    try {

      // --------------------------------------------
      // OUDE INZENDINGEN WISSEN
      // --------------------------------------------

      await remove(
        entriesRef
      );


      // --------------------------------------------
      // UNIEK RONDE-ID
      // --------------------------------------------

      const roundId =
        createRoundId();


      // --------------------------------------------
      // STARTTIJD
      // --------------------------------------------

      const startedAt =
        Date.now();


      // --------------------------------------------
      // NIEUWE RONDE OPSLAAN
      // --------------------------------------------

      await set(
        gameRef,
        {

          status:
            "open",

          roundId:
            roundId,

          duration:
            duration,

          startedAt:
            startedAt

        }
      );


      $("adminStatus")
        .textContent =
        `Ronde gestart voor ${duration} seconden.`;

    }


    catch (error) {

      console.error(
        error
      );


      $("adminStatus")
        .textContent =
        "Fout bij starten van de ronde.";

    }

  }
);


// ==================================================
// UNIEK RONDE-ID
// ==================================================

function createRoundId() {

  return (
    Date.now()
    .toString(36)
    +
    "-"
    +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );

}


// ==================================================
// ADMIN — WINNAAR
// ==================================================

$("revealBtn")?.addEventListener(
  "click",
  async () => {

    try {

      const snapshot =
        await new Promise(
          resolve =>

            onValue(
              entriesRef,
              resolve,
              {
                onlyOnce: true
              }
            )

        );


      const data =
        snapshot.val() || {};


      // --------------------------------------------
      // ALLEEN INZENDINGEN VAN HUIDIGE RONDE
      // --------------------------------------------

      const entries =
        Object.values(data)
          .filter(
            entry =>
              entry.roundId ===
              currentGame?.roundId
          );


      if (
        !entries.length
      ) {

        $("adminStatus")
          .textContent =
          "Er zijn nog geen deelnemers.";

        return;

      }


      // --------------------------------------------
      // CODE
      // --------------------------------------------

      const code =
        Math.floor(
          Math.random() *
          1000000
        );


      let winner =
        null;


      // --------------------------------------------
      // TOP 3 BEPALEN
      // --------------------------------------------

const rankedEntries =
  entries
    .map(entry => {

      const guess =
        Number(entry.guess);

      const diff =
        Math.abs(
          guess - code
        );

      return {
        name: entry.name,
        guess: guess,
        diff: diff
      };

    })
    .sort(
      (a, b) => a.diff - b.diff
    );


// Eerste deelnemer is de winnaar
winner =
  rankedEntries[0];


// De beste drie
const top3 =
  rankedEntries.slice(0, 3);


      // --------------------------------------------
      // RESULTAAT OPSLAAN
      // --------------------------------------------

      await set(
        gameRef,
        {

          status:
            "revealed",

          roundId:
            currentGame.roundId,

          code:
            code,

          winner:
            winner

        }
      );


      $("adminStatus")
        .textContent =
        `Code: ${String(code).padStart(6, "0")}`;

    }


    catch (error) {

      console.error(
        error
      );


      $("adminStatus")
        .textContent =
        "Fout bij tonen van de winnaar.";

    }

  }
);


// ==================================================
// ADMIN — NIEUWE RONDE
// ==================================================

$("resetBtn")?.addEventListener(
  "click",
  async () => {

    try {

      await remove(
        entriesRef
      );


      await set(
        gameRef,
        {

          status:
            "idle",

          roundId:
            null,

          duration:
            Number(
              $("duration").value
            ) || 30

        }
      );


      $("adminStatus")
        .textContent =
        "Nieuwe ronde klaar.";

    }


    catch (error) {

      console.error(
        error
      );


      $("adminStatus")
        .textContent =
        "Fout bij starten van nieuwe ronde.";

    }

  }
);


// ==================================================
// GROOT SCHERM
// ==================================================

function renderDisplay(
  game
) {

  if (
    !game ||
    !game.status
  ) {

    return;

  }


  // ----------------------------------------------
  // OPEN
  // ----------------------------------------------

  if (
    game.status ===
    "open"
  ) {

    const startedAt =
      Number(
        game.startedAt
      );


    const duration =
      Number(
        game.duration
      );


    if (
      !Number.isFinite(
        startedAt
      ) ||
      !Number.isFinite(
        duration
      )
    ) {

      return;

    }


    const endTime =
      startedAt +
      duration * 1000;


    $("displayText")
      .textContent =
      "Vul je gok in op je telefoon!";


    $("result")
      .classList
      .add(
        "hidden"
      );


    startDisplayTimer(
      endTime
    );

  }


  // ----------------------------------------------
  // REVEALED
  // ----------------------------------------------

  else if (
    game.status ===
    "revealed"
  ) {

    clearInterval(
      timerHandle
    );


    $("timer")
      .textContent =
      String(
        game.code
      ).padStart(
        6,
        "0"
      );


    $("displayText")
      .textContent =
      "DE 2FA-CODE IS...";


    $("result")
      .classList
      .remove(
        "hidden"
      );


    if (
      game.winner
    ) {

      $("result")
        .innerHTML = `
          🎉 ${escapeHtml(
            game.winner.name
          )} WINT! 🎉

          <br>

          <small>
            Gok:
            ${String(
              game.winner.guess
            ).padStart(
              6,
              "0"
            )}

            · Verschil:
            ${game.winner.diff}
          </small>
        `;


      confetti();

    }

  }


  // ----------------------------------------------
  // IDLE
  // ----------------------------------------------

  else {

    clearInterval(
      timerHandle
    );


    $("timer")
      .textContent =
      game.duration ||
      30;


    $("displayText")
      .textContent =
      "Doe mee via je telefoon!";


    $("result")
      .classList
      .add(
        "hidden"
      );

  }

}


// ==================================================
// DISPLAY TIMER
// ==================================================

function startDisplayTimer(
  endTime
) {

  clearInterval(
    timerHandle
  );


  const tick = () => {

    const left =
      Math.max(
        0,
        Math.ceil(
          (
            endTime -
            Date.now()
          ) / 1000
        )
      );


    $("timer")
      .textContent =
      left;


    if (
      left <= 0
    ) {

      clearInterval(
        timerHandle
      );


      $("displayText")
        .textContent =
        "🔒 INSCHRIJVING GESLOTEN";

    }

  };


  tick();


  timerHandle =
    setInterval(
      tick,
      200
    );

}

// ==================================================
// INZENDINGEN
// ==================================================

onValue(
  entriesRef,
  snapshot => {

    if (!isDisplay) {
      return;
    }

    const data =
      snapshot.val() || {};

    // We gebruiken Object.entries zodat iedere
    // Firebase-inzending zijn eigen unieke key behoudt.
    const entries =
      Object.entries(data)
        .map(([id, entry]) => ({
          id,
          ...entry
        }))
        .filter(
          entry =>
            entry.roundId ===
            currentGame?.roundId
        );


    // AANTAL DEELNEMERS
    $("entriesCount").textContent =
      `${entries.length} deelnemer${
        entries.length === 1
          ? ""
          : "s"
      } hebben meegedaan`;


    // OVERZICHT
    $("entries").innerHTML =
      entries
        .map(
          entry => {

            const guess =
              String(
                entry.guess
              ).padStart(
                6,
                "0"
              );

            return `
              <div class="entry">

                ${escapeHtml(
                  entry.name
                )}

                —

                <b>
                  ${guess}
                </b>

              </div>
            `;

          }
        )
        .join("");

  }
);

// ==================================================
// HTML VEILIG MAKEN
// ==================================================

function escapeHtml(
  value
) {

  return String(
    value
  ).replace(
    /[&<>"']/g,
    char => ({

      "&":
        "&amp;",

      "<":
        "&lt;",

      ">":
        "&gt;",

      '"':
        "&quot;",

      "'":
        "&#039;"

    }[char])
  );

}


// ==================================================
// CONFETTI
// ==================================================

function confetti() {

  for (
    let i = 0;
    i < 90;
    i++
  ) {

    const el =
      document.createElement(
        "div"
      );


    el.textContent =
      [
        "🎉",
        "✨",
        "🎊",
        "⭐"
      ][
        Math.floor(
          Math.random() * 4
        )
      ];


    el.style.position =
      "fixed";


    el.style.left =
      Math.random() *
      100 +
      "vw";


    el.style.top =
      "-40px";


    el.style.fontSize =
      18 +
      Math.random() *
      28 +
      "px";


    el.style.zIndex =
      9999;


    el.style.transition =
      `transform ${
        2 +
        Math.random() *
        2
      }s linear,
       top ${
        2 +
        Math.random() *
        2
      }s linear`;


    document.body.appendChild(
      el
    );


    requestAnimationFrame(
      () => {

        el.style.top =
          "110vh";


        el.style.transform =
          `rotate(${
            Math.random() *
            900 -
            450
          }deg)`;

      }
    );


    setTimeout(
      () =>
        el.remove(),
      4500
    );

  }

}
