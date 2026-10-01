'use strict';

// RobOS Tabletop Studio Client Application
let currentData = {
  tabletopNodes: [],
  gameNodes: [],
  heroes: [],
  monsters: [],
  spells: [],
  furniture: [],
  doors: [],
  quest: {},
  activeHeroId: null,
  activeMonsterId: null
};

// DOM references
const statusBar = document.getElementById("status-text");
const cartridgeSelect = document.getElementById("cartridge-select");

// Setup Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    const target = btn.dataset.tab;
    const pane = document.getElementById(target);
    if (pane) pane.classList.add("active");

    if (target === "tab-board") {
      drawBoard();
    }
  });
});

function setStatus(msg) {
  if (statusBar) statusBar.textContent = msg;
}

// Load KGraph Data
async function initKGraphData() {
  setStatus("Reading Knowledge Graph package 'tabletop-game'...");
  try {
    const res = await window.robosTabletop.loadKGraph();
    if (!res.success) {
      setStatus("Error loading KGraph: " + res.error);
      return;
    }

    currentData.tabletopNodes = res.tabletopNodes;
    currentData.gameNodes = res.gameNodes;

    // Filter nodes
    currentData.heroes = currentData.tabletopNodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopHero");
    });

    currentData.monsters = currentData.tabletopNodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopMonster");
    });

    currentData.spells = currentData.tabletopNodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopSpellCard");
    });

    currentData.furniture = currentData.tabletopNodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopFurniture");
    });

    renderHeroesList();
    renderMonstersList();
    renderSpellsAndItems();
    initBoard();

    setStatus(`KGraph loaded: ${currentData.heroes.length} heroes, ${currentData.monsters.length} monsters, ${currentData.spells.length} spells.`);
  } catch (err) {
    setStatus("Failed to initialize: " + err.message);
  }
}

// Render Heroes
function renderHeroesList() {
  const container = document.getElementById("heroes-list");
  if (!container) return;
  container.innerHTML = "";

  currentData.heroes.forEach(h => {
    const div = document.createElement("div");
    div.className = "list-item" + (h["@id"] === currentData.activeHeroId ? " active" : "");
    div.innerHTML = `<span>${h["robos:tokenColor"] ? '<span style="color:' + h["robos:tokenColor"] + '">●</span>' : "🛡️"}</span> <strong>${h["dcterms:title"] || h["@id"]}</strong>`;
    div.onclick = () => selectHero(h["@id"]);
    container.appendChild(div);
  });

  if (!currentData.activeHeroId && currentData.heroes.length > 0) {
    selectHero(currentData.heroes[0]["@id"]);
  }
}

function selectHero(heroId) {
  currentData.activeHeroId = heroId;
  const hero = currentData.heroes.find(h => h["@id"] === heroId);
  if (!hero) return;

  renderHeroesList();
  document.getElementById("hero-editor-title").textContent = "Edit Hero: " + (hero["dcterms:title"] || "");
  document.getElementById("hero-id").value = hero["@id"] || "";
  document.getElementById("hero-name").value = hero["dcterms:title"] || "";
  document.getElementById("hero-bp").value = hero["robos:bodyPoints"] || 8;
  document.getElementById("hero-mp").value = hero["robos:mindPoints"] || 2;
  document.getElementById("hero-atk").value = hero["robos:attackDice"] || 3;
  document.getElementById("hero-def").value = hero["robos:defendDice"] || 2;
  document.getElementById("hero-weapon").value = hero["robos:startingWeapon"] || "";
  document.getElementById("hero-ability").value = hero["robos:specialAbility"] || "";
  document.getElementById("hero-color").value = hero["robos:tokenColor"] || "#b91c1c";
  document.getElementById("hero-icon").value = hero["robos:icon"] || "⚔️";
  document.getElementById("hero-pos-x").value = (hero["robos:position"] && hero["robos:position"][0]) || 1;
  document.getElementById("hero-pos-y").value = (hero["robos:position"] && hero["robos:position"][1]) || 1;
}

// Render Monsters
function renderMonstersList() {
  const container = document.getElementById("monsters-list");
  if (!container) return;
  container.innerHTML = "";

  currentData.monsters.forEach(m => {
    const div = document.createElement("div");
    div.className = "list-item" + (m["@id"] === currentData.activeMonsterId ? " active" : "");
    div.innerHTML = `<span>👹</span> <strong>${m["dcterms:title"] || m["@id"]}</strong>`;
    div.onclick = () => selectMonster(m["@id"]);
    container.appendChild(div);
  });

  if (!currentData.activeMonsterId && currentData.monsters.length > 0) {
    selectMonster(currentData.monsters[0]["@id"]);
  }
}

