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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationServiceIdentity;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.DependencyEdge;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.Span;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.TraceDetail;
import org.apache.hertzbeat.observability.shared.query.ObservabilityQueryRequestException;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.TraceSpanRow;
import org.springframework.util.StringUtils;

/** Strictly validates and assembles a complete selected trace. */
final class InvestigationTraceAssembler {

    private InvestigationTraceAssembler() {
    }

    static AssembledTrace assemble(String traceId, String selectedSpanId, List<TraceSpanRow> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new MalformedTraceException();
        }
        Map<String, TraceSpanRow> byId = new LinkedHashMap<>();
        List<TraceSpanRow> roots = new ArrayList<>();
        for (TraceSpanRow row : rows) {
            if (row == null || !traceId.equals(row.traceId()) || byId.put(row.spanId(), row) != null) {
                throw new MalformedTraceException();
            }
            if (!StringUtils.hasText(row.parentSpanId())) {
                roots.add(row);
            }
        }
        if (roots.size() != 1) {
            throw new MalformedTraceException();
        }
        for (TraceSpanRow row : rows) {
            if (StringUtils.hasText(row.parentSpanId()) && !byId.containsKey(row.parentSpanId())) {
                throw new MalformedTraceException();
            }
        }
        Set<String> reachable = new HashSet<>();
        reachable.add(roots.getFirst().spanId());
        boolean changed;
        do {
            changed = false;
            for (TraceSpanRow row : rows) {
                if (StringUtils.hasText(row.parentSpanId()) && reachable.contains(row.parentSpanId())) {
                    changed |= reachable.add(row.spanId());
                }
            }
        } while (changed);
        if (reachable.size() != rows.size()) {
            throw new MalformedTraceException();
        }
        TraceSpanRow selected = roots.getFirst();
        if (StringUtils.hasText(selectedSpanId)) {
            selected = byId.get(selectedSpanId);
            if (selected == null) {
                throw new ObservabilityQueryRequestException();
            }
        }
        TraceSpanRow root = roots.getFirst();
        List<Span> spans = rows.stream().map(InvestigationTraceAssembler::toSpan).toList();
        int errorCount = (int) rows.stream().filter(row -> isError(row.status())).count();
        TraceDetail detail = new TraceDetail(root.spanId(), root.serviceName(), root.serviceNamespace(),
                root.deploymentEnvironment(), root.entityId(), root.entityType(), root.spanName(),
                Long.toString(root.durationNanos()),
                normalizedStatus(root.status()), root.startTime(), errorCount, root.resourceAttributes(), spans);
        return new AssembledTrace(detail, identity(selected), dependencies(rows, byId));
    }

    private static Span toSpan(TraceSpanRow row) {
        return new Span(row.spanId(), row.parentSpanId(), row.spanName(), row.serviceName(), row.serviceNamespace(),
                row.deploymentEnvironment(), row.entityId(), row.entityType(), normalizedStatus(row.status()),
                row.statusMessage(), row.spanKind(), row.traceState(), row.scopeName(), row.scopeVersion(),
                Long.toString(row.durationNanos()), row.startTime(), isError(row.status()), row.resourceAttributes(),
                row.spanAttributes(), row.spanEvents(), row.spanLinks(), row.codeNavigationHint());
    }

    private static InvestigationServiceIdentity identity(TraceSpanRow row) {
        if (!StringUtils.hasText(row.workspaceId()) || !StringUtils.hasText(row.entityId())
                || !StringUtils.hasText(row.entityType()) || !StringUtils.hasText(row.serviceName())) {
            return null;
        }
        try {
            return new InvestigationServiceIdentity(row.workspaceId(), row.entityId(), row.entityType(),
                    row.serviceName(), row.serviceNamespace(), row.deploymentEnvironment());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static List<DependencyEdge> dependencies(List<TraceSpanRow> rows, Map<String, TraceSpanRow> byId) {
        List<DependencyEdge> edges = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (TraceSpanRow child : rows) {
            TraceSpanRow parent = byId.get(child.parentSpanId());
            if (parent == null || parent.serviceName().equals(child.serviceName())) {
                continue;
            }
            String key = parent.serviceName() + '\0' + child.serviceName() + '\0' + child.spanId();
            if (seen.add(key)) {
                edges.add(new DependencyEdge(parent.serviceName(), child.serviceName(), parent.entityId(),
                        child.entityId(), child.spanId(), normalizedStatus(child.status()),
                        child.durationNanos() / 1_000_000D));
            }
        }
        return List.copyOf(edges);
    }

    private static boolean isError(String status) {
        return status != null && status.toUpperCase(java.util.Locale.ROOT).contains("ERROR");
    }

    private static String normalizedStatus(String status) {
        if (!StringUtils.hasText(status)) {
            return "unknown";
        }
        String normalized = status.trim().toUpperCase(java.util.Locale.ROOT);
        if (normalized.contains("ERROR")) {
            return "error";
        }
        if (normalized.endsWith("_OK") || "OK".equals(normalized)) {
            return "ok";
        }
        if (normalized.contains("UNSET")) {
            return "unset";
        }
        return "unknown";
    }

    record AssembledTrace(TraceDetail detail,
                          InvestigationServiceIdentity selectedIdentity,
                          List<DependencyEdge> dependencies) {
    }

    static final class MalformedTraceException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
