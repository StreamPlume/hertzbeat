/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hertzbeat.observability.traces.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import java.util.regex.Pattern;
import org.apache.hertzbeat.common.entity.dto.Message;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationWindow;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView;
import org.apache.hertzbeat.common.observability.dto.trace.TraceListItemDto;
import org.apache.hertzbeat.common.observability.dto.trace.TraceOverviewDto;
import org.apache.hertzbeat.common.observability.dto.trace.TraceServiceStatsDto;
import org.apache.hertzbeat.common.observability.gateway.AuthTokenRequestContext;
import org.apache.hertzbeat.common.observability.gateway.AuthTokenScopes;
import org.apache.hertzbeat.common.support.exception.TelemetryStorageUnavailableException;
import org.apache.hertzbeat.observability.ingestion.semantic.OtlpResourceSemanticAttributes;
import org.apache.hertzbeat.observability.shared.query.CollectorResourceScope;
import org.apache.hertzbeat.observability.shared.query.TelemetryQueryContextScope;
import org.apache.hertzbeat.observability.investigation.service.TraceInvestigationReadModelService;
import org.apache.hertzbeat.observability.traces.service.EntityTraceQueryService;
import org.apache.hertzbeat.warehouse.query.admission.ObservabilityQueryAdmissionService;
import org.springframework.data.domain.Page;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Trace query APIs for entity workspace and trace center.
 */
@RestController
@RequestMapping(path = "/api/traces", produces = "application/json")
@Tag(name = "Trace Query Controller")
public class TraceQueryController {

    private static final Pattern TRACE_ID = Pattern.compile("[0-9a-f]{32}");
    private static final Pattern SPAN_ID = Pattern.compile("[0-9a-f]{16}");
    private static final long MAX_SAFE_WIRE_INTEGER = 9_007_199_254_740_991L;

    private final EntityTraceQueryService entityTraceQueryService;
    private final ObservabilityQueryAdmissionService queryAdmissionService;
    private final TraceInvestigationReadModelService traceInvestigationReadModelService;

    @Autowired
    public TraceQueryController(EntityTraceQueryService entityTraceQueryService,
                                ObservabilityQueryAdmissionService queryAdmissionService,
                                TraceInvestigationReadModelService traceInvestigationReadModelService) {
        this.entityTraceQueryService = entityTraceQueryService;
        this.queryAdmissionService = queryAdmissionService;
        this.traceInvestigationReadModelService = traceInvestigationReadModelService;
    }

    @GetMapping("/list")
    @Operation(summary = "Query traces with entity context and canonical resource filters")
    public ResponseEntity<Message<Page<TraceListItemDto>>> list(
            @RequestParam(value = "entityId", required = false) Long entityId,
            @RequestParam(value = "entityType", required = false) String entityType,
            @RequestParam(value = "start", required = false) Long start,
            @RequestParam(value = "end", required = false) Long end,
            @RequestParam(value = "traceId", required = false) String traceId,
            @RequestParam(value = "errorOnly", required = false) Boolean errorOnly,
            @RequestParam(value = "serviceName", required = false) String serviceName,
            @RequestParam(value = "serviceNamespace", required = false) String serviceNamespace,
            @RequestParam(value = "environment", required = false) String environment,
            @RequestParam(value = "collectorId", required = false) String collectorId,
            @RequestParam(value = "instance", required = false) String instance,
            @RequestParam(value = "endpoint", required = false) String endpoint,
            @RequestParam(value = "resourceFilter", required = false) String resourceFilter,
            @RequestParam(value = "attributeFilter", required = false) String attributeFilter,
            @RequestParam(value = "operationName", required = false) String operationName,
            @RequestParam(value = "minDurationMs", required = false) Long minDurationMs,
            @RequestParam(value = "maxDurationMs", required = false) Long maxDurationMs,
            @RequestParam(value = "spanScope", required = false) String spanScope,
            @RequestParam(value = "hideInternal", required = false) Boolean hideInternal,
            @RequestParam(value = "pageIndex", defaultValue = "0") Integer pageIndex,
            @RequestParam(value = "pageSize", defaultValue = "20") Integer pageSize) {
        String workspaceId = trustedWorkspaceId();
        ScopedFilters scopedFilters = scopeFilters(
                entityId, entityType, collectorId, instance, endpoint, resourceFilter, attributeFilter);
        Page<TraceListItemDto> page = queryAdmissionService.execute("traces",
                () -> requireCompleteTraceRows(entityTraceQueryService.queryTraceList(
                        workspaceId, entityId, start, end, traceId, errorOnly, serviceName, serviceNamespace, environment,
                        scopedFilters.resourceFilter(), operationName, minDurationMs, maxDurationMs, pageIndex, pageSize,
                        hideInternal, spanScope, scopedFilters.attributeFilter())));
        return ResponseEntity.ok(Message.success(page));
    }

