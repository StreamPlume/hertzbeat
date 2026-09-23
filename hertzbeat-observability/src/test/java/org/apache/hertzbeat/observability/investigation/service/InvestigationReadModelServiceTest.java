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

package org.apache.hertzbeat.observability.investigation.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationEvidenceState;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationLogRecord;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationServiceIdentity;
import org.apache.hertzbeat.observability.shared.query.ObservabilityQueryRequestException;
import org.apache.hertzbeat.warehouse.repository.ApmRedQueryRepository;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.RowsResult;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.Status;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.TraceSpanRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class InvestigationReadModelServiceTest {

    private static final long START = 1_787_934_874_000L;
    private static final long END = START + 60_000L;
    private static final String TRACE_ID = "0123456789abcdef0123456789abcdef";
    private static final String SPAN_ID = "0123456789abcdef";

    @Mock
    private ObjectProvider<InvestigationQueryRepository> repositoryProvider;

    @Mock
    private ObjectProvider<ApmRedQueryRepository> redRepositoryProvider;

    @Mock
    private InvestigationQueryRepository repository;

    private TraceInvestigationReadModelService traceService;
    private LogInvestigationReadModelService logService;

    @BeforeEach
    void setUp() {
        traceService = new TraceInvestigationReadModelService(repositoryProvider, redRepositoryProvider);
        logService = new LogInvestigationReadModelService(repositoryProvider);
    }

    @Test
    void completeTraceKeepsIndependentEmptyAndUnavailableEvidenceHonest() throws Exception {
        when(repositoryProvider.getIfAvailable()).thenReturn(repository);
        when(repository.trace(new InvestigationQueryRepository.TraceQuery("team-a", TRACE_ID, START, END)))
                .thenReturn(RowsResult.available(List.of(rootSpan()), false));
        when(repository.sameTraceLogs(new InvestigationQueryRepository.TraceLogsQuery(
                "team-a", TRACE_ID, START, END))).thenReturn(RowsResult.available(List.of(), false));
        when(redRepositoryProvider.getIfAvailable()).thenReturn(null);

        var view = traceService.query("team-a", TRACE_ID, null, START, END);

        assertEquals(InvestigationEvidenceState.READY, view.gantt().state());
        assertEquals(InvestigationEvidenceState.EMPTY, view.sameTraceLogs().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.red().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.metrics().state());
        assertEquals(InvestigationEvidenceState.EMPTY, view.dependencies().state());
        var json = JsonMapper.builder().build().readTree(JsonMapper.builder().build().writeValueAsString(view));
        assertTrue(json.path("gantt").path("detail").path("durationNanos").isString());
        assertEquals("2000000", json.path("gantt").path("detail").path("durationNanos").asText());
        assertTrue(json.path("gantt").path("detail").path("spans").path(0).path("durationNanos").isString());
    }

    @Test
    void rejectsUppercaseTraceAndSpanSelectionsBeforeRepositoryResolution() {
        assertThrows(ObservabilityQueryRequestException.class,
                () -> traceService.query("team-a", "0123456789ABCDEF0123456789ABCDEF", null, START, END));
        assertThrows(ObservabilityQueryRequestException.class,
                () -> traceService.query("team-a", TRACE_ID, "0123456789ABCDEF", START, END));

        verifyNoInteractions(repositoryProvider);
    }

    @Test
    void duplicateSpanMakesWholeGanttUnavailable() {
        when(repositoryProvider.getIfAvailable()).thenReturn(repository);
        when(repository.trace(new InvestigationQueryRepository.TraceQuery("team-a", TRACE_ID, START, END)))
                .thenReturn(RowsResult.available(List.of(rootSpan(), rootSpan()), false));

        var view = traceService.query("team-a", TRACE_ID, null, START, END);

        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.gantt().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.dependencies().state());
    }

    @Test
    void malformedSelectedLogDoesNotBecomeNotFound() {
        when(repositoryProvider.getIfAvailable()).thenReturn(repository);
        when(repository.selectedLog(new InvestigationQueryRepository.LogQuery("team-a", "event-7", START, END)))
                .thenReturn(RowsResult.failed(Status.MALFORMED_DATA));

        var view = logService.query("team-a", "event-7", START, END);

        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.selectedLog().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.trace().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.nearbyLogs().state());
    }

    @Test
    void duplicateSelectedLogRowsAreMalformedAtServiceBoundary() {
        InvestigationLogRecord log = new InvestigationLogRecord(
                "event-7", "1787934874782123456", null, 17, "ERROR", "failed", null, null,
                identity(), Map.of(), Map.of());
        when(repositoryProvider.getIfAvailable()).thenReturn(repository);
        when(repository.selectedLog(new InvestigationQueryRepository.LogQuery("team-a", "event-7", START, END)))
                .thenReturn(RowsResult.available(List.of(log, log), false));

        var view = logService.query("team-a", "event-7", START, END);

        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.selectedLog().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.trace().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.nearbyLogs().state());
    }

    @Test
    void disconnectedParentCycleMakesWholeGanttUnavailable() {
        when(repositoryProvider.getIfAvailable()).thenReturn(repository);
        when(repository.trace(new InvestigationQueryRepository.TraceQuery("team-a", TRACE_ID, START, END)))
                .thenReturn(RowsResult.available(List.of(rootSpan(),
                        childSpan("1111111111111111", "2222222222222222"),
                        childSpan("2222222222222222", "1111111111111111")), false));

        var view = traceService.query("team-a", TRACE_ID, null, START, END);

        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.gantt().state());
        assertEquals(InvestigationEvidenceState.UNAVAILABLE, view.dependencies().state());
    }

    @Test
    void selectedLogWithoutTraceHasNotCorrelatedTraceAndBoundedNearbyRows() {
        InvestigationLogRecord log = new InvestigationLogRecord(
                "event-7", "1787934874782123456", null, 17, "ERROR", "failed", null, null,
                identity(), Map.of(), Map.of());
        when(repositoryProvider.getIfAvailable()).thenReturn(repository);
        when(repository.selectedLog(new InvestigationQueryRepository.LogQuery("team-a", "event-7", START, END)))
                .thenReturn(RowsResult.available(List.of(log), false));
        when(repository.nearbyLogs(new InvestigationQueryRepository.NearbyQuery(
                "team-a", "event-7", 1_787_934_874_782_123_456L, "checkout", "7", "service", "payments", "prod",
                START, END)))
                .thenReturn(new InvestigationQueryRepository.NearbyResult(
                        Status.AVAILABLE, List.of(), List.of(), false, false));

        var view = logService.query("team-a", "event-7", START, END);

        assertEquals(InvestigationEvidenceState.READY, view.selectedLog().state());
        assertEquals(InvestigationEvidenceState.EMPTY, view.trace().state());
        assertEquals(InvestigationEvidenceState.EMPTY, view.nearbyLogs().state());
    }

    private TraceSpanRow rootSpan() {
        return new TraceSpanRow(START, TRACE_ID, SPAN_ID, null, "GET /checkout", "checkout",
                "STATUS_CODE_OK", null, "SPAN_KIND_SERVER", null, "checkout", "1.0", 2_000_000L,
                "team-a", "7", "service", "payments", "prod", Map.of("service.name", "checkout"), Map.of(),
                List.of(), List.of(), null);
    }

    private TraceSpanRow childSpan(String spanId, String parentSpanId) {
        return new TraceSpanRow(START + 1, TRACE_ID, spanId, parentSpanId, "child", "checkout",
                "STATUS_CODE_UNSET", null, "SPAN_KIND_INTERNAL", null, "checkout", "1.0", 1_000L,
                "team-a", null, null, null, null, Map.of("service.name", "checkout"), Map.of(),
                List.of(), List.of(), null);
    }

    private InvestigationServiceIdentity identity() {
        return new InvestigationServiceIdentity("team-a", "7", "service", "checkout", "payments", "prod");
    }
}
