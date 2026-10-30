---
title: "RobOS Hardware Keys"
package: hardware-keys
category: "security-vault"
icon: hardware-keys.svg
summary: "YubiKey & FIDO2 physical push keys, touch verification, ed25519-sk SSH keys, Passkeys, and PAM U2F security studio"
description: "YubiKey & FIDO2 physical push keys, touch verification, ed25519-sk SSH keys, Passkeys, and PAM U2F security studio"
---

**RobOS Hardware Keys** (`packages/hardware-keys`) is the physical security key studio for YubiKey, Security Key C NFC, SoloKey, Nitrokey, and FIDO2/U2F hardware authenticators.

## Key Capabilities

- **Live Hardware Inspector**: Automatically detects connected USB & NFC security keys via `/sys/class/hidraw`, `ykman`, and `python3-fido2` CTAP2 (`Ctap2.get_info()`). Displays firmware version, form factor, FIDO2 AAGUID, COSE cryptographic algorithms (`EdDSA / Ed25519`, `ES256 / P-256`, `ES384`), CTAP2 extensions (`credProtect`, `hmac-secret`, `largeBlobKey`), remaining Resident Key slots, and Linux `/dev/hidraw` udev ACL status.
- **Physical Touch / Push-to-Approve Tester**: Trigger a live cryptographic FIDO2/U2F challenge-response that blinks the LED on your YubiKey and measures touch latency, authenticator flags (`UP=1`, `UV`), credential handle, and hardware signature proof.
- **Hardware-Backed OpenSSH Keys (`ed25519-sk` & `ecdsa-sk`)**: Generate non-exportable FIDO2 SSH keys where the private key never leaves the YubiKey, test hardware SSH signing (`ssh-keygen -Y sign`), and upload public keys directly to GitHub.
- **FIDO2 PIN & Resident Passkeys**: Set or change your FIDO2 PIN (`ykman fido access change-pin`) and inspect or delete discoverable resident credentials (`ykman fido credentials list`).
- **Linux PAM U2F & RobOS Push Guards**: Enroll your YubiKey into `~/.config/Yubico/u2f_keys` via `pamu2fcfg` for touch-to-approve `sudo` and desktop login, configure Git global SSH commit signing (`gpg.format=ssh`), and enforce hardware touch gates for RobOS Pass Store unlock and high-risk agent actions.
