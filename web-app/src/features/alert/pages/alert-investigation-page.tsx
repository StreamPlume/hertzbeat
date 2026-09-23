/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { OperationalPage } from '@/shared/operational-page';

import { AlertInvestigationView } from '../components/alert-investigation-view';
import { useAlertInvestigationController } from '../controller/use-alert-investigation-controller';
import {
  buildAlertInvestigationLogPath,
  buildAlertInvestigationMetricPath,
  buildAlertInvestigationTopologyPath,
  buildAlertInvestigationTracePath
} from '../model/alert-investigation-handoff';
import { readAlertInvestigationRoute } from '../model/alert-investigation-route';

export function AlertInvestigationPage() {
  const { alertId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const route = readAlertInvestigationRoute(alertId, searchParams);
  const controller = useAlertInvestigationController(route);
  const { state } = controller;
  if (state.kind !== 'ready') return <AlertInvestigationPageState state={state.kind} retry={controller.refetch} />;
  const metricPath = buildAlertInvestigationMetricPath(state.route, state.snapshot);
  const topologyPath = buildAlertInvestigationTopologyPath(state.route, state.snapshot);
  return (
    <OperationalPage mode="workspace">
      <AlertInvestigationView
        state={state}
        onBack={() => void navigate(state.route.returnTo)}
        onOpenMetric={metricPath ? () => void navigate(metricPath) : undefined}
        onOpenLog={record =>
          navigateRequired(buildAlertInvestigationLogPath(state.route, state.snapshot, record), navigate)
        }
        onOpenTrace={trace =>
          navigateRequired(buildAlertInvestigationTracePath(state.route, state.snapshot, trace), navigate)
        }
        onOpenTopology={topologyPath ? () => void navigate(topologyPath) : undefined}
      />
    </OperationalPage>
  );
}

function AlertInvestigationPageState({
  state,
  retry
}: {
  state: 'invalid' | 'loading' | 'unavailable' | 'contract_error';
  retry: () => Promise<void>;
}) {
  const { t } = useTranslation();
  if (state === 'loading') {
    return (
      <OperationalPage mode="workspace">
        <div role="status" aria-live="polite" data-alert-investigation="true">
          {t('alertInvestigation.query.loading')}
        </div>
      </OperationalPage>
    );
  }
  const message = state === 'invalid' ? 'invalidRoute' : state === 'contract_error' ? 'contract' : 'unavailable';
  return (
    <OperationalPage mode="workspace">
      <div role="alert" data-alert-investigation="true">
        <h1>{t('alertInvestigation.title')}</h1>
        <p>{t(`alertInvestigation.query.${message}`)}</p>
        {state === 'invalid' ? null : (
          <Button onClick={() => void retry()}>{t('alertInvestigation.actions.retry')}</Button>
        )}
      </div>
    </OperationalPage>
  );
}

function navigateRequired(path: string | undefined, navigate: ReturnType<typeof useNavigate>) {
  if (path) void navigate(path);
}
