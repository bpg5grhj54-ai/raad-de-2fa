// ============================================================
// RAAD DE 2FA
// Volledige app.js
//
// Pagina's:
// normaal                     = telefoon
// ?admin=1                    = spelbesturing
// ?screen=display             = groot scherm
//
// Behoudt:
// - Firebase
// - anonieme login
// - unieke roundId
// - nieuwe telefoons tijdens actieve ronde
// - timer
// - inzendingen na timer blokkeren
// - dubbele codes toestaan
// - Top 3
// - winnaar
// - confetti
// ============================================================


import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";


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


import {
  firebaseConfig
} from "./firebase-config.js";


// ============================================================
// FIREBASE
// ============================================================

const app =
  initializeApp(
    firebaseConfig
  );


const db =
  getDatabase(
    app
  );


const auth =
  getAuth(
    app
  );


const gameRef =
  ref(
    db,
    "game"
  );


const entriesRef =
  ref(
    db,
    "entries"
  );


// ============================================================
// HULPFUNCTIE
// ============================================================

const $ =
  id =>
    document.getElementById(
      id
    );


// ============================================================
// URL MODUS
// ============================================================

const params =
  new URLSearchParams(
    window.location.search
  );


const isAdmin =
  params.get("admin") === "1";


const isDisplay =
  params.get("screen") === "display";


// ============================================================
// PAGINA'S
// ============================================================
//
// We gebruiken hier bewust inline display-stijlen.
// Daardoor zijn we niet afhankelijk van een .hidden CSS-class.
// ============================================================

function show(id) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  element.style.display =
    "";

}


function hide(id) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  element.style.display =
    "none";

}


// Eerst alles verbergen
hide("join");
hide("waiting");
hide("admin");
hide("display");


// Daarna exact één modus tonen
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
// AUTHENTICATIE
// ============================================================

let currentUid =
  null;


onAuthStateChanged(
  auth,
  user => {

    if (!user) {
      return;
    }

    currentUid =
      user.uid;


    if (
      isAdmin &&
      $("adminUid")
    ) {

      $("adminUid")
        .textContent =
        "Jouw admin-ID: " +
        currentUid;

    }

  }
);


signInAnonymously(
  auth
)
.catch(
  error => {

    console.error(
      "Firebase login fout:",
      error
    );

    if (
      isAdmin &&
      $("adminStatus")
    ) {

      $("adminStatus")
        .textContent =
        "Firebase login fout: " +
        getErrorMessage(
          error
        );

    }

  }
);


// ============================================================
// LOKALE STATUS
// ============================================================

let currentRoundId =
  null;


let currentGame =
  null;


let timerHandle =
  null;


let latestEntries =
  [];


// ============================================================
// FIREBASE GAME VOLGEN
// ============================================================

onValue(
  gameRef,
  snapshot => {

    const game =
      snapshot.val() ||
      {};

    currentGame =
      game;


    // ----------------------------------------
    // GROOT SCHERM
    // ----------------------------------------

    if (isDisplay) {

      renderDisplay(
        game
      );

    }


    // ----------------------------------------
    // TELEFOON
    // ----------------------------------------

    if (
      !isAdmin &&
      !isDisplay
    ) {

      renderParticipant(
        game
      );

    }

  },
  error => {

    console.error(
      "Game listener fout:",
      error
    );


    if (isAdmin) {

      showAdminError(
        "Firebase leesfout: ",
        error
      );

    }

  }
);


// ============================================================
// TELEFOON — GAME WEERGEVEN
// ============================================================

