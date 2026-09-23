/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

package org.apache.hertzbeat.common.observability.dto.log;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import org.apache.hertzbeat.common.entity.log.LogEntry;
import org.junit.jupiter.api.Test;

class HistoricalLogRowTest {

    @Test
    void exposesPersistedUidAndLosslessNanoseconds() {
        HistoricalLogRow row = HistoricalLogRow.from(LogEntry.builder()
                .timeUnixNano(Long.MAX_VALUE)
                .observedTimeUnixNano(1_787_934_874_782_123_456L)
                .attributes(Map.of("log.record.uid", "event-7"))
                .build());

        assertEquals("event-7", row.logRecordUid());
        assertEquals("9223372036854775807", row.timeUnixNano());
        assertEquals("1787934874782123456", row.observedTimeUnixNano());
    }

    @Test
    void neverSynthesizesOrLeaksMalformedUid() {
        assertNull(HistoricalLogRow.from(LogEntry.builder().timeUnixNano(7L).build()).logRecordUid());
        assertNull(HistoricalLogRow.from(LogEntry.builder()
                .attributes(Map.of("log.record.uid", "not valid"))
                .build()).logRecordUid());
    }

    @Test
    void publicContractRejectsInvalidTimeAndCopiesMaps() {
        Map<String, Object> attributes = new java.util.HashMap<>(Map.of("key", "value"));
        HistoricalLogRow row = HistoricalLogRow.from(LogEntry.builder()
                .timeUnixNano(7L).attributes(attributes).build());
        attributes.put("late", "mutation");

        assertFalse(row.attributes().containsKey("late"));
        assertThrows(IllegalArgumentException.class, () -> new HistoricalLogRow(null, "0", null, null, null,
                null, null, null, null, null, null, null, null, null, null));
    }

    @Test
    void doesNotExposeGreptimeEventTimeFallbackAsObservedEvidence() {
        HistoricalLogRow row = HistoricalLogRow.from(LogEntry.builder()
                .timeUnixNano(7L).observedTimeUnixNano(7L).build());

        assertNull(row.observedTimeUnixNano());
    }
}
