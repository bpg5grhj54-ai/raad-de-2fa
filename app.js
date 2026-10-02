// ============================================================
// RAAD DE 2FA - VOLLEDIGE APP.JS
// ============================================================
//
// Gewone URL:
// https://.../raad-de-2fa/
//
// Admin:
// https://.../raad-de-2fa/?admin=1
//
// Groot scherm:
// https://.../raad-de-2fa/?screen=display
//
// ============================================================

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


// ============================================================
// FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);
const auth = getAuth(app);

const gameRef = ref(db, "game");
const entriesRef = ref(db, "entries");


// ============================================================
// ELEMENT HELPER
// ============================================================

const $ = (id) => document.getElementById(id);


// ============================================================
// URL / SCHERM-MODUS
// ============================================================

const params = new URLSearchParams(
  window.location.search
);

const isAdmin =
  params.get("admin") === "1";

const isDisplay =
  params.get("screen") === "display";


// ============================================================
// SCHERMEN
// ============================================================

function show(id) {

  const element = $(id);

  if (element) {
    element.classList.remove("hidden");
  }

}


function hide(id) {

  const element = $(id);

  if (element) {
    element.classList.add("hidden");
  }

}


// Bij het openen eerst alles verbergen
hide("join");
hide("waiting");
hide("display");
hide("admin");


// Daarna precies het juiste scherm tonen
if (isDisplay) {

  show("display");

}
else if (isAdmin) {

  show("admin");

}
else {

  show("join");

}


// ============================================================
// VARIABELEN
// ============================================================

let currentUid = null;

let currentGame = null;

let currentRoundId = null;

let timerHandle = null;

let latestEntries = [];

let confettiShownForRound = null;


// ============================================================
// FIREBASE AUTH
// ============================================================

onAuthStateChanged(
  auth,
  (user) => {

    if (!user) {
      return;
    }

    currentUid = user.uid;

    if (
      isAdmin &&
      $("adminUid")
    ) {

      $("adminUid").textContent =
        "Jouw admin-ID: " +
        currentUid;

    }

  }
);


signInAnonymously(auth)
  .catch(
    (error) => {

      console.error(
        "Firebase login fout:",
        error
      );

      if (isAdmin) {

        setAdminStatus(
          "Firebase login fout: " +
          getErrorMessage(error)
        );

      }

    }
  );


// ============================================================
// GAME LISTENER
// ============================================================

onValue(
  gameRef,
  (snapshot) => {

    const game =
      snapshot.val() || null;

    currentGame = game;


    // Groot scherm
    if (isDisplay) {

      renderDisplay(game);

    }


    // Mobiele telefoon
    else if (!isAdmin) {

      renderParticipant(game);

    }

  },
  (error) => {

    console.error(
      "Game listener fout:",
      error
    );

    if (isAdmin) {

      setAdminStatus(
        "Firebase leesfout: " +
        getErrorMessage(error)
      );

    }

  }
);


// ============================================================
// ENTRIES LISTENER
// ============================================================

onValue(
  entriesRef,
  (snapshot) => {

    const data =
      snapshot.val() || {};


    latestEntries =
      Object.entries(data)
        .map(
          ([id, entry]) => ({
            id,
            ...entry
          })
        );


    if (!isDisplay) {
      return;
    }


    const roundEntries =
      latestEntries.filter(
        (entry) =>
          entry.roundId ===
          currentGame?.roundId
      );


    // Aantal deelnemers
    if ($("entriesCount")) {

      $("entriesCount").textContent =
        `${roundEntries.length} deelnemer${
          roundEntries.length === 1
            ? ""
            : "s"
        }`;

    }


    // Deelnemerslijst
    if ($("entries")) {

      $("entries").innerHTML =
        roundEntries
          .map(
            (entry) => `
              <div class="entry">
                ${escapeHtml(entry.name)}
                —
                <b>
                  ${formatCode(entry.guess)}
                </b>
              </div>
            `
          )
          .join("");

    }

  },
  (error) => {

    console.error(
      "Entries listener fout:",
      error
    );

  }
);