function renderParticipant(
  game
) {

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
    Number(
      game.startedAt
    );


  const duration =
    Number(
      game.duration
    );


  // Ongeldige game
  if (
    !roundId ||
    !Number.isFinite(
      startedAt
    ) ||
    !Number.isFinite(
      duration
    )
  ) {

    return;

  }


  // ----------------------------------------
  // NIEUWE RONDE
  // ----------------------------------------

  if (
    currentRoundId !==
    roundId
  ) {

    currentRoundId =
      roundId;

    prepareForNewRound();

  }


  const endTime =
    startedAt +
    duration *
    1000;


  // ----------------------------------------
  // TIJD VOORBIJ
  // ----------------------------------------

  if (
    Date.now() >=
    endTime
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


// ============================================================
// TELEFOON — NIEUWE RONDE
// ============================================================

function prepareForNewRound() {

  clearInterval(
    timerHandle
  );


  // Naam blijft behouden.


  // Alleen de code wissen
  if ($("guess")) {

    $("guess").value =
      "";

  }


  // Oude foutmelding wissen
  if ($("joinMsg")) {

    $("joinMsg")
      .textContent =
      "";

  }


  // Knop weer actief
  if ($("joinBtn")) {

    $("joinBtn")
      .disabled =
      false;

  }


  // Oude schermen weg
  hide("waiting");

  hide("closedMessage");


  // Invoer tonen
  show("join");

}


// ============================================================
// TELEFOON — TIMER
// ============================================================

function startParticipantTimer(
  endTime
) {

  clearInterval(
    timerHandle
  );


  function update() {

    const remaining =
      Math.max(
        0,
        endTime -
        Date.now()
      );


    const seconds =
      Math.ceil(
        remaining /
        1000
      );


    if ($("joinMsg")) {

      $("joinMsg")
        .textContent =
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

  }


  update();


  timerHandle =
    setInterval(
      update,
      200
    );

}


// ============================================================
// TELEFOON — INSCHRIJVING SLUITEN
// ============================================================

function closeParticipantForm() {

  clearInterval(
    timerHandle
  );


  hide("join");

  hide("waiting");


  let closed =
    $("closedMessage");


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

      <div class="lock">
        🔒
      </div>

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


    const appElement =
      $("app");


    if (appElement) {

      appElement.appendChild(
        closed
      );

    }

  }


  show(
    "closedMessage"
  );

}


// ============================================================
// TELEFOON — MEEDOEN
// ============================================================

$("joinBtn")?.addEventListener(
  "click",
  async () => {

    const name =
      $("name")
        ?.value
        ?.trim() ||
      "";


    const guess =
      $("guess")
        ?.value
        ?.trim() ||
      "";


    // ----------------------------------------
    // NAAM
    // ----------------------------------------

    if (!name) {

      $("joinMsg")
        .textContent =
        "Vul je naam in.";

      return;

    }


    // ----------------------------------------
    // CODE
    // ----------------------------------------

    if (
      !/^\d{6}$/.test(
        guess
      )
    ) {

      $("joinMsg")
        .textContent =
        "Vul precies 6 cijfers in.";

      return;

    }


    $("joinBtn")
      .disabled =
      true;


    $("joinMsg")
      .textContent =
      "Inzending controleren...";


    try {

      // --------------------------------------
      // ACTUELE GAME OPHALEN
      // --------------------------------------

      const snapshot =
        await getOnce(
          gameRef
        );


      const game =
        snapshot.val();


      // --------------------------------------
      // CONTROLEREN
      // --------------------------------------

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
        duration *
        1000;


      // --------------------------------------
      // TIMER CONTROLEREN
      // --------------------------------------

      if (
        Date.now() >=
        endTime
      ) {

        throw new Error(
          "ROUND_CLOSED"
        );

      }


      // --------------------------------------
      // INZENDING OPSLAAN
      //
      // push() zorgt ervoor dat twee spelers
      // met dezelfde code tóch twee aparte
      // deelnemers zijn.
      // --------------------------------------

      const item =
        push(
          entriesRef
        );


      await set(
        item,
        {

          name:
            name,

          guess:
            Number(
              guess
            ),

          roundId:
            roundId,

          createdAt:
            Date.now()

        }
      );


      // --------------------------------------
      // GELUKT
      // --------------------------------------

      hide("join");

      hide("closedMessage");


      if ($("savedGuess")) {

        $("savedGuess")
          .textContent =
          `${name}, jouw gok is ${guess}.`;

      }


      show("waiting");

    }


    catch (error) {

      console.error(
        "Inzending mislukt:",
        error
      );


      if ($("joinBtn")) {

        $("joinBtn")
          .disabled =
          false;

      }


      if (
        error.message ===
        "ROUND_CLOSED"
      ) {

        closeParticipantForm();

      }
      else {

        $("joinMsg")
          .textContent =
          "Er ging iets mis: " +
          getErrorMessage(
            error
          );

      }

    }

  }
);


// ============================================================
// ADMIN — START RONDE
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
            $("duration")
              ?.value
          ) || 30
        )
      );


    setAdminStatus(
      "Ronde wordt gestart..."
    );


    try {

      // --------------------------------------
      // OUDE INZENDINGEN WISSEN
      // --------------------------------------

      await remove(
        entriesRef
      );


      // --------------------------------------
      // UNIEK RONDE-ID
      // --------------------------------------

      const roundId =
        createRoundId();


      // --------------------------------------
      // STARTTIJD
      // --------------------------------------

      const startedAt =
        Date.now();


      // --------------------------------------
      // NIEUWE RONDE OPSLAAN
      // --------------------------------------

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


      setAdminStatus(
        `Ronde gestart voor ${duration} seconden.`
      );

    }


    catch (error) {

      console.error(
        "START RONDE fout:",
        error
      );


      showAdminError(
        "Fout bij starten van de ronde: ",
        error
      );

    }

  }
);


