/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useTranslation } from 'react-i18next';

import { InvestigationBlockState, InvestigationSection } from './explore-investigation-view-primitives';

export function InvestigationLogTopology({
  evidenceCurrent,
  onOpen
}: {
  evidenceCurrent: boolean;
  onOpen?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <InvestigationSection
      title={t('exploreInvestigation.sections.topology')}
      action={onOpen}
      actionLabel={t('exploreInvestigation.actions.openTopology')}
      evidenceCurrent={evidenceCurrent}
    >
      {onOpen ? <p>{t('exploreInvestigation.topology.logScope')}</p> : <InvestigationBlockState state="unavailable" />}
    </InvestigationSection>
  );
}
