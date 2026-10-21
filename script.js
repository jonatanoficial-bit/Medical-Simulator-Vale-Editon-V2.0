/* ============================================================
   Simulador Médico - Motor local V3
   UI: camadas de telas + overlays
   Engine: fisiologia simplificada + avaliação por caso
   Persistência: localStorage
   ============================================================ */

'use strict';

// ================================
// Helpers
// ================================
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function randomBetween(a,b){ return a + Math.random()*(b-a); }
function randomBetweenInt(a,b){ return Math.floor(randomBetween(a, b+1)); }
function round1(x){ return Math.round(x*10)/10; }
function normalize(s){ return String(s||"").trim().toLowerCase(); }

function loadPlayerProfile(){
  try { const raw = localStorage.getItem("medsim_playerProfile"); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function savePlayerProfile(p){
  try { localStorage.setItem("medsim_playerProfile", JSON.stringify(p)); } catch {}
}

let playerProfile = loadPlayerProfile();
if (playerProfile) window.playerProfile = playerProfile;

// ================================
// Assets / Catálogos (fallbacks)
// ================================
const avatars = [
  { name:"Avatar 1", image:"images/avatar1.png" },
  { name:"Avatar 2", image:"images/avatar2.png" },
  { name:"Avatar 3", image:"images/avatar3.png" },
  { name:"Avatar 4", image:"images/avatar4.png" },
  { name:"Avatar 5", image:"images/avatar5.png" },
  { name:"Avatar 6", image:"images/avatar6.png" }
];

function randomName(gender){
  const male = ["João Ferreira","Bruno Rocha","Eduardo Reis","Marcos Lima","Rafael Souza","Lucas Almeida"];
  const female = ["Maria Oliveira","Ana Martins","Juliana Costa","Beatriz Rocha","Carla Souza","Fernanda Lima"];
  const arr = gender === "female" ? female : male;
  return arr[Math.floor(Math.random()*arr.length)];
}

function getRankTitle(level){
  if (level <= 1) return "Residente";
  if (level === 2) return "Plant. Júnior";
  if (level === 3) return "Plantonista";
  return "Médico Sênior";
}

function formatVitals(v){
  const dia = Math.max(40, Math.round(v.sys*0.55));
  return `PA: ${v.sys}/${dia} mmHg\nFC: ${v.hr} bpm\nFR: ${v.rr} irpm\nSatO2: ${v.spo2}%\nTemp: ${v.temp} °C`;
}

function getExamDelaySeconds(examKey){
  const k = normalize(examKey);
  if (k.includes("tc")) return 35;
  if (k.includes("angio")) return 45;
  if (k.includes("rm")) return 60;
  if (k.includes("usg") || k.includes("eco")) return 30;
  if (k.includes("raio") || k.includes("rx") || k.includes("x")) return 25;
  if (k.includes("gasometria")) return 18;
  if (k.includes("hemograma")) return 22;
  if (k.includes("troponina")) return 26;
  if (k.includes("d-d") || k.includes("d-dí") || k.includes("d-di")) return 24;
  if (k.includes("ecg")) return 8;
  return 20;
}

function defaultCasesFallback(){
  return [
    {
      id:"fallback_appendicitis",
      specialty:"cirurgia",
      gender:"male",
      age:25,
      complaint:"Dor abdominal intensa no quadrante inferior direito + náuseas.",
      history:"Dor iniciou peri-umbilical e migrou para FID. Náuseas, inapetência. Sem diarreia.",
      physicalExam:"Dor importante em FID, defesa voluntária. Blumberg discreto.",
      diagnosis:"Apendicite aguda",
      differentials:["Gastroenterite aguda","Cólica renal"],
      initialSeverity:0.35,
      requiredExams:["Hemograma","PCR","TC abdome/pelve"],
      harmfulExams:["RM crânio"],
      requiredMeds:["Dipirona IV","SF 0,9% 500 mL","Acesso venoso periférico"],
      harmfulMeds:["Heparina IV"],
      examResults:{
        "Hemograma":"Leucócitos 15.800 (neutrofilia).",
        "PCR":"PCR 62 mg/L (elevada).",
        "TC abdome/pelve":"Apêndice espessado com densificação periappendicular."
      },
      medEffects:{
        "SF 0,9% 500 mL": { "severityDelta": -0.06, "delaySeconds": 6 },
        "Dipirona IV": { "severityDelta": -0.05, "delaySeconds": 5 }
      }
    }
  ];
}

function defaultCatalogFallback(){
  return {
    exams:{
      laboratory:["Hemograma","PCR","Gasometria arterial","Lactato","Troponina","D-dímero","Glicemia"],
      imaging:["Raio-X de tórax","TC abdome/pelve","TC crânio sem contraste","AngioTC de tórax","USG abdome total"],
      others:["ECG 12 derivações","Monitorização contínua","Glicemia capilar"]
    },
    treatments:{
      iv:["SF 0,9% 500 mL","Dipirona IV","Ondansetrona IV","Ceftriaxona IV","Naloxona IV","Heparina IV"],
      home:["Dipirona VO","Paracetamol VO","Azitromicina VO","Omeprazol VO"],
      procedures:["Oxigênio por máscara","Acesso venoso periférico","Monitorização contínua"]
    },
    diagnoses:["Apendicite aguda","TEP (Tromboembolismo pulmonar)","Overdose de opioides","Pneumonia comunitária"]
  };
}

function fillSpecialties(cases, select){
  const set = new Set();
  for (const c of (cases||[])){
    const s = normalize(c.specialty) || "geral";
    set.add(s);
  }
  const arr = ["all", ...Array.from(set).sort()];
  select.innerHTML = "";
  for (const s of arr){
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s === "all" ? "Todas" : (s[0].toUpperCase()+s.slice(1));
    select.appendChild(opt);
  }
}

/* As cenas não carregam conteúdo clínico novo: apenas dão contexto espacial
   aos cenários que já existem no catálogo revisável do projeto. */
function getScenarioPresentation(specialty){
  const key = normalize(specialty);
  if (key === "cirurgia") return {
    location: "Ala Cirúrgica",
    area: "Triagem cirúrgica",
    note: "Um novo prontuário chegou da área de avaliação. Organize as pistas antes de encerrar o cenário."
  };
  if (key === "clinica") return {
    location: "Sala de Observação",
    area: "Atendimento clínico",
    note: "O caso está em observação. Reúna as informações que o cenário oferece antes da decisão final."
  };
  return {
    location: "Ala de Emergência",
    area: "Baia de estabilização",
    note: "A equipe abriu uma nova baia. Observe o cenário, registre as descobertas e acompanhe cada retorno."
  };
}

// ================================
// Engine
// ================================
class GameEngine {
  constructor(ui){
    this.ui = ui;

    // Ajuste de jogabilidade (mais tempo para agir)
    this.config = {
      initialLevel: 1,
      baseNewPatientIntervalMs: 16000,
      tickMs: 1000,
      training: { deteriorationMultiplier: 0.45, penaltyMultiplier: 0.35 },
      shift: { deteriorationMultiplier: 1.0, penaltyMultiplier: 1.0 }
    };

    this.mode = "shift";
    this.player = { name:"Residente", avatarIndex:0 };

    this.patients = [];
    this.score = 0;
    this.totalScore = 0;
    this.activePatientId = null;
    this.currentLevel = this.config.initialLevel;

    this.stats = { correct:0, incorrect:0, deaths:0 };
    this.casesAttended = 0;

    this.cases = [];
    this.catalog = null;
    this.lastCaseId = null;

    this.loaded = false;
    this.specialtyFilter = "all";

    this.tickInterval = null;
    this.newPatientInterval = null;

    this.paused = false;
  }

  async loadData(){
    // cases
    try{
      const r = await fetch("data/cases.json", { cache:"no-store" });
      if (r.ok){
        const j = await r.json();
        this.cases = Array.isArray(j) ? j : (j.cases || []);
      }
    }catch{
      this.cases = defaultCasesFallback();
    }
    if (!Array.isArray(this.cases) || this.cases.length === 0) this.cases = defaultCasesFallback();

    // catalog
    try{
      const r2 = await fetch("data/catalog.json", { cache:"no-store" });
      if (r2.ok) this.catalog = await r2.json();
    }catch{
      this.catalog = defaultCatalogFallback();
    }
    if (!this.catalog) this.catalog = defaultCatalogFallback();

    this.loaded = true;
  }

  setPlayer(name, avatarIndex){
    this.player.name = name;
    this.player.avatarIndex = avatarIndex;
  }
  setSpecialtyFilter(v){ this.specialtyFilter = v || "all"; }
  setMode(m){ this.mode = m === "training" ? "training" : "shift"; }

  start(){
    this.patients = [];
    this.score = 0;
    this.activePatientId = null;

    // mantém totalScore entre sessões
    if (playerProfile && typeof playerProfile.score === "number") this.totalScore = playerProfile.score;

    this.currentLevel = playerProfile?.level || this.config.initialLevel;

    this.ui.updateLevel(this.currentLevel);
    this.ui.updateScore(this.score);

    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.newPatientInterval) clearInterval(this.newPatientInterval);

    this.paused = false;

    this.tickInterval = setInterval(() => this.tick(), this.config.tickMs);
    this.newPatientInterval = null;

    // O vertical slice usa um paciente por vez. A dificuldade altera ritmo e pistas,
    // sem criar uma fila que esconda a consequência da decisão.
    this.spawnPatient();
  }

  stop(){
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.newPatientInterval) clearInterval(this.newPatientInterval);
    clearTimeout(this.nextPatientTimer);
    this.nextPatientTimer = null;
    this.tickInterval = null;
    this.newPatientInterval = null;
    this.paused = false;
  }

  setPaused(isPaused){
    this.paused = !!isPaused;
    this.ui.setPausedUI(this.paused);
  }

  tick(){
    if (this.paused) return;

    const mult = this.mode === "training"
      ? this.config.training.deteriorationMultiplier
      : this.config.shift.deteriorationMultiplier;

    for (const p of this.patients){
      if (p.status === "dead" || p.status === "discharged") continue;

      p.time += 1;

      // Deterioração mais lenta (antes 0.08)
      // ~1.2min até crítico extremo se não fizer nada (mais realista)
      const baseDeterioration = 0.028;
      const deterioration = baseDeterioration * mult;
      p.severity = clamp(p.severity + deterioration, 0, 1);

      p.vitals.hr = Math.round(70 + p.severity * 55 + randomBetween(-3, 3));
      p.vitals.rr = Math.round(14 + p.severity * 12 + randomBetween(-2, 2));
      p.vitals.spo2 = Math.round(98 - p.severity * 18 + randomBetween(-1, 1));
      p.vitals.sys = Math.round(125 - p.severity * 38 + randomBetween(-3, 3));
      p.vitals.temp = round1(36.7 + p.severity * 2.0 + randomBetween(-0.2, 0.2));

      this.applyQueuedEffects(p);

      // morte: exige severidade alta E tempo
      if (p.severity >= 0.99 && p.time > 75){
        p.status = "dead";
        this.stats.deaths += 1;
        this.ui.onPatientDied(p);
      }
    }

    this.ui.refreshPatients(this.patients, this.activePatientId);

    const active = this.getActivePatient();
    if (active) this.ui.renderPatientDetails(active, this);
  }

  spawnPatient(){
    if (!this.loaded) return;

    const candidate = this.cases.filter(c => {
      if (this.specialtyFilter === "all") return true;
      return normalize(c.specialty) === normalize(this.specialtyFilter);
    });

    const list = candidate.length ? candidate : this.cases;
    // Evita que a mesma situação apareça duas vezes em sequência. Quando o
    // jogador esgota a rotação disponível, o catálogo volta a ficar elegível.
    const rotatedList = list.filter(c => c.id !== this.lastCaseId);
    const availableCases = rotatedList.length ? rotatedList : list;
    const caseData = availableCases[Math.floor(Math.random() * availableCases.length)];
    this.lastCaseId = caseData.id;

    const id = `p_${Date.now()}_${Math.floor(Math.random()*9999)}`;
    const gender = caseData.gender || (Math.random() > 0.5 ? "male" : "female");

    const patient = {
      id,
      caseId: caseData.id,
      specialty: caseData.specialty || "emergencia",
      scenario: getScenarioPresentation(caseData.specialty),
      name: randomName(gender),
      gender,
      age: caseData.age || randomBetweenInt(18,80),
      complaint: caseData.complaint || "Queixa inespecífica.",
      history: caseData.history || "Sem dados adicionais.",
      physicalExam: caseData.physicalExam || "Sem alterações relevantes.",
      diagnosis: caseData.diagnosis || "Diagnóstico não definido.",
      differentials: caseData.differentials || [],
      requiredExams: caseData.requiredExams || [],
      harmfulExams: caseData.harmfulExams || [],
      requiredMeds: caseData.requiredMeds || [],
      harmfulMeds: caseData.harmfulMeds || [],
      examResults: caseData.examResults || {},
      medEffects: caseData.medEffects || {},
      requested: { history:false, physical_exam:false, exams:[], meds:[], results:[], diagnosis:null },
      queuedEffects: [],
      time: 0,
      severity: clamp(caseData.initialSeverity ?? 0.22, 0, 1),
      status: "waiting",
      vitals: { hr:92, rr:18, spo2:97, sys:128, temp:36.8 }
    };

    this.patients.unshift(patient);
    if (!this.activePatientId) this.activePatientId = patient.id;
    this.ui.refreshPatients(this.patients, this.activePatientId);
  }

  setActivePatient(id){
    this.activePatientId = id;
    const p = this.getActivePatient();
    if (p && p.status === "waiting") p.status = "in_care";
    this.ui.refreshPatients(this.patients, this.activePatientId);
    if (p) this.ui.renderPatientDetails(p, this);
  }

  getActivePatient(){
    return this.patients.find(p => p.id === this.activePatientId) || null;
  }

  performAction(patientId, action, payload){
    const p = this.patients.find(x => x.id === patientId);
    if (!p || p.status === "dead") return;

    if (action === "history"){
      p.requested.history = true;
      this.ui.showInfo("História Clínica", p.history);
      return;
    }

    if (action === "physical_exam"){
      p.requested.physical_exam = true;
      const vtxt = formatVitals(p.vitals);
      this.ui.showInfo("Exame Físico", `${p.physicalExam}\n\nSinais vitais:\n${vtxt}`);
      return;
    }

    if (action === "request_exam"){
      const examKey = payload?.examKey;
      if (!examKey) return;
      if (p.requested.exams.includes(examKey)){
        this.ui.toast(`Este pedido já está no prontuário do turno.`);
        return;
      }
      p.requested.exams.push(examKey);

      const baseDelay = getExamDelaySeconds(examKey);
      const mult = this.mode === "training" ? 0.55 : 1.0;
      const delay = Math.max(2, Math.round(baseDelay * mult));

      const result = p.examResults?.[examKey] || "Sem alterações específicas.";
      p.queuedEffects.push({ type:"exam_result", examKey, result, readyAt: p.time + delay });

      this.ui.toast(`Exame solicitado: ${examKey} (resultado em ~${delay}s)`);
      this.ui.renderPatientDetails(p, this);
      return;
    }

    if (action === "give_med"){
      const medKey = payload?.medKey;
      if (!medKey) return;
      if (p.requested.meds.includes(medKey)){
        this.ui.toast(`Esta ação já foi registrada no turno.`);
        return;
      }
      p.requested.meds.push(medKey);

      const eff = p.medEffects?.[medKey];
      if (eff){
        const delay = Math.max(1, eff.delaySeconds || 1);
        p.queuedEffects.push({ type:"med_effect", medKey, effect: eff, readyAt: p.time + delay });
      }

      this.ui.toast(`Aplicado: ${medKey}`);
      this.ui.renderPatientDetails(p, this);
      return;
    }

    if (action === "final_diagnosis"){
      p.requested.diagnosis = payload?.diagnosis || null;
      this.evaluateCase(p);
      return;
    }
  }

  applyQueuedEffects(patient){
    const now = patient.time;
    const ready = patient.queuedEffects.filter(e => e.readyAt <= now);
    if (!ready.length) return;
    patient.queuedEffects = patient.queuedEffects.filter(e => e.readyAt > now);

    for (const e of ready){
      if (e.type === "exam_result"){
        patient.requested.results.push({ examKey: e.examKey, result: e.result });
        this.ui.showExamResult(e.examKey, e.result);
      } else if (e.type === "med_effect"){
        const delta = e.effect.severityDelta || 0;
        patient.severity = clamp(patient.severity + delta, 0, 1);
      }
    }
  }

  evaluateCase(patient){
    const diagCorrect = normalize(patient.requested.diagnosis) === normalize(patient.diagnosis);

    const requiredExams = patient.requiredExams || [];
    const requiredMeds = patient.requiredMeds || [];
    const harmfulExams = patient.harmfulExams || [];
    const harmfulMeds = patient.harmfulMeds || [];

    const pickedExams = patient.requested.exams || [];
    const pickedMeds = patient.requested.meds || [];

    const missingExams = requiredExams.filter(x => !pickedExams.includes(x));
    const missingMeds = requiredMeds.filter(x => !pickedMeds.includes(x));
    const wrongExams = pickedExams.filter(x => harmfulExams.includes(x));
    const wrongMeds = pickedMeds.filter(x => harmfulMeds.includes(x));

    const penaltyMult = this.mode === "training"
      ? this.config.training.penaltyMultiplier
      : this.config.shift.penaltyMultiplier;

    let points = 0;
    if (diagCorrect) points += 120; else points -= 90 * penaltyMult;
    points += (requiredExams.length - missingExams.length) * 12;
    points += (requiredMeds.length - missingMeds.length) * 18;
    points -= wrongExams.length * 10 * penaltyMult;
    points -= wrongMeds.length * 18 * penaltyMult;

    const timePenalty = Math.max(0, Math.floor(patient.time / 8));
    points -= timePenalty * 2 * penaltyMult;

    let outcome = "stable";
    if (!diagCorrect && (wrongMeds.length > 0 || missingMeds.length > 1) && patient.severity > 0.92) outcome = "death";
    else if (diagCorrect && missingMeds.length === 0) outcome = "improved";

    if (outcome === "death"){
      patient.status = "dead";
      this.stats.deaths += 1;
      points -= 120 * penaltyMult;
    } else {
      patient.status = "discharged";
    }

    this.casesAttended += 1;
    if (diagCorrect) this.stats.correct += 1; else this.stats.incorrect += 1;

    this.score += points;
    this.totalScore += points;

    // progressão
    if (this.totalScore > 300 && this.currentLevel < 2) this.currentLevel = 2;
    if (this.totalScore > 800 && this.currentLevel < 3) this.currentLevel = 3;
    if (this.totalScore > 1500 && this.currentLevel < 4) this.currentLevel = 4;

    // perfil persistente
    if (!playerProfile) playerProfile = window.playerProfile || null;
    if (playerProfile){
      playerProfile.score = this.totalScore;
      playerProfile.level = this.currentLevel;
      playerProfile.role = getRankTitle(this.currentLevel);
      playerProfile.stats = this.stats;
      savePlayerProfile(playerProfile);
      window.playerProfile = playerProfile;
    }

    this.ui.updateScore(this.score);
    this.ui.updateLevel(this.currentLevel);

    // relatório
    this.ui.showCaseReport({
      patient, diagCorrect, missingExams, missingMeds, wrongExams, wrongMeds, points, outcome
    });

    // remove e seleciona próximo
    this.patients = this.patients.filter(p => p.id !== patient.id);
    if (this.patients.length) this.activePatientId = this.patients[0].id;
    else {
      this.activePatientId = null;
      const nextPatientDelay = this.mode === "training" ? 1500 : 2500;
      clearTimeout(this.nextPatientTimer);
      this.nextPatientTimer = window.setTimeout(() => {
        if (this.patients.length !== 0) return;
        this.spawnPatient();
        this.activePatientId = this.patients[0]?.id || null;
        this.ui.refreshPatients(this.patients, this.activePatientId);
      }, nextPatientDelay);
    }

    this.ui.refreshPatients(this.patients, this.activePatientId);
  }
}