// ============================================================
// MOBIELE PAGINA
// ============================================================

function renderParticipant(game) {

  // ----------------------------------------------------------
  // GEEN GAME
  // ----------------------------------------------------------

  if (!game) {

    return;

  }


  // ----------------------------------------------------------
  // NIEUWE RONDE
  // ----------------------------------------------------------

  if (
    game.roundId &&
    currentRoundId !== game.roundId
  ) {

    currentRoundId =
      game.roundId;

    resetParticipantForNewRound();

  }


  // ----------------------------------------------------------
  // OPEN RONDE
  // ----------------------------------------------------------

  if (
    game.status === "open"
  ) {

    const startedAt =
      Number(game.startedAt);

    const duration =
      Number(game.duration);


    if (
      !game.roundId ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(duration)
    ) {

      return;

    }


    const endTime =
      startedAt +
      duration * 1000;


    // Timer is al afgelopen
    if (
      Date.now() >= endTime
    ) {

      closeParticipantForm();

      return;

    }


    // Invoer weer beschikbaar
    show("join");

    hide("waiting");


    if ($("joinBtn")) {

      $("joinBtn").disabled =
        false;

    }


    if ($("guess")) {

      $("guess").disabled =
        false;

    }


    startParticipantTimer(
      endTime
    );


    return;

  }


  // ----------------------------------------------------------
  // UITSLAG
  // ----------------------------------------------------------

  if (
    game.status === "revealed"
  ) {

    clearInterval(timerHandle);

    // Niets meer veranderen aan de
    // telefoon. De melding blijft staan.

    return;

  }


  // ----------------------------------------------------------
  // IDLE
  // ----------------------------------------------------------

  if (
    game.status === "idle"
  ) {

    clearInterval(timerHandle);

    return;

  }

}


// ============================================================
// NIEUWE RONDE OP TELEFOON
// ============================================================

function resetParticipantForNewRound() {

  clearInterval(timerHandle);


  // ----------------------------------------------------------
  // NAAM BEHOUDEN
  // ----------------------------------------------------------

  // We wissen bewust NIET:
  // $("name").value


  // ----------------------------------------------------------
  // CODE WISSEN
  // ----------------------------------------------------------

  if ($("guess")) {

    $("guess").value = "";

    $("guess").disabled = false;

  }


  // ----------------------------------------------------------
  // MELDING WISSEN
  // ----------------------------------------------------------

  if ($("joinMsg")) {

    $("joinMsg").textContent = "";

  }


  // ----------------------------------------------------------
  // KNOP RESETTEN
  // ----------------------------------------------------------

  if ($("joinBtn")) {

    $("joinBtn").disabled = false;

  }


  // ----------------------------------------------------------
  // WACHTSCHERM WEG
  // ----------------------------------------------------------

  hide("waiting");


  // ----------------------------------------------------------
  // DEELNAMEFORMULIER TONEN
  // ----------------------------------------------------------

  show("join");

}


// ============================================================
// TELEFOON TIMER
// ============================================================

function startParticipantTimer(endTime) {

  clearInterval(timerHandle);


  function updateTimer() {

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


    if (remaining <= 0) {

      clearInterval(timerHandle);

      closeParticipantForm();

    }

  }


  updateTimer();


  timerHandle =
    setInterval(
      updateTimer,
      200
    );

}


// ============================================================
// INSCHRIJVING SLUITEN
// ============================================================

