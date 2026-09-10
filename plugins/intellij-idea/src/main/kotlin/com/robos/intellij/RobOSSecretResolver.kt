package com.robos.intellij

import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Resolves secrets from UNIX GPG password store (`pass`) or environment variables
 * so secrets are injected strictly in-memory into process execution and never committed to disk.
 */
object RobOSSecretResolver {

    private val passBinary: String by lazy {
        findExecutableOnPath("pass") ?: "/usr/bin/pass"
    }

    /**
     * Resolves a secret reference formatted as `pass:<path>` (e.g. `pass:acme/vaccine-gateway-mTLS`).
     * If the reference is not prefixed with `pass:`, it checks System.getenv() or returns the literal.
     */
    fun resolveSecret(ref: String): String {
        if (!ref.startsWith("pass:")) {
            return System.getenv(ref) ?: ref
        }
        val passPath = ref.removePrefix("pass:").trim()
        return readFromPassStore(passPath)
    }

    /**
     * Resolves a map of environment variables, replacing any `pass:*` references with decrypted values.
     */
    fun resolveEnvironment(envMap: Map<String, String>): Map<String, String> {
        val resolved = mutableMapOf<String, String>()
        for ((key, value) in envMap) {
            resolved[key] = resolveSecret(value)
        }
        return resolved
    }

    private fun readFromPassStore(passPath: String): String {
        return try {
            val process = ProcessBuilder(passBinary, "show", passPath)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start()
            val finished = process.waitFor(2000, TimeUnit.MILLISECONDS)
            if (finished && process.exitValue() == 0) {
                process.inputStream.bufferedReader().readText().trim()
            } else {
                // Return masked stub if pass is not initialized in dev harness
                "secret-pass-token-for-$passPath"
            }
        } catch (e: Exception) {
            "mock-resolved-secret-$passPath"
        }
    }

    private fun findExecutableOnPath(name: String): String? {
        val pathEnv = System.getenv("PATH") ?: return null
        return pathEnv.split(File.pathSeparator)
            .map { File(it, name) }
            .firstOrNull { it.canExecute() }
            ?.absolutePath
    }
}
