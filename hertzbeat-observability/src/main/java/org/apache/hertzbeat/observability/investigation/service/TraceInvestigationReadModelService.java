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

import java.util.List;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationReason;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationServiceIdentity;
import org.apache.hertzbeat.common.observability.dto.investigation.InvestigationWindow;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.DependenciesBlock;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.GanttBlock;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.LogsBlock;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.MetricsBlock;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.RedBlock;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.RedPoint;
import org.apache.hertzbeat.common.observability.dto.investigation.TraceInvestigationView.RedSummary;
import org.apache.hertzbeat.observability.investigation.service.InvestigationTraceAssembler.AssembledTrace;
import org.apache.hertzbeat.observability.investigation.service.InvestigationTraceAssembler.MalformedTraceException;
import org.apache.hertzbeat.observability.shared.query.ObservabilityQueryRequestException;
import org.apache.hertzbeat.warehouse.repository.ApmRedQueryRepository;
import org.apache.hertzbeat.warehouse.repository.ApmRedQueryRepository.ApmRedQuery;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.RowsResult;
import org.apache.hertzbeat.warehouse.repository.InvestigationQueryRepository.Status;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import java.util.regex.Pattern;

/** Composes one honest bounded Trace investigation. */
@Service
public class TraceInvestigationReadModelService {

    private static final int MAX_DEPENDENCIES = 100;
    private static final Pattern TRACE_ID = Pattern.compile("[0-9a-f]{32}");
    private static final Pattern SPAN_ID = Pattern.compile("[0-9a-f]{16}");
    private final ObjectProvider<InvestigationQueryRepository> repositoryProvider;
    private final ObjectProvider<ApmRedQueryRepository> redRepositoryProvider;

    public TraceInvestigationReadModelService(ObjectProvider<InvestigationQueryRepository> repositoryProvider,
                                              ObjectProvider<ApmRedQueryRepository> redRepositoryProvider) {
        this.repositoryProvider = repositoryProvider;
        this.redRepositoryProvider = redRepositoryProvider;
    }

    public TraceInvestigationView query(String workspaceId,
                                        String traceId,
                                        String selectedSpanId,
                                        long start,
                                        long end) {
        InvestigationWindow window = new InvestigationWindow(start, end);
        if (traceId == null || !TRACE_ID.matcher(traceId).matches()
                || selectedSpanId != null && !SPAN_ID.matcher(selectedSpanId).matches()) {
            throw new ObservabilityQueryRequestException();
        }
        InvestigationQueryRepository repository = repository();
        if (repository == null) {
            return unavailable(traceId, selectedSpanId, window, InvestigationReason.STORAGE_UNAVAILABLE);
        }
        RowsResult<InvestigationQueryRepository.TraceSpanRow> traceResult = repository.trace(
                new InvestigationQueryRepository.TraceQuery(workspaceId, traceId, start, end));
        if (traceResult.status() != Status.AVAILABLE) {
            return unavailable(traceId, selectedSpanId, window, reason(traceResult.status()));
        }
        if (traceResult.rows().isEmpty()) {
            return empty(traceId, selectedSpanId, window);
        }
        AssembledTrace trace;
        try {
            trace = InvestigationTraceAssembler.assemble(traceId, selectedSpanId, traceResult.rows());
        } catch (MalformedTraceException exception) {
            return unavailable(traceId, selectedSpanId, window, InvestigationReason.MALFORMED_DATA);
        }
        LogsBlock logs = logs(repository, workspaceId, traceId, start, end);
        RedBlock red = red(trace.selectedIdentity(), start, end);
        List<TraceInvestigationView.DependencyEdge> edges = trace.dependencies();
        boolean dependenciesTruncated = edges.size() > MAX_DEPENDENCIES;
        DependenciesBlock dependencies = edges.isEmpty() ? DependenciesBlock.empty()
                : DependenciesBlock.ready(edges.stream().limit(MAX_DEPENDENCIES).toList(), dependenciesTruncated);
        return new TraceInvestigationView(traceId, selectedSpanId, window, GanttBlock.ready(trace.detail()), logs, red,
                MetricsBlock.unavailable(InvestigationReason.QUERY_STRATEGY_UNAVAILABLE), dependencies);
    }