// ================================
// UI
// ================================
class GameUI {
  constructor(){
    // Screens
    this.coverScreen = document.getElementById("cover-screen");
    this.welcomeScreen = document.getElementById("welcome-screen");
    this.lobbyScreen = document.getElementById("lobby-screen");
    this.officeScreen = document.getElementById("office-screen");
    this.gameScreen = document.getElementById("game-screen");

    // Lobby/office fields
    this.avatarSelection = document.getElementById("avatar-selection");

    // Office UI
    this.officeAvatar = document.getElementById("office-avatar");
    this.officeName = document.getElementById("office-name");
    this.officeLevel = document.getElementById("office-level");
    this.officeScore = document.getElementById("office-score");
    this.statTotal = document.getElementById("stat-total");
    this.statCorrect = document.getElementById("stat-correct");
    this.statIncorrect = document.getElementById("stat-incorrect");
    this.statDeaths = document.getElementById("stat-deaths");

    this.specialtySelect = document.getElementById("specialty-select");
    this.modeSelect = document.getElementById("mode-select");

    // Game UI
    this.levelDisplay = document.getElementById("level-display");
    this.scoreDisplay = document.getElementById("score-display");
    this.patientsList = document.getElementById("patients-list");
    this.patientDetails = document.getElementById("patient-details");
    this.pauseBtn = document.getElementById("pause-btn");

    // Overlays
    this.examPage = document.getElementById("exam-page");
    this.examContent = document.getElementById("exam-content");
    this.examBack = document.getElementById("exam-back");

    this.treatmentPage = document.getElementById("treatment-page");
    this.treatmentContent = document.getElementById("treatment-content");
    this.treatmentBack = document.getElementById("treatment-back");

    this.diagnosisPage = document.getElementById("diagnosis-page");
    this.diagnosisContent = document.getElementById("diagnosis-content");
    this.diagnosisBack = document.getElementById("diagnosis-back");

    this.toastEl = null;
    this.reportOverlay = null;

    this.selectedAvatarIndex = 0;

    // painel de mensagens do paciente (persistente)
    this.infoTitle = "Messages";
    this.infoText = "Toque em História Clínica ou Exame Físico para ver detalhes aqui.";
  }

