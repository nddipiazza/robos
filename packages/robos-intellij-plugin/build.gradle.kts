plugins {
    kotlin("jvm") version "2.1.20" apply false
}

allprojects {
    group = "com.robos.intellij"
    version = property("pluginVersion") as String

    repositories {
        mavenCentral()
        maven("https://packages.jetbrains.team/maven/p/ij/intellij-dependencies")
    }
}
