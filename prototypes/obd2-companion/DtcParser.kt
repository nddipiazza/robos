package com.rowbose.obd

/**
 * Parser for ELM327 text responses to OBD-II service 03, 07 or 0A.
 * Input must be a complete response from a bounded transport read.
 * Supports simple non-CAN payloads and CAN ISO-TP single/multi-frame text once reassembled.
 */
object DtcParser {
    fun parsePayload(service: Int, payload: List<Int>): List<String> {
        require(service in listOf(0x03, 0x07, 0x0A))
        if (payload.isEmpty() || payload[0] != service + 0x40) return emptyList()
        val codes = mutableListOf<String>()
        for (i in 1 until payload.size - 1 step 2) {
            val a = payload[i] and 0xff
            val b = payload[i + 1] and 0xff
            if (a == 0 && b == 0) continue
            val family = "PCBU"[a ushr 6]
            val first = (a ushr 4) and 0x03
            val tail = "%01X%02X".format(a and 0x0f, b)
            codes.add("$family$first$tail")
        }
        return codes.distinct()
    }

    /** Decode a response containing only contiguous hexadecimal bytes, e.g. "43 01 02 00 00". */
    fun parseSimpleElmResponse(service: Int, response: String): List<String> {
        val cleaned = response.replace(">", "").trim()
        if (cleaned.isEmpty() || cleaned.contains("NO DATA", ignoreCase = true)) return emptyList()
        val tokens = cleaned.split(Regex("\\s+"))
        if (tokens.any { !it.matches(Regex("[0-9A-Fa-f]{2}")) }) return emptyList()
        return parsePayload(service, tokens.map { it.toInt(16) })
    }
}