  init(engine){
    // Toque na capa -> welcome
    const goWelcome = () => {
      this.coverScreen.classList.remove("active");
      this.welcomeScreen.classList.add("active");
    };
    this.coverScreen.addEventListener("click", goWelcome);
    this.coverScreen.addEventListener("touchend", (e) => { e.preventDefault(); goWelcome(); }, { passive:false });

    // Toque na welcome -> lobby
    const goLobby = () => {
      this.welcomeScreen.classList.remove("active");
      this.lobbyScreen.classList.add("active");
    };
    this.welcomeScreen.addEventListener("click", goLobby);
    this.welcomeScreen.addEventListener("touchend", (e) => { e.preventDefault(); goLobby(); }, { passive:false });

    // Avatares
    this.renderAvatars();

    // Restore profile
    if (playerProfile){
      const nameInput = document.getElementById("player-name");
      nameInput.value = playerProfile.name || "";
      const idx = avatars.findIndex(a => a.image === playerProfile.avatar);
      if (idx >= 0) this.selectedAvatarIndex = idx;
      this.renderAvatars(); // re-render com selecionado
    }

    // Start button -> office
    document.getElementById("start-button").addEventListener("click", () => {
      const name = document.getElementById("player-name").value.trim();
      if (!name){ alert("Por favor, insira seu nome."); return; }

      engine.setPlayer(name, this.selectedAvatarIndex);

      playerProfile = {
        name,
        avatar: avatars[this.selectedAvatarIndex].image,
        role: getRankTitle(engine.currentLevel),
        level: engine.currentLevel,
        score: (playerProfile?.score ?? 0),
        stats: playerProfile?.stats || { correct:0, incorrect:0, deaths:0 }
      };
      window.playerProfile = playerProfile;
      savePlayerProfile(playerProfile);

      this.lobbyScreen.classList.remove("active");
      this.updateOffice(engine);
      this.officeScreen.classList.add("active");
    });

    // Next case -> game
    document.getElementById("next-case-button").addEventListener("click", () => {
      engine.setSpecialtyFilter(this.specialtySelect.value);
      engine.setMode(this.modeSelect.value);

      this.officeScreen.classList.remove("active");
      this.gameScreen.classList.add("active");

      engine.start();
    });

    // Back office
    document.getElementById("back-office").addEventListener("click", () => {
      engine.stop();
      this.officeScreen.classList.remove("active");
      this.lobbyScreen.classList.add("active");
    });

    // Pause
    this.pauseBtn.addEventListener("click", () => {
      engine.setPaused(!engine.paused);
    });

    // Overlay back
    this.examBack.addEventListener("click", () => this.hideOverlay("exam"));
    this.treatmentBack.addEventListener("click", () => this.hideOverlay("treatment"));
    this.diagnosisBack.addEventListener("click", () => this.hideOverlay("diagnosis"));

    // inicializa selects de especialidade após loadData
    fillSpecialties(engine.cases, this.specialtySelect);
    this.updateOffice(engine);
  }

