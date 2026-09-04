'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();

var _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS GraphQL Client',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19182);
  }

  return win;
}

app.setName('graphql-client');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'graphql-client'));

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

const SAMPLE_SCHEMA = {
  types: [
    {
      name: 'Query',
      fields: [
        { name: 'pet(id: ID!)', type: 'Pet', desc: 'Fetch pet by unique ID' },
        { name: 'allPets(status: PetStatus)', type: '[Pet!]!', desc: 'Query pets with optional status filter' },
        { name: 'verifyRabiesCert(petId: ID!)', type: 'VaccineVerificationResult!', desc: 'Verify vaccination status via Fastify mTLS gateway' }
      ]
    },
    {
      name: 'Mutation',
      fields: [
        { name: 'createPet(input: PetInput!)', type: 'Pet!', desc: 'Register new pet in system' },
        { name: 'bookSurgery(input: SurgeryBookingInput!)', type: 'SurgeryBooking!', desc: 'Book emergency surgery room' }
      ]
    },
    {
      name: 'Pet',
      fields: [
        { name: 'id', type: 'ID!' },
        { name: 'name', type: 'String!' },
        { name: 'species', type: 'String!' },
        { name: 'status', type: 'PetStatus!' },
        { name: 'vaccinationCertificates', type: '[VaccineCertificate!]!' }
      ]
    }
  ]
};

ipcMain.handle('gql-introspect', async () => SAMPLE_SCHEMA);

ipcMain.handle('gql-execute', async (_, { endpoint, query, variables }) => {
  const start = Date.now();
  await new Promise(r => setTimeout(r, 160));
  const latency = Date.now() - start;

  if (query.includes('pet(') || query.includes('allPets')) {
    return {
      data: {
        pet: {
          id: "PET-105",
          name: "Luna",
          species: "Canine (Siberian Husky)",
          status: "AVAILABLE",
          vaccinationCertificates: [
            { certId: "VAX-CERT-9941", vaccineType: "Rabies 3-Year", verified: true, expiryDate: "2029-09-04" }
          ]
        }
      },
      extensions: {
        latencyMs: latency,
        servingPod: "vaccine-gateway-55f5cbbbcb-mqlwm",
        cachedInRedis: true
      }
    };
  }

  return {
    data: {
      result: "SUCCESS",
      timestamp: new Date().toISOString()
    },
    extensions: { latencyMs: latency }
  };
});
