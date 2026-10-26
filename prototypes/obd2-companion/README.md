# OBD-II companion prototype

Experimental Android-first bridge for reading standard emissions-related diagnostic trouble codes (DTCs) from ELM327-compatible adapters and passing them to a Rowbose maintenance application.

## Scope
- Initial transport: Android Bluetooth Classic SPP (many inexpensive ELM327 adapters); BLE adapters need a separate transport.
- Commands: ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0, 0100 (capability check), 03 (stored DTCs), 07 (pending DTCs), 0A (permanent DTCs where supported).
- Never clear codes (Mode 04) automatically.
- Treat adapter responses as untrusted; enforce read timeouts, maximum response sizes and explicit user consent before upload.
- No VIN, GPS or owner-identifying data should be uploaded by default.

## Initial implementation
The included Kotlin parser is Android-independent, and can be exercised with the included Kotlin test fixture. It handles standard 2-byte DTC payloads and common ELM327 text formatting. The Bluetooth transport, permission prompts, UI, and backend authentication remain to be implemented.

## Integration contract (proposed)
POST to an authenticated endpoint selected by the Rowbose application, with JSON:
```json
{
  "schemaVersion": 1,
  "vehicleId": "user-selected-vehicle-id",
  "capturedAt": "2026-10-15T18:00:00Z",
  "source": "obd2-elm327",
  "storedCodes": ["P0302"],
  "pendingCodes": [],
  "permanentCodes": []
}
```
The server must authorize the vehicle association and validate codes. Do not assume this endpoint exists yet.

## Next steps
1. Confirm the actual automotive-maintenance repository or module and API conventions.
2. Scaffold Android Gradle app, Bluetooth permission flow and paired-device picker.
3. Implement bounded SPP command/response exchange, adapter errors and reconnection.
4. Add simulation mode, protocol tests and backend API integration.
5. Test with a real adapter and vehicle. Hardware testing is not possible from GitHub alone.
