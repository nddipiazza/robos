import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    kotlin("jvm")
    id("org.jetbrains.intellij.platform") version "2.3.0"
}

val localIdePath: String by project
val jvmTarget: String by project
val pluginSinceBuild: String by project
val pluginUntilBuild: String by project

kotlin {
    jvmToolchain(jvmTarget.toInt())
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

intellijPlatform {
    pluginConfiguration {
        id = "com.robos.intellij"
        name = "RobOS"
        version = project.version.toString()
        description = """
            RobOS integration for JetBrains IDEs.
            Exposes an IPC HTTP server on port 63343 for the RobOS Workspace Agent to
            open projects, navigate to files, manage run configurations, and relay
            notifications from the RobOS notification bus into IDE balloon popups.
        """.trimIndent()
        ideaVersion {
            sinceBuild = pluginSinceBuild
            untilBuild = pluginUntilBuild
        }
    }

    signing {
        val certChain = System.getenv("ROBOS_PLUGIN_CERT_CHAIN_FILE")
        if (certChain != null) {
            certificateChainFile = file(certChain)
            privateKeyFile = file(System.getenv("ROBOS_PLUGIN_PRIVATE_KEY_FILE"))
            password = System.getenv("ROBOS_PLUGIN_PRIVATE_KEY_PASSWORD")
        }
    }
}

dependencies {
    intellijPlatform {
        // Use the locally installed IDE — no download needed
        local(localIdePath)
        instrumentationTools()
    }

    // Netty is bundled with IntelliJ — compileOnly so it isn't double-bundled
    compileOnly("io.netty:netty-all:4.1.113.Final")

    // JSON serialization for IPC request/response bodies
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.2")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.17.2")

    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

// buildSearchableOptions spawns a headless IDE sandbox to index settings search.
// Disable for local dev builds — only needed when publishing to JetBrains Marketplace.
tasks.named("buildSearchableOptions") {
    enabled = false
}