// ============================================================
// UNIEK RONDE-ID
// ============================================================

function createRoundId() {

  return (
    Date.now()
      .toString(36)

    +
    "-"

    +
    Math.random()
      .toString(36)
      .substring(
        2,
        10
      )
  );

}


// ============================================================
// ADMIN — TOON CODE & WINNAAR
// ============================================================

$("revealBtn")?.addEventListener(
  "click",
  async () => {

    setAdminStatus(
      "Uitslag wordt berekend..."
    );


    try {

      // --------------------------------------
      // HUIDIGE GAME CONTROLEREN
      // --------------------------------------

      if (
        !currentGame ||
        !currentGame.roundId
      ) {

        throw new Error(
          "Er is geen actieve ronde."
        );

      }


      // --------------------------------------
      // INZENDINGEN OPHALEN
      // --------------------------------------

      const snapshot =
        await getOnce(
          entriesRef
        );


      const data =
        snapshot.val() ||
        {};


      // --------------------------------------
      // ALLEEN HUIDIGE RONDE
      // --------------------------------------

      const entries =
        Object.entries(
          data
        )
        .map(
          ([id, entry]) => ({

            id,

            ...entry

          })
        )
        .filter(
          entry =>
            entry.roundId ===
            currentGame.roundId
        );


      // --------------------------------------
      // GEEN DEELNEMERS
      // --------------------------------------

      if (
        !entries.length
      ) {

        setAdminStatus(
          "Er zijn nog geen deelnemers."
        );

        return;

      }


      // --------------------------------------
      // 6-CIJFERIGE CODE
      // --------------------------------------

      const code =
        Math.floor(
          Math.random() *
          1000000
        );


      // --------------------------------------
      // RANKING MAKEN
      // --------------------------------------

      const rankedEntries =
        entries
          .map(
            entry => {

              const guess =
                Number(
                  entry.guess
                );


              const diff =
                Math.abs(
                  guess -
                  code
                );


              return {

                id:
                  entry.id,

                name:
                  entry.name,

                guess:
                  guess,

                diff:
                  diff,

                createdAt:
                  Number(
                    entry.createdAt
                  ) || 0

              };

            }
          )
          .sort(
            (a, b) => {

              // Kleinste verschil eerst
              if (
                a.diff !==
                b.diff
              ) {

                return (
                  a.diff -
                  b.diff
                );

              }


              // Bij gelijk verschil:
              // eerste inzending wint
              return (
                a.createdAt -
                b.createdAt
              );

            }
          );


      // --------------------------------------
      // TOP 3
      // --------------------------------------

      const top3 =
        rankedEntries
          .slice(
            0,
            3
          );


      const winner =
        top3[0];


      // --------------------------------------
      // RESULTAAT OPSLAAN
      // --------------------------------------

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
            winner,

          top3:
            top3

        }
      );


      setAdminStatus(
        `Code: ${String(
          code
        ).padStart(
          6,
          "0"
        )}`
      );

    }


    catch (error) {

      console.error(
        "TOON CODE fout:",
        error
      );


      showAdminError(
        "Fout bij tonen van de winnaar: ",
        error
      );

    }

  }
);


// ============================================================
// ADMIN — NIEUWE RONDE
// ============================================================

