plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    id("org.jetbrains.intellij.platform") version "2.0.0"
}

group = "com.robos.intellij"
version = "1.0.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaUltimate("2024.1")
        bundledPlugin("com.intellij.java")
        instrumentationTools()
    }
    implementation("org.jetbrains.kotlin:kotlin-stdlib")
    implementation("com.google.code.gson:gson:2.10.1")
    testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
    pluginConfiguration {
        id = "com.robos.intellij"
        name = "RobOS IDE Review Bridge & Autonomous Agent Harness"
        version = "1.0.0"
        vendor {
            name = "RobOS"
            url = "https://rowbose.com"
        }
        description = """
            RobOS IntelliJ Platform Plugin providing a high-performance bi-directional IPC HTTP bridge on port 63343,
            secret-managed run/debug configurations via GPG pass, breakpoint webhooks, paused thread inspection,
            and ephemeral multi-project workspace lifecycle orchestration.
        """.trimIndent()
    }
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
}