  setPausedUI(isPaused){
    this.pauseBtn.textContent = isPaused ? "Continuar" : "Pausar";
    this.toast(isPaused ? "Plantão pausado" : "Plantão retomado");
  }

  renderAvatars(){
    this.avatarSelection.innerHTML = "";
    avatars.forEach((a, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-btn";
      btn.innerHTML = `<img src="${a.image}" alt="${a.name}"/><span>${a.name}</span>`;
      if (i === this.selectedAvatarIndex) btn.classList.add("selected");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.selectedAvatarIndex = i;
        [...this.avatarSelection.querySelectorAll(".avatar-btn")].forEach(x => x.classList.remove("selected"));
        btn.classList.add("selected");
      });
      this.avatarSelection.appendChild(btn);
    });
  }

  updateOffice(engine){
    const prof = playerProfile || { name: engine.player.name, avatar: avatars[engine.player.avatarIndex]?.image };

    // avatar no office (background)
    const ava = prof.avatar || avatars[0].image;
    this.officeAvatar.style.backgroundImage = `url("${ava}")`;

    this.officeName.textContent = prof.name || "—";
    const lvl = prof.level || engine.currentLevel || 1;
    const role = prof.role || getRankTitle(lvl);
    this.officeLevel.textContent = `${role} • Nível ${lvl}`;
    this.officeScore.textContent = String(prof.score ?? 0);

    const stats = prof.stats || engine.stats || { correct:0, incorrect:0, deaths:0 };
    const total = (stats.correct||0) + (stats.incorrect||0);
    this.statTotal.textContent = String(total);
    this.statCorrect.textContent = String(stats.correct||0);
    this.statIncorrect.textContent = String(stats.incorrect||0);
    this.statDeaths.textContent = String(stats.deaths||0);

    const playerAvatarImg = document.getElementById("player-avatar");
    const playerNameDisplay = document.getElementById("player-name-display");
    if (playerAvatarImg){
      playerAvatarImg.src = ava;
      playerAvatarImg.style.display = "inline-block";
    }
    if (playerNameDisplay){
      playerNameDisplay.textContent = prof.name || "—";
    }
  }

  updateLevel(level){
    this.levelDisplay.textContent = `Nível ${level}`;
  }

  updateScore(score){
    this.scoreDisplay.textContent = `Pontuação: ${score}`;
  }

  refreshPatients(patients, activeId){
    this.patientsList.innerHTML = "";

    if (!patients || patients.length === 0){
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Nenhum paciente no momento.";
      this.patientsList.appendChild(empty);
      return;
    }

    for (const p of patients){
      const card = document.createElement("div");
      card.className = "patient-card";
      if (p.id === activeId) card.classList.add("active");

      const status = this.statusLabel(p);
      card.innerHTML = `
        <div class="patient-card-top">
          <div class="patient-name">${p.name}</div>
          <div class="patient-status ${status.cls}">${status.text}</div>
        </div>
        <div class="patient-complaint">${p.complaint}</div>
      `;

      card.addEventListener("click", () => window.engine?.setActivePatient(p.id));
      this.patientsList.appendChild(card);
    }
  }

  statusLabel(p){
    if (p.status === "dead") return { text:"Óbito", cls:"status-dead" };
    if (p.severity >= 0.92) return { text:"Crítico", cls:"status-critical" };
    if (p.severity >= 0.65) return { text:"Instável", cls:"status-unstable" };
    return { text:"Estável", cls:"status-stable" };
  }

  renderPatientDetails(p, engine){
    if (!p){
      this.patientDetails.innerHTML = `<div class="empty-state">Selecione um paciente na fila.</div>`;
      return;
    }

    // portrait
    const portrait = p.gender === "female" ? "images/patient_female.png" : "images/patient_male.png";

    const status = this.statusLabel(p);
    const scenario = p.scenario || getScenarioPresentation(p.specialty);
    const requested = p.requested || { history:false, physical_exam:false, exams:[], meds:[], results:[] };
    const pendingExams = (p.queuedEffects || []).filter(effect => effect.type === "exam_result");
    const receivedResults = requested.results || [];
    const explorationCount = Number(requested.history) + Number(requested.physical_exam);
    const nextStep = !requested.history || !requested.physical_exam
      ? "Leia a história e faça o exame físico para reunir as pistas do cenário."
      : pendingExams.length
        ? "Há resultado em processamento. Você pode aguardar ou continuar explorando o cenário."
        : "Quando estiver pronto, registre a decisão final para receber o debriefing do turno.";

    this.updateScenarioLocation(scenario);

    this.patientDetails.innerHTML = `
      <div class="patient-header">
        <div class="patient-portrait" style="background-image:url('${portrait}')"></div>
        <div class="patient-main">
          <h2>${p.name} (${p.age} anos)</h2>
          <div class="patient-sub">
            <span class="badge">${status.text}</span>
            <span class="dot">•</span>
            <span>${(p.gender === "female") ? "Feminino" : "Masculino"}</span>
          </div>
          <div class="patient-complaint-big">${p.complaint}</div>
        </div>

        <div class="vitals-box">
          <h3>Sinais Vitais</h3>
          <div class="vitals-grid">
            <div class="vital"><span>PA</span><b>${p.vitals.sys}/${Math.max(40, Math.round(p.vitals.sys*0.55))}</b></div>
            <div class="vital"><span>FC</span><b>${p.vitals.hr} bpm</b></div>
            <div class="vital"><span>FR</span><b>${p.vitals.rr} irpm</b></div>
            <div class="vital"><span>SatO2</span><b>${p.vitals.spo2}%</b></div>
            <div class="vital"><span>Temp</span><b>${p.vitals.temp} °C</b></div>
            <div class="vital"><span>Tempo</span><b>${p.time}s</b></div>
          </div>
        </div>
      </div>

      <div class="actions-area">
        <section class="case-brief" aria-label="Contexto do cenário">
          <div class="case-brief-topline">
            <span class="eyebrow">CASO ${engine.casesAttended + 1}</span>
            <span class="case-area">${scenario.area}</span>
          </div>
          <h3>${scenario.location}</h3>
          <p>${scenario.note}</p>
        </section>

        <section class="turn-guide" aria-label="Acompanhamento do turno">
          <div class="turn-guide-header">
            <div>
              <span class="eyebrow">SEU TURNO</span>
              <h3>Acompanhe suas descobertas</h3>
            </div>
            <span class="turn-progress">${explorationCount}/2 pistas iniciais</span>
          </div>
          <p>${nextStep}</p>
          <div class="turn-statuses">
            <span class="turn-status ${requested.history ? "is-done" : ""}">História ${requested.history ? "vista" : "pendente"}</span>
            <span class="turn-status ${requested.physical_exam ? "is-done" : ""}">Exame ${requested.physical_exam ? "visto" : "pendente"}</span>
            <span class="turn-status ${pendingExams.length ? "is-pending" : receivedResults.length ? "is-done" : ""}">${pendingExams.length ? `${pendingExams.length} resultado(s) a caminho` : receivedResults.length ? `${receivedResults.length} resultado(s) recebido(s)` : "Sem exames pedidos"}</span>
          </div>
        </section>

        <div class="actions-row">
          <button class="action-btn ${requested.history ? "is-complete" : ""}" data-act="history"><i>📄</i><span>História Clínica</span></button>
          <button class="action-btn ${requested.physical_exam ? "is-complete" : ""}" data-act="physical_exam"><i>🩺</i><span>Exame Físico</span></button>
          <button class="action-btn action-final" data-act="diagnosis"><i>✅</i><span>Encerrar caso</span></button>
        </div>

        <div class="actions-row">
          <button class="action-btn" data-act="exam_lab"><i>🧪</i><span>Exames Laboratoriais</span></button>
          <button class="action-btn" data-act="exam_img"><i>🩻</i><span>Exames de Imagem</span></button>
          <button class="action-btn" data-act="exam_other"><i>📟</i><span>Outros Exames</span></button>
        </div>

        <div class="actions-row">
          <button class="action-btn" data-act="med_iv"><i>💉</i><span>Medicação IV</span></button>
          <button class="action-btn" data-act="med_home"><i>💊</i><span>Medicação Casa/VO</span></button>
          <button class="action-btn" data-act="procedures"><i>🧰</i><span>Procedimentos</span></button>
        </div>

        <div class="info-container">
          <h4>${this.infoTitle}</h4>
          <pre>${this.infoText}</pre>
        </div>

        ${receivedResults.length ? `
          <section class="results-ledger" aria-label="Resultados recebidos">
            <h4>Resultados recebidos</h4>
            ${receivedResults.map(entry => `<button type="button" class="result-item" data-result="${entry.examKey}"><span>${entry.examKey}</span><b>Ver</b></button>`).join("")}
          </section>
        ` : ""}
      </div>
    `;

    // bind actions
    this.patientDetails.querySelectorAll(".action-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        if (act === "history") engine.performAction(p.id, "history");
        else if (act === "physical_exam") engine.performAction(p.id, "physical_exam");
        else if (act === "diagnosis") this.openDiagnosis(engine, p);
        else if (act === "exam_lab") this.openExamList(engine, p, "laboratory");
        else if (act === "exam_img") this.openExamList(engine, p, "imaging");
        else if (act === "exam_other") this.openExamList(engine, p, "others");
        else if (act === "med_iv") this.openTreatmentList(engine, p, "iv");
        else if (act === "med_home") this.openTreatmentList(engine, p, "home");
        else if (act === "procedures") this.openTreatmentList(engine, p, "procedures");
      });
    });

    this.patientDetails.querySelectorAll("[data-result]").forEach(btn => {
      btn.addEventListener("click", () => {
        const result = receivedResults.find(entry => entry.examKey === btn.getAttribute("data-result"));
        if (result) this.showExamResult(result.examKey, result.result);
      });
    });
  }

  updateScenarioLocation(scenario){
    const label = scenario?.location || "Ala de Emergência";
    const locationArea = document.getElementById("game-location-area");
    if (locationArea) locationArea.textContent = label;
  }

  showInfo(title, text){
    this.infoTitle = title;
    this.infoText = String(text || "");
    // força re-render do paciente ativo para manter a mensagem visível (não some)
    const active = window.engine?.getActivePatient();
    if (active) this.renderPatientDetails(active, window.engine);
  }

  showExamResult(examKey, result){
    this.showInfo(`Resultado: ${examKey}`, result);
  }

  onPatientDied(p){
    this.toast(`${p.name} evoluiu para óbito.`);
  }

  openExamList(engine, patient, category){
    const catalog = engine.catalog || defaultCatalogFallback();
    const list = (catalog.exams && catalog.exams[category]) ? catalog.exams[category] : [];
    const title = category === "laboratory" ? "Exames Laboratoriais"
      : category === "imaging" ? "Exames de Imagem"
      : "Outros Exames";

    const bg = category === "laboratory" ? "images/labs.png"
      : category === "imaging" ? "images/xray.jpg"
      : "images/bg_hospital_01.jpg";

    this.examContent.innerHTML = `
      <div class="overlay-hero" style="background-image:url('${bg}')"></div>
      <h2>${title}</h2>
      <div class="muted">Registre o pedido que faz sentido para este cenário. Pedidos repetidos ficam bloqueados.</div>
      <div class="grid-list">
        ${list.map(x => `<button class="grid-item" type="button" data-exam="${x}">${x}</button>`).join("")}
      </div>
    `;

    this.examContent.querySelectorAll("[data-exam]").forEach(btn => {
      btn.addEventListener("click", () => {
        const examKey = btn.getAttribute("data-exam");
        engine.performAction(patient.id, "request_exam", { examKey });
      });
    });

    this.showOverlay("exam");
  }

  openTreatmentList(engine, patient, category){
    const catalog = engine.catalog || defaultCatalogFallback();
    const list = (catalog.treatments && catalog.treatments[category]) ? catalog.treatments[category] : [];
    const title = category === "iv" ? "Medicação IV"
      : category === "home" ? "Medicação Casa/VO"
      : "Procedimentos";

    const bg = category === "iv" ? "images/bg_hospital_02.jpg"
      : category === "home" ? "images/bg_hospital_01.jpg"
      : "images/bg_hospital_02.jpg";

    this.treatmentContent.innerHTML = `
      <div class="overlay-hero" style="background-image:url('${bg}')"></div>
      <h2>${title}</h2>
      <div class="muted">As escolhas são avaliadas apenas dentro deste cenário fictício. Ações repetidas ficam bloqueadas.</div>
      <div class="grid-list">
        ${list.map(x => `<button class="grid-item" type="button" data-med="${x}">${x}</button>`).join("")}
      </div>
    `;

    this.treatmentContent.querySelectorAll("[data-med]").forEach(btn => {
      btn.addEventListener("click", () => {
        const medKey = btn.getAttribute("data-med");
        engine.performAction(patient.id, "give_med", { medKey });
      });
    });

    this.showOverlay("treatment");
  }

  openDiagnosis(engine, patient){
    const catalog = engine.catalog || defaultCatalogFallback();
    const dxList = Array.isArray(catalog.diagnoses) ? catalog.diagnoses : [];

    this.diagnosisContent.innerHTML = `
      <h2>Diagnóstico</h2>
      <div class="muted">Registre a decisão final para encerrar este cenário e receber o debriefing do turno.</div>

      <input id="dx-search" class="dx-search" placeholder="Pesquisar diagnóstico..." />

      <div class="dx-list" id="dx-list">
        ${dxList.map(x => `<button class="dx-item" type="button" data-dx="${x}">${x}</button>`).join("")}
      </div>
    `;

    const listEl = this.diagnosisContent.querySelector("#dx-list");
    const searchEl = this.diagnosisContent.querySelector("#dx-search");

    const render = (q) => {
      const qq = normalize(q);
      const filtered = dxList.filter(x => normalize(x).includes(qq));
      listEl.innerHTML = filtered.map(x => `<button class="dx-item" type="button" data-dx="${x}">${x}</button>`).join("");
      listEl.querySelectorAll("[data-dx]").forEach(btn => {
        btn.addEventListener("click", () => {
          const diagnosis = btn.getAttribute("data-dx");
          engine.performAction(patient.id, "final_diagnosis", { diagnosis });
          this.hideOverlay("diagnosis");
        });
      });
    };

    render("");

    searchEl.addEventListener("input", () => render(searchEl.value));

    this.showOverlay("diagnosis");
  }

  showOverlay(which){
    if (which === "exam") this.examPage.classList.remove("hidden");
    if (which === "treatment") this.treatmentPage.classList.remove("hidden");
    if (which === "diagnosis") this.diagnosisPage.classList.remove("hidden");
  }

  hideOverlay(which){
    if (which === "exam") this.examPage.classList.add("hidden");
    if (which === "treatment") this.treatmentPage.classList.add("hidden");
    if (which === "diagnosis") this.diagnosisPage.classList.add("hidden");
  }

  showCaseReport(r){
    // remove anterior
    if (this.reportOverlay) this.reportOverlay.remove();

    const { patient, diagCorrect, missingExams, missingMeds, wrongExams, wrongMeds, points, outcome } = r;

    const overlay = document.createElement("div");
    overlay.className = "overlay report-overlay";
    overlay.innerHTML = `
      <div class="overlay-content report-content">
        <h2>Debriefing do turno</h2>
        <div class="muted">${patient.name} • ${patient.age} anos • ${patient.scenario?.location || "Hospital Vale"} • Desfecho do cenário: <b class="${outcome === "death" ? "bad" : "ok"}">${outcome === "death" ? "Encerramento crítico" : "Caso encerrado"}</b></div>

        <div class="report-grid">
          <div class="report-card">
            <h3>Diagnóstico</h3>
            <div>${diagCorrect ? `<b class="ok">Correto</b>` : `<b class="bad">Incorreto</b>`}</div>
            <div class="muted" style="margin-top:6px;">No cenário: ${patient.diagnosis}</div>
          </div>
          <div class="report-card">
            <h3>Pontuação</h3>
            <div><b>${points}</b></div>
            <div class="muted" style="margin-top:6px;">A pontuação compara suas escolhas com as regras deste cenário.</div>
          </div>
        </div>

        <div class="result-box">
          <h4>O que ficou registrado</h4>
          <pre>${[
            `Pistas iniciais: ${patient.requested.history ? "história" : "—"}${patient.requested.history && patient.requested.physical_exam ? " + " : ""}${patient.requested.physical_exam ? "exame físico" : ""}`,
            `Exames pedidos: ${patient.requested.exams.length ? patient.requested.exams.join(", ") : "Nenhum"}`,
            `Ações registradas: ${patient.requested.meds.length ? patient.requested.meds.join(", ") : "Nenhuma"}`,
            `Exames faltando: ${missingExams.length ? missingExams.join(", ") : "Nenhum"}`,
            `Medicações faltando: ${missingMeds.length ? missingMeds.join(", ") : "Nenhuma"}`,
            `Exames inadequados: ${wrongExams.length ? wrongExams.join(", ") : "Nenhum"}`,
            `Condutas inadequadas: ${wrongMeds.length ? wrongMeds.join(", ") : "Nenhuma"}`
          ].join("\n")}</pre>
        </div>

        <p class="report-disclaimer">Feedback do universo do jogo — não é recomendação para situações reais.</p>

        <button class="overlay-back" id="report-close">Continuar</button>
      </div>
    `;
    overlay.querySelector("#report-close").addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
    this.reportOverlay = overlay;
  }

  toast(msg){
    if (!this.toastEl){
      const t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
      this.toastEl = t;
    }
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), 2200);
  }
}

// ================================
// Bootstrap
// ================================
window.addEventListener("DOMContentLoaded", async () => {
  const ui = new GameUI();
  const engine = new GameEngine(ui);

  // expõe para cliques dos cards
  window.engine = engine;

  await engine.loadData();

  // (re)preenche especialidades agora que os cases carregaram
  fillSpecialties(engine.cases, ui.specialtySelect);

  ui.init(engine);

  // garante que a welcome tenha background (se existir)
  const welcomeBg = document.querySelector(".welcome-bg");
  if (welcomeBg){
    // usa o arquivo do projeto (não quebra se mudar)
    welcomeBg.style.backgroundImage = `url('images/hospital_corridor.png')`;
  }

  // capa: deixa a imagem como fundo (capa do jogo)
  const cover = document.getElementById("cover-screen");
  if (cover){
    cover.style.backgroundImage = `url('images/capa.jpg')`;
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
  }
});