    private static Page<TraceListItemDto> requireCompleteTraceRows(Page<TraceListItemDto> page) {
        if (page == null) {
            throw new TelemetryStorageUnavailableException();
        }
        page.forEach(TraceQueryController::requireCompleteTraceRow);
        return page;
    }

    private static void requireCompleteTraceRow(TraceListItemDto item) {
        if (item == null || !StringUtils.hasText(item.getTraceId()) || !TRACE_ID.matcher(item.getTraceId()).matches()
                || !StringUtils.hasText(item.getServiceName()) || !StringUtils.hasText(item.getRootSpanName())
                || item.getStartTime() == null || item.getStartTime() <= 0
                || item.getStartTime() > MAX_SAFE_WIRE_INTEGER
                || item.getDurationNanos() == null || item.getDurationNanos() < 0
                || item.getDurationNanos() > MAX_SAFE_WIRE_INTEGER
                || item.getSpanCount() == null || item.getSpanCount() <= 0
                || item.getSpanCount() > MAX_SAFE_WIRE_INTEGER
                || item.getErrorSpanCount() < 0 || item.getErrorSpanCount() > item.getSpanCount()
                || item.getServiceStats() == null || item.getServiceStats().isEmpty()) {
            throw new TelemetryStorageUnavailableException();
        }
        long totalSpans = 0L;
        long totalErrors = 0L;
        try {
            for (Map.Entry<String, TraceServiceStatsDto> entry : item.getServiceStats().entrySet()) {
                TraceServiceStatsDto service = entry.getValue();
                if (!StringUtils.hasText(entry.getKey()) || service == null || service.getSpanCount() <= 0
                        || service.getErrorCount() < 0 || service.getErrorCount() > service.getSpanCount()) {
                    throw new TelemetryStorageUnavailableException();
                }
                totalSpans = Math.addExact(totalSpans, service.getSpanCount());
                totalErrors = Math.addExact(totalErrors, service.getErrorCount());
            }
        } catch (ArithmeticException ignored) {
            throw new TelemetryStorageUnavailableException();
        }
        if (totalSpans != item.getSpanCount() || totalErrors != item.getErrorSpanCount()) {
            throw new TelemetryStorageUnavailableException();
        }
    }

    @GetMapping("/stats/overview")
    @Operation(summary = "Trace overview statistics")
    public ResponseEntity<Message<TraceOverviewDto>> overview(
            @RequestParam(value = "entityId", required = false) Long entityId,
            @RequestParam(value = "entityType", required = false) String entityType,
            @RequestParam(value = "start", required = false) Long start,
            @RequestParam(value = "end", required = false) Long end,
            @RequestParam(value = "traceId", required = false) String traceId,
            @RequestParam(value = "errorOnly", required = false) Boolean errorOnly,
            @RequestParam(value = "serviceName", required = false) String serviceName,
            @RequestParam(value = "serviceNamespace", required = false) String serviceNamespace,
            @RequestParam(value = "environment", required = false) String environment,
            @RequestParam(value = "collectorId", required = false) String collectorId,
            @RequestParam(value = "instance", required = false) String instance,
            @RequestParam(value = "endpoint", required = false) String endpoint,
            @RequestParam(value = "resourceFilter", required = false) String resourceFilter,
            @RequestParam(value = "attributeFilter", required = false) String attributeFilter,
            @RequestParam(value = "operationName", required = false) String operationName,
            @RequestParam(value = "minDurationMs", required = false) Long minDurationMs,
            @RequestParam(value = "maxDurationMs", required = false) Long maxDurationMs,
            @RequestParam(value = "spanScope", required = false) String spanScope,
            @RequestParam(value = "hideInternal", required = false) Boolean hideInternal) {
        String workspaceId = trustedWorkspaceId();
        ScopedFilters scopedFilters = scopeFilters(
                entityId, entityType, collectorId, instance, endpoint, resourceFilter, attributeFilter);
        return ResponseEntity.ok(Message.success(queryAdmissionService.execute("traces",
                () -> entityTraceQueryService.getTraceOverview(
                        workspaceId, entityId, start, end, traceId, errorOnly, serviceName, serviceNamespace, environment,
                        scopedFilters.resourceFilter(), operationName, minDurationMs, maxDurationMs, hideInternal,
                        spanScope, scopedFilters.attributeFilter()))));
    }

