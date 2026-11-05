# RobOS phone image

Builds a RobOS Android image for the Motorola Moto G100 (`nio`, model XT2125-4), or the Moto G10 (`capri`, models XT2127-1 and XT2127-2) with `ROBOS_DEVICE=capri`: LineageOS with a RobOS boot animation and home screen, the RobOS phone apps, and the stock apps removed. It is Wi-Fi only for now.

## Status

The RobOS parts are built and tested on an emulator. The full image has not been built or flashed yet, so `vendor/robos` and `robos-image.sh` are untested against a real LineageOS tree. Expect the first build to need fixes.

## What is in the image

| Piece | Source |
|---|---|
| Boot animation | `tools/make-bootanimation.py`, from the RobOS logo |
| Home screen | `packages/robos-launcher-android`. It shows only `com.robos.*` apps and Settings |
| Smart Home | `packages/smart-home-android` |
| Stock apps removed | The `overrides` list in `vendor/robos/Android.bp`. It includes `Updater`, which would otherwise replace RobOS with stock LineageOS |
| Everything else | LineageOS `lineage-24.0`, the current official branch for this phone |

## Build

You need about 400 GB free and a fast connection. Android 17's analysis step alone can pass 50 GB of memory, so a machine with 64 GB or less should turn on compressed swap in RAM first. This lasts until the next restart:

```bash
sudo modprobe zram && sudo zramctl --size 48G --algorithm lz4 /dev/zram0 && sudo mkswap /dev/zram0 && sudo swapon --priority 100 /dev/zram0
```
 The source download is over 100 GB, and the first build takes several hours.

```bash
infra/android/robos-image.sh check
```

```bash
infra/android/robos-image.sh all
```

To rebuild after that, `robos-image.sh start` runs the build as its own background service, capped at 44 GB of memory, or 36 GB plus swap when zram is on. Inside a desktop app, the system's out-of-memory guard can kill the app along with the build. Watch it with `tools/progress.sh`.

The result is `out/target/product/nio/lineage-*.zip` under `~/android/robos`. Set `ROBOS_ANDROID_TREE` to build somewhere else.

## Install on the phone

This erases the phone. Read the [LineageOS install guide for the G100](https://wiki.lineageos.org/devices/nio/install/variant2/) first, since it has the exact commands.

1. Confirm the phone's codename with `adb shell getprop ro.product.device`. An image built for another model can brick it. Also confirm the required firmware: Android 12 on the G100, Android 11 on the G10.
2. Unlock the bootloader through Motorola's support site. Motorola decides per device, and carrier phones may be refused.
3. Flash the `dtbo` and `vendor_boot` partitions and the recovery from the build with `fastboot`.
4. In recovery, copy the active slot's partitions to the other slot as the guide describes. The G100 needs this step.
5. In recovery, factory reset, then sideload the zip with `adb sideload`.

To go back, restore stock Android with Motorola's Rescue and Smart Assistant.

## Known limits

- The bootloader cannot be relocked, so Motorola's unlocked-bootloader warning appears before the RobOS animation. Motorola phones may allow replacing it through the `logo` partition, which has not been tried on this model.
- The build is `userdebug`, signed with public test keys. That suits one personal phone, but a phone for other people needs its own keys.
- Removing the stock launcher removes the app switcher and gesture navigation, so the image uses the three-button bar. The Recents button is expected to do nothing.
- System UI reported "not responding" once during boot on the emulator, before any app was opened. Check for this on the real phone.
