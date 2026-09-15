import {
  ProjectSchema,
  exportProjectToZip,
  importProjectFromZip,
  type Project,
  type Aspect,
} from "@nva/core";

export interface ProjectSummary {
  id: string;
  name: string;
  aspect: Aspect;
  updatedAt: string;
  assetCount: number;
  beatCount: number;
  durationSec: number;
}

const INDEX_KEY = "nva_projects_index_v1";

/** In-memory blob cache for generated Object URLs */
const blobUrlCache = new Map<string, string>();

/** Helper to get OPFS root directory handle if supported */
async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.getDirectory) {
    try {
      return await navigator.storage.getDirectory();
    } catch {
      return null;
    }
  }
  return null;
}

/** Get or create projects folder in OPFS */
async function getProjectsDir(): Promise<FileSystemDirectoryHandle | null> {
  const root = await getOpfsRoot();
  if (!root) return null;
  return await root.getDirectoryHandle("projects", { create: true });
}

/** LocalStorage index management */
export function getProjectSummariesIndex(): ProjectSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjectSummariesIndex(summaries: ProjectSummary[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(summaries));
  } catch {
    // Ignore quota errors
  }
}

function updateIndexForProject(project: Project): void {
  const summaries = getProjectSummariesIndex();
  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    aspect: project.output.aspect,
    updatedAt: project.updatedAt,
    assetCount: project.assets.length,
    beatCount: project.beats.length,
    durationSec: project.audio.durationSec,
  };
  const idx = summaries.findIndex((s) => s.id === project.id);
  if (idx >= 0) {
    summaries[idx] = summary;
  } else {
    summaries.unshift(summary);
  }
  saveProjectSummariesIndex(summaries);
}

function removeFromIndex(id: string): void {
  const summaries = getProjectSummariesIndex().filter((s) => s.id !== id);
  saveProjectSummariesIndex(summaries);
}

/** List all projects metadata summaries */
export async function listProjects(): Promise<ProjectSummary[]> {
  return getProjectSummariesIndex();
}

/** Get full Project object by ID */
export async function getProject(id: string): Promise<Project | null> {
  const projectsDir = await getProjectsDir();

  if (projectsDir) {
    try {
      const projDir = await projectsDir.getDirectoryHandle(id);
      const fileHandle = await projDir.getFileHandle("project.json");
      const file = await fileHandle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      return ProjectSchema.parse(parsed);
    } catch {
      // Fallback to localStorage if file not in OPFS
    }
  }

  // Fallback storage
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(`nva_project_${id}`);
    if (raw) {
      try {
        return ProjectSchema.parse(JSON.parse(raw));
      } catch {
        return null;
      }
    }
  }

  return null;
}

/** Save Project object */
export async function saveProject(project: Project): Promise<void> {
  const updatedProject: Project = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(updatedProject, null, 2);
  const projectsDir = await getProjectsDir();

  if (projectsDir) {
    try {
      const projDir = await projectsDir.getDirectoryHandle(updatedProject.id, { create: true });
      const fileHandle = await projDir.getFileHandle("project.json", { create: true });
      // Create writable stream
      const writable = await (fileHandle as any).createWritable();
      await writable.write(jsonStr);
      await writable.close();
    } catch (e) {
      console.warn("OPFS write failed, falling back to LocalStorage:", e);
    }
  }

  // LocalStorage fallback
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`nva_project_${updatedProject.id}`, jsonStr);
    } catch (e) {
      console.warn("LocalStorage quota reached:", e);
    }
  }

  updateIndexForProject(updatedProject);
  notifyProjectSaved(updatedProject);
}

/**
 * Fired after every successful save so shells that render project-derived UI
 * (the pipeline nav, for one) can re-read instead of holding a stale copy from
 * their own mount.
 */
export const PROJECT_SAVED_EVENT = "nva:project-saved";

function notifyProjectSaved(project: Project) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Project>(PROJECT_SAVED_EVENT, { detail: project }));
}

/** Subscribe to saves. Returns an unsubscribe function. */
export function onProjectSaved(listener: (project: Project) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => listener((e as CustomEvent<Project>).detail);
  window.addEventListener(PROJECT_SAVED_EVENT, handler);
  return () => window.removeEventListener(PROJECT_SAVED_EVENT, handler);
}

/** Create a new blank Project */
export async function createProject(name: string, aspect: Aspect = "16:9"): Promise<Project> {
  const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  let width = 1920;
  let height = 1080;
  if (aspect === "9:16") {
    width = 1080;
    height = 1920;
  } else if (aspect === "1:1") {
    width = 1080;
    height = 1080;
  }

  const project: Project = {
    id,
    name: name.trim() || "Untitled Video",
    createdAt: now,
    updatedAt: now,
    version: "1",
    output: {
      aspect,
      width,
      height,
      fps: 30,
      codec: "h264",
    },
    audio: {
      fileRef: "",
      durationSec: 0,
      speed: 1.0,
      trimStartSec: 0,
      trimEndSec: 0,
      loudnessTarget: -16,
    },
    script: {
      text: "",
      language: "en",
    },
    beats: [],
    assets: [],
    style: {
      transition: "dissolve",
      transitionSec: 0.5,
      kenBurns: {
        zoomMin: 1.035,
        zoomMax: 1.04,
        alternate: true,
      },
    },
    timing: {
      mode: "proportional",
      startsAtBeat: 1,
      minHoldSec: 2,
      maxHoldSec: 15,
    },
    ai: {},
    changeLog: [{ at: now, what: "Project created" }],
  };

  await saveProject(project);
  return project;
}

/** Rename an existing project */
export async function renameProject(id: string, newName: string): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error(`Project ${id} not found`);

  const updated: Project = {
    ...project,
    name: newName.trim(),
    updatedAt: new Date().toISOString(),
  };

  await saveProject(updated);
  return updated;
}