function selectMonster(monsterId) {
  currentData.activeMonsterId = monsterId;
  const m = currentData.monsters.find(item => item["@id"] === monsterId);
  if (!m) return;

  renderMonstersList();
  document.getElementById("monster-editor-title").textContent = "Edit Monster: " + (m["dcterms:title"] || "");
  document.getElementById("monster-id").value = m["@id"] || "";
  document.getElementById("monster-name").value = m["dcterms:title"] || "";
  document.getElementById("monster-bp").value = m["robos:bodyPoints"] || 1;
  document.getElementById("monster-atk").value = m["robos:attackDice"] || 2;
  document.getElementById("monster-def").value = m["robos:defendDice"] || 2;
  document.getElementById("monster-move").value = m["robos:movementSquares"] || 6;
  document.getElementById("monster-room").value = m["robos:roomId"] || "room-center";
  document.getElementById("monster-pos-x").value = (m["robos:position"] && m["robos:position"][0]) || 12;
  document.getElementById("monster-pos-y").value = (m["robos:position"] && m["robos:position"][1]) || 9;
  document.getElementById("monster-is-boss").checked = !!m["robos:isBoss"];
  document.getElementById("monster-is-undead").checked = m["robos:monsterType"] === "undead";
}

// Render Spells & Items
function renderSpellsAndItems() {
  const sGrid = document.getElementById("spells-grid");
  if (sGrid) {
    sGrid.innerHTML = currentData.spells.map(s => `
      <div class="spell-card">
        <div class="card-title">${s["dcterms:title"]}</div>
        <div class="card-meta">College: ${s["robos:element"] || "neutral"}</div>
        <div class="card-meta">Dice: ${s["robos:damageDice"] || s["robos:healingPoints"] || "utility"}</div>
      </div>
    `).join("");
  }

  const iGrid = document.getElementById("items-grid");
  if (iGrid) {
    const items = [
      { name: "Broadsword", cat: "Weapon", dice: "3 Dice" },
      { name: "Shortsword", cat: "Weapon", dice: "2 Dice" },
      { name: "Dagger", cat: "Weapon", dice: "1 Die" },
      { name: "Shield", cat: "Armor", dice: "+1 Def" },
      { name: "Plate Mail", cat: "Armor", dice: "+2 Def" },
      { name: "Potion of Healing", cat: "Consumable", dice: "Restores 4 BP" }
    ];
    iGrid.innerHTML = items.map(i => `
      <div class="item-card">
        <div class="card-title">${i.name}</div>
        <div class="card-meta">Category: ${i.cat}</div>
        <div class="card-meta">${i.dice}</div>
      </div>
    `).join("");
  }
}

// Board Canvas Preview
function initBoard() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellW = canvas.width / 26;
    const cellH = canvas.height / 19;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);

    const hoverSpan = document.getElementById("board-hover-coords");
    if (hoverSpan && col >= 0 && col < 26 && row >= 0 && row < 19) {
      let locName = "Corridor";
      if (col >= 11 && col <= 14 && row >= 7 && row <= 11) {
        locName = "Central Chamber";
      }
      hoverSpan.textContent = `Square: [${col}, ${row}] | ${locName}`;
    }
  });

  drawBoard();
}