function closeParticipantForm() {

  clearInterval(timerHandle);


  // ----------------------------------------------------------
  // FORMULIER BLIJFT ZICHTBAAR
  // ----------------------------------------------------------

  show("join");

  hide("waiting");


  // ----------------------------------------------------------
  // KNOP UITSCHAKELEN
  // ----------------------------------------------------------

  if ($("joinBtn")) {

    $("joinBtn").disabled =
      true;

  }


  // ----------------------------------------------------------
  // CODEVELD UITSCHAKELEN
  // ----------------------------------------------------------

  if ($("guess")) {

    $("guess").disabled =
      true;

  }


  // ----------------------------------------------------------
  // MELDING
  // ----------------------------------------------------------

  if ($("joinMsg")) {

    $("joinMsg").textContent =
      "🔒 De inschrijving is gesloten.";

  }

}


// ============================================================
// MEEDOEN
// ============================================================

$("joinBtn")?.addEventListener(
  "click",
  async () => {

    const name =
      $("name")?.value.trim() || "";

    const guess =
      $("guess")?.value.trim() || "";


    // --------------------------------------------------------
    // NAAM
    // --------------------------------------------------------

    if (!name) {

      $("joinMsg").textContent =
        "Vul je naam in.";

      return;

    }


    // --------------------------------------------------------
    // CODE
    // --------------------------------------------------------

    if (!/^\d{6}$/.test(guess)) {

      $("joinMsg").textContent =
        "Vul precies 6 cijfers in.";

      return;

    }


    $("joinBtn").disabled =
      true;


    $("joinMsg").textContent =
      "Inzending controleren...";


    try {

      // ------------------------------------------------------
      // ACTUELE GAME OPHALEN
      // ------------------------------------------------------

      const gameSnapshot =
        await getOnce(gameRef);

      const game =
        gameSnapshot.val();


      if (
        !game ||
        game.status !== "open"
      ) {

        throw new Error(
          "De inschrijving is gesloten."
        );

      }


      const roundId =
        game.roundId;

      const startedAt =
        Number(game.startedAt);

      const duration =
        Number(game.duration);


      const endTime =
        startedAt +
        duration * 1000;


      // ------------------------------------------------------
      // TIMER CONTROLEREN
      // ------------------------------------------------------

      if (
        Date.now() >= endTime
      ) {

        throw new Error(
          "De inschrijving is gesloten."
        );

      }


      // ------------------------------------------------------
      // NIEUWE UNIEKE INZENDING
      // ------------------------------------------------------
      //
      // push() zorgt ervoor dat:
      //
      // Martin -> 123456
      // Piet   -> 123456
      // Jan    -> 123456
      //
      // alle drie afzonderlijke deelnemers blijven.
      //

      const entryRef =
        push(entriesRef);


      await set(
        entryRef,
        {
          name: name,
          guess: Number(guess),
          roundId: roundId,
          createdAt: Date.now()
        }
      );


      // ------------------------------------------------------
      // GELUKT
      // ------------------------------------------------------

      hide("join");


      if ($("savedGuess")) {

        $("savedGuess").textContent =
          `${name}, jouw gok is ${formatCode(guess)}.`;

      }


      show("waiting");

    }

    catch (error) {

      console.error(
        "Inzending mislukt:",
        error
      );


      $("joinBtn").disabled =
        false;


      $("joinMsg").textContent =
        getErrorMessage(error);

    }

  }
);


// ============================================================
// ADMIN - START RONDE
// ============================================================

$("startBtn")?.addEventListener(
  "click",
  async () => {

    const duration =
      Math.max(
        5,
        Math.min(
          300,
          Number(
            $("duration")?.value
          ) || 30
        )
      );


    setAdminStatus(
      "Ronde wordt gestart..."
    );


    try {

      // Oude inzendingen verwijderen
      await remove(entriesRef);


      // Nieuwe unieke ronde
      const roundId =
        createRoundId();


      // Nieuwe ronde opslaan
      await set(
        gameRef,
        {
          status: "open",
          roundId: roundId,
          duration: duration,
          startedAt: Date.now()
        }
      );


      setAdminStatus(
        `Ronde gestart voor ${duration} seconden.`
      );

    }

    catch (error) {

      console.error(
        "START RONDE fout:",
        error
      );


      setAdminStatus(
        "Fout bij starten van de ronde: " +
        getErrorMessage(error)
      );

    }

  }
);