$("resetBtn")?.addEventListener(
  "click",
  async () => {

    setAdminStatus(
      "Nieuwe ronde wordt klaargezet..."
    );


    try {

      // --------------------------------------
      // INZENDINGEN WISSEN
      // --------------------------------------

      await remove(
        entriesRef
      );


      // --------------------------------------
      // GAME RESETTEN
      // --------------------------------------

      await set(
        gameRef,
        {

          status:
            "idle",

          roundId:
            null,

          duration:
            Number(
              $("duration")
                ?.value
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


      showAdminError(
        "Fout bij nieuwe ronde: ",
        error
      );

    }

  }
);


// ============================================================
// GROOT SCHERM
// ============================================================

function renderDisplay(
  game
) {

  if (
    !game ||
    !game.status
  ) {

    return;

  }


  // ----------------------------------------
  // OPEN
  // ----------------------------------------

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
      duration *
      1000;


    if ($("displayText")) {

      $("displayText")
        .textContent =
        "Vul je gok in op je telefoon!";

    }


    if ($("result")) {

      $("result")
        .classList
        .add(
          "hidden"
        );

    }


    startDisplayTimer(
      endTime
    );

    return;

  }


  // ----------------------------------------
  // UITSLAG
  // ----------------------------------------

  if (
    game.status ===
    "revealed"
  ) {

    clearInterval(
      timerHandle
    );


    if ($("timer")) {

      $("timer")
        .textContent =
        String(
          game.code
        ).padStart(
          6,
          "0"
        );

    }


    if ($("displayText")) {

      $("displayText")
        .textContent =
        "DE 2FA-CODE IS...";

    }


    if ($("result")) {

      $("result")
        .classList
        .remove(
          "hidden"
        );

    }


    // --------------------------------------
    // TOP 3
    // --------------------------------------

    let top3 =
      Array.isArray(
        game.top3
      )
        ? game.top3
        : [];


    // --------------------------------------
    // FALLBACK
    //
    // Als een oude ronde geen top3 heeft,
    // berekenen we hem opnieuw uit Firebase.
    // --------------------------------------

    if (
      top3.length === 0 &&
      game.code !== undefined &&
      latestEntries.length > 0
    ) {

      top3 =
        latestEntries
          .filter(
            entry =>
              entry.roundId ===
              game.roundId
          )
          .map(
            entry => {

              const guess =
                Number(
                  entry.guess
                );


              return {

                id:
                  entry.id,

                name:
                  entry.name,

                guess:
                  guess,

                diff:
                  Math.abs(
                    guess -
                    Number(
                      game.code
                    )
                  ),

                createdAt:
                  Number(
                    entry.createdAt
                  ) || 0

              };

            }
          )
          .sort(
            (a, b) => {

              if (
                a.diff !==
                b.diff
              ) {

                return (
                  a.diff -
                  b.diff
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


    // --------------------------------------
    // TOP 3 WEERGEVEN
    // --------------------------------------

    if (
      top3.length > 0
    ) {

      const medals = [
        "🥇",
        "🥈",
        "🥉"
      ];


      const places = [
        "1e PLAATS — GOUD",
        "2e PLAATS — ZILVER",
        "3e PLAATS — BRONS"
      ];


      if ($("result")) {

        $("result")
          .innerHTML = `

            <div
              class="winner-title"
              style="
                font-size:clamp(2rem,4vw,4rem);
                font-weight:900;
                margin-bottom:24px;
                text-align:center;
              "
            >

              🎉
              ${escapeHtml(
                top3[0].name
              )}
              WINT!
              🎉

            </div>


            <div
              style="
                display:flex;
                justify-content:center;
                align-items:flex-end;
                gap:18px;
                flex-wrap:wrap;
                width:100%;
                max-width:1100px;
                margin:0 auto;
              "
            >

              ${top3
                .map(
                  (
                    entry,
                    index
                  ) => `

                    <div
                      style="
                        background:rgba(255,255,255,.10);
                        border:2px solid rgba(255,255,255,.20);
                        border-radius:22px;
                        padding:20px 24px;
                        min-width:220px;
                        flex:1 1 220px;
                        max-width:320px;
                        box-sizing:border-box;
                        text-align:center;
                      "
                    >

                      <div
                        style="
                          font-size:clamp(2.5rem,5vw,4.5rem);
                          line-height:1;
                          margin-bottom:8px;
                        "
                      >
                        ${medals[index]}
                      </div>


                      <div
                        style="
                          font-size:clamp(1.1rem,2vw,1.6rem);
                          font-weight:900;
                          margin-bottom:10px;
                        "
                      >
                        ${places[index]}
                      </div>


                      <div
                        style="
                          font-size:clamp(1.4rem,3vw,2.3rem);
                          font-weight:900;
                          margin-bottom:8px;
                        "
                      >
                        ${escapeHtml(
                          entry.name
                        )}
                      </div>


                      <div
                        style="
                          font-size:clamp(1.2rem,2.5vw,2rem);
                          font-weight:800;
                          letter-spacing:2px;
                          margin-bottom:8px;
                        "
                      >
                        ${String(
                          entry.guess
                        ).padStart(
                          6,
                          "0"
                        )}
                      </div>


                      <div
                        style="
                          font-size:1.1rem;
                          opacity:.85;
                        "
                      >

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

      }


      confetti();

      return;

    }


    // --------------------------------------
    // OUDE WINNAAR-DATA
    // --------------------------------------

    if (
      game.winner
    ) {

      if ($("result")) {

        $("result")
          .innerHTML = `

            <div
              class="winner-title"
              style="
                font-size:clamp(2rem,4vw,4rem);
                font-weight:900;
                text-align:center;
              "
            >

              🎉
              ${escapeHtml(
                game.winner.name
              )}
              WINT!
              🎉

            </div>


            <br>


            <small>

              Gok:

              ${String(
                game.winner.guess
              ).padStart(
                6,
                "0"
              )}

              ·

              Verschil:

              ${game.winner.diff}

            </small>

          `;

      }


      confetti();

    }


    return;

  }


  // ----------------------------------------
  // IDLE
  // ----------------------------------------

  clearInterval(
    timerHandle
  );


  if ($("timer")) {

    $("timer")
      .textContent =
      game.duration ||
      30;

  }


  if ($("displayText")) {

    $("displayText")
      .textContent =
      "Doe mee via je telefoon!";

  }


  if ($("result")) {

    $("result")
      .classList
      .add(
        "hidden"
      );

  }

}


// ============================================================
// GROOT SCHERM — TIMER
// ============================================================

function startDisplayTimer(
  endTime
) {

  clearInterval(
    timerHandle
  );


  function tick() {

    const left =
      Math.max(
        0,
        Math.ceil(
          (
            endTime -
            Date.now()
          ) /
          1000
        )
      );


    if ($("timer")) {

      $("timer")
        .textContent =
        left;

    }


    if (
      left <= 0
    ) {

      clearInterval(
        timerHandle
      );


      if ($("displayText")) {

        $("displayText")
          .textContent =
          "🔒 INSCHRIJVING GESLOTEN";

      }

    }

  }


  tick();


  timerHandle =
    setInterval(
      tick,
      200
    );

}


// ============================================================
// INZENDINGEN VOLGEN
// ============================================================

onValue(
  entriesRef,
  snapshot => {

    const data =
      snapshot.val() ||
      {};


    const entries =
      Object.entries(
        data
      )
      .map(
        ([id, entry]) => ({

          id,

          ...entry

        })
      );


    latestEntries =
      entries;


    // Alleen voor groot scherm
    if (!isDisplay) {
      return;
    }


    const currentEntries =
      entries.filter(
        entry =>
          entry.roundId ===
          currentGame?.roundId
      );


    // ----------------------------------------
    // AANTAL
    // ----------------------------------------

    if ($("entriesCount")) {

      $("entriesCount")
        .textContent =
        `${currentEntries.length} deelnemer${
          currentEntries.length === 1
            ? ""
            : "s"
        } hebben meegedaan`;

    }


    // ----------------------------------------
    // OVERZICHT
    // ----------------------------------------

    if ($("entries")) {

      $("entries")
        .innerHTML =
        currentEntries
          .map(
            entry => `

              <div
                class="entry"
              >

                ${escapeHtml(
                  entry.name
                )}

                —

                <b>

                  ${String(
                    entry.guess
                  ).padStart(
                    6,
                    "0"
                  )}

                </b>

              </div>

            `
          )
          .join("");

    }


    // Als de uitslag al zichtbaar is,
    // opnieuw tekenen zodat de fallback
    // Top 3 meteen beschikbaar is.

    if (
      currentGame?.status ===
      "revealed"
    ) {

      renderDisplay(
        currentGame
      );

    }

  },
  error => {

    console.error(
      "Entries listener fout:",
      error
    );

  }
);


// ============================================================
// FIREBASE ONCE
// ============================================================

function getOnce(
  databaseRef
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      onValue(
        databaseRef,
        resolve,
        reject,
        {
          onlyOnce:
            true
        }
      );

    }
  );

}


// ============================================================
// ADMIN STATUS
// ============================================================

function setAdminStatus(
  message
) {

  if ($("adminStatus")) {

    $("adminStatus")
      .textContent =
      message;

  }

}


// ============================================================
// ADMIN FOUT
// ============================================================

function showAdminError(
  prefix,
  error
) {

  const message =
    getErrorMessage(
      error
    );


  setAdminStatus(
    prefix +
    message
  );

}


// ============================================================
// FOUTMELDING
// ============================================================

function getErrorMessage(
  error
) {

  if (!error) {

    return "Onbekende fout.";

  }


  if (
    error.code &&
    error.message
  ) {

    return (
      error.code +
      " — " +
      error.message
    );

  }


  if (
    error.message
  ) {

    return error.message;

  }


  if (
    typeof error ===
    "string"
  ) {

    return error;

  }


  return "Onbekende fout.";

}


// ============================================================
// HTML VEILIG MAKEN
// ============================================================

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


// ============================================================
// CONFETTI
// ============================================================

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
          Math.random() *
          4
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
      "9999";


    el.style.pointerEvents =
      "none";


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
      () => {

        el.remove();

      },
      4500
    );

  }

}
