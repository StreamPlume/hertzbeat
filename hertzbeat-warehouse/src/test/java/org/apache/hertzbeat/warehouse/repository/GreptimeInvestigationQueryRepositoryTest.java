/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hertzbeat.warehouse.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.hertzbeat.warehouse.db.GreptimeSqlQueryExecutor;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.LogQuery;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.IdentityQuery;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.NearbyQuery;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.Status;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.TraceQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

@ExtendWith(MockitoExtension.class)
class GreptimeInvestigationQueryRepositoryTest {

    private static final long START = 1_787_934_874_000L;
    private static final long END = START + 60_000L;

    @Mock
    private ObjectProvider<GreptimeSqlQueryExecutor> executorProvider;

    @Mock
    private GreptimeSqlQueryExecutor executor;

    private GreptimeInvestigationQueryRepository repository;

    @BeforeEach
    void setUp() {
        repository = new GreptimeInvestigationQueryRepository(executorProvider);
    }

    @Test
    void queriesCompleteTraceWithExplicitProjectionAndExclusiveEnd() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of(traceRow()));

        var result = repository.trace(new TraceQuery(
                "team-a", "0123456789abcdef0123456789abcdef", START, END));

        assertEquals(Status.AVAILABLE, result.status());
        assertEquals(1, result.rows().size());
        assertEquals(START, result.rows().getFirst().startTime());
        assertTrue(result.rows().getFirst().spanAttributes().isEmpty());
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor).executeStrict(sql.capture());
        assertTrue(sql.getValue().startsWith("SELECT CAST(timestamp AS BIGINT) / 1000000 AS start_time"));
        assertFalse(sql.getValue().contains("span_attributes."));
        assertTrue(sql.getValue().contains("timestamp >= to_timestamp_millis(" + START + ")"));
        assertTrue(sql.getValue().contains("timestamp < to_timestamp_millis(" + END + ")"));
        assertFalse(sql.getValue().contains("timestamp <="));
        assertTrue(sql.getValue().endsWith("ORDER BY timestamp ASC LIMIT 5001"));
    }

    @Test
    void selectedLogUsesWorkspaceAndUidLimitTwoAndPreservesNanoseconds() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of(logRow("event-7")));

        var result = repository.selectedLog(new LogQuery("team-a", "event-7", START, END));

        assertEquals(Status.AVAILABLE, result.status());
        assertEquals("1787934874782123456", result.rows().getFirst().timeUnixNano());
        assertEquals(null, result.rows().getFirst().observedTimeUnixNano());
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor).executeStrict(sql.capture());
        assertTrue(sql.getValue().contains(" FROM hertzbeat_logs WHERE "));
        assertFalse(sql.getValue().contains(" FROM hzb_logs "));
        assertTrue(sql.getValue().contains("log_record_uid = 'event-7'"));
        assertTrue(sql.getValue().contains("hertzbeat_workspace_id = 'team-a'"));
        assertTrue(sql.getValue().contains("timestamp < to_timestamp_millis(" + END + ")"));
        assertFalse(sql.getValue().contains("observed_time_unix_nano"));
        assertTrue(sql.getValue().endsWith("ORDER BY timestamp ASC, log_record_uid ASC LIMIT 2"));
    }

    @Test
    void duplicateSelectedUidIsMalformedInsteadOfPickingFirst() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of(logRow("event-7"), logRow("event-7")));

        var result = repository.selectedLog(new LogQuery("team-a", "event-7", START, END));

        assertEquals(Status.MALFORMED_DATA, result.status());
        assertTrue(result.rows().isEmpty());
    }

    @Test
    void providerResolutionFailureIsUnavailable() {
        when(executorProvider.getIfAvailable()).thenThrow(new IllegalStateException("bean failure"));

        var result = repository.trace(new TraceQuery(
                "team-a", "0123456789abcdef0123456789abcdef", START, END));

        assertEquals(Status.STORAGE_UNAVAILABLE, result.status());
        assertTrue(result.rows().isEmpty());
    }

    @Test
    void rejectsUppercaseQueryAndPersistedSpanIdentifiers() {
        assertThrows(IllegalArgumentException.class, () -> new TraceQuery(
                "team-a", "0123456789ABCDEF0123456789ABCDEF", START, END));

        Map<String, Object> uppercaseSpanRow = new HashMap<>(traceRow());
        uppercaseSpanRow.put("span_id", "0123456789ABCDEF");
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of(uppercaseSpanRow));

        var result = repository.trace(new TraceQuery(
                "team-a", "0123456789abcdef0123456789abcdef", START, END));

        assertEquals(Status.MALFORMED_DATA, result.status());
        assertTrue(result.rows().isEmpty());
    }

    @Test
    void nearbyLogsUseTimestampAndUidTieBreakersInBothDirections() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of());
        long selectedTime = 1_787_934_874_782_123_456L;

        repository.nearbyLogs(new NearbyQuery("team-a", "event-7", selectedTime, "checkout", "7",
                "service", "payments", "prod", START, END));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor, org.mockito.Mockito.times(2)).executeStrict(sql.capture());
        assertTrue(sql.getAllValues().stream().allMatch(value -> value.contains(" FROM hertzbeat_logs WHERE ")));
        assertTrue(sql.getAllValues().get(0).contains("(CAST(timestamp AS BIGINT) < " + selectedTime
                + " OR (CAST(timestamp AS BIGINT) = " + selectedTime
                + " AND log_record_uid < 'event-7'))"));
        assertTrue(sql.getAllValues().get(0).endsWith("ORDER BY timestamp DESC, log_record_uid DESC LIMIT 26"));
        assertTrue(sql.getAllValues().get(1).contains("(CAST(timestamp AS BIGINT) > " + selectedTime
                + " OR (CAST(timestamp AS BIGINT) = " + selectedTime
                + " AND log_record_uid > 'event-7'))"));
        assertTrue(sql.getAllValues().get(1).endsWith("ORDER BY timestamp ASC, log_record_uid ASC LIMIT 26"));
    }

    @Test
    void sameTraceLogsUseTheCanonicalPipelineTable() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of());

        repository.sameTraceLogs(new InvestigationQueryRepository.TraceLogsQuery(
                "team-a", "0123456789abcdef0123456789abcdef", START, END));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor).executeStrict(sql.capture());
        assertTrue(sql.getValue().contains(" FROM hertzbeat_logs WHERE "));
        assertFalse(sql.getValue().contains(" FROM hzb_logs "));
    }

    @Test
    void alertLogsUseExactWorkspaceIdentityExclusiveWindowAndLimitPlusOne() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of(logRow("event-7")));

        var result = repository.identityLogs(new IdentityQuery(
                "team-a", "7", "checkout", "payments", "prod", START, END));

        assertEquals(Status.AVAILABLE, result.status());
        assertEquals(1, result.rows().size());
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor).executeStrict(sql.capture());
        assertTrue(sql.getValue().contains(" FROM hertzbeat_logs WHERE hertzbeat_workspace_id = 'team-a'"));
        assertTrue(sql.getValue().contains("hertzbeat_entity_id = '7'"));
        assertTrue(sql.getValue().contains("service_name = 'checkout'"));
        assertTrue(sql.getValue().contains("timestamp < to_timestamp_millis(" + END + ")"));
        assertTrue(sql.getValue().endsWith("ORDER BY timestamp DESC, log_record_uid DESC LIMIT 101"));
    }

    @Test
    void alertTraceSummariesStayLosslessAndAreBoundedByExactIdentity() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of(Map.of(
                "trace_id", "0123456789abcdef0123456789abcdef",
                "start_time_unix_nano", "1787934874782123456",
                "duration_nanos", 42_000L,
                "span_count", 2L,
                "service_name", "checkout",
                "error_count", 1L,
                "ok_count", 1L,
                "unset_count", 0L)));

        var result = repository.identityTraces(new IdentityQuery(
                "team-a", "7", "checkout", "payments", "prod", START, END));

        assertEquals(Status.AVAILABLE, result.status());
        assertEquals("1787934874782123456", result.rows().getFirst().startTimeUnixNano());
        assertEquals("42000", result.rows().getFirst().durationNanos());
        assertEquals("error", result.rows().getFirst().status());
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor).executeStrict(sql.capture());
        assertTrue(sql.getValue().contains("FROM hzb_traces"));
        assertTrue(sql.getValue().contains("\"resource_attributes.hertzbeat.workspace_id\" = 'team-a'"));
        assertTrue(sql.getValue().contains("\"resource_attributes.hertzbeat.entity_id\" = '7'"));
        assertTrue(sql.getValue().contains("timestamp < to_timestamp_millis(" + END + ")"));
        assertTrue(sql.getValue().endsWith("ORDER BY start_time_unix_nano DESC LIMIT 51"));
    }

    @Test
    void missingOptionalAlertLabelsDoNotInventNullPredicates() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString())).thenReturn(List.of());

        repository.identityLogs(new IdentityQuery(
                "team-a", null, "checkout", null, null, START, END));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(executor).executeStrict(sql.capture());
        assertFalse(sql.getValue().contains("hertzbeat_entity_id IS NULL"));
        assertFalse(sql.getValue().contains("service.namespace\"]') IS NULL"));
        assertFalse(sql.getValue().contains("deployment.environment.name\"]') IS NULL"));
        assertTrue(sql.getValue().contains("service_name = 'checkout'"));
    }

    @Test
    void alertSignalQueriesReturnBoundedRowsWithHonestTruncation() {
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        when(executor.executeStrict(anyString()))
                .thenReturn(java.util.Collections.nCopies(101, logRow("event-7")))
                .thenReturn(java.util.Collections.nCopies(51, Map.of(
                        "trace_id", "0123456789abcdef0123456789abcdef",
                        "start_time_unix_nano", "1787934874782123456",
                        "duration_nanos", 42_000L,
                        "span_count", 2L,
                        "service_name", "checkout",
                        "error_count", 0L,
                        "ok_count", 2L,
                        "unset_count", 0L)));
        IdentityQuery query = new IdentityQuery(
                "team-a", "7", "checkout", "payments", "prod", START, END);

        var logs = repository.identityLogs(query);
        var traces = repository.identityTraces(query);

        assertEquals(100, logs.rows().size());
        assertTrue(logs.truncated());
        assertEquals(50, traces.rows().size());
        assertTrue(traces.truncated());
    }

    private Map<String, Object> traceRow() {
        return Map.ofEntries(
                Map.entry("start_time", START),
                Map.entry("trace_id", "0123456789abcdef0123456789abcdef"),
                Map.entry("span_id", "0123456789abcdef"),
                Map.entry("parent_span_id", ""),
                Map.entry("span_name", "GET /checkout"),
                Map.entry("service_name", "checkout"),
                Map.entry("span_status_code", "STATUS_CODE_OK"),
                Map.entry("span_kind", "SPAN_KIND_SERVER"),
                Map.entry("duration_nano", 2_000_000L),
                Map.entry("workspace_id", "team-a"),
                Map.entry("entity_id", "7"),
                Map.entry("entity_type", "service"),
                Map.entry("service_namespace", "payments"),
                Map.entry("deployment_environment", "prod"));
    }

    private Map<String, Object> logRow(String uid) {
        return Map.ofEntries(
                Map.entry("time_unix_nano", 1_787_934_874_782_123_456L),
                Map.entry("log_record_uid", uid),
                Map.entry("severity_number", 17),
                Map.entry("severity_text", "ERROR"),
                Map.entry("body", "checkout failed"),
                Map.entry("trace_id", "0123456789abcdef0123456789abcdef"),
                Map.entry("span_id", "0123456789abcdef"),
                Map.entry("hertzbeat_workspace_id", "team-a"),
                Map.entry("hertzbeat_entity_id", "7"),
                Map.entry("hertzbeat_entity_type", "service"),
                Map.entry("service_name", "checkout"),
                Map.entry("service_namespace", "payments"),
                Map.entry("deployment_environment", "prod"));
    }
}