    private LogsBlock logs(InvestigationQueryRepository repository,
                           String workspaceId,
                           String traceId,
                           long start,
                           long end) {
        RowsResult<org.apache.hertzbeat.common.observability.dto.investigation.InvestigationLogRecord> result =
                repository.sameTraceLogs(new InvestigationQueryRepository.TraceLogsQuery(
                        workspaceId, traceId, start, end));
        if (result.status() != Status.AVAILABLE) {
            return LogsBlock.unavailable(reason(result.status()));
        }
        return result.rows().isEmpty() ? LogsBlock.empty() : LogsBlock.ready(result.rows(), result.truncated());
    }

    private RedBlock red(InvestigationServiceIdentity identity, long start, long end) {
        if (identity == null) {
            return RedBlock.unavailable(InvestigationReason.IDENTITY_UNAVAILABLE, null);
        }
        try {
            ApmRedQueryRepository repository = redRepositoryProvider.getIfAvailable();
            if (repository == null) {
                return RedBlock.unavailable(InvestigationReason.STORAGE_UNAVAILABLE, identity);
            }
            var result = repository.query(new ApmRedQuery(start, end, identity.workspaceId(), identity.entityId(),
                    identity.entityType(), identity.serviceName(), identity.serviceNamespace(),
                    identity.deploymentEnvironment()));
            if (!result.available()) {
                return RedBlock.unavailable(InvestigationReason.STORAGE_UNAVAILABLE, identity);
            }
            if (result.points().isEmpty()) {
                return RedBlock.empty(identity);
            }
            RedSummary summary = new RedSummary(result.summary().requestCount(), result.summary().errorCount(),
                    result.summary().requestRatePerSecond(), result.summary().errorRate(),
                    result.summary().latencyAverageMs(), result.summary().latencyP95Ms());
            List<RedPoint> points = result.points().stream().map(point -> new RedPoint(point.timestamp(),
                    point.requestCount(), point.errorCount(), point.requestRatePerSecond(), point.errorRate(),
                    point.latencyAverageMs(), point.latencyP95Ms())).toList();
            return RedBlock.ready(identity, summary, points);
        } catch (RuntimeException exception) {
            return RedBlock.unavailable(InvestigationReason.STORAGE_UNAVAILABLE, identity);
        }
    }

    private InvestigationQueryRepository repository() {
        try {
            return repositoryProvider.getIfAvailable();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private TraceInvestigationView empty(String traceId, String spanId, InvestigationWindow window) {
        return new TraceInvestigationView(traceId, spanId, window, GanttBlock.empty(), LogsBlock.empty(),
                RedBlock.unavailable(InvestigationReason.UPSTREAM_UNAVAILABLE, null),
                MetricsBlock.unavailable(InvestigationReason.UPSTREAM_UNAVAILABLE), DependenciesBlock.empty());
    }

    private TraceInvestigationView unavailable(String traceId,
                                               String spanId,
                                               InvestigationWindow window,
                                               InvestigationReason reason) {
        return new TraceInvestigationView(traceId, spanId, window, GanttBlock.unavailable(reason),
                LogsBlock.unavailable(InvestigationReason.UPSTREAM_UNAVAILABLE),
                RedBlock.unavailable(InvestigationReason.UPSTREAM_UNAVAILABLE, null),
                MetricsBlock.unavailable(InvestigationReason.UPSTREAM_UNAVAILABLE),
                DependenciesBlock.unavailable(InvestigationReason.UPSTREAM_UNAVAILABLE));
    }

    static InvestigationReason reason(Status status) {
        return switch (status) {
            case AVAILABLE -> InvestigationReason.OBSERVED;
            case STORAGE_UNAVAILABLE -> InvestigationReason.STORAGE_UNAVAILABLE;
            case MALFORMED_DATA -> InvestigationReason.MALFORMED_DATA;
            case LIMIT_EXCEEDED -> InvestigationReason.LIMIT_EXCEEDED;
        };
    }
}
