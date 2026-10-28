import { getServerUrl } from './storage';

export class ApiError extends Error {}

function inspectionUrl(serverUrl) {
  return `${serverUrl.replace(/\/+$/, '')}/api/inspect`;
}

// Quick reachability check — hits the server's root route (a GET the
// Flask app actually serves) so a real 2xx response is required for "OK",
// rather than treating any non-404 response (including a 405 from the
// POST-only /api/inspect route) as success.
export async function testConnection(serverUrl) {
  const url = `${serverUrl.replace(/\/+$/, '')}/`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.error('testConnection fetch failed:', error);
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown network error',
    };
  }
}

// Turns an expo-image-picker asset into the {uri, name, type} shape React
// Native's FormData needs — it can't take a raw File/Blob like the browser
// version of this app does.
function toFormFile(asset, fallbackName) {
  return {
    uri: asset.uri,
    name: asset.fileName || fallbackName,
    type: asset.mimeType || 'image/jpeg',
  };
}

// payload: { product, extraNotes, mode, referenceImages, testImage }
// Returns the parsed run_record on success. Throws ApiError with a
// human-readable message on any failure (network, non-2xx, bad JSON).
export async function submitInspection({ product, extraNotes, mode, referenceImages, testImage }) {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    throw new ApiError('No server URL configured. Open Settings and paste your current ngrok URL.');
  }

  const url = inspectionUrl(serverUrl);

  const formData = new FormData();
  formData.append('product', product);
  if (extraNotes) {
    formData.append('extra_notes', extraNotes);
  }
  formData.append('mode', mode);
  formData.append('test_image', toFormFile(testImage, 'test_image.jpg'));

  if (mode === 'with_references') {
    referenceImages.forEach((img, idx) => {
      formData.append('reference_images', toFormFile(img, `reference_${idx + 1}.jpg`));
    });
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        // Skips ngrok's free-tier interstitial warning page, which would
        // otherwise return HTML instead of JSON on a fresh tunnel.
        'ngrok-skip-browser-warning': 'true',
      },
    });
  } catch (networkError) {
    // Log the *real* underlying error to the Metro/dev console — the
    // generic message below was hiding exactly what kind of failure this
    // is (DNS, timeout, a bad/unreadable image file URI, etc.).
    console.error('submitInspection fetch failed:', networkError);
    throw new ApiError(
      `Could not reach the server at ${serverUrl}. Underlying error: ${networkError?.message || networkError}. Check the backend is running, the ngrok tunnel is active, and the URL in Settings is current.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new ApiError(`Server returned a non-JSON response (HTTP ${response.status}). Double-check the URL in Settings.`);
  }

  if (!response.ok) {
    throw new ApiError(data.error || `Server error (HTTP ${response.status}).`);
  }

  return data; // the run_record: run_id, product, mode, results[0], timing_summary, ...
}