// ============================================================
// ADMIN - TOON CODE & WINNAAR
// ============================================================

$("revealBtn")?.addEventListener(
  "click",
  async () => {

    setAdminStatus(
      "Uitslag wordt berekend..."
    );


    try {

      if (
        !currentGame ||
        !currentGame.roundId
      ) {

        throw new Error(
          "Er is geen actieve ronde."
        );

      }


      // Inzendingen ophalen
      const snapshot =
        await getOnce(entriesRef);

      const data =
        snapshot.val() || {};


      // Alleen huidige ronde
      const entries =
        Object.entries(data)
          .map(
            ([id, entry]) => ({
              id,
              ...entry
            })
          )
          .filter(
            (entry) =>
              entry.roundId ===
              currentGame.roundId
          );


      if (!entries.length) {

        throw new Error(
          "Er zijn nog geen deelnemers."
        );

      }


      // ------------------------------------------------------
      // 6-CIJFERIGE CODE
      // ------------------------------------------------------

      const code =
        Math.floor(
          Math.random() * 1000000
        );


      // ------------------------------------------------------
      // RANKING
      // ------------------------------------------------------

      const ranked =
        entries
          .map(
            (entry) => {

              const guess =
                Number(entry.guess);

              const diff =
                Math.abs(
                  guess - code
                );


              return {
                id: entry.id,
                name: entry.name,
                guess: guess,
                diff: diff,
                createdAt:
                  Number(entry.createdAt) || 0
              };

            }
          )
          .sort(
            (a, b) => {

              // Kleinste afstand eerst
              if (
                a.diff !== b.diff
              ) {

                return (
                  a.diff - b.diff
                );

              }


              // Bij gelijke afstand:
              // eerste inzending wint
              return (
                a.createdAt -
                b.createdAt
              );

            }
          );


      // Top 3
      const top3 =
        ranked.slice(
          0,
          3
        );


      const winner =
        top3[0];


      // ------------------------------------------------------
      // UITSLAG OPSLAAN
      // ------------------------------------------------------

      await set(
        gameRef,
        {
          status: "revealed",
          roundId: currentGame.roundId,
          code: code,
          winner: winner,
          top3: top3
        }
      );


      setAdminStatus(
        `Code: ${formatCode(code)}`
      );

    }

    catch (error) {

      console.error(
        "TOON CODE fout:",
        error
      );


      setAdminStatus(
        "Fout bij tonen van winnaar: " +
        getErrorMessage(error)
      );

    }

  }
);


// ============================================================
// ADMIN - NIEUWE RONDE
// ============================================================

$("resetBtn")?.addEventListener(
  "click",
  async () => {

    setAdminStatus(
      "Nieuwe ronde wordt klaargezet..."
    );


    try {

      // Oude inzendingen verwijderen
      await remove(entriesRef);


      // Game resetten
      await set(
        gameRef,
        {
          status: "idle",
          roundId: null,
          duration:
            Number(
              $("duration")?.value
            ) || 30
        }
      );


      setAdminStatus(
        "Nieuwe ronde klaar."
      );

    }

    catch (error) {

      console.error(
        "NIEUWE RONDE fout:",
        error
      );


      setAdminStatus(
        "Fout bij nieuwe ronde: " +
        getErrorMessage(error)
      );

    }

  }
);


// ============================================================
// GROOT SCHERM
// ============================================================

