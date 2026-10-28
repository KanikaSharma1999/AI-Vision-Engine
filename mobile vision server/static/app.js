(function () {
  "use strict";

  const form = document.getElementById("inspect-form");
  const MAX_REFERENCE_IMAGES = parseInt(form.getAttribute("data-max-references"), 10) || 5;

  const productInput = document.getElementById("product");
  const extraNotesInput = document.getElementById("extra_notes"); // hidden field, may be absent
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const modeLabel = document.getElementById("modeLabel");
  const referencesSection = document.getElementById("references-section");

  const referenceZone = document.getElementById("reference-zone");
  const referenceInput = document.getElementById("reference-input");
  const referenceThumbs = document.getElementById("reference-thumbs");

  const testZone = document.getElementById("test-zone");
  const testInput = document.getElementById("test-input");
  const testThumb = document.getElementById("test-thumb");

  const runBtn = document.getElementById("run-btn");
  const statusLine = document.getElementById("status-line");
  const resultArea = document.getElementById("resultArea");

  let referenceFiles = [];
  let testFile = null;
  let lastRunData = null;

  // ---- mode toggle ("Add reference image?" Yes/No) --------------------
  function currentMode() {
    return document.querySelector('input[name="mode"]:checked').value;
  }

  function syncModeUI() {
    const mode = currentMode();
    if (mode === "prompt_only") {
      referencesSection.classList.add("hidden");
      modeLabel.textContent = "NO";
    } else {
      referencesSection.classList.remove("hidden");
      modeLabel.textContent = "YES";
    }
  }

  modeRadios.forEach((r) => r.addEventListener("change", syncModeUI));
  syncModeUI();

  // ---- reference uploads ---------------------------------------------
  function renderReferenceThumbs() {
    referenceThumbs.innerHTML = "";
    referenceFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      const div = document.createElement("div");
      div.className = "thumb";
      div.innerHTML = `<img src="${url}" alt="Reference ${idx + 1}" />
        <div class="rm" data-idx="${idx}">&times;</div>`;
      referenceThumbs.appendChild(div);
    });
    referenceThumbs.querySelectorAll(".rm").forEach((el) => {
      el.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
        referenceFiles.splice(idx, 1);
        renderReferenceThumbs();
      });
    });
  }

  function addReferenceFiles(fileList) {
    for (const file of Array.from(fileList)) {
      if (referenceFiles.length >= MAX_REFERENCE_IMAGES) {
        setStatus(`Only ${MAX_REFERENCE_IMAGES} reference images are allowed — skipped the rest.`);
        break;
      }
      referenceFiles.push(file);
    }
    renderReferenceThumbs();
  }

  referenceZone.addEventListener("click", () => referenceInput.click());
  referenceInput.addEventListener("change", (e) => {
    addReferenceFiles(e.target.files);
    referenceInput.value = "";
  });
  referenceZone.addEventListener("dragover", (e) => e.preventDefault());
  referenceZone.addEventListener("drop", (e) => {
    e.preventDefault();
    addReferenceFiles(e.dataTransfer.files);
  });

  // ---- test image upload ---------------------------------------------
  function renderTestThumb() {
    testThumb.innerHTML = "";
    if (!testFile) return;
    const url = URL.createObjectURL(testFile);
    const div = document.createElement("div");
    div.className = "thumb";
    div.innerHTML = `<img src="${url}" alt="Part to inspect" />
      <div class="rm" id="testRm">&times;</div>`;
    testThumb.appendChild(div);
    document.getElementById("testRm").addEventListener("click", () => {
      testFile = null;
      renderTestThumb();
    });
  }

  function setTestFile(fileList) {
    if (fileList && fileList.length > 0) {
      testFile = fileList[0];
      renderTestThumb();
    }
  }

  testZone.addEventListener("click", () => testInput.click());
  testInput.addEventListener("change", (e) => {
    setTestFile(e.target.files);
    testInput.value = "";
  });
  testZone.addEventListener("dragover", (e) => e.preventDefault());
  testZone.addEventListener("drop", (e) => {
    e.preventDefault();
    setTestFile(e.dataTransfer.files);
  });

  // ---- status / submit -------------------------------------------------
  function setStatus(msg) {
    statusLine.textContent = msg || "";
  }

  function setLoading(isLoading, label) {
    runBtn.disabled = isLoading;
    runBtn.textContent = isLoading ? (label || "Inspecting part...") : "Run Inspection";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");

    const product = productInput.value.trim();
    const extraNotes = extraNotesInput ? extraNotesInput.value.trim() : "";
    const mode = currentMode();

    if (!product) {
      setStatus("Enter the product name to inspect (e.g. washing machine).");
      return;
    }
    if (!testFile) {
      setStatus("Add a test image to inspect.");
      return;
    }
    if (mode === "with_references" && referenceFiles.length === 0) {
      setStatus("No reference images added — running as an unanchored single-image judgment. " +
        "Add at least one reference image, or set 'Add reference image?' to No.");
      return;
    }

    const formData = new FormData();
    formData.append("product", product);
    if (extraNotes) formData.append("extra_notes", extraNotes);
    formData.append("mode", mode);
    formData.append("test_image", testFile);
    if (mode === "with_references") {
      referenceFiles.forEach((f) => formData.append("reference_images", f));
    }

    setLoading(true, mode === "with_references" ? "Comparing against references..." : "Inspecting part...");
    resultArea.innerHTML = '<div class="loading">Running visual quality analysis<span class="dots"></span></div>';

    try {
      const resp = await fetch("/api/inspect", { method: "POST", body: formData });
      const data = await resp.json();

      if (!resp.ok) {
        lastRunData = null;
        resultArea.innerHTML = `<div class="err">ERROR — ${escapeHtml(data.error || `Server error (${resp.status})`)}</div>`;
        return;
      }

      lastRunData = data;
      renderResult(data);
      setStatus("");
    } catch (err) {
      resultArea.innerHTML = `<div class="err">ERROR — ${escapeHtml(err.message)}</div>`;
    } finally {
      setLoading(false);
    }
  });

  // ---- results rendering -----------------------------------------------
  function fmtSeconds(v) {
    return v === null || v === undefined ? "—" : `${v.toFixed(2)}s`;
  }

  function fmtPercent(v) {
    return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
  }

  function verdictBadgeText(v) {
    switch (v) {
      case "conforming": return "PASS";
      case "defective": return "FAIL";
      case "uncertain": return "UNCERTAIN";
      case "error": return "ERROR";
      default: return (v || "UNKNOWN").toUpperCase();
    }
  }

  function renderResult(run) {
    const result = run.results[0];
    const verdictClass = result.verdict || "error";
    const imgUrl = testFile ? URL.createObjectURL(testFile) : "";

    if (result.error) {
      resultArea.innerHTML = `
        <div class="verdict ${verdictClass}">
          <div class="verdict-badge">${verdictBadgeText(result.verdict)}</div>
          <div class="verdict-conf">${escapeHtml(result.filename || "")}</div>
        </div>
        <div class="err">${escapeHtml(result.error)}</div>
        ${downloadButtonHtml()}`;
      wireDownloadButton();
      return;
    }

    resultArea.innerHTML = `
      <div class="verdict ${verdictClass}">
        <div class="verdict-badge">${verdictBadgeText(result.verdict)}</div>
        <div class="verdict-conf">CONFIDENCE: ${(result.confidence_score * 100).toFixed(0)}% · ${escapeHtml(run.mode.replace("_", " "))}</div>
      </div>

      <div class="result-block"><h4>Finding</h4><p>${escapeHtml(result.finding)}</p></div>
      <div class="result-block"><h4>Assessment</h4><p>${escapeHtml(result.assessment)}</p></div>
      <div class="result-block"><h4>Location</h4><p>${escapeHtml(result.location)}</p></div>

      <div class="stats-row">
        <div class="stat">
          <div class="stat-value">${fmtPercent(result.defect_percentage)}</div>
          <div class="stat-label">Defect coverage</div>
        </div>
        <div class="stat">
          <div class="stat-value">${(result.confidence_score * 100).toFixed(0)}%</div>
          <div class="stat-label">Confidence</div>
        </div>
      </div>

      <div class="result-block"><h4>Reasoning</h4><p>${escapeHtml(result.reasoning)}</p></div>

      ${renderTiming(result.timing, run.timing_summary)}

      <div class="result-block">
        <h4>Inspected part</h4>
        <div class="test-img-wrap">${imgUrl ? `<img src="${imgUrl}" alt="Inspected part" />` : ""}</div>
      </div>

      ${downloadButtonHtml()}`;

    wireDownloadButton();
  }

  // ---- JSON download ----------------------------------------------------
  function downloadButtonHtml() {
    return `<button type="button" class="download-btn" id="download-json-btn">Download result JSON</button>`;
  }

  function wireDownloadButton() {
    const btn = document.getElementById("download-json-btn");
    if (!btn) return;
    btn.addEventListener("click", downloadLastRunAsJson);
  }

  function downloadLastRunAsJson() {
    if (!lastRunData) return;
    const filename = `run_${lastRunData.run_id || "result"}.json`;
    const blob = new Blob([JSON.stringify(lastRunData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderTiming(timing, summary) {
    return `
      <details class="data-block">
        <summary>Timing</summary>
        <table>
          <tr><td>Image load</td><td>${fmtSeconds(timing.image_load_seconds)}</td></tr>
          <tr><td>Inference</td><td>${fmtSeconds(timing.inference_seconds)}</td></tr>
          <tr><td>Total (this image)</td><td>${fmtSeconds(timing.total_seconds)}</td></tr>
          <tr><td>Reference image load</td><td>${fmtSeconds(summary.reference_load_seconds)}</td></tr>
          <tr><td>Total run time</td><td>${fmtSeconds(summary.total_run_seconds)}</td></tr>
        </table>
      </details>`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
