package com.rowbose.obd

import kotlin.test.Test
import kotlin.test.assertEquals

class DtcParserTest {
    @Test fun storedMisfire() {
        assertEquals(listOf("P0302"), DtcParser.parseSimpleElmResponse(0x03, "43 03 02 00 00 >"))
    }
    @Test fun multipleFamilies() {
        assertEquals(listOf("P0302", "C1234"), DtcParser.parsePayload(0x03, listOf(0x43, 0x03, 0x02, 0x52, 0x34)))
    }
    @Test fun noData() {
        assertEquals(emptyList(), DtcParser.parseSimpleElmResponse(0x03, "NO DATA >"))
    }
}