function renderDisplay(game) {

  if (!game) {

    showDisplayWaiting();

    return;

  }


  // ----------------------------------------------------------
  // OPEN RONDE
  // ----------------------------------------------------------

  if (
    game.status === "open"
  ) {

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


    if ($("displayText")) {

      $("displayText").textContent =
        "Vul je gok in op je telefoon!";

    }


    if ($("result")) {

      $("result").classList.add(
        "hidden"
      );

    }


    startDisplayTimer(
      startedAt +
      duration * 1000
    );


    return;

  }


  // ----------------------------------------------------------
  // UITSLAG
  // ----------------------------------------------------------

  if (
    game.status === "revealed"
  ) {

    clearInterval(timerHandle);


    if ($("timer")) {

      $("timer").textContent =
        formatCode(game.code);

    }


    if ($("displayText")) {

      $("displayText").textContent =
        "DE 2FA-CODE IS...";

    }


    showResult(game);

    return;

  }


  // ----------------------------------------------------------
  // IDLE
  // ----------------------------------------------------------

  showDisplayWaiting();

}


// ============================================================
// GROOT SCHERM - WACHTSCHERM
// ============================================================

function showDisplayWaiting() {

  clearInterval(timerHandle);


  if ($("timer")) {

    $("timer").textContent =
      "30";

  }


  if ($("displayText")) {

    $("displayText").textContent =
      "Doe mee via je telefoon!";

  }


  if ($("result")) {

    $("result").classList.add(
      "hidden"
    );

  }

}


// ============================================================
// GROOT SCHERM - TIMER
// ============================================================

function startDisplayTimer(endTime) {

  clearInterval(timerHandle);


  function update() {

    const remaining =
      Math.max(
        0,
        endTime - Date.now()
      );


    const seconds =
      Math.ceil(
        remaining / 1000
      );


    if ($("timer")) {

      $("timer").textContent =
        seconds;

    }


    if (remaining <= 0) {

      clearInterval(timerHandle);


      if ($("displayText")) {

        $("displayText").textContent =
          "🔒 INSCHRIJVING GESLOTEN";

      }

    }

  }


  update();


  timerHandle =
    setInterval(
      update,
      200
    );

}


// ============================================================
// UITSLAG OP GROOT SCHERM
// ============================================================

function showResult(game) {

  if (!$("result")) {
    return;
  }


  let top3 =
    Array.isArray(game.top3)
      ? game.top3
      : [];


  // ----------------------------------------------------------
  // FALLBACK TOP 3
  // ----------------------------------------------------------

  if (
    top3.length === 0 &&
    latestEntries.length > 0
  ) {

    top3 =
      latestEntries
        .filter(
          (entry) =>
            entry.roundId ===
            game.roundId
        )
        .map(
          (entry) => {

            const guess =
              Number(entry.guess);

            return {
              id: entry.id,
              name: entry.name,
              guess: guess,
              diff:
                Math.abs(
                  guess -
                  Number(game.code)
                ),
              createdAt:
                Number(entry.createdAt) || 0
            };

          }
        )
        .sort(
          (a, b) => {

            if (
              a.diff !== b.diff
            ) {

              return (
                a.diff - b.diff
              );

            }

            return (
              a.createdAt -
              b.createdAt
            );

          }
        )
        .slice(
          0,
          3
        );

  }


  if (!top3.length) {

    $("result").innerHTML = `
      <div style="
        text-align:center;
        font-size:2rem;
        font-weight:900;
      ">
        Geen deelnemers.
      </div>
    `;

    $("result").classList.remove(
      "hidden"
    );

    return;

  }


  // ----------------------------------------------------------
  // MEDAILLES
  // ----------------------------------------------------------

  const medals = [
    "🥇",
    "🥈",
    "🥉"
  ];


  const places = [
    "1e PLAATS",
    "2e PLAATS",
    "3e PLAATS"
  ];


  const winner =
    top3[0];


  // ----------------------------------------------------------
  // HTML TOP 3
  // ----------------------------------------------------------

  $("result").innerHTML = `

    <div style="
      text-align:center;
      margin-bottom:25px;
    ">

      <div style="
        font-size:clamp(2rem,5vw,4rem);
        font-weight:900;
      ">

        🎉
        ${escapeHtml(winner.name)}
        WINT!
        🎉

      </div>

    </div>


    <div style="
      display:flex;
      justify-content:center;
      align-items:stretch;
      gap:18px;
      flex-wrap:wrap;
      width:100%;
    ">

      ${top3
        .map(
          (entry, index) => `

            <div style="
              flex:1 1 220px;
              max-width:320px;
              min-width:210px;
              padding:22px;
              border-radius:22px;
              background:rgba(255,255,255,.10);
              border:2px solid rgba(255,255,255,.20);
              text-align:center;
              box-sizing:border-box;
            ">

              <div style="
                font-size:clamp(2.5rem,6vw,4.5rem);
                line-height:1;
              ">

                ${medals[index]}

              </div>


              <div style="
                font-size:1.2rem;
                font-weight:900;
                margin-top:10px;
              ">

                ${places[index]}

              </div>


              <div style="
                font-size:clamp(1.4rem,3vw,2.3rem);
                font-weight:900;
                margin-top:12px;
              ">

                ${escapeHtml(entry.name)}

              </div>


              <div style="
                font-size:1.4rem;
                font-weight:800;
                margin-top:8px;
              ">

                ${formatCode(entry.guess)}

              </div>


              <div style="
                margin-top:8px;
                opacity:.85;
              ">

                Verschil:
                <strong>
                  ${entry.diff}
                </strong>

              </div>

            </div>

          `
        )
        .join("")}

    </div>

  `;


  $("result").classList.remove(
    "hidden"
  );


  // ----------------------------------------------------------
  // CONFETTI
  // ----------------------------------------------------------

  if (
    confettiShownForRound !==
    game.roundId
  ) {

    confettiShownForRound =
      game.roundId;

    confetti();

  }

}


