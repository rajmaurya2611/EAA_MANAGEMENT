import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./MaterialsAdmin.css";
import {
  Alert,
  AutoComplete,
  Breadcrumb,
  Button,
  Card,
  Collapse,
  ConfigProvider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
  message,
  theme,
} from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DataNode } from "antd/es/tree";
import {
  CopyOutlined,
  MoonOutlined,
  SunOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  InboxOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  SettingOutlined,
  SwapOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import CryptoJS from "crypto-js";
import {
  getDatabase,
  onValue,
  ref,
  update,
} from "firebase/database";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";

const { Title, Text } = Typography;

/* ──────────────────────────────────────────────────────────────────────────
 * CONFIG
 * ────────────────────────────────────────────────────────────────────────── */

// The panel reads from READ_PATH. When "Sync" is on (default), every write is
// also applied to MIRROR_PATHS in the SAME atomic update. In your export,
// MaterialsV2/items is an exact copy of MaterialsV2/activeIndex.
const READ_PATH = "MaterialsV2/activeIndex";
const MIRROR_PATHS = ["MaterialsV2/items"];

// Types that have an extra "session" level (e.g. Pyq/First_Year/ALL/2023-2024/<id>).
const SESSION_TYPES = ["Pyq"];

const DEFAULT_AUTHOR = "Engineers At AKTU";

// Upload PDFs straight to Firebase Storage and auto-fill the link.
const ENABLE_STORAGE_UPLOAD = true;
const STORAGE_FOLDER = "materials";

const AES_SECRET_KEY: string =
  (import.meta as any).env?.VITE_MATERIALS_AES_SECRET_KEY || "";

const DEFAULT_YEARS = ["First_Year", "Second_Year", "Third_Year", "Fourth_Year"];
const DEFAULT_BRANCHES = ["ALL", "CSE", "IT", "ECE", "EEE", "ME", "CIVIL", "OTHER"];

const ID_PREFIX: Record<string, string> = {
  "E-Book": "ebooks",
  Lectures: "lec",
  Notes: "notes",
  Pyq: "pyq",
  Quantum: "quantum",
  Syllabus: "syllabus",
};
const YEAR_SHORT: Record<string, string> = {
  First_Year: "1st",
  Second_Year: "2nd",
  Third_Year: "3rd",
  Fourth_Year: "4th",
};

/* ──────────────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────────────── */

type Raw = Record<string, any>;
type LinkState = "ok" | "missing" | "unreadable";
type StatusFilter = "all" | "visible" | "hidden" | "attention";
type SortMode = "folder" | "newest" | "liked" | "az";

interface Row {
  key: string;
  id: string;
  segs: string[]; // [type, year, branch, session?]
  type: string;
  year: string;
  branch: string;
  session?: string;
  title: string;
  sub_name: string;
  sub_code: string;
  link: string; // decrypted PDF/primary link
  videoLink: string; // decrypted video link
  rawPdf: string;
  rawVideo: string;
  linkState: LinkState;
  by: string;
  active: boolean;
  likes: number;
  dislikes: number;
  createdAt: number;
  updatedAt: number;
  raw: Raw;
}

interface Loc {
  type: string;
  year: string;
  branch: string;
  session?: string;
}

interface WriteOp {
  path: string[];
  value?: Raw | null; // set / delete (null)
  patch?: Raw; // update only these fields
}

/* ──────────────────────────────────────────────────────────────────────────
 * HELPERS
 * ────────────────────────────────────────────────────────────────────────── */

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const YEAR_ORDER = DEFAULT_YEARS;
function cmpYear(a: string, b: string) {
  const ia = YEAR_ORDER.indexOf(a);
  const ib = YEAR_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return natural(a, b);
}
function cmpBranch(a: string, b: string) {
  if (a === "ALL" && b !== "ALL") return -1;
  if (b === "ALL" && a !== "ALL") return 1;
  if (a === "OTHER" && b !== "OTHER") return 1;
  if (b === "OTHER" && a !== "OTHER") return -1;
  return natural(a, b);
}
const cmpSession = (a: string, b: string) => natural(b, a); // newest first
const LEVEL_CMP = [natural, cmpYear, cmpBranch, cmpSession];

const pretty = (s: string) => s.replace(/_/g, " ");
const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const isUrl = (s: string) => /^https?:\/\//i.test(s);
const idNumber = (id: string) => {
  const m = id.match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
};

// Firebase RTDB keys cannot contain  . $ # [ ] /  or control characters.
const BAD_KEY = /[.$#\[\]/\u0000-\u001F\u007F]/;
function keyError(value: string | undefined, label: string): string | null {
  const s = (value ?? "").trim();
  if (!s) return `${label} is required.`;
  if (BAD_KEY.test(s)) return `${label} cannot contain  . $ # [ ] /`;
  return null;
}
const keyRule = (label: string) => ({
  validator: async (_: unknown, v: string) => {
    const err = keyError(v, label);
    if (err) throw new Error(err);
  },
});

/* AES (same scheme as the Android app: AES-ECB / PKCS7, key = UTF-8 bytes) */
function encryptAES(value: string): string {
  if (!value) return "";
  if (!AES_SECRET_KEY) {
    throw new Error("VITE_MATERIALS_AES_SECRET_KEY is not configured.");
  }
  const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
  return CryptoJS.AES.encrypt(value, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
}

function decryptAES(value: string): { text: string; ok: boolean } {
  if (!value) return { text: "", ok: true };
  if (isUrl(value)) return { text: value, ok: true }; // legacy plain-text value
  if (!AES_SECRET_KEY) return { text: "", ok: false };
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const out = CryptoJS.AES.decrypt(value, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    return out ? { text: out, ok: true } : { text: "", ok: false };
  } catch {
    return { text: "", ok: false };
  }
}

/* Parsing the Firebase tree into flat rows */
function isMaterial(v: any): v is Raw {
  return (
    !!v &&
    typeof v === "object" &&
    (typeof v.title === "string" ||
      typeof v.pdf === "string" ||
      typeof v.id === "string")
  );
}

function toRow(id: string, v: Raw, segs: string[]): Row {
  const rawPdf = typeof v.pdf === "string" ? v.pdf : "";
  const rawVideo = typeof v.videoUrl === "string" ? v.videoUrl : "";
  const pdf = decryptAES(rawPdf);
  const video = decryptAES(rawVideo);
  const linkState: LinkState = !rawPdf
    ? "missing"
    : pdf.ok
    ? "ok"
    : "unreadable";
  return {
    key: [...segs, id].join("/"),
    id,
    segs,
    type: segs[0],
    year: segs[1],
    branch: segs[2],
    session: segs[3],
    title: typeof v.title === "string" ? v.title : "",
    sub_name: typeof v.sub_name === "string" ? v.sub_name : "",
    sub_code: typeof v.sub_code === "string" ? v.sub_code : "",
    link: pdf.text,
    videoLink: video.text,
    rawPdf,
    rawVideo,
    linkState,
    by: typeof v.by === "string" && v.by ? v.by : DEFAULT_AUTHOR,
    active: v.active !== false && v.active !== "false",
    likes: Number(v.likes || 0),
    dislikes: Number(v.dislikes || 0),
    createdAt: Number(v.createdAt || 0),
    updatedAt: Number(v.updatedAt || 0),
    raw: v,
  };
}

function parseRows(data: any): Row[] {
  const rows: Row[] = [];
  if (!data || typeof data !== "object") return rows;
  Object.entries<any>(data).forEach(([type, years]) => {
    Object.entries<any>(years || {}).forEach(([year, branches]) => {
      Object.entries<any>(branches || {}).forEach(([branch, children]) => {
        Object.entries<any>(children || {}).forEach(([k, v]) => {
          if (isMaterial(v)) {
            rows.push(toRow(k, v, [type, year, branch]));
          } else if (v && typeof v === "object") {
            // k is a session folder (e.g. "2023-2024")
            Object.entries<any>(v).forEach(([id, m]) => {
              if (isMaterial(m)) rows.push(toRow(id, m, [type, year, branch, k]));
            });
          }
        });
      });
    });
  });
  return rows;
}

function cmpRowsByFolder(a: Row, b: Row) {
  const n = Math.max(a.segs.length, b.segs.length);
  for (let i = 0; i < n; i++) {
    const x = a.segs[i] ?? "";
    const y = b.segs[i] ?? "";
    if (x !== y) return (LEVEL_CMP[i] ?? natural)(x, y);
  }
  return idNumber(a.id) - idNumber(b.id) || natural(a.id, b.id);
}

const inScope = (r: Row, scope: string[]) =>
  scope.every((s, i) => r.segs[i] === s);

const typeUsesSession = (rows: Row[], type?: string) =>
  !!type &&
  (SESSION_TYPES.includes(type) ||
    rows.some((r) => r.type === type && r.session !== undefined));

const locSegs = (loc: Loc, usesSession: boolean) =>
  [loc.type, loc.year, loc.branch, ...(usesSession ? [loc.session ?? ""] : [])].map(
    (s) => s.trim()
  );

/* ID generation: pyq_1st_all_2021_3, notes_2nd_yr_cse_7 … */
function idBase(loc: Loc): string {
  const prefix = ID_PREFIX[loc.type] ?? slug(loc.type);
  const y = YEAR_SHORT[loc.year] ?? slug(loc.year);
  const parts = [prefix, loc.session ? y : `${y}_yr`, slug(loc.branch)];
  if (loc.session) {
    const d = loc.session.replace(/\D/g, "");
    parts.push(d.length === 8 ? d.slice(2, 4) + d.slice(6, 8) : slug(loc.session));
  }
  return parts.filter(Boolean).join("_");
}

function makeIdFactory(rows: Row[], loc: Loc, usesSession: boolean) {
  const used = new Set(rows.map((r) => r.id));
  const segs = locSegs(loc, usesSession);
  const siblings = rows.filter((r) => inScope(r, segs));
  let n = Math.max(0, ...siblings.map((r) => idNumber(r.id))) + 1;
  const base = idBase(loc);
  return () => {
    let id = `${base}_${n}`;
    while (used.has(id)) {
      n++;
      id = `${base}_${n}`;
    }
    used.add(id);
    n++;
    return id;
  };
}

/* Firebase writes. One atomic multi-path update, applied to every root. */
async function commitWrites(db: ReturnType<typeof getDatabase>, ops: WriteOp[], sync: boolean) {
  const roots = [READ_PATH, ...(sync ? MIRROR_PATHS : [])];
  const updates: Record<string, any> = {};
  for (const op of ops) {
    for (const root of roots) {
      const base = `${root}/${op.path.join("/")}`;
      if (op.patch) {
        Object.entries(op.patch).forEach(([k, v]) => (updates[`${base}/${k}`] = v));
      } else {
        updates[base] = op.value ?? null;
      }
    }
  }
  await update(ref(db), updates);
}

const fmtDate = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

async function copyText(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    message.success(label);
  } catch {
    message.error("Could not copy to clipboard.");
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * FOLDER TREE
 * ────────────────────────────────────────────────────────────────────────── */

interface TNode {
  name: string;
  key: string;
  count: number;
  hidden: number;
  kids: Map<string, TNode>;
}

function buildTreeData(rows: Row[]): DataNode[] {
  const root: TNode = { name: "", key: "", count: 0, hidden: 0, kids: new Map() };
  rows.forEach((r) => {
    root.count++;
    if (!r.active) root.hidden++;
    let node = root;
    r.segs.forEach((s, i) => {
      let child = node.kids.get(s);
      if (!child) {
        child = { name: s, key: r.segs.slice(0, i + 1).join("/"), count: 0, hidden: 0, kids: new Map() };
        node.kids.set(s, child);
      }
      child.count++;
      if (!r.active) child.hidden++;
      node = child;
    });
  });

  const label = (n: TNode, text: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "max-content", minWidth: 150, whiteSpace: "nowrap" }}>
      <span style={{ display: "block", flex: "0 0 auto", whiteSpace: "nowrap" }}>{text}</span>
      <Text type="secondary" style={{ flex: "0 0 auto", fontSize: 11, lineHeight: 1.2 }}>
        {n.count}
      </Text>
    </div>
  );

  const convert = (n: TNode, level: number): DataNode[] =>
    [...n.kids.values()]
      .sort((a, b) => (LEVEL_CMP[level] ?? natural)(a.name, b.name))
      .map((c) => ({
        key: c.key,
        title: label(c, pretty(c.name)),
        icon: ({ expanded }: any) => (expanded ? <FolderOpenOutlined /> : <FolderOutlined />),
        children: convert(c, level + 1),
      }));

  return [
    {
      key: "",
      title: label(root, "All materials"),
      icon: <FolderOpenOutlined />,
      children: convert(root, 0),
    },
  ];
}

/* ──────────────────────────────────────────────────────────────────────────
 * LOCATION FIELDS (shared by Add/Edit drawer, Bulk add, Move)
 * ────────────────────────────────────────────────────────────────────────── */

function LocationFields({ form, rows }: { form: FormInstance; rows: Row[] }) {
  const type = Form.useWatch("type", form) as string | undefined;
  const year = Form.useWatch("year", form) as string | undefined;
  const branch = Form.useWatch("branch", form) as string | undefined;

  const opts = useMemo(() => {
    const types = [...new Set(rows.map((r) => r.type))].sort(natural);
    const years = [
      ...new Set([
        ...DEFAULT_YEARS,
        ...rows.filter((r) => r.type === type).map((r) => r.year),
      ]),
    ].sort(cmpYear);
    const branches = [
      ...new Set([
        ...DEFAULT_BRANCHES,
        ...rows.filter((r) => r.type === type && r.year === year).map((r) => r.branch),
      ]),
    ].sort(cmpBranch);
    const sessions = [
      ...new Set(
        rows
          .filter((r) => r.type === type && r.year === year && r.branch === branch && r.session)
          .map((r) => r.session as string)
      ),
    ].sort(cmpSession);
    return { types, years, branches, sessions };
  }, [rows, type, year, branch]);

  const auto = (options: string[], placeholder: string) => (
    <AutoComplete
      allowClear
      placeholder={placeholder}
      options={options.map((v) => ({ value: v, label: pretty(v) }))}
      filterOption={(input, o) => String(o?.value ?? "").toLowerCase().includes(input.toLowerCase())}
    />
  );

  const showSession = typeUsesSession(rows, type);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Form.Item label="Type" name="type" rules={[keyRule("Type")]}>
          {auto(opts.types, "e.g. Notes")}
        </Form.Item>
        <Form.Item label="Year" name="year" rules={[keyRule("Year")]}>
          {auto(opts.years, "e.g. Second_Year")}
        </Form.Item>
        <Form.Item label="Branch" name="branch" rules={[keyRule("Branch")]}>
          {auto(opts.branches, "e.g. CSE")}
        </Form.Item>
        {showSession && (
          <Form.Item label="Session" name="session" rules={[keyRule("Session")]}>
            {auto(opts.sessions, "e.g. 2023-2024")}
          </Form.Item>
        )}
      </div>
      <Text type="secondary" style={{ display: "block", marginTop: -8, marginBottom: 16, fontSize: 12 }}>
        Pick an existing folder or type a new name — missing folders are created automatically.
      </Text>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ADD / EDIT DRAWER
 * ────────────────────────────────────────────────────────────────────────── */

interface DrawerState {
  mode: "create" | "edit";
  row?: Row; // edit target, or duplicate source for create
  duplicate?: boolean;
  preset?: Partial<Loc>;
}

function MaterialDrawer(props: {
  state: DrawerState;
  rows: Row[];
  isMobile: boolean;
  commit: (ops: WriteOp[]) => Promise<void>;
  onClose: () => void;
  onSaved: (segs: string[]) => void;
}) {
  const { state, rows, isMobile, commit, onClose, onSaved } = props;
  const editing = state.mode === "edit" ? state.row : undefined;
  const source = state.row;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [idTouched, setIdTouched] = useState(!!editing);
  const [titleTouched, setTitleTouched] = useState(!!editing);

  const initial = useMemo(
    () => ({
      type: source?.type ?? state.preset?.type ?? "",
      year: source?.year ?? state.preset?.year ?? "",
      branch: source?.branch ?? state.preset?.branch ?? "",
      session: source?.session ?? state.preset?.session ?? "",
      title: state.duplicate ? "" : source?.title ?? "",
      sub_name: source?.sub_name ?? "",
      sub_code: source?.sub_code ?? "",
      link: state.duplicate ? "" : source?.link ?? "",
      by: source?.by ?? DEFAULT_AUTHOR,
      active: source?.active ?? true,
      id: editing?.id ?? "",
      separateVideo: !!source && !!source.rawVideo && source.rawVideo !== source.rawPdf,
      videoLink: source && source.rawVideo !== source.rawPdf ? source.videoLink : "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const type = Form.useWatch("type", form) as string | undefined;
  const year = Form.useWatch("year", form) as string | undefined;
  const branch = Form.useWatch("branch", form) as string | undefined;
  const session = Form.useWatch("session", form) as string | undefined;
  const separateVideo = Form.useWatch("separateVideo", form) as boolean | undefined;
  const usesSession = typeUsesSession(rows, type);

  // Auto-generate the ID for new materials as the location changes.
  useEffect(() => {
    if (state.mode !== "create" || idTouched) return;
    if (!type || !year || !branch || (usesSession && !session)) return;
    if ([type, year, branch].some((s) => keyError(s, "x")) ) return;
    const next = makeIdFactory(rows, { type, year, branch, session }, usesSession)();
    form.setFieldValue("id", next);
  }, [state.mode, idTouched, type, year, branch, session, usesSession, rows, form]);

  const unreadable = editing?.linkState === "unreadable";

  function handleUpload(opts: any) {
    const file = opts.file as File;
    const loc = form.getFieldsValue(["type", "year", "branch", "session"]);
    const safe = `${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const path = [STORAGE_FOLDER, loc.type, loc.year, loc.branch, loc.session, safe]
      .filter(Boolean)
      .join("/");
    try {
      const task = uploadBytesResumable(storageRef(getStorage(), path), file, {
        contentType: file.type || undefined,
      });
      setUploadPct(0);
      task.on(
        "state_changed",
        (s) => setUploadPct(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
        (err) => {
          console.error(err);
          setUploadPct(null);
          message.error("Upload failed. Check Storage rules, or paste a link instead.");
          opts.onError?.(err);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          form.setFieldValue("link", url);
          form.validateFields(["link"]).catch(() => undefined);
          setUploadPct(null);
          message.success("Uploaded — link filled in.");
          opts.onSuccess?.(url);
        }
      );
    } catch (err) {
      console.error(err);
      setUploadPct(null);
      message.error("Storage is not available. Paste a link instead.");
    }
  }

  async function save(addAnother: boolean) {
    let v: any;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }

    const sessionOn = typeUsesSession(rows, v.type);
    const segs = locSegs(v, sessionOn);
    const id = String(v.id ?? "").trim();
    const idErr = keyError(id, "Material ID");
    if (idErr) return void message.error(idErr);

    const path = [...segs, id];
    const clash = rows.find((r) => r.key === path.join("/") && r.key !== editing?.key);
    if (clash) return void message.error("A material with this ID already exists in that folder.");
    const elsewhere = rows.find((r) => r.id === id && r.key !== editing?.key);
    if (!editing && elsewhere) {
      return void message.error(`ID "${id}" is already used in ${elsewhere.segs.map(pretty).join(" › ")}.`);
    }

    setSaving(true);
    try {
      const now = Date.now();
      const link = String(v.link ?? "").trim();
      const cipher = (val: string, prevPlain?: string, prevRaw?: string) => {
        if (!val) return prevRaw ?? "";
        if (prevRaw && prevPlain !== undefined && val === prevPlain) return prevRaw; // untouched
        return encryptAES(val);
      };
      const pdf = cipher(link, editing?.link, editing?.rawPdf);
      const videoUrl = v.separateVideo
        ? cipher(String(v.videoLink ?? "").trim(), editing?.videoLink, editing?.rawVideo)
        : pdf;

      const fields = {
        id,
        title: String(v.title).trim(),
        sub_name: String(v.sub_name ?? "").trim(),
        sub_code: String(v.sub_code ?? "").trim(),
        pdf,
        videoUrl,
        by: String(v.by ?? "").trim() || DEFAULT_AUTHOR,
        active: !!v.active,
        updatedAt: now,
      };

      let ops: WriteOp[];
      if (!editing) {
        ops = [{ path, value: { ...fields, likes: 0, dislikes: 0, createdAt: now } }];
      } else if (path.join("/") === editing.key) {
        // Patch only editable fields so live like/dislike counters are never overwritten.
        ops = [{ path, patch: fields }];
      } else {
        // Location changed → move.
        ops = [
          { path: [...editing.segs, editing.id], value: null },
          { path, value: { ...editing.raw, ...fields } },
        ];
      }

      await commit(ops);
      message.success(editing ? "Changes saved." : "Material added.");
      onSaved(segs);

      if (addAnother) {
        setIdTouched(false);
        setTitleTouched(false);
        form.setFieldsValue({ title: "", sub_name: "", sub_code: "", link: "", id: "" });
      } else {
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      message.error(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={isMobile ? "100%" : 580}
      title={editing ? "Edit material" : state.duplicate ? "Duplicate material" : "Add material"}
      maskClosable={false}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose}>Cancel</Button>
          {!editing && (
            <Button loading={saving} onClick={() => void save(true)}>
              Save &amp; add another
            </Button>
          )}
          <Button type="primary" loading={saving} onClick={() => void save(false)}>
            {editing ? "Save changes" : "Add material"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        requiredMark={false}
        onValuesChange={(changed) => {
          if ("title" in changed) setTitleTouched(true);
          if ("sub_name" in changed && !titleTouched) form.setFieldValue("title", changed.sub_name);
        }}
      >
        {!AES_SECRET_KEY && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Encryption key missing"
            description="Set VITE_MATERIALS_AES_SECRET_KEY, otherwise links can't be saved."
          />
        )}

        <Title level={5} style={{ marginTop: 0 }}>1 · Where does it go?</Title>
        <LocationFields form={form} rows={rows} />

        <Title level={5}>2 · Details</Title>
        <Form.Item
          label="Subject / name"
          name="sub_name"
          rules={[{ required: true, message: "Enter the subject or name." }]}
        >
          <Input placeholder="e.g. Engineering Mathematics - 1" />
        </Form.Item>
        <Form.Item label="Subject code / note" name="sub_code">
          <Input placeholder="e.g. BAS-203" />
        </Form.Item>
        <Form.Item
          label="Title shown in the app"
          name="title"
          extra={titleTouched ? undefined : "Follows the subject name until you edit it."}
          rules={[{ required: true, message: "Enter a title." }]}
        >
          <Input />
        </Form.Item>

        <Title level={5}>3 · File or link</Title>
        {unreadable && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="The saved link couldn't be decrypted with the current key."
            description="Leave the field empty to keep the existing value untouched, or enter a new link to replace it."
          />
        )}
        <Form.Item
          name="link"
          label="Link (PDF / Drive / video)"
          rules={[{ required: !unreadable, message: "Paste a link or upload a file." }]}
          extra={
            <span>
              Stored encrypted. Use a shareable link the app can open.
            </span>
          }
        >
          <Input.TextArea rows={2} placeholder="https://…" />
        </Form.Item>

        {ENABLE_STORAGE_UPLOAD && (
          <div style={{ marginBottom: 16 }}>
            <Upload.Dragger
              accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.mp4"
              multiple={false}
              maxCount={1}
              showUploadList={false}
              disabled={uploadPct !== null}
              customRequest={handleUpload}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Or drop a file here to upload it</p>
              <p className="ant-upload-hint">Saved to Firebase Storage; the link is filled in above.</p>
            </Upload.Dragger>
            {uploadPct !== null && <Progress percent={uploadPct} size="small" style={{ marginTop: 8 }} />}
          </div>
        )}

        <Title level={5}>4 · Visibility</Title>
        <Form.Item name="active" valuePropName="checked" extra="Hidden materials stay in the database but the app should skip them.">
          <Switch checkedChildren="Visible" unCheckedChildren="Hidden" />
        </Form.Item>

        <Collapse
          ghost
          items={[
            {
              key: "adv",
              label: "Advanced",
              children: (
                <>
                  <Form.Item
                    label="Material ID"
                    name="id"
                    rules={[keyRule("Material ID")]}
                    extra={editing ? "IDs can't be changed after creation." : "Auto-generated. Change only if you need a specific ID."}
                  >
                    <Input disabled={!!editing} onChange={() => setIdTouched(true)} />
                  </Form.Item>
                  <Form.Item label="Added by" name="by">
                    <Input />
                  </Form.Item>
                  <Form.Item name="separateVideo" valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Switch size="small" /> 
                  </Form.Item>
                  <Text type="secondary" style={{ display: "block", marginTop: -40, marginLeft: 48, marginBottom: 16 }}>
                    Use a different link for video
                  </Text>
                  {separateVideo && (
                    <Form.Item label="Video link" name="videoLink">
                      <Input.TextArea rows={2} placeholder="https://…" />
                    </Form.Item>
                  )}
                </>
              ),
            },
          ]}
        />
      </Form>
    </Drawer>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * BULK ADD
 * ────────────────────────────────────────────────────────────────────────── */

interface BulkLine {
  line: number;
  sub_name: string;
  sub_code: string;
  link: string;
  title: string;
  issue?: string;
}

function parseBulk(text: string): BulkLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: BulkLine[] = [];
  lines.forEach((l, i) => {
    const cols = (l.includes("\t") ? l.split("\t") : l.split("|")).map((c) => c.trim());
    const [sub_name = "", sub_code = "", link = "", title = ""] = cols;
    if (i === 0 && /^(link|url)$/i.test(link)) return; // header row
    let issue: string | undefined;
    if (!sub_name) issue = "No subject";
    else if (!link) issue = "No link";
    out.push({ line: i + 1, sub_name, sub_code, link, title: title || sub_name, issue });
  });
  return out;
}

function BulkAddModal(props: {
  rows: Row[];
  scope: string[];
  commit: (ops: WriteOp[]) => Promise<void>;
  onClose: () => void;
  onSaved: (segs: string[]) => void;
}) {
  const { rows, scope, commit, onClose, onSaved } = props;
  const [form] = Form.useForm();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseBulk(text), [text]);
  const valid = parsed.filter((p) => !p.issue);

  async function save() {
    let v: any;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    if (!valid.length) return void message.warning("Nothing valid to add yet.");
    setSaving(true);
    try {
      const sessionOn = typeUsesSession(rows, v.type);
      const segs = locSegs(v, sessionOn);
      const nextId = makeIdFactory(rows, v, sessionOn);
      const now = Date.now();
      const ops: WriteOp[] = valid.map((p) => {
        const id = nextId();
        const enc = encryptAES(p.link);
        return {
          path: [...segs, id],
          value: {
            id,
            title: p.title,
            sub_name: p.sub_name,
            sub_code: p.sub_code,
            pdf: enc,
            videoUrl: enc,
            by: DEFAULT_AUTHOR,
            active: true,
            likes: 0,
            dislikes: 0,
            createdAt: now,
            updatedAt: now,
          },
        };
      });
      await commit(ops);
      message.success(`${ops.length} materials added.`);
      onSaved(segs);
      onClose();
    } catch (e: any) {
      console.error(e);
      message.error(e?.message || "Bulk add failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Bulk add materials"
      width={820}
      onCancel={onClose}
      onOk={() => void save()}
      okText={`Add ${valid.length || ""} material${valid.length === 1 ? "" : "s"}`}
      okButtonProps={{ disabled: !valid.length, loading: saving }}
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          type: scope[0] ?? "",
          year: scope[1] ?? "",
          branch: scope[2] ?? "",
          session: scope[3] ?? "",
        }}
      >
        <LocationFields form={form} rows={rows} />
      </Form>

      <Text strong>Paste your list</Text>
      <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        One material per line: <code>Subject | Code | Link</code>. Copying rows straight from Google Sheets or Excel also
        works (tab-separated). IDs and titles are generated for you.
      </Text>
      <Input.TextArea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Engineering Chemistry | BAS102 | https://drive.google.com/…\nEngineering Physics | BAS101 | https://drive.google.com/…"}
        style={{ fontFamily: "monospace" }}
      />

      {parsed.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">
            {valid.length} ready{parsed.length - valid.length > 0 ? `, ${parsed.length - valid.length} will be skipped` : ""}
          </Text>
          <Table
            size="small"
            style={{ marginTop: 8 }}
            rowKey="line"
            pagination={false}
            scroll={{ y: 220 }}
            dataSource={parsed}
            columns={[
              { title: "#", dataIndex: "line", width: 50 },
              { title: "Subject", dataIndex: "sub_name", ellipsis: true },
              { title: "Code", dataIndex: "sub_code", width: 130, ellipsis: true },
              { title: "Link", dataIndex: "link", ellipsis: true },
              {
                title: "",
                dataIndex: "issue",
                width: 90,
                render: (v?: string) => (v ? <Tag color="error">{v}</Tag> : <Tag color="success">OK</Tag>),
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * MOVE / RENAME / DELETE-FOLDER MODALS
 * ────────────────────────────────────────────────────────────────────────── */

function MoveModal(props: {
  moving: Row[];
  rows: Row[];
  commit: (ops: WriteOp[]) => Promise<void>;
  onClose: () => void;
  onSaved: (segs: string[]) => void;
}) {
  const { moving, rows, commit, onClose, onSaved } = props;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const first = moving[0];

  async function save() {
    let v: any;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const segs = locSegs(v, typeUsesSession(rows, v.type));
    const movingKeys = new Set(moving.map((m) => m.key));
    const clash = moving.find((m) =>
      rows.some((r) => !movingKeys.has(r.key) && r.key === [...segs, m.id].join("/"))
    );
    if (clash) return void message.error(`"${clash.id}" already exists in the destination.`);

    setSaving(true);
    try {
      const now = Date.now();
      const ops: WriteOp[] = [];
      moving.forEach((m) => {
        const from = [...m.segs, m.id];
        const to = [...segs, m.id];
        if (from.join("/") === to.join("/")) return;
        ops.push({ path: from, value: null });
        ops.push({ path: to, value: { ...m.raw, updatedAt: now } });
      });
      if (ops.length) await commit(ops);
      message.success(`Moved ${moving.length} material${moving.length === 1 ? "" : "s"}.`);
      onSaved(segs);
      onClose();
    } catch (e: any) {
      message.error(e?.message || "Move failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Move ${moving.length} material${moving.length === 1 ? "" : "s"}`}
      onCancel={onClose}
      onOk={() => void save()}
      okText="Move"
      confirmLoading={saving}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          type: first?.type ?? "",
          year: first?.year ?? "",
          branch: first?.branch ?? "",
          session: first?.session ?? "",
        }}
      >
        <LocationFields form={form} rows={rows} />
      </Form>
    </Modal>
  );
}

function RenameFolderModal(props: {
  name: string;
  onClose: () => void;
  onSubmit: (newName: string) => Promise<void>;
}) {
  const [value, setValue] = useState(props.name);
  const [saving, setSaving] = useState(false);
  const err = value.trim() === props.name ? "Enter a different name." : keyError(value, "Name");

  return (
    <Modal
      open
      title={`Rename folder “${pretty(props.name)}”`}
      onCancel={props.onClose}
      okText="Rename"
      okButtonProps={{ disabled: !!err }}
      confirmLoading={saving}
      onOk={async () => {
        setSaving(true);
        try {
          await props.onSubmit(value.trim());
        } finally {
          setSaving(false);
        }
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
        Every material inside is moved to the renamed folder. If your app has this folder name hard-coded, update the app too.
      </Text>
    </Modal>
  );
}

function DeleteFolderModal(props: {
  name: string;
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title="Delete folder"
      onCancel={props.onClose}
      okText="Delete everything inside"
      okButtonProps={{ danger: true, disabled: typed !== props.name }}
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          await props.onConfirm();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message={`This deletes ${props.count} material${props.count === 1 ? "" : "s"}.`}
        description="You'll get a short chance to undo, but download a backup first if unsure."
      />
      <Text>
        Type <Text code>{props.name}</Text> to confirm:
      </Text>
      <Input style={{ marginTop: 8 }} value={typed} onChange={(e) => setTyped(e.target.value)} />
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * MAIN
 * ────────────────────────────────────────────────────────────────────────── */

const MaterialsAdminContent: React.FC<{ mode: "light" | "dark"; onToggleTheme: () => void }> = ({ mode, onToggleTheme }) => {
  const db = useMemo(() => getDatabase(), []);
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;

  const [rawData, setRawData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scope, setScope] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([""]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("folder");
  const [selected, setSelected] = useState<React.Key[]>([]);

  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [moving, setMoving] = useState<Row[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);

  const [sync, setSync] = useState<boolean>(() => {
    try {
      return localStorage.getItem("materials.sync") !== "off";
    } catch {
      return true;
    }
  });
  const changeSync = (v: boolean) => {
    setSync(v);
    try {
      localStorage.setItem("materials.sync", v ? "on" : "off");
    } catch {
      /* ignore */
    }
  };

  /* live data */
  useEffect(() => {
    const unsub = onValue(
      ref(db, READ_PATH),
      (snap) => {
        setRawData(snap.val());
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        console.error(err);
        setLoadError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [db]);

  const rows = useMemo(() => parseRows(rawData), [rawData]);

  /* if the selected folder disappears (e.g. last item deleted), go up */
  useEffect(() => {
    if (loading || !scope.length) return;
    let s = scope;
    while (s.length && !rows.some((r) => inScope(r, s))) s = s.slice(0, -1);
    if (s.length !== scope.length) setScope(s);
  }, [rows, scope, loading]);

  /* keep tree expanded down to the selected folder */
  useEffect(() => {
    const keys = scope.map((_, i) => scope.slice(0, i + 1).join("/"));
    setExpanded((prev) => [...new Set([...prev, "", ...keys])]);
    setSelected([]);
  }, [scope]);

  const commit = useCallback((ops: WriteOp[]) => commitWrites(db, ops, sync), [db, sync]);

  const treeData = useMemo(() => buildTreeData(rows), [rows]);
  const scopeRows = useMemo(() => rows.filter((r) => inScope(r, scope)), [rows, scope]);

  const counts = useMemo(
    () => ({
      all: scopeRows.length,
      visible: scopeRows.filter((r) => r.active).length,
      hidden: scopeRows.filter((r) => !r.active).length,
      attention: scopeRows.filter((r) => r.linkState !== "ok").length,
    }),
    [scopeRows]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scopeRows.filter((r) => {
      if (status === "visible" && !r.active) return false;
      if (status === "hidden" && r.active) return false;
      if (status === "attention" && r.linkState === "ok") return false;
      if (!q) return true;
      return [r.id, r.title, r.sub_name, r.sub_code, r.by, ...r.segs].some((x) => x.toLowerCase().includes(q));
    });
    const sorters: Record<SortMode, (a: Row, b: Row) => number> = {
      folder: cmpRowsByFolder,
      newest: (a, b) => b.updatedAt - a.updatedAt,
      liked: (a, b) => b.likes - a.likes,
      az: (a, b) => natural(a.title, b.title),
    };
    return [...list].sort(sorters[sort]);
  }, [scopeRows, status, search, sort]);

  const maxDepth = Math.max(0, ...scopeRows.map((r) => r.segs.length));
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.includes(r.key)),
    [rows, selected]
  );

  /* ── actions ── */

  async function toggleActive(r: Row, active: boolean) {
    try {
      await commit([{ path: [...r.segs, r.id], patch: { active, updatedAt: Date.now() } }]);
    } catch (e) {
      console.error(e);
      message.error("Could not change visibility.");
    }
  }

  async function bulkActive(active: boolean) {
    try {
      const now = Date.now();
      await commit(selectedRows.map((r) => ({ path: [...r.segs, r.id], patch: { active, updatedAt: now } })));
      message.success(`${selectedRows.length} materials ${active ? "made visible" : "hidden"}.`);
      setSelected([]);
    } catch (e) {
      console.error(e);
      message.error("Bulk update failed.");
    }
  }

  async function deleteRows(list: Row[]) {
    try {
      await commit(list.map((r) => ({ path: [...r.segs, r.id], value: null })));
      setSelected([]);
      const msgKey = `undo-${Date.now()}`;
      message.open({
        key: msgKey,
        type: "success",
        duration: 10,
        content: (
          <span>
            Deleted {list.length} material{list.length === 1 ? "" : "s"}.{" "}
            <a
              onClick={async () => {
                message.destroy(msgKey);
                try {
                  await commit(list.map((r) => ({ path: [...r.segs, r.id], value: r.raw })));
                  message.success("Restored.");
                } catch {
                  message.error("Could not restore.");
                }
              }}
            >
              Undo
            </a>
          </span>
        ),
      });
    } catch (e) {
      console.error(e);
      message.error("Delete failed.");
    }
  }

  async function renameFolder(newName: string) {
    const level = scope.length - 1;
    const now = Date.now();
    const movingKeys = new Set(scopeRows.map((r) => r.key));
    const ops: WriteOp[] = [];
    for (const r of scopeRows) {
      const segs = [...r.segs];
      segs[level] = newName;
      const to = [...segs, r.id];
      if (rows.some((x) => !movingKeys.has(x.key) && x.key === to.join("/"))) {
        return void message.error(`"${r.id}" already exists in “${newName}”.`);
      }
      ops.push({ path: [...r.segs, r.id], value: null });
      ops.push({ path: to, value: { ...r.raw, updatedAt: now } });
    }
    try {
      await commit(ops);
      message.success("Folder renamed.");
      setScope([...scope.slice(0, level), newName]);
      setRenaming(false);
    } catch (e: any) {
      message.error(e?.message || "Rename failed.");
    }
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(rawData ?? {}, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `materials-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const openAdd = () =>
    setDrawer({
      mode: "create",
      preset: { type: scope[0], year: scope[1], branch: scope[2], session: scope[3] },
    });

  /* ── pieces ── */

  const folderTree = (
    <div className="materials-folder-tree-scroll">
      <Tree
        showIcon
        blockNode
        treeData={treeData}
        expandedKeys={expanded}
        onExpand={(keys) => setExpanded(keys as string[])}
        selectedKeys={[scope.join("/")]}
        onSelect={(_keys, info) => {
          const k = String(info.node.key);
          setScope(k === "" ? [] : k.split("/"));
          setFoldersOpen(false);
        }}
      />
    </div>
  );

  const columns: ColumnsType<Row> = [
    {
      title: "Material",
      key: "material",
      render: (_v, r) => (
        <div style={{ minWidth: 0 }}>
          <Text strong>{r.title || "(Untitled)"}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {[r.sub_name !== r.title ? r.sub_name : "", r.sub_code].filter(Boolean).join(" · ")}
            </Text>
          </div>
          <Text type="secondary" code style={{ fontSize: 11 }}>
            {r.id}
          </Text>
        </div>
      ),
    },
    ...(scope.length >= maxDepth
      ? []
      : [
          {
            title: "Location",
            key: "location",
            width: 230,
            render: (_v: unknown, r: Row) => (
              <Space size={[4, 4]} wrap>
                {r.segs.slice(scope.length).map((s, i) => (
                  <Tag key={i} style={{ marginInlineEnd: 0 }}>
                    {pretty(s)}
                  </Tag>
                ))}
              </Space>
            ),
          } as ColumnsType<Row>[number],
        ]),
    {
      title: "Link",
      key: "link",
      width: 110,
      render: (_v, r) =>
        r.linkState === "missing" ? (
          <Tag color="error">No link</Tag>
        ) : r.linkState === "unreadable" ? (
          <Tooltip title="Can't decrypt with the current key. Check VITE_MATERIALS_AES_SECRET_KEY.">
            <Tag color="warning">Unreadable</Tag>
          </Tooltip>
        ) : (
          <Space size={0}>
            <Tooltip title={isUrl(r.link) ? "Open" : r.link}>
              <Button
                type="text"
                size="small"
                icon={<LinkOutlined />}
                disabled={!isUrl(r.link)}
                href={isUrl(r.link) ? r.link : undefined}
                target="_blank"
                rel="noreferrer"
              />
            </Tooltip>
            <Tooltip title="Copy link">
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copyText(r.link, "Link copied")} />
            </Tooltip>
          </Space>
        ),
    },
    {
      title: "Likes",
      key: "likes",
      width: 80,
      render: (_v, r) => (
        <Text type="secondary">
          {r.likes} / {r.dislikes}
        </Text>
      ),
    },
    {
      title: "Updated",
      key: "updated",
      width: 120,
      render: (_v, r) => <Text type="secondary">{fmtDate(r.updatedAt)}</Text>,
    },
    {
      title: "Status",
      key: "status",
      width: 110,
      render: (_v, r) => (
        <Switch
          checked={r.active}
          checkedChildren="Visible"
          unCheckedChildren="Hidden"
          onChange={(v) => void toggleActive(r, v)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      fixed: "right",
      width: 120,
      render: (_v, r) => (
        <Space size={4}>
          <Button icon={<EditOutlined />} onClick={() => setDrawer({ mode: "edit", row: r })} />
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "dup", label: "Duplicate", icon: <CopyOutlined /> },
                { key: "move", label: "Move to…", icon: <SwapOutlined /> },
                { key: "id", label: "Copy ID" },
                { type: "divider" },
                { key: "del", label: "Delete", icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === "dup") setDrawer({ mode: "create", row: r, duplicate: true });
                if (key === "move") setMoving([r]);
                if (key === "id") void copyText(r.id, "ID copied");
                if (key === "del") {
                  Modal.confirm({
                    title: "Delete this material?",
                    content: r.title,
                    okText: "Delete",
                    okButtonProps: { danger: true },
                    onOk: () => deleteRows([r]),
                  });
                }
              },
            }}
          >
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const settings = (
    <div style={{ width: 280 }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div>
          <Switch checked={sync} onChange={changeSync} size="small" />{" "}
          <Text>Also write to {MIRROR_PATHS.join(", ")}</Text>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            Keeps both copies identical. Turn off only if another process manages them.
          </Text>
        </div>
        <Button block icon={<DownloadOutlined />} onClick={downloadBackup} disabled={!rawData}>
          Download backup (JSON)
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Encryption key: {AES_SECRET_KEY ? "configured" : "NOT configured"}
        </Text>
      </Space>
    </div>
  );

  const folderName = scope.length ? scope[scope.length - 1] : "";

  /* ── render ── */

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message="Could not load materials" description={loadError} />
      </div>
    );
  }

  return (
    <div className="materials-admin-shell" data-theme={mode} style={{ padding: isMobile ? 12 : 28, display: "flex", gap: 22, alignItems: "flex-start" }}>
      {/* Sidebar */}
      {!isMobile && (
        <Card
          className="materials-folder-card"
          size="small"
          title="Folders"
          style={{ width: 240, flexShrink: 0, position: "sticky", top: 12, maxHeight: "calc(100vh - 24px)", overflow: "auto" }}
        >
          {loading ? <Skeleton active /> : folderTree}
        </Card>
      )}
      {isMobile && (
        <Drawer title="Folders" placement="left" open={foldersOpen} onClose={() => setFoldersOpen(false)} width={260}>
          {folderTree}
        </Drawer>
      )}

      {/* Main column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!AES_SECRET_KEY && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Encryption key not configured"
            description="Set VITE_MATERIALS_AES_SECRET_KEY. Without it, links can't be read or saved."
          />
        )}

        {/* Header */}
        <div
          className="materials-page-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 22,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Breadcrumb
              items={[
                { title: <a onClick={() => setScope([])}>All materials</a> },
                ...scope.map((s, i) => ({
                  title:
                    i === scope.length - 1 ? (
                      pretty(s)
                    ) : (
                      <a onClick={() => setScope(scope.slice(0, i + 1))}>{pretty(s)}</a>
                    ),
                })),
              ]}
            />
            <Title level={3} style={{ margin: "4px 0 0" }}>
              {scope.length ? pretty(folderName) : "Study materials"}
            </Title>
            <Text type="secondary">
              {counts.all} material{counts.all === 1 ? "" : "s"} · {counts.visible} visible · {counts.hidden} hidden
              {counts.attention > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <a onClick={() => setStatus("attention")} style={{ color: token.colorWarning }}>
                    {counts.attention} need attention
                  </a>
                </>
              )}
            </Text>
          </div>

          <Space wrap>
            {isMobile && (
              <Button icon={<FolderOutlined />} onClick={() => setFoldersOpen(true)}>
                Folders
              </Button>
            )}
            {scope.length > 0 && (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    { key: "rename", label: "Rename folder", icon: <EditOutlined /> },
                    { key: "delete", label: "Delete folder…", icon: <DeleteOutlined />, danger: true },
                  ],
                  onClick: ({ key }) => (key === "rename" ? setRenaming(true) : setDeletingFolder(true)),
                }}
              >
                <Button icon={<FolderOutlined />}>Folder</Button>
              </Dropdown>
            )}
            <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <Button
                className="materials-theme-toggle"
                aria-label="Toggle color theme"
                icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                onClick={onToggleTheme}
              />
            </Tooltip>
            <Popover trigger="click" placement="bottomRight" content={settings} title="Settings">
              <Button icon={<SettingOutlined />} />
            </Popover>
            <Button icon={<UnorderedListOutlined />} onClick={() => setBulkOpen(true)}>
              Bulk add
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              Add material
            </Button>
          </Space>
        </div>

        <Card className="materials-content-card" styles={{ body: { padding: isMobile ? 12 : 20 } }}>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Input.Search
              allowClear
              placeholder="Search title, subject, code or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: "1 1 240px", maxWidth: 420 }}
            />
            <Segmented
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={[
                { value: "all", label: `All ${counts.all}` },
                { value: "visible", label: `Visible ${counts.visible}` },
                { value: "hidden", label: `Hidden ${counts.hidden}` },
                ...(counts.attention ? [{ value: "attention", label: `Needs fix ${counts.attention}` }] : []),
              ]}
            />
            <Select
              value={sort}
              onChange={setSort}
              style={{ width: 160 }}
              options={[
                { value: "folder", label: "Sort: Folder order" },
                { value: "newest", label: "Sort: Recently edited" },
                { value: "liked", label: "Sort: Most liked" },
                { value: "az", label: "Sort: A–Z" },
              ]}
            />
          </div>

          {/* Bulk action bar */}
          {selectedRows.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "8px 12px",
                marginBottom: 12,
                borderRadius: token.borderRadius,
                background: token.colorPrimaryBg,
              }}
            >
              <Text strong>{selectedRows.length} selected</Text>
              <Button size="small" onClick={() => void bulkActive(true)}>
                Make visible
              </Button>
              <Button size="small" onClick={() => void bulkActive(false)}>
                Hide
              </Button>
              <Button size="small" icon={<SwapOutlined />} onClick={() => setMoving(selectedRows)}>
                Move…
              </Button>
              <Popconfirm
                title={`Delete ${selectedRows.length} materials?`}
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => deleteRows(selectedRows)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Delete
                </Button>
              </Popconfirm>
              <Button size="small" type="link" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          )}

          {loading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <Table<Row>
              rowKey="key"
              size="middle"
              columns={columns}
              dataSource={shown}
              scroll={{ x: 900 }}
              rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                pageSizeOptions: [25, 50, 100],
                showTotal: (t) => `${t} materials`,
              }}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      rows.length === 0
                        ? "No materials yet."
                        : search || status !== "all"
                        ? "Nothing matches your filters."
                        : "This folder is empty."
                    }
                  >
                    {(!search && status === "all") && (
                      <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                        Add the first material
                      </Button>
                    )}
                  </Empty>
                ),
              }}
            />
          )}
        </Card>
      </div>

      {/* Overlays */}
      {drawer && (
        <MaterialDrawer
          state={drawer}
          rows={rows}
          isMobile={isMobile}
          commit={commit}
          onClose={() => setDrawer(null)}
          onSaved={(segs) => {
            if (drawer.mode === "create") setScope(segs);
          }}
        />
      )}
      {bulkOpen && (
        <BulkAddModal
          rows={rows}
          scope={scope}
          commit={commit}
          onClose={() => setBulkOpen(false)}
          onSaved={setScope}
        />
      )}
      {moving && (
        <MoveModal moving={moving} rows={rows} commit={commit} onClose={() => setMoving(null)} onSaved={(s) => { setScope(s); setSelected([]); }} />
      )}
      {renaming && (
        <RenameFolderModal name={folderName} onClose={() => setRenaming(false)} onSubmit={renameFolder} />
      )}
      {deletingFolder && (
        <DeleteFolderModal
          name={folderName}
          count={scopeRows.length}
          onClose={() => setDeletingFolder(false)}
          onConfirm={async () => {
            const list = scopeRows;
            setScope(scope.slice(0, -1));
            setDeletingFolder(false);
            await deleteRows(list);
          }}
        />
      )}
    </div>
  );
};

const MaterialsAdmin: React.FC = () => {
  const [mode, setMode] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("materials-admin.theme");
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("materials-admin.theme", mode);
    } catch {
      // Theme still works for this session if storage is unavailable.
    }
  }, [mode]);

  const onToggleTheme = useCallback(() => {
    setMode((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#635bff",
          colorInfo: "#635bff",
          borderRadius: 12,
          controlHeight: 40,
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Card: { borderRadiusLG: 18 },
          Button: { borderRadius: 10, fontWeight: 600 },
          Input: { borderRadius: 10 },
          Select: { borderRadius: 10 },
          Table: { headerBorderRadius: 12 },
        },
      }}
    >
      <MaterialsAdminContent mode={mode} onToggleTheme={onToggleTheme} />
    </ConfigProvider>
  );
};

export default MaterialsAdmin;



 