/** Delete project and all associated media */
export async function deleteProject(id: string): Promise<void> {
  const projectsDir = await getProjectsDir();
  if (projectsDir) {
    try {
      await projectsDir.removeEntry(id, { recursive: true });
    } catch {
      // Ignore if not present
    }
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem(`nva_project_${id}`);
  }

  removeFromIndex(id);
}

/** Duplicate an existing project */
export async function duplicateProject(id: string, newName?: string): Promise<Project> {
  const source = await getProject(id);
  if (!source) throw new Error(`Project ${id} not found`);

  const newId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const cloned: Project = {
    ...source,
    id: newId,
    name: newName || `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    changeLog: [{ at: now, what: `Cloned from project ${id}` }],
  };

  // Copy media files in OPFS if present
  const projectsDir = await getProjectsDir();
  if (projectsDir) {
    try {
      const srcDir = await projectsDir.getDirectoryHandle(id);
      const mediaDir = await srcDir.getDirectoryHandle("media").catch(() => null);
      if (mediaDir) {
        const destDir = await projectsDir.getDirectoryHandle(newId, { create: true });
        const destMedia = await destDir.getDirectoryHandle("media", { create: true });
        for await (const [fileName, handle] of (mediaDir as any).entries()) {
          if (handle.kind === "file") {
            const file = await handle.getFile();
            const destFile = await destMedia.getFileHandle(fileName, { create: true });
            const writable = await destFile.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
          }
        }
      }
    } catch (e) {
      console.warn("OPFS media duplication warning:", e);
    }
  }

  await saveProject(cloned);
  return cloned;
}

/** Save media file into OPFS projects/[id]/media/[name] */
export async function saveAssetFile(
  projectId: string,
  fileName: string,
  fileData: Blob | ArrayBuffer | ArrayBufferView,
): Promise<string> {
  const projectsDir = await getProjectsDir();
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (projectsDir) {
    try {
      const projDir = await projectsDir.getDirectoryHandle(projectId, { create: true });
      const mediaDir = await projDir.getDirectoryHandle("media", { create: true });
      const fileHandle = await mediaDir.getFileHandle(cleanName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(fileData);
      await writable.close();
    } catch (e) {
      console.warn("Failed saving asset file to OPFS:", e);
    }
  }

  return cleanName;
}

/** Fetch Blob for a media asset */
export async function getAssetBlob(projectId: string, fileName: string): Promise<Blob | null> {
  const projectsDir = await getProjectsDir();
  if (projectsDir) {
    try {
      const projDir = await projectsDir.getDirectoryHandle(projectId);
      const mediaDir = await projDir.getDirectoryHandle("media");
      const fileHandle = await mediaDir.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Remove a media file from OPFS and drop its cached Object URL.
 * Safe to call for a file that is already gone.
 */
export async function deleteAssetFile(projectId: string, fileName: string): Promise<void> {
  const cacheKey = `${projectId}/${fileName}`;
  const cachedUrl = blobUrlCache.get(cacheKey);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    blobUrlCache.delete(cacheKey);
  }

  const projectsDir = await getProjectsDir();
  if (!projectsDir) return;

  try {
    const projDir = await projectsDir.getDirectoryHandle(projectId);
    const mediaDir = await projDir.getDirectoryHandle("media");
    await mediaDir.removeEntry(fileName);
  } catch {
    // Already absent, or OPFS unavailable — nothing to clean up.
  }
}

/** Get cached or create Object URL for a media asset */
export async function getAssetUrl(projectId: string, fileName: string): Promise<string | null> {
  const cacheKey = `${projectId}/${fileName}`;
  if (blobUrlCache.has(cacheKey)) {
    return blobUrlCache.get(cacheKey)!;
  }

  const blob = await getAssetBlob(projectId, fileName);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  blobUrlCache.set(cacheKey, url);
  return url;
}

/** Export full project as a downloadable ZIP blob */
export async function exportProjectZipBlob(projectId: string): Promise<Blob> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const mediaMap = new Map<string, Uint8Array>();
  const projectsDir = await getProjectsDir();

  if (projectsDir) {
    try {
      const projDir = await projectsDir.getDirectoryHandle(projectId);
      const mediaDir = await projDir.getDirectoryHandle("media").catch(() => null);
      if (mediaDir) {
        for await (const [fileName, handle] of (mediaDir as any).entries()) {
          if (handle.kind === "file") {
            const file = await handle.getFile();
            const arrBuf = await file.arrayBuffer();
            mediaMap.set(fileName, new Uint8Array(arrBuf));
          }
        }
      }
    } catch (e) {
      console.warn("OPFS media read warning during export:", e);
    }
  }

  const zipUint8 = exportProjectToZip(project, mediaMap);
  return new Blob([zipUint8], { type: "application/zip" });
}

/** Import project from ZIP File */
export async function importProjectZipFile(file: File): Promise<Project> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const { project, mediaFiles } = await importProjectFromZip(buffer);

  // Generate unique ID if project with same ID exists
  const existing = await getProject(project.id);
  const finalProject: Project = {
    ...project,
    id: existing ? `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : project.id,
    updatedAt: new Date().toISOString(),
  };

  // Write media files to OPFS
  for (const [fileName, data] of mediaFiles.entries()) {
    await saveAssetFile(finalProject.id, fileName, data);
  }

  await saveProject(finalProject);
  return finalProject;
}

/** File System Access API: link local directory */
export async function linkLocalFolder(): Promise<{ name: string; handle: FileSystemDirectoryHandle } | null> {
  if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      return { name: handle.name, handle };
    } catch {
      return null;
    }
  }
  return null;
}