    @GetMapping("/stats/group-by")
    @Operation(summary = "Trace group-by statistics")
    public ResponseEntity<Message<Map<String, Object>>> groupBy(
            @RequestParam(value = "entityId", required = false) Long entityId,
            @RequestParam(value = "entityType", required = false) String entityType,
            @RequestParam(value = "start", required = false) Long start,
            @RequestParam(value = "end", required = false) Long end,
            @RequestParam(value = "traceId", required = false) String traceId,
            @RequestParam(value = "errorOnly", required = false) Boolean errorOnly,
            @RequestParam(value = "serviceName", required = false) String serviceName,
            @RequestParam(value = "serviceNamespace", required = false) String serviceNamespace,
            @RequestParam(value = "environment", required = false) String environment,
            @RequestParam(value = "collectorId", required = false) String collectorId,
            @RequestParam(value = "instance", required = false) String instance,
            @RequestParam(value = "endpoint", required = false) String endpoint,
            @RequestParam(value = "resourceFilter", required = false) String resourceFilter,
            @RequestParam(value = "attributeFilter", required = false) String attributeFilter,
            @RequestParam(value = "operationName", required = false) String operationName,
            @RequestParam(value = "minDurationMs", required = false) Long minDurationMs,
            @RequestParam(value = "maxDurationMs", required = false) Long maxDurationMs,
            @RequestParam(value = "groupBy") String groupBy,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "orderBy", required = false) String orderBy,
            @RequestParam(value = "minCount", required = false) Integer minCount,
            @RequestParam(value = "spanScope", required = false) String spanScope,
            @RequestParam(value = "hideInternal", required = false) Boolean hideInternal) {
        String workspaceId = trustedWorkspaceId();
        ScopedFilters scopedFilters = scopeFilters(
                entityId, entityType, collectorId, instance, endpoint, resourceFilter, attributeFilter);
        return ResponseEntity.ok(Message.success(queryAdmissionService.execute("traces",
                () -> entityTraceQueryService.getTraceGroupByStats(
                        workspaceId, entityId, start, end, traceId, errorOnly, serviceName, serviceNamespace, environment,
                        scopedFilters.resourceFilter(), operationName, minDurationMs, maxDurationMs, groupBy, limit,
                        orderBy, minCount, hideInternal, spanScope, scopedFilters.attributeFilter()))));
    }

    @GetMapping("/{traceId}")
    @Operation(summary = "Query one bounded Trace investigation")
    public ResponseEntity<Message<TraceInvestigationView>> detail(
            @PathVariable("traceId") String traceId,
            @RequestParam("start") long start,
            @RequestParam("end") long end,
            @RequestParam(value = "spanId", required = false) String spanId) {
        validateInvestigationSelection(traceId, spanId, start, end);
        String workspaceId = trustedWorkspaceId();
        return ResponseEntity.ok(Message.success(queryAdmissionService.execute("traces",
                () -> traceInvestigationReadModelService.query(workspaceId, traceId, spanId, start, end))));
    }

    private static void validateInvestigationSelection(String traceId, String spanId, long start, long end) {
        if (traceId == null || !TRACE_ID.matcher(traceId).matches()) {
            throw new IllegalArgumentException("traceId must be 32 lowercase hexadecimal characters");
        }
        if (spanId != null && !SPAN_ID.matcher(spanId).matches()) {
            throw new IllegalArgumentException("spanId must be 16 lowercase hexadecimal characters");
        }
        new InvestigationWindow(start, end);
    }

    private String mergeEntityContextResourceFilter(Long entityId, String entityType, String resourceFilter) {
        String normalizedResourceFilter = StringUtils.trimWhitespace(resourceFilter);
        String scopedResourceFilter = normalizedResourceFilter;
        String normalizedEntityType = StringUtils.trimWhitespace(entityType);
        if (!StringUtils.hasText(normalizedEntityType) || !normalizedEntityType.matches("[A-Za-z0-9_.:-]+")) {
            return scopedResourceFilter;
        }
        if (StringUtils.hasText(scopedResourceFilter)
                && scopedResourceFilter.contains(OtlpResourceSemanticAttributes.HERTZBEAT_ENTITY_TYPE)) {
            return scopedResourceFilter;
        }
        String entityTypeFilter = OtlpResourceSemanticAttributes.HERTZBEAT_ENTITY_TYPE + "=\"" + normalizedEntityType + "\"";
        return StringUtils.hasText(scopedResourceFilter)
                ? scopedResourceFilter + " and " + entityTypeFilter
                : entityTypeFilter;
    }

    private String trustedWorkspaceId() {
        String workspaceId = AuthTokenRequestContext.currentWorkspaceId();
        if (!StringUtils.hasText(workspaceId)) {
            throw new TelemetryStorageUnavailableException();
        }
        return AuthTokenScopes.normalizeWorkspaceId(workspaceId);
    }

    private ScopedFilters scopeFilters(Long entityId, String entityType, String collectorId, String instance,
                                       String endpoint, String resourceFilter, String attributeFilter) {
        TelemetryQueryContextScope queryContextScope = new TelemetryQueryContextScope(instance, endpoint);
        String collectorScopedResourceFilter = CollectorResourceScope.apply(
                mergeEntityContextResourceFilter(entityId, entityType, resourceFilter), collectorId);
        return new ScopedFilters(
                queryContextScope.applyResourceFilter(collectorScopedResourceFilter),
                queryContextScope.applyAttributeFilter(attributeFilter));
    }

    private record ScopedFilters(String resourceFilter, String attributeFilter) {
    }
}
