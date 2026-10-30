# RobOS Pass Manager — KeePassXC (`.kdbx`) Single-Archive Vault & YubiKey FIDO2 Unlock

**RobOS Pass Manager** (`packages/pass-manager`, debug port `:19113`) replaces traditional directory-based GPG `pass` stores with a single-archive **KeePassXC `.kdbx` 4.1** password studio backed by `packages/robos-lib/kdbx-vault.js` and unlocked by a physical **YubiKey / FIDO2 Security Key** via the CTAP2.1 `hmac-secret` extension.

![RobOS Pass Manager 1-Touch YubiKey Unlock](assets/images/pass-manager/01-unlock-yubikey.png)

## Architecture

![KeePassXC .kdbx and YubiKey FIDO2 hmac-secret Architecture](assets/images/pass-manager/kdbx-yubikey-architecture.png)

```mermaid
flowchart LR
  subgraph YK["Physical Security Key (/dev/hidraw0 • 1050:0402)"]
    TOUCH["Capacitive Gold Touch Disc<br/>User Presence (UP=1)"]
    ECDH["CTAP2.1 ClientPin ECDH<br/>PinProtocolV2 Shared Secret"]
    HMAC["FIDO2 hmac-secret Extension<br/>32-Byte Salt -> 256-Bit Hardware Secret"]
    TOUCH --> ECDH --> HMAC
  end

  subgraph ENGINE["RobOS Keystore Engine (packages/robos-lib/kdbx-vault.js)"]
    WRAP["AES-256-GCM Key Envelope<br/>robos-passwords.kdbx.fido2.json<br/>(1-Touch / Touch-Only / 2FA PBKDF2)"]
    SHM["Volatile RAM Session Cache<br/>/dev/shm/robos-kdbx-session-UID.json (0600)<br/>Wiped on Lock or USB Unplug"]
    CLI["keepassxc-cli Bridge<br/>db-create / ls / show / add / edit / rm / db-info"]
    HMAC --> WRAP --> SHM --> CLI
  end

  subgraph CONSUMERS["Single-File Archive & RobOS Apps"]
    KDBX[("robos-passwords.kdbx<br/>KDBX 4.1 • AES-256 • Argon2id")]
    PM["RobOS Pass Manager (:19113)<br/>Entry Tree, Editor & Generator"]
    HK["RobOS Hardware Keys (:19218)<br/>Keystore Guard & Unplug Auto-Lock"]
    PU["RobOS Pass Unlock (:19122)<br/>Daily Desktop Unlock Prompt"]
    CLI --> KDBX
    SHM --> PM
    SHM --> HK
    SHM --> PU
  end
```

## Key Capabilities

1. **Single-Archive KDBX 4.1 Container (`robos-passwords.kdbx`)**: Encrypts the entire hierarchy—group names, titles, usernames, passwords, URLs, UUIDs, and notes—inside one portable `.kdbx` file (`AES-256`, `Argon2id`).
2. **Physical YubiKey Unlock via FIDO2 `hmac-secret`**: Works with FIDO-only keys (such as the **Yubico Security Key C NFC**, Firmware 5.7.1, USB ID `1050:0402`) as well as YubiKey 5 Series keys by negotiating an ECDH shared secret (`PinProtocolV2`) and evaluating a deterministic 32-byte hardware HMAC-SHA256 secret on physical touch (`UP=1`).
3. **Three Protection Modes**:
   - **1-Touch Physical Key OR Master Password** (unlock with a single YubiKey touch; keep Master Password as backup)
   - **Physical YubiKey Touch ONLY** (zero master password)
   - **2FA Composite Key** (`PBKDF2-HMAC-SHA256` combining Master Password + Physical YubiKey Touch)
4. **Volatile `/dev/shm` Session & USB Unplug Auto-Lock**: Active unlocked session keys live only in `/dev/shm/robos-kdbx-session-<uid>.json` (`0600`) and are wiped immediately when you click **Lock** or unplug your YubiKey from USB.
