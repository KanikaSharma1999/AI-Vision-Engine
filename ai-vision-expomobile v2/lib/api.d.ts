export type InspectionImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type InspectionPayload = {
  product: string;
  extraNotes: string;
  mode: 'with_references' | 'prompt_only';
  referenceImages: InspectionImage[];
  testImage: InspectionImage;
};

export type InspectionResult = {
  error?: string | null;
  verdict?: string;
  finding?: string;
  assessment?: string;
  location?: string;
  reasoning?: string;
  confidence_score?: number;
  defect_percentage?: number;
  timing?: Record<string, number | null>;
};

export type InspectionRun = {
  run_id?: string;
  timestamp?: string;
  product?: string;
  mode?: string;
  results: InspectionResult[];
  timing_summary?: Record<string, number | null>;
};

export class ApiError extends Error {}
export function submitInspection(payload: InspectionPayload): Promise<InspectionRun>;

export type ConnectionTestResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export function testConnection(serverUrl: string): Promise<ConnectionTestResult>;
