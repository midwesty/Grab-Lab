// ===========================================================
// main.js – Core game loop, input handling, data persistence
// ===========================================================
import { GameState } from './engine/gameState.js';
import { UIManager } from './engine/uiManager.js';
import { AudioManager } from './engine/audioManager.js';
import { CombatEngine } from './combat/turnBasedCombat.js';
import { MapData } from './map/mapData.js';
import { SaveManager } from './storage/saveManager.js';
import { CheatCodes } from './cheats/adminCheatCodes.json';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = new GameState();
let uiMgr    = new UIManager(canvas, gameState);
let audioMgr = new AudioManager();          // will point to assets/audio/ folder
let combat   = new CombatEngine(gameState);  // uses Zomboid style turn based

// input: mouse or touch
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);

function handleMouseDown(e){
    if (uiMgr.isAdmin) {
        const key = e.button;
        uiMgr.showCheatPanel(key);
    }
}

// Save / load logic
window.onload = () => {
  // Load assets, JSONs, start game
};
