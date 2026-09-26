import { useState, useEffect, useCallback } from 'react';
import type {
  ProjectFailureResultV3,
  ProjectRunManifest,
} from '../../../artifacts/artifact-manifest.js';
import {
  isValidFailureResult,
  isValidManifestContract,
  isValidProjectResult,
} from '../../../artifacts/result-validation.js';
import type { VulnerabilityReportResultV3 } from '../../../result-types.js';
import {
  createProjectReportViewModel,
  type ProjectReportViewModel,
} from '../../report-view-model.js';

export type ProjectReportState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly model: ProjectReportViewModel;
      readonly manifest: ProjectRunManifest;
      readonly rawData: VulnerabilityReportResultV3 | ProjectFailureResultV3;
      readonly projectId: string;
      readonly runId: string;
    }
  | { readonly status: 'missing'; readonly message: string }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'load-error'; readonly message: string };

export function validateDataAndManifestAgreement(
  projectId: string,
  runId: string,
  data: VulnerabilityReportResultV3 | ProjectFailureResultV3,
  manifest: ProjectRunManifest,
): string | undefined {
  if (data.project.id !== projectId || manifest.project.id !== projectId) {
    return `Project ID mismatch: route expects '${projectId}', received data '${data.project.id}', manifest '${manifest.project.id}'`;
  }
  if (data.run.runId !== runId || manifest.run.runId !== runId) {
    return `Run ID mismatch: route expects '${runId}', received data '${data.run.runId}', manifest '${manifest.run.runId}'`;
  }
  if (data.project.name !== manifest.project.name) {
    return `Project name mismatch: data '${data.project.name}', manifest '${manifest.project.name}'`;
  }
  if (data.run.observedAt !== manifest.run.observedAt) {
    return `Timestamp mismatch: data '${data.run.observedAt}', manifest '${manifest.run.observedAt}'`;
  }
  if (data.state !== manifest.state) {
    return `State mismatch: data '${data.state}', manifest '${manifest.state}'`;
  }
  const dataJobUrl = data.jenkins?.jobUrl;
  const manifestJobUrl = manifest.jenkins?.jobUrl;
  if (dataJobUrl !== manifestJobUrl) {
    return `Jenkins job URL mismatch: data '${dataJobUrl ?? 'none'}', manifest '${manifestJobUrl ?? 'none'}'`;
  }
  return undefined;
}

export function useProjectReport(projectId: string | undefined, runId: string | undefined) {
  const [state, setState] = useState<ProjectReportState>({ status: 'loading' });
  const [reloadIndex, setReloadIndex] = useState(0);

  const reload = useCallback(() => {
    setReloadIndex((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!projectId || !runId) {
      setState({ status: 'invalid', message: 'Missing project or run identifier in route' });
      return;
    }

    const pid = projectId;
    const rid = runId;
    const controller = new AbortController();
    const { signal } = controller;

    setState({ status: 'loading' });

    async function fetchReport() {
      const dataUrl = `/reports/${pid}/${rid}/data.json`;
      const manifestUrl = `/reports/${pid}/${rid}/manifest.json`;
      try {
        const [dataResponse, manifestResponse] = await Promise.all([
          fetch(dataUrl, { cache: 'no-store', signal }),
          fetch(manifestUrl, { cache: 'no-store', signal }),
        ]);

        if (signal.aborted) return;

        if (dataResponse.status === 404 || manifestResponse.status === 404) {
          setState({
            status: 'missing',
            message: `Report evidence not found for ${projectId}/${runId}`,
          });
          return;
        }

        if (!dataResponse.ok) {
          setState({
            status: 'load-error',
            message: `Failed to load data.json (HTTP ${dataResponse.status})`,
          });
          return;
        }

        if (!manifestResponse.ok) {
          setState({
            status: 'load-error',
            message: `Failed to load manifest.json (HTTP ${manifestResponse.status})`,
          });
          return;
        }

        let rawDataJson: unknown;
        let rawManifestJson: unknown;

        try {
          rawDataJson = await dataResponse.json();
        } catch {
          if (signal.aborted) return;
          setState({ status: 'invalid', message: 'Corrupt or unparseable data.json' });
          return;
        }

        try {
          rawManifestJson = await manifestResponse.json();
        } catch {
          if (signal.aborted) return;
          setState({ status: 'invalid', message: 'Corrupt or unparseable manifest.json' });
          return;
        }

        if (signal.aborted) return;

        if (!isValidManifestContract(rawManifestJson, { expectedProjectId: pid, expectedRunId: rid })) {
          setState({ status: 'invalid', message: 'manifest.json does not conform to expected schema or ID contract' });
          return;
        }

        const manifest = rawManifestJson;

        let data: VulnerabilityReportResultV3 | ProjectFailureResultV3;
        if (isValidProjectResult(rawDataJson)) {
          data = rawDataJson;
        } else if (isValidFailureResult(rawDataJson)) {
          data = rawDataJson;
        } else {
          setState({ status: 'invalid', message: 'data.json does not conform to expected project or failure result schema' });
          return;
        }

        const agreementError = validateDataAndManifestAgreement(pid, rid, data, manifest);
        if (agreementError !== undefined) {
          setState({ status: 'invalid', message: agreementError });
          return;
        }

        const model = createProjectReportViewModel(data, manifest);

        setState({
          status: 'ready',
          model,
          manifest,
          rawData: data,
          projectId: pid,
          runId: rid,
        });
      } catch (err: unknown) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState({ status: 'load-error', message: `Network error loading report: ${msg}` });
      }
    }

    void fetchReport();

    return () => {
      controller.abort();
    };
  }, [projectId, runId, reloadIndex]);

  return { state, reload };
}
