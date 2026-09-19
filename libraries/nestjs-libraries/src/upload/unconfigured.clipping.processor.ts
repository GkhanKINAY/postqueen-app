import {
  ClipResult,
  ClippingNotConfiguredError,
  IClippingProcessor,
  IngestResult,
} from './clipping.processor.interface';

// What UploadFactory hands out while no processor is configured. The routes
// and tools refuse before a clipping starts (isClippingEnabled), so this is
// only reached when the backend and the orchestrator were given different
// environments; the clipping then stops with a clear reason and its minutes
// are given back, instead of waiting on a job nobody runs.
export class UnconfiguredClippingProcessor implements IClippingProcessor {
  async ingest(): Promise<IngestResult> {
    throw new ClippingNotConfiguredError();
  }

  async clip(): Promise<ClipResult> {
    throw new ClippingNotConfiguredError();
  }
}
