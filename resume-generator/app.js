import { db, storage } from "./firebase.js";
import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  ref,
  uploadString,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const $ = (id) => document.getElementById(id);

let uploadedResumeFile = null;
let resumeContent = "";
let jobSnapshot = "";

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

function buildApplicationBaseName({ company, role, candidate }) {
  const parts = [slugify(company), slugify(role), slugify(candidate)];
  return parts.filter(Boolean).join("_");
}

function extractKeywords(text) {
  const stop = new Set([
    "the","and","for","with","you","your","our","are","will","that","this",
    "have","has","from","into","over","under","more","than","what","when",
    "where","which","while","they","them","their","been","being","into","upon",
    "of","to","in","on","at","by","as","is","it","an","a","or","be","we","us",
  ]);
  const counts = new Map();
  (text || "").toLowerCase().match(/[a-z][a-z+#.\-]{2,}/g)?.forEach((w) => {
    if (stop.has(w)) return;
    counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);
}

function buildTailoredText({ resume, job, keywords, includeSuggestions }) {
  const banner = "=== TAILORED RESUME ===\n";
  const top = keywords.slice(0, 10).join(", ");
  const suggestions = includeSuggestions
    ? `\n\n--- Suggested additions (review before sending) ---\nConsider weaving in: ${top}\n`
    : "";
  return `${banner}${resume || "(no resume provided)"}${suggestions}\n\nJob keywords detected: ${top}`;
}

function buildCoverLetter({ candidate, company, role, keywords }) {
  const skills = keywords.slice(0, 5).join(", ") || "relevant skills";
  return `Dear ${company || "Hiring Manager"},\n\nI am writing to express my interest in the ${role || "open"} role. With strong experience in ${skills}, I am confident I can contribute to your team.\n\nI would welcome the opportunity to discuss how my background aligns with your needs.\n\nSincerely,\n${candidate || "Candidate"}`;
}

async function uploadResumeToStorage(baseName) {
  if (!uploadedResumeFile) return null;
  const path = `resumes/${baseName}_${Date.now()}_${uploadedResumeFile.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, uploadedResumeFile);
  return await getDownloadURL(fileRef);
}

async function saveGeneratedFiles(baseName, { tailored, cover }) {
  const stamp = Date.now();
  const tailoredRef = ref(storage, `generated/${baseName}_${stamp}_resume.txt`);
  const coverRef = ref(storage, `generated/${baseName}_${stamp}_cover.txt`);
  await uploadString(tailoredRef, tailored);
  await uploadString(coverRef, cover);
  return {
    tailoredUrl: await getDownloadURL(tailoredRef),
    coverUrl: await getDownloadURL(coverRef),
  };
}

async function checkDuplicates(baseName) {
  const q = query(collection(db, "applications"), where("baseName", "==", baseName));
  const snap = await getDocs(q);
  return snap.size;
}

async function saveTrackerRecord(record) {
  return await addDoc(collection(db, "applications"), {
    ...record,
    createdAt: serverTimestamp(),
  });
}

async function parseResume() {
  const fileInput = $("resumeFile");
  const file = fileInput.files?.[0];
  if (!file) {
    alert("Please choose a resume file first.");
    return;
  }
  uploadedResumeFile = file;
  try {
    const text = await file.text();
    resumeContent = text;
    $("resumeText").value = text;
  } catch (e) {
    $("resumeText").value = `(could not read ${file.name} as text — it will still be uploaded)`;
  }
}

function parseJob() {
  jobSnapshot = $("jobText").value.trim();
  if (!jobSnapshot) {
    alert("Paste a job description first.");
    return;
  }
  alert("Job description captured.");
}

async function generateContent() {
  const resume = $("resumeText").value.trim() || resumeContent;
  const job = $("jobText").value.trim() || jobSnapshot;
  const candidate = $("candidateName").value.trim();
  const role = $("roleTitle").value.trim();
  const company = $("companyName").value.trim();
  const status = $("status").value;
  const notes = $("notes").value.trim();
  const includeSuggestions = $("includeSuggestions").checked;

  if (!resume || !job || !candidate || !role || !company) {
    alert("Please fill resume, job, candidate name, job title, and company name.");
    return;
  }

  const baseName = buildApplicationBaseName({ company, role, candidate });
  const keywords = extractKeywords(job);
  const tailored = buildTailoredText({ resume, job, keywords, includeSuggestions });
  const cover = buildCoverLetter({ candidate, company, role, keywords });

  $("keywords").textContent = "Keywords: " + keywords.join(", ");
  $("tailoredResume").value = tailored;
  $("coverLetter").value = cover;
  $("fileList").textContent = "Uploading to Firebase...";

  try {
    const duplicateCount = await checkDuplicates(baseName);
    if (duplicateCount > 0) {
      $("duplicateWarning").hidden = false;
      $("duplicateWarning").textContent = `Warning: ${duplicateCount} existing application(s) with the same company/role/candidate.`;
    } else {
      $("duplicateWarning").hidden = true;
    }

    const resumeUrl = await uploadResumeToStorage(baseName);
    const { tailoredUrl, coverUrl } = await saveGeneratedFiles(baseName, { tailored, cover });

    await saveTrackerRecord({
      baseName,
      candidate,
      role,
      company,
      status,
      notes,
      keywords,
      jobSnapshot: job,
      resumeUrl,
      tailoredUrl,
      coverUrl,
    });

    $("fileList").textContent = `Saved.\nResume: ${resumeUrl || "(none uploaded)"}\nTailored: ${tailoredUrl}\nCover: ${coverUrl}`;
    await loadTracker();
  } catch (e) {
    console.error(e);
    $("fileList").textContent = "Error: " + e.message;
  }
}

async function loadTracker() {
  const list = $("trackerList");
  list.textContent = "Loading...";
  try {
    const q = query(collection(db, "applications"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const queryStr = $("trackerQuery").value.toLowerCase();
    const statusFilter = $("trackerStatusFilter").value;
    const companyFilter = $("trackerCompanyFilter").value.toLowerCase();
    const jobFilter = $("trackerJobFilter").value.toLowerCase();

    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (statusFilter && d.status !== statusFilter) return;
      if (companyFilter && !(d.company || "").toLowerCase().includes(companyFilter)) return;
      if (jobFilter && !(d.role || "").toLowerCase().includes(jobFilter)) return;
      if (queryStr) {
        const hay = `${d.candidate} ${d.company} ${d.role} ${d.notes || ""}`.toLowerCase();
        if (!hay.includes(queryStr)) return;
      }
      const when = d.createdAt?.toDate?.().toLocaleString?.() || "(pending)";
      rows.push(
        `[${d.status}] ${d.company} — ${d.role} (${d.candidate})\n  ${when}\n  ${d.notes || ""}\n  Resume: ${d.resumeUrl || "—"}\n  Tailored: ${d.tailoredUrl || "—"}\n  Cover: ${d.coverUrl || "—"}\n`
      );
    });
    list.textContent = rows.length ? rows.join("\n") : "No tracker entries match.";
  } catch (e) {
    list.textContent = "Error loading tracker: " + e.message;
  }
}

$("parseResumeBtn").addEventListener("click", parseResume);
$("parseJobBtn").addEventListener("click", parseJob);
$("generateBtn").addEventListener("click", generateContent);
$("refreshTrackerBtn").addEventListener("click", loadTracker);

loadTracker();
