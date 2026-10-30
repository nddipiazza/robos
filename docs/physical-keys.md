---
title: Physical Push Keys (YubiKey & FIDO2)
layout: default
nav_order: 8
permalink: /physical-keys/
description: "Reference guide for RobOS Hardware Keys (packages/hardware-keys): inspect YubiKey & FIDO2 authenticators over USB/HID and CTAP2, verify physical capacitive touch, generate non-exportable ed25519-sk SSH keys, manage FIDO2 PINs and resident passkeys, and bind physical push approval to Linux PAM sudo, Git commit signing, and the RobOS Pass Store."
---

# Physical Push Keys (`packages/hardware-keys`)
{: .no_toc }

Connect physical FIDO2 and U2F authenticators—such as the **YubiKey 5 Series**, **Security Key C NFC**, **SoloKey**, and **Nitrokey**—directly to your Linux desktop, SSH keys, Git commits, `sudo` prompts, and the RobOS Pass Store.
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 1. Architecture Overview

**RobOS Hardware Keys** (`packages/hardware-keys`, debug port `:19218`) combines three local Linux inspection layers—`/sys/class/hidraw` udev attributes, YubiKey Manager (`ykman`), and direct `python3-fido2` CTAP2/CTAP1 HID frames—so every hardware capability can be inspected and exercised without cloud services or browser extensions.

![RobOS Hardware Keys Physical Push-to-Approve Architecture]({{ '/assets/images/physical-keys/hardware-keys-architecture.png' | relative_url }})

```mermaid
flowchart LR
  subgraph HW["Physical Security Key (USB 1050:0402 / NFC)"]
    TOUCH["Gold Capacitive Touch Disc<br/>Hardware User Presence (UP=1)"]
    SE["Secure Element (Firmware 5.7.1)<br/>FIDO2 CTAP2.1 + FIDO U2F CTAP1<br/>COSE: EdDSA (-8), ES256 (-7), ES384 (-35)"]
    HID["Linux Kernel HID Node<br/>/dev/hidraw0 (udev ACL crw-rw----+)"]
    TOUCH --> SE --> HID
  end

  subgraph ENGINE["RobOS Hardware Keys Studio (packages/hardware-keys :19218)"]
    INSP["Hardware Inspector<br/>sysfs + ykman + python3-fido2 Ctap2.get_info()"]
    CHAL["Physical Touch Verifier<br/>SHA-256 Challenge -> Touch -> Signature Proof"]
    HOTPLUG["USB Hotplug Monitor (3.5s poll)<br/>Auto-Lock on Unplug (gpgconf --kill gpg-agent)"]
    HID --> INSP
    HID --> CHAL
    HID --> HOTPLUG
  end

  subgraph TARGETS["Protected Workstation & RobOS Targets"]
    SSH["OpenSSH 10.2 FIDO2 Keys<br/>~/.ssh/id_ed25519_sk & ssh-keygen -Y sign"]
    GIT["Git Commit Signing<br/>gpg.format = ssh & commit.gpgsign = true"]
    PAM["Linux PAM U2F<br/>pamu2fcfg -> ~/.config/Yubico/u2f_keys"]
    GUARD["RobOS Pass Store & Agent Gate<br/>~/.config/robos/hardware-keys.json"]
  end

  ENGINE --> SSH
  SSH --> GIT
  ENGINE --> PAM
  ENGINE --> GUARD
```

---

## 2. Live Application Views

![RobOS Hardware Keys — Hardware Inspector]({{ '/assets/images/physical-keys/01-hardware-inspector.png' | relative_url }})

| Physical Touch Verifier | FIDO2 SSH Keys (`ed25519-sk`) |
|:---:|:---:|
| ![Physical Touch Verifier]({{ '/assets/images/physical-keys/02-physical-touch-verified.png' | relative_url }}) | ![FIDO2 SSH Keys]({{ '/assets/images/physical-keys/03-fido2-ssh-keys.png' | relative_url }}) |

| FIDO2 PIN & Resident Passkeys | Linux PAM U2F & RobOS Guards |
|:---:|:---:|
| ![FIDO2 PIN & Passkeys]({{ '/assets/images/physical-keys/04-fido2-pin-passkeys.png' | relative_url }}) | ![PAM & RobOS Guard]({{ '/assets/images/physical-keys/05-pam-robos-guard.png' | relative_url }}) |

---

## 3. Capabilities & Workflows

1. **Hardware Inspector**: Queries `/sys/class/hidraw/hidraw*/device/uevent`, `ykman info`, `ykman fido info`, and `Ctap2.get_info()` to report firmware version, USB/NFC applet state, FIDO2 AAGUID, supported COSE algorithms (`EdDSA / Ed25519`, `ES256 / P-256`, `ES384 / P-384`), CTAP2 extensions, and Linux udev read/write permissions.
2. **Physical Touch Verifier**: Issues a live cryptographic challenge to the key, blinks the LED, measures physical touch latency in milliseconds, and displays the resulting hardware signature and authenticator flags (`UP=1`, `UV`).
3. **Hardware-Backed OpenSSH Keys (`ed25519-sk` & `ecdsa-sk`)**: Generates FIDO2 SSH keys whose private half never leaves the YubiKey, supports `verify-required` and resident (`-O resident`) modes, tests `ssh-keygen -Y sign` signatures, and uploads `.pub` keys to GitHub.
4. **FIDO2 PIN & Passkeys**: Sets or rotates the FIDO2 PIN (`ykman fido access change-pin`) and lists or deletes discoverable resident credentials (`ykman fido credentials list`).
5. **Linux PAM U2F & RobOS Guards**: Enrolls `~/.config/Yubico/u2f_keys` via `pamu2fcfg` for touch-to-approve `sudo` and desktop login, configures Git global SSH commit signing (`gpg.format = ssh`), and can automatically lock `gpg-agent` when the YubiKey is unplugged.