function drawBoard() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cellW = w / 26;
  const cellH = h / 19;

  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, w, h);

  // Draw grid
  ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= 26; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellW, 0);
    ctx.lineTo(c * cellW, h);
    ctx.stroke();
  }
  for (let r = 0; r <= 19; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellH);
    ctx.lineTo(w, r * cellH);
    ctx.stroke();
  }

  // Draw Central Chamber
  ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
  ctx.fillRect(11 * cellW, 7 * cellH, 4 * cellW, 5 * cellH);
  ctx.strokeStyle = "rgba(245, 158, 11, 0.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(11 * cellW, 7 * cellH, 4 * cellW, 5 * cellH);

  // Draw Heroes
  const heroCoords = [
    { name: "B", col: 1, row: 1, color: "#b91c1c" },
    { name: "D", col: 1, row: 2, color: "#b45309" },
    { name: "E", col: 2, row: 1, color: "#15803d" },
    { name: "W", col: 2, row: 2, color: "#1d4ed8" }
  ];
  heroCoords.forEach(h => {
    ctx.fillStyle = h.color;
    ctx.beginPath();
    ctx.arc(h.col * cellW + cellW/2, h.row * cellH + cellH/2, cellW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(h.name, h.col * cellW + cellW/2, h.row * cellH + cellH/2);
  });

  // Draw Boss Verag
  ctx.fillStyle = "#15803d";
  ctx.beginPath();
  ctx.arc(12 * cellW + cellW/2, 9 * cellH + cellH/2, cellW * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText("V", 12 * cellW + cellW/2, 9 * cellH + cellH/2);
}

// Action: Save to KGraph
document.getElementById("btn-save-kgraph")?.addEventListener("click", async () => {
  const activeHero = currentData.heroes.find(h => h["@id"] === currentData.activeHeroId);
  if (activeHero) {
    activeHero["dcterms:title"] = document.getElementById("hero-name").value;
    activeHero["robos:bodyPoints"] = parseInt(document.getElementById("hero-bp").value, 10);
    activeHero["robos:mindPoints"] = parseInt(document.getElementById("hero-mp").value, 10);
    activeHero["robos:attackDice"] = parseInt(document.getElementById("hero-atk").value, 10);
    activeHero["robos:defendDice"] = parseInt(document.getElementById("hero-def").value, 10);
    activeHero["robos:startingWeapon"] = document.getElementById("hero-weapon").value;
    activeHero["robos:specialAbility"] = document.getElementById("hero-ability").value;
    activeHero["robos:tokenColor"] = document.getElementById("hero-color").value;

    setStatus("Saving hero to KGraph...");
    const res = await window.robosTabletop.saveKGraphEntity({ entity: activeHero });
    if (res.success) {
      setStatus(`Successfully saved hero x24{activeHero[dcterms:title]} to KGraph package.`);
      alert(`Saved hero x24{activeHero[dcterms:title]} to Knowledge Graph!`);
    } else {
      setStatus("Error saving: " + res.error);
    }
  }
});

// Action: Bundle Cartridge
document.getElementById("btn-bundle")?.addEventListener("click", async () => {
  const payload = {
    cartridgeId: document.getElementById("quest-slug").value || "heroquest-the-trial",
    title: document.getElementById("quest-title").value || "HeroQuest: The Trial",
    description: document.getElementById("quest-briefing").value || "",
    ruleset: document.getElementById("quest-ruleset").value || "heroquest",
    startingPosition: [
      parseInt(document.getElementById("quest-spawn-x").value, 10) || 1,
      parseInt(document.getElementById("quest-spawn-y").value, 10) || 1
    ],
    heroes: currentData.heroes.map(h => ({
      id: h["@id"].split(":").pop(),
      slug: h["@id"].split(":").pop(),
      name: h["dcterms:title"],
      bodyPoints: h["robos:bodyPoints"] || 8,
      mindPoints: h["robos:mindPoints"] || 2,
      attackDice: h["robos:attackDice"] || 3,
      defendDice: h["robos:defendDice"] || 2,
      tokenColor: h["robos:tokenColor"] || "#b91c1c",
      position: [1, 1]
    })),
    monsters: currentData.monsters.map(m => ({
      id: m["@id"].split(":").pop(),
      slug: m["@id"].split(":").pop(),
      name: m["dcterms:title"],
      bodyPoints: m["robos:bodyPoints"] || 1,
      attackDice: m["robos:attackDice"] || 2,
      defendDice: m["robos:defendDice"] || 2,
      movementSquares: m["robos:movementSquares"] || 6,
      position: [12, 9]
    })),
    maps: {
      "the-trial": {
        width: 26,
        height: 19,
        title: "The Trial Map"
      }
    },
    quests: [
      { id: "quest-1", title: document.getElementById("quest-title").value }
    ]
  };

  setStatus("Bundling Tabletop Cartridge...");
  const res = await window.robosTabletop.bundleCartridge(payload);
  if (res.success) {
    setStatus(`Cartridge generated: ${res.cartridgeId}.cartridge.json`);
    alert(`Tabletop Cartridge generated successfully!\nPath: ${res.cartridgePath}`);
  } else {
    setStatus("Failed to bundle: " + res.error);
  }
});

// Action: Play as Hero (Player Mode)
document.getElementById("btn-play-hero")?.addEventListener("click", async () => {
  const slug = document.getElementById("quest-slug").value || "heroquest-the-trial";
  setStatus(`Launching Godot 4 Tabletop Player in PLAYER MODE for x24{slug}...`);
  const res = await window.robosTabletop.launchGame({ cartridgeSlug: slug, role: "player" });
  if (res.success) {
    setStatus(`Launched Player Mode (PID: ${res.pid})`);
  } else {
    setStatus("Error launching game: " + res.error);
  }
});

// Action: Play as DunMaster (DM Mode)
document.getElementById("btn-play-dm")?.addEventListener("click", async () => {
  const slug = document.getElementById("quest-slug").value || "heroquest-the-trial";
  setStatus(`Launching Godot 4 Tabletop Player in DUNMASTER MODE for x24{slug}...`);
  const res = await window.robosTabletop.launchGame({ cartridgeSlug: slug, role: "dm" });
  if (res.success) {
    setStatus(`Launched DunMaster Mode (PID: ${res.pid})`);
  } else {
    setStatus("Error launching game: " + res.error);
  }
});

// Initialize on page load
window.addEventListener("DOMContentLoaded", initKGraphData);