// ============================================================
// ADMIN STATUS
// ============================================================

function setAdminStatus(message) {

  if ($("adminStatus")) {

    $("adminStatus").textContent =
      message;

  }

}


// ============================================================
// UNIEK RONDE-ID
// ============================================================

function createRoundId() {

  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .substring(
        2,
        10
      )
  );

}


// ============================================================
// FIREBASE - ÉÉN KEER OPHALEN
// ============================================================

function getOnce(databaseRef) {

  return new Promise(
    (resolve, reject) => {

      onValue(
        databaseRef,
        resolve,
        reject,
        {
          onlyOnce: true
        }
      );

    }
  );

}


// ============================================================
// CODE FORMATTEREN
// ============================================================

function formatCode(value) {

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {

    return "000000";

  }


  return String(value)
    .padStart(
      6,
      "0"
    );

}


// ============================================================
// HTML VEILIG MAKEN
// ============================================================

function escapeHtml(value) {

  return String(value)
    .replace(
      /[&<>"']/g,
      (character) => {

        const entities = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        };

        return entities[character];

      }
    );

}


// ============================================================
// CONFETTI
// ============================================================

function confetti() {

  for (
    let i = 0;
    i < 90;
    i++
  ) {

    const element =
      document.createElement(
        "div"
      );


    const symbols = [
      "🎉",
      "✨",
      "🎊",
      "⭐"
    ];


    element.textContent =
      symbols[
        Math.floor(
          Math.random() *
          symbols.length
        )
      ];


    element.style.position =
      "fixed";

    element.style.left =
      Math.random() * 100 +
      "vw";

    element.style.top =
      "-40px";

    element.style.fontSize =
      18 +
      Math.random() * 28 +
      "px";

    element.style.zIndex =
      "9999";

    element.style.pointerEvents =
      "none";

    element.style.transition =
      `top ${
        2 +
        Math.random() * 2
      }s linear,
      transform ${
        2 +
        Math.random() * 2
      }s linear`;


    document.body.appendChild(
      element
    );


    requestAnimationFrame(
      () => {

        element.style.top =
          "110vh";

        element.style.transform =
          `rotate(${
            Math.random() * 900 -
            450
          }deg)`;

      }
    );


    setTimeout(
      () => {

        element.remove();

      },
      4500
    );

  }

}
