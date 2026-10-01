import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
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

function show(id){ $(id).classList.remove("hidden"); }
function hide(id){ $(id).classList.add("hidden"); }

if (isDisplay) { hide("join"); hide("admin"); show("display"); }
else if (isAdmin) { hide("join"); hide("display"); show("admin"); }
else { hide("display"); hide("admin"); show("join"); }

let currentUid = null;
onAuthStateChanged(auth, user => {
  if (!user) return;
  currentUid = user.uid;
  if (isAdmin) {
    $("adminUid").textContent = "Jouw admin-ID: " + currentUid;
  }
});
signInAnonymously(auth).catch(e => console.error(e));

$("joinBtn")?.addEventListener("click", async () => {
  const name = $("name").value.trim();
  const guess = $("guess").value.trim();
  if (!name) return $("joinMsg").textContent = "Vul je naam in.";
  if (!/^\d{6}$/.test(guess)) return $("joinMsg").textContent = "Vul precies 6 cijfers in.";
  try {
    const item = push(entriesRef);
    await set(item, {name, guess: Number(guess), createdAt: Date.now()});
    $("savedGuess").textContent = `${name}, jouw gok is ${guess}.`;
    hide("join"); show("waiting");
  } catch(e) {
    $("joinMsg").textContent = "Er ging iets mis. Controleer de Firebase-instellingen.";
    console.error(e);
  }
});

let timerHandle = null;
let lastGame = null;

onValue(gameRef, snap => {
  const game = snap.val() || {};
  lastGame = game;
  if (isDisplay) renderDisplay(game);
});

onValue(entriesRef, snap => {
  const data = snap.val() || {};
  const entries = Object.values(data);
  if (isDisplay) renderEntries(entries);
});

function renderDisplay(game) {
  if (game.status === "open") {
    $("displayText").textContent = "Vul je gok in op je telefoon!";
    startVisualTimer(game.endsAt);
    $("result").classList.add("hidden");
  } else if (game.status === "revealed") {
    clearInterval(timerHandle);
    $("timer").textContent = String(game.code).padStart(6,"0");
    $("displayText").textContent = "DE 2FA-CODE IS...";
    $("result").classList.remove("hidden");
    if (game.winner) {
      $("result").innerHTML = `🎉 ${escapeHtml(game.winner.name)} WINT! 🎉<br><small>Gok: ${String(game.winner.guess).padStart(6,"0")} · Verschil: ${game.winner.diff}</small>`;
      confetti();
    }
  } else {
    clearInterval(timerHandle);
    $("timer").textContent = game.duration || 30;
    $("displayText").textContent = "Doe mee via je telefoon!";
    $("result").classList.add("hidden");
  }
}

function startVisualTimer(endsAt) {
  clearInterval(timerHandle);
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    $("timer").textContent = left;
    if (left <= 0) clearInterval(timerHandle);
  };
  tick(); timerHandle = setInterval(tick, 200);
}

function renderEntries(entries) {
  $("entriesCount").textContent = `${entries.length} deelnemer${entries.length === 1 ? "" : "s"} hebben meegedaan`;
  $("entries").innerHTML = entries.map(e =>
    `<div class="entry">${escapeHtml(e.name)} — <b>${String(e.guess).padStart(6,"0")}</b></div>`
  ).join("");
}

$("startBtn")?.addEventListener("click", async () => {
  const duration = Math.max(5, Math.min(300, Number($("duration").value) || 30));
  await set(gameRef, {status:"open", duration, endsAt:Date.now()+duration*1000});
  $("adminStatus").textContent = "Ronde gestart!";
});

$("revealBtn")?.addEventListener("click", async () => {
  const snap = await new Promise(resolve => onValue(entriesRef, resolve, {onlyOnce:true}));
  const data = snap.val() || {};
  const entries = Object.values(data);
  if (!entries.length) return $("adminStatus").textContent = "Er zijn nog geen deelnemers.";
  const code = Math.floor(Math.random()*1000000);
  let winner = null;
  for (const e of entries) {
    const diff = Math.abs(Number(e.guess) - code);
    if (!winner || diff < winner.diff) winner = {...e, diff};
  }
  await set(gameRef, {status:"revealed", code, winner});
  $("adminStatus").textContent = `Code: ${String(code).padStart(6,"0")}`;
});

$("resetBtn")?.addEventListener("click", async () => {
  await remove(entriesRef);
  await set(gameRef, {status:"idle", duration:Number($("duration").value)||30});
  $("adminStatus").textContent = "Nieuwe ronde klaar.";
});

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

function confetti(){
  for(let i=0;i<90;i++){
    const el=document.createElement("div");
    el.textContent=["🎉","✨","🎊","⭐"][Math.floor(Math.random()*4)];
    el.style.position="fixed"; el.style.left=Math.random()*100+"vw"; el.style.top="-40px";
    el.style.fontSize=(18+Math.random()*28)+"px"; el.style.zIndex=9999;
    el.style.transition=`transform ${2+Math.random()*2}s linear, top ${2+Math.random()*2}s linear`;
    document.body.appendChild(el);
    requestAnimationFrame(()=>{el.style.top="110vh";el.style.transform=`rotate(${Math.random()*900-450}deg)`});
    setTimeout(()=>el.remove(),4500);
  }
}
