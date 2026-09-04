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
    title: 'RobOS gRPC Client',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19181);
  }

  return win;
}

app.setName('grpc-client');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'grpc-client'));

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

const SAMPLE_PROTO_SERVICES = [
  {
    service: 'petshop.v1.VaccineVerificationService',
    methods: [
      {
        name: 'VerifyCertificate',
        type: 'UNARY',
        requestType: 'VerifyCertificateRequest',
        responseType: 'VerifyCertificateResponse',
        samplePayload: {
          pet_id: "PET-105",
          chip_id: "CHIP-99014-VAX",
          vaccine_code: "RABIES-3YR",
          strict_mtls_validation: true
        }
      },
      {
        name: 'StreamVaccinationEvents',
        type: 'SERVER_STREAMING',
        requestType: 'StreamEventsRequest',
        responseType: 'VaccineEvent',
        samplePayload: {
          shelter_branch_id: "BRANCH-SEA-01",
          since_timestamp: "2026-09-04T00:00:00Z"
        }
      }
    ]
  },
  {
    service: 'petshop.v1.SurgeryBookingService',
    methods: [
      {
        name: 'BookEmergencySurgery',
        type: 'UNARY',
        requestType: 'SurgeryBookingRequest',
        responseType: 'SurgeryBookingResponse',
        samplePayload: {
          pet_id: "PET-105-VAX",
          procedure: "EMERGENCY_RABIES_IMMUNOTHERAPY",
          severity: "URGENT",
          operating_room: "OR-3-TRAUMA"
        }
      }
    ]
  }
];

ipcMain.handle('grpc-get-services', async () => SAMPLE_PROTO_SERVICES);

ipcMain.handle('grpc-invoke', async (_, { endpoint, method, payload, metadata }) => {
  const start = Date.now();
  await new Promise(r => setTimeout(r, 220));
  const latency = Date.now() - start;

  if (method === 'VerifyCertificate') {
    return {
      status: '0 OK',
      statusCode: 0,
      latencyMs: latency,
      peer: '127.0.0.1:8444',
      responseHeaders: {
        'grpc-server': 'vaccine-gateway/1.0.0',
        'x-mtls-verified': 'true'
      },
      responseBody: {
        verified: true,
        cert_id: "VAX-CERT-9941",
        pet_id: payload.pet_id || "PET-105",
        status: "COMPLIANT_ACTIVE",
        expiry_date: "2029-09-04",
        verified_by: "Dr. E. Vance DVM (State Board #44129)",
        serving_pod: "vaccine-gateway-55f5cbbbcb-mqlwm"
      }
    };
  }

  return {
    status: '0 OK',
    statusCode: 0,
    latencyMs: latency,
    peer: endpoint || 'localhost:50051',
    responseHeaders: { 'grpc-server': 'petshop-grpc/1.0' },
    responseBody: {
      booking_id: "SURG-BOOKING-990412",
      pet_id: payload.pet_id || "PET-105",
      status: "CONFIRMED",
      operating_room: payload.operating_room || "OR-3-TRAUMA",
      scheduled_at: new Date().toISOString()
    }
  };
});
