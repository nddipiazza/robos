# The RobOS layer on top of LineageOS. robos-image.sh adds this to the device's product.
PRODUCT_SOONG_NAMESPACES += vendor/robos

PRODUCT_PACKAGES += \
    RobOSHome \
    RobOSSmartHome

# The stock launcher provides gesture navigation, so RobOS uses the three-button bar.
PRODUCT_PRODUCT_PROPERTIES += \
    ro.boot.vendor.overlay.theme=com.android.internal.systemui.navbar.threebutton
