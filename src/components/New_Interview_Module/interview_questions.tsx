import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Input,
  Select,
  Switch,
  Modal,
  Drawer,
  Table,
  Tag,
  Popconfirm,
  message,
  Upload,
  Form,
  Popover, 
  Spin,
  Empty,
  ConfigProvider,
  theme as antdTheme,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';

import { CKEditor } from '@ckeditor/ckeditor5-react'; 

import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update, get } from 'firebase/database';

import { ClassicEditor } from 'ckeditor5';

/* ============================================================
   NOTE ON DEPENDENCIES (already-in-project things this reuses):
   - Firebase Realtime Database instance from '../../firebaseConfig' (same
     pattern as FirstYearNotes.tsx), adjust the relative import path to
     match where you place this file.
   - antd (already used in the project).

   NEW dependency you need to install for CKEditor 5:
     npm install @ckeditor/ckeditor5-react @ckeditor/ckeditor5-build-classic
   ============================================================ */

/* ------------------------------------------------------------------
   Types
------------------------------------------------------------------ */

type Level = 'Easy' | 'Medium' | 'Hard';
const LEVELS: Level[] = ['Easy', 'Medium', 'Hard'];

interface RawQuestion {
  active: boolean;
  answer: string;
  company: string;
  level: Level;
  premium: boolean;
  question: string;
  topic: string;
  year: string;
}

interface FlatQuestion extends RawQuestion {
  id: string;
  tabKey: string;
}

interface RawTab {
  name: string;
  order: number;
  active?: boolean; // optional - not in original schema, only written if user toggles it
}

interface TabItem extends RawTab {
  key: string;
}

interface SectionData {
  title?: string;
  subtitle?: string;
  tabs?: Record<string, RawTab>;
  questions?: Record<string, Record<string, Record<string, RawQuestion>>>;
}

interface ParentDef {
  key: string; // firebase node key
  label: string; // display label
  prefix: string; // question id prefix
}

const PARENTS: ParentDef[] = [
  { key: 'aptitude', label: 'Aptitude', prefix: 'Q' },
  { key: 'coding', label: 'Coding', prefix: 'C' },
  { key: 'company', label: 'Company', prefix: 'CM' },
  { key: 'hr', label: 'HR', prefix: 'H' },
  { key: 'technical', label: 'Technical', prefix: 'T' },
];

// Root path in Firebase Realtime Database. Adjust if your project mounts
// this module somewhere else (e.g. 'version12/InterviewModule').
const ROOT_PATH = 'version12/Interview_Ques_Module';

/* ------------------------------------------------------------------
   Small helpers
------------------------------------------------------------------ */

function flattenQuestions(
  questions: SectionData['questions']
): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  if (!questions) return out;
  Object.entries(questions).forEach(([tabKey, levels]) => {
    Object.entries(levels || {}).forEach(([, ids]) => {
      Object.entries(ids || {}).forEach(([id, q]) => {
        out.push({ ...q, id, tabKey });
      });
    });
  });
  return out;
}

function allExistingIds(questions: SectionData['questions']): string[] {
  return flattenQuestions(questions).map((q) => q.id);
}

// Generates the next N ids for a given prefix based on existing ids.
function generateNextIds(prefix: string, existingIds: string[], count: number): string[] {
  const re = new RegExp('^' + prefix + '(\\d+)$');
  let max = 0;
  existingIds.forEach((id) => {
    const m = id.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    result.push(prefix + String(max + i).padStart(3, '0'));
  }
  return result;
}

/* ------------------------------------------------------------------
   Simple CSV parsing (no external dependency)
------------------------------------------------------------------ */

function parseCSV(text: string): Record<string, string>[] {
  // Handles quoted fields containing commas / newlines, basic RFC4180-ish parsing.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => h.trim().toLowerCase());
  return nonEmptyRows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

const CSV_TEMPLATE = 'question,answer,company,level,topic,year,premium,active\n' +
  '"What is a closure?","<p>A closure is a function bundled with its lexical scope.</p>",Google,Easy,JavaScript,2024,false,true\n';

/* ------------------------------------------------------------------
   Main Component
------------------------------------------------------------------ */

const THEME_STORAGE_KEY = 'iqa-theme';


/* ------------------------------------------------------------------
   All Interview Questions page styling lives in this TSX file.
   No separate CSS file is required.
------------------------------------------------------------------ */
type IqaStyleTheme = {
  pageBg: string;
  cardBg: string;
  border: string;
  borderSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  segmentedBg: string;
  segmentedActiveBg: string;
  accent: string;
  accentBg: string;
  previewBg: string;
  dangerBorder: string;
  dangerBg: string;
  dangerText: string;
  codeBg: string;
  codeFg: string;
  easyBg: string;
  easyFg: string;
  mediumBg: string;
  mediumFg: string;
  hardBg: string;
  hardFg: string;
  premiumBg: string;
  premiumFg: string;
  mutedBadgeBg: string;
  mutedBadgeFg: string;
};

const getIqaTheme = (darkMode: boolean): IqaStyleTheme => darkMode ? {
  pageBg: '#14151c',
  cardBg: '#1d1e27',
  border: '#2c2d3a',
  borderSoft: '#262733',
  textPrimary: '#f1f2f6',
  textSecondary: '#a3a7b7',
  textMuted: '#767a8a',
  segmentedBg: '#23242e',
  segmentedActiveBg: '#2f303d',
  accent: '#6b83ff',
  accentBg: '#23263f',
  previewBg: '#16171f',
  dangerBorder: '#4a2323',
  dangerBg: '#221515',
  dangerText: '#a3a7b7',
  codeBg: '#0d0e13',
  codeFg: '#d1d5db',
  easyBg: '#123626',
  easyFg: '#4ade80',
  mediumBg: '#3a2a12',
  mediumFg: '#fbbf24',
  hardBg: '#3a1414',
  hardFg: '#f87171',
  premiumBg: '#23263f',
  premiumFg: '#8fa0ff',
  mutedBadgeBg: '#262733',
  mutedBadgeFg: '#a3a7b7',
} : {
  pageBg: '#f7f8fa',
  cardBg: '#ffffff',
  border: '#e6e8ec',
  borderSoft: '#eef0f3',
  textPrimary: '#1a1a2e',
  textSecondary: '#6b7280',
  textMuted: '#9aa0ab',
  segmentedBg: '#eef0f3',
  segmentedActiveBg: '#ffffff',
  accent: '#2f4bff',
  accentBg: '#eef1ff',
  previewBg: '#fafbfc',
  dangerBorder: '#fde2e2',
  dangerBg: '#fff8f8',
  dangerText: '#7c7c7c',
  codeBg: '#1a1a2e',
  codeFg: '#d1d5db',
  easyBg: '#e3f9ed',
  easyFg: '#12a35a',
  mediumBg: '#fff2e0',
  mediumFg: '#d97706',
  hardBg: '#fde8e8',
  hardFg: '#dc2626',
  premiumBg: '#eef1ff',
  premiumFg: '#2f4bff',
  mutedBadgeBg: '#f1f2f4',
  mutedBadgeFg: '#6b7280',
};

const getBadgeStyle = (theme: IqaStyleTheme, type: 'Easy' | 'Medium' | 'Hard' | 'Premium' | 'Muted'): React.CSSProperties => {
  const colors = {
    Easy: { background: theme.easyBg, color: theme.easyFg },
    Medium: { background: theme.mediumBg, color: theme.mediumFg },
    Hard: { background: theme.hardBg, color: theme.hardFg },
    Premium: { background: theme.premiumBg, color: theme.premiumFg },
    Muted: { background: theme.mutedBadgeBg, color: theme.mutedBadgeFg },
  }[type];

  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    ...colors,
  };
};

const getLevelBadgeStyle = (theme: IqaStyleTheme, level: Level) => getBadgeStyle(theme, level);


const InterviewQuestionsAdmin: React.FC = () => {
  const [activeParent, setActiveParent] = useState<string>(PARENTS[0].key);
  const [sectionData, setSectionData] = useState<SectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Dark mode. Persisted so the choice survives a refresh.
  const [darkMode, setDarkMode] = useState<boolean>(
    () => localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
  );

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // question editor drawer
  const [questionDrawerOpen, setQuestionDrawerOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<FlatQuestion | null>(null);
  const [saving, setSaving] = useState(false);

  // tab modal
  const [tabModalOpen, setTabModalOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<TabItem | null>(null);

  // bulk import drawer
  const [bulkOpen, setBulkOpen] = useState(false);

  // filters
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [filterPremium, setFilterPremium] = useState<string>('all');

  const currentParentDef = PARENTS.find((p) => p.key === activeParent)!;
  const theme = getIqaTheme(darkMode);

  /* --------------------- Load section from Firebase --------------------- */
  useEffect(() => {
    setLoading(true);
    const sectionRef = dbRef(db, `${ROOT_PATH}/${activeParent}`);
    const unsubscribe = onValue(
      sectionRef,
      (snap) => {
        setSectionData(snap.val() || {});
        setLoading(false);
      },
      () => {
        message.error('Error loading data.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [activeParent]);

  const tabs: TabItem[] = useMemo(() => {
    const t = sectionData?.tabs || {};
    return Object.entries(t)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [sectionData]);

  const flatQuestions: FlatQuestion[] = useMemo(
    () => flattenQuestions(sectionData?.questions),
    [sectionData]
  );

  const filteredQuestions = useMemo(() => {
    return flatQuestions.filter((q) => {
      if (filterTab !== 'all' && q.tabKey !== filterTab) return false;
      if (filterLevel !== 'all' && q.level !== filterLevel) return false;
      if (filterActive !== 'all') {
        const wantActive = filterActive === 'active';
        if (!!q.active !== wantActive) return false;
      }
      if (filterPremium !== 'all') {
        const wantPremium = filterPremium === 'premium';
        if (!!q.premium !== wantPremium) return false;
      }
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const hay = `${q.id} ${q.question} ${q.company} ${q.topic}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [flatQuestions, filterTab, filterLevel, filterActive, filterPremium, search]);

  /* --------------------- Firebase write helpers --------------------- */

  const refresh = () => {
    setLoading(true);
    get(dbRef(db, `${ROOT_PATH}/${activeParent}`))
      .then((snap) => setSectionData(snap.val() || {}))
      .catch(() => message.error('Error loading data.'))
      .finally(() => setLoading(false));
  };

  // Save (create or move) a single question, handling path changes if tab/level changed.
  const saveQuestion = async (
    id: string,
    tabKey: string,
    level: Level,
    data: RawQuestion,
    previous?: { tabKey: string; level: Level; id: string }
  ) => {
    const updates: Record<string, any> = {};
    if (previous && (previous.tabKey !== tabKey || previous.level !== level || previous.id !== id)) {
      updates[`${ROOT_PATH}/${activeParent}/questions/${previous.tabKey}/${previous.level.toLowerCase()}/${previous.id}`] = null;
    }
    updates[`${ROOT_PATH}/${activeParent}/questions/${tabKey}/${level.toLowerCase()}/${id}`] = data;
    await update(dbRef(db), updates);
  };

  const toggleQuestionStatus = async (q: FlatQuestion) => {
    try {
      await update(dbRef(db), {
        [`${ROOT_PATH}/${activeParent}/questions/${q.tabKey}/${q.level.toLowerCase()}/${q.id}/active`]: !q.active,
      });
      message.success(q.active ? 'Question deactivated.' : 'Question activated.');
    } catch {
      message.error('Failed to update question status.');
    }
  };

  const saveTab = async (key: string, name: string, order: number, isNew: boolean) => {
    if (isNew) {
      await update(dbRef(db), {
        [`${ROOT_PATH}/${activeParent}/tabs/${key}`]: { name, order },
      });
    } else {
      await update(dbRef(db), {
        [`${ROOT_PATH}/${activeParent}/tabs/${key}/name`]: name,
        [`${ROOT_PATH}/${activeParent}/tabs/${key}/order`]: order,
      });
    }
  };

  const toggleTabActive = async (tab: TabItem) => {
    try {
      const next = !(tab.active !== false); // treat undefined as active(true)
      await update(dbRef(db), {
        [`${ROOT_PATH}/${activeParent}/tabs/${tab.key}/active`]: !next,
      });
    } catch {
      message.error('Failed to update tab.');
    }
  };

  /* --------------------- Table columns --------------------- */

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 90 },
    {
      title: 'Question',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
      render: (v: string) => v,
    },
    {
      title: 'Category',
      dataIndex: 'tabKey',
      key: 'tabKey',
      width: 120,
      render: (v: string) => tabs.find((t) => t.key === v)?.name || v,
    },
    {
      title: 'Difficulty',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (v: Level) => <span style={getLevelBadgeStyle(theme, v)}>{v}</span>,
    },
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Premium',
      dataIndex: 'premium',
      key: 'premium',
      width: 90,
      render: (v: boolean) => (
        <span style={getBadgeStyle(theme, v ? 'Premium' : 'Muted')}>
          {v ? 'YES' : 'NO'}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      width: 90,
      render: (v: boolean, record: FlatQuestion) => (
        <Popconfirm
          title={v ? 'Deactivate this question?' : 'Activate this question?'}
          onConfirm={() => toggleQuestionStatus(record)}
          okText="Yes"
          cancelText="Cancel"
        >
          <Switch checked={v} size="small" />
        </Popconfirm>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: any, record: FlatQuestion) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setEditingQuestion(record);
            setQuestionDrawerOpen(true);
          }}
        />
      ),
    },
  ];

  /* --------------------- Render --------------------- */

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: '#2f4bff' },
      }}
    >
    <div style={{ background: theme.pageBg, padding: 20, minHeight: '100vh', transition: 'background 0.2s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: theme.textPrimary }}>Interview Questions</h1>
          <p style={{ margin: '2px 0 0', color: theme.textSecondary, fontSize: 13 }}>Manage interview categories, tabs and questions</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
            onClick={() => setDarkMode((d) => !d)}
            aria-label="Toggle dark mode"
          />
          <Button icon={<ReloadOutlined />} onClick={refresh} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingQuestion(null);
              setQuestionDrawerOpen(true);
            }}
          >
            Add Question
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>
            Bulk Add
          </Button>
        </div>
      </div>

      {/* Parent selector */}
      <div style={{ display: 'inline-flex', background: theme.segmentedBg, borderRadius: 8, padding: 4, gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {PARENTS.map((p) => (
          <button
            key={p.key}
            style={{ border: 'none', background: activeParent === p.key ? theme.segmentedActiveBg : 'transparent', color: activeParent === p.key ? theme.accent : theme.textSecondary, padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', boxShadow: activeParent === p.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}
            onClick={() => setActiveParent(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Spin spinning={loading}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.accentBg, borderRadius: 8, fontSize: 18 }}>📘</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: theme.textPrimary }}>{sectionData?.title || '—'}</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>{sectionData?.subtitle || ''}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {/* Tabs panel */}
          <div style={{ flex: '0 1 260px', minWidth: 240, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, fontSize: 14, marginBottom: 12, color: theme.textPrimary }}>
              <span>Tabs</span>
              <Button
                size="small"
                type="link"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingTab(null);
                  setTabModalOpen(true);
                }}
              >
                Add Tab
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tabs.length === 0 && <Empty description="No tabs yet" />}
              {tabs.map((t) => (
                <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${theme.borderSoft}`, borderRadius: 8, padding: '8px 10px', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: theme.textPrimary }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      Key: {t.key} | Ord: {t.order}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Switch
                      size="small"
                      checked={t.active !== false}
                      onChange={() => toggleTabActive(t)}
                    />
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingTab(t);
                        setTabModalOpen(true);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Questions bank */}
          <div style={{ flex: '1 1 600px', minWidth: 320, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, fontSize: 14, marginBottom: 12, color: theme.textPrimary }}>
              <span>Questions Bank</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: 260 }}
              />
              <Select
                value={filterTab}
                onChange={setFilterTab}
                style={{ minWidth: 140 }}
                options={[{ value: 'all', label: 'All Categories' }, ...tabs.map((t) => ({ value: t.key, label: t.name }))]}
              />
              <Select
                value={filterLevel}
                onChange={setFilterLevel}
                style={{ minWidth: 120 }}
                options={[{ value: 'all', label: 'Difficulty' }, ...LEVELS.map((l) => ({ value: l, label: l }))]}
              />
              <Popover
                trigger="click"
                content={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180 }}>
                    <div>
                      <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>Status</div>
                      <Select
                        value={filterActive}
                        onChange={setFilterActive}
                        style={{ width: 160 }}
                        options={[
                          { value: 'all', label: 'All' },
                          { value: 'active', label: 'Active' },
                          { value: 'inactive', label: 'Inactive' },
                        ]}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>Premium</div>
                      <Select
                        value={filterPremium}
                        onChange={setFilterPremium}
                        style={{ width: 160 }}
                        options={[
                          { value: 'all', label: 'All' },
                          { value: 'premium', label: 'Premium only' },
                          { value: 'free', label: 'Free only' },
                        ]}
                      />
                    </div>
                  </div>
                }
              >
                <Button icon={<FilterOutlined />}>Filters</Button>
              </Popover>
              <div style={{ flex: 1 }} />
              <Button icon={<PlusOutlined />} onClick={() => { setEditingQuestion(null); setQuestionDrawerOpen(true); }}>
                Add Question
              </Button>
              <Button icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>
                Bulk Add
              </Button>
            </div>

            <Table
              size="small"
              rowKey="id"
              columns={columns as any}
              dataSource={filteredQuestions}
              pagination={filteredQuestions.length > 20 ? { pageSize: 20 } : false}
            />
          </div>
        </div>
      </Spin>

      {/* Question editor drawer */}
      {questionDrawerOpen && (
        <QuestionEditorDrawer
          open={questionDrawerOpen}
          onClose={() => setQuestionDrawerOpen(false)}
          question={editingQuestion}
          tabs={tabs}
          prefix={currentParentDef.prefix}
          existingIds={allExistingIds(sectionData?.questions)}
          saving={saving}
          onSave={async (id, tabKey, level, data, previous) => {
            setSaving(true);
            try {
              await saveQuestion(id, tabKey, level, data, previous);
              message.success('Saved successfully.');
              setQuestionDrawerOpen(false);
            } catch {
              message.error('Failed to save question.');
            } finally {
              setSaving(false);
            }
          }}
          onToggleStatus={async (q) => {
            await toggleQuestionStatus(q);
            setQuestionDrawerOpen(false);
          }}
          darkMode={darkMode}
        />
      )}

      {/* Tab modal */}
      <TabModal
        open={tabModalOpen}
        onClose={() => setTabModalOpen(false)}
        tab={editingTab}
        onSave={async (key, name, order, isNew) => {
          try {
            await saveTab(key, name, order, isNew);
            message.success('Saved successfully.');
            setTabModalOpen(false);
          } catch {
            message.error('Failed to save tab.');
          }
        }}
      />

      {/* Bulk import drawer */}
      <BulkImportDrawer
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        tabs={tabs}
        prefix={currentParentDef.prefix}
        existingIds={allExistingIds(sectionData?.questions)}
        parentKey={activeParent}
        onImported={() => {
          setBulkOpen(false);
          refresh();
        }}
        darkMode={darkMode}
      />
    </div>
    </ConfigProvider>
  );
};

export default InterviewQuestionsAdmin;

/* ============================================================
   Question Editor Drawer (Add / Edit)
============================================================ */

interface QuestionEditorDrawerProps {
  darkMode: boolean;
  open: boolean;
  onClose: () => void;
  question: FlatQuestion | null; // null = add mode
  tabs: TabItem[];
  prefix: string;
  existingIds: string[];
  saving: boolean;
  onSave: (
    id: string,
    tabKey: string,
    level: Level,
    data: RawQuestion,
    previous?: { tabKey: string; level: Level; id: string }
  ) => void;
  onToggleStatus: (q: FlatQuestion) => void;
}

const QuestionEditorDrawer: React.FC<QuestionEditorDrawerProps> = ({
  open,
  onClose,
  question,
  tabs,
  prefix,
  existingIds,
  saving,
  onSave,
  onToggleStatus,
  darkMode,
}) => {
  const isEdit = !!question;
  const theme = getIqaTheme(darkMode);

  const [id] = useState<string>(
    isEdit ? question!.id : generateNextIds(prefix, existingIds, 1)[0]
  );
  const [tabKey, setTabKey] = useState<string>(question?.tabKey || tabs[0]?.key || 'all');
  const [level, setLevel] = useState<Level>(question?.level || 'Easy');
  const [questionText, setQuestionText] = useState(question?.question || '');
  const [answerHtml, setAnswerHtml] = useState(question?.answer || '');
  const [company, setCompany] = useState(question?.company || '');
  const [topic, setTopic] = useState(question?.topic || '');
  const [year, setYear] = useState(question?.year || '');
  const [premium, setPremium] = useState(question?.premium ?? false);
  const [active, setActive] = useState(question?.active ?? true);

  const handleSave = () => {
    if (!questionText.trim()) {
      message.error('Question is required.');
      return;
    }
    if (!answerHtml.trim()) {
      message.error('Answer is required.');
      return;
    }
    const data: RawQuestion = {
      active,
      answer: answerHtml,
      company,
      level,
      premium,
      question: questionText,
      topic,
      year,
    };
    onSave(
      id,
      tabKey,
      level,
      data,
      isEdit ? { tabKey: question!.tabKey, level: question!.level, id: question!.id } : undefined
    );
  };

  return (
    <>
      <style>{`
        .iqa-preview-answer pre, .iqa-preview-answer code {
          background: ${theme.codeBg};
          color: ${theme.codeFg};
          padding: 8px;
          border-radius: 6px;
          display: block;
          overflow-x: auto;
          font-size: 12px;
        }
      `}</style>
      <Drawer
      open={open}
      onClose={onClose}
      width="90%"
      title={isEdit ? `Edit Question · ${question!.id}` : 'Add Question'}
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 600px', minWidth: 320 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Question</div>
            <Input.TextArea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter the question"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Answer / Explanation</div>
            <div>
              <CKEditor
                editor={ClassicEditor}
                data={answerHtml}
                onChange={(_, editor) => setAnswerHtml(editor.getData())}
                onReady={(editor) => {
                  const editable = editor.ui.view.editable.element as HTMLElement | undefined;
                  const editorRoot = editable?.closest('.ck-editor') as HTMLElement | null;
                  if (editable) editable.style.minHeight = '180px';
                  if (editorRoot) {
                    editorRoot.style.setProperty('--ck-color-base-background', theme.cardBg);
                    editorRoot.style.setProperty('--ck-color-base-foreground', theme.pageBg);
                    editorRoot.style.setProperty('--ck-color-text', theme.textPrimary);
                    editorRoot.style.setProperty('--ck-color-toolbar-background', theme.cardBg);
                    editorRoot.style.setProperty('--ck-color-toolbar-border', theme.border);
                    editorRoot.style.setProperty('--ck-color-base-border', theme.border);
                    editorRoot.style.setProperty('--ck-color-button-default-hover-background', theme.borderSoft);
                  }
                }}
                config={{
                  toolbar: [
                    'bold',
                    'italic',
                    'heading',
                    '|',
                    'bulletedList',
                    'numberedList',
                    '|',
                    'codeBlock',
                    'insertTable',
                    'link',
                    '|',
                    'undo',
                    'redo',
                  ],
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Live Preview</div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', maxWidth: 320 }}>
              <div style={{ background: theme.accent, color: '#fff', padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>
                <span>Coding Interview</span>
              </div>
              <div style={{ padding: 14, background: theme.previewBg }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: theme.textPrimary, marginBottom: 8 }}>{questionText || 'Question preview…'}</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={getLevelBadgeStyle(theme, level)}>{level}</span>
                  {topic && <span style={getBadgeStyle(theme, 'Muted')}>{topic}</span>}
                </div>
                <div
                  className="iqa-preview-answer"
                  style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: answerHtml }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: '0 1 320px', minWidth: 280 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Metadata</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Question ID</div>
            <Input value={id} disabled />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Category / Tab</div>
            <Select
              value={tabKey}
              onChange={setTabKey}
              style={{ width: '100%' }}
              options={tabs.map((t) => ({ value: t.key, label: t.name }))}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Difficulty</div>
            <Select
              value={level}
              onChange={(v) => setLevel(v as Level)}
              style={{ width: '100%' }}
              options={LEVELS.map((l) => ({ value: l, label: l }))}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Company</div>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Google, Amazon" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Topic</div>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Data Structures" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Year</div>
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2024" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${theme.borderSoft}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Premium Question</div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>Requires paid subscription</div>
            </div>
            <Switch checked={premium} onChange={setPremium} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${theme.borderSoft}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>Active Status</div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>Visible in production</div>
            </div>
            <Switch checked={active} onChange={setActive} />
          </div>

          {isEdit && (
            <div style={{ marginTop: 16, border: `1px solid ${theme.dangerBorder}`, background: theme.dangerBg, borderRadius: 8, padding: 14 }}>
              <div style={{ color: theme.hardFg, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⚠ Danger Zone</div>
              <div style={{ fontSize: 12, color: theme.dangerText, marginBottom: 10 }}>
                Deactivating this question will hide it from active app content, but it will
                remain in the database (Soft Delete).
              </div>
              <Popconfirm
                title={question!.active ? 'Deactivate this question?' : 'Activate this question?'}
                onConfirm={() => onToggleStatus(question!)}
                okText="Yes"
                cancelText="Cancel"
              >
                <Button danger block>
                  {question!.active ? 'Deactivate Question' : 'Activate Question'}
                </Button>
              </Popconfirm>
            </div>
          )}
        </div>
      </div>
    </Drawer>
    </>
  );
};

/* ============================================================
   Tab Add/Edit Modal
============================================================ */

interface TabModalProps {
  open: boolean;
  onClose: () => void;
  tab: TabItem | null; // null = add mode
  onSave: (key: string, name: string, order: number, isNew: boolean) => void;
}

const TabModal: React.FC<TabModalProps> = ({ open, onClose, tab, onSave }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        key: tab?.key || '',
        name: tab?.name || '',
        order: tab?.order ?? 1,
      });
    }
  }, [open, tab, form]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSave(values.key, values.name, Number(values.order), !tab);
    });
  };

  return (
    <Modal
      open={open}
      title={tab ? 'Edit Tab' : 'Add Tab'}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input placeholder="e.g. Data Structures" />
        </Form.Item>
        <Form.Item
          name="key"
          label="Key"
          rules={[{ required: true, message: 'Key is required' }]}
        >
          <Input placeholder="e.g. dsa" disabled={!!tab} />
        </Form.Item>
        <Form.Item name="order" label="Order" rules={[{ required: true, message: 'Order is required' }]}>
          <Input type="number" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

/* ============================================================
   Bulk Import Drawer
============================================================ */

interface BulkRow {
  row: number;
  question: string;
  answer: string;
  company: string;
  level: string;
  topic: string;
  year: string;
  premium: boolean;
  active: boolean;
  errors: string[];
}

interface BulkImportDrawerProps {
  darkMode: boolean;
  open: boolean;
  onClose: () => void;
  tabs: TabItem[];
  prefix: string;
  existingIds: string[];
  parentKey: string;
  onImported: () => void;
}

const BulkImportDrawer: React.FC<BulkImportDrawerProps> = ({
  open,
  onClose,
  tabs,
  prefix,
  existingIds,
  parentKey,
  onImported,
  darkMode,
}) => {
  const theme = getIqaTheme(darkMode);
  const [targetTab, setTargetTab] = useState<string>(tabs[0]?.key || 'all');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setRows([]);
      setTargetTab(tabs[0]?.key || 'all');
    }
  }, [open, tabs]);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCSV(text);
      const validated: BulkRow[] = parsed.map((r, idx) => {
        const errors: string[] = [];
        const question = r['question'] || '';
        const answer = r['answer'] || '';
        let level = (r['level'] || '').trim();
        const levelNormalized = level
          ? level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()
          : '';

        if (!question) errors.push('Missing question');
        if (!answer) errors.push('Missing answer');
        if (!levelNormalized) {
          errors.push('Missing level');
        } else if (!LEVELS.includes(levelNormalized as Level)) {
          errors.push(`Invalid level: ${level}`);
        }

        return {
          row: idx + 2, // +2 because row 1 is header, spreadsheet rows are 1-indexed
          question,
          answer,
          company: r['company'] || '',
          level: levelNormalized,
          topic: r['topic'] || '',
          year: r['year'] || '',
          premium: String(r['premium'] || '').toLowerCase() === 'true',
          active: r['active'] === undefined || r['active'] === '' ? true : String(r['active']).toLowerCase() === 'true',
          errors,
        };
      });
      setRows(validated);
    };
    reader.readAsText(file);
    return false; // prevent antd auto-upload
  };

  const uploadProps: UploadProps = {
    accept: '.csv',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: handleFile,
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const ids = generateNextIds(prefix, existingIds, validRows.length);
      const updates: Record<string, any> = {};
      validRows.forEach((r, idx) => {
        const id = ids[idx];
        const levelKey = r.level.toLowerCase();
        const data: RawQuestion = {
          active: r.active,
          answer: r.answer,
          company: r.company,
          level: r.level as Level,
          premium: r.premium,
          question: r.question,
          topic: r.topic,
          year: r.year,
        };
        updates[`${ROOT_PATH}/${parentKey}/questions/${targetTab}/${levelKey}/${id}`] = data;
      });
      await update(dbRef(db), updates);
      message.success(`${validRows.length} questions imported successfully`);
      onImported();
    } catch {
      message.error('Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const previewColumns = [
    { title: 'Row', dataIndex: 'row', width: 60 },
    { title: 'Question', dataIndex: 'question', ellipsis: true },
    { title: 'Company', dataIndex: 'company', width: 120 },
    { title: 'Level', dataIndex: 'level', width: 90 },
    { title: 'Topic', dataIndex: 'topic', width: 120 },
    { title: 'Premium', dataIndex: 'premium', width: 80, render: (v: boolean) => (v ? 'Yes' : 'No') },
    {
      title: 'Status',
      key: 'status',
      width: 220,
      render: (_: any, r: BulkRow) =>
        r.errors.length === 0 ? (
          <Tag color="green">Valid</Tag>
        ) : (
          <Tag color="red">{r.errors.join('; ')}</Tag>
        ),
    },
  ];

  return (
    <Drawer open={open} onClose={onClose} width="80%" title="Bulk Add Questions">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>1. Download CSV Template</div>
        <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
          Download Template
        </Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>2. Target Tab (all rows import into this tab)</div>
        <Select
          value={targetTab}
          onChange={setTargetTab}
          style={{ width: 260 }}
          options={tabs.map((t) => ({ value: t.key, label: t.name }))}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>3. Upload CSV</div>
        <Upload.Dragger {...uploadProps}>
          <p style={{ marginBottom: 0 }}>Drag & drop a CSV file here, or click to select</p>
        </Upload.Dragger>
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, margin: '12px 0', color: theme.textPrimary }}>
            {rows.length} questions detected — {validRows.length} valid, {errorRows.length} errors
          </div>

          <Table
            size="small"
            rowKey="row"
            columns={previewColumns as any}
            dataSource={rows}
            pagination={rows.length > 10 ? { pageSize: 10 } : false}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.borderSoft}`, gap: 16, flexWrap: 'wrap' }}>
            <div>
              Import {validRows.length} questions into:{' '}
              <strong>{tabs.find((t) => t.key === targetTab)?.name || targetTab}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={onClose}>Cancel</Button>
              <Button
                type="primary"
                loading={importing}
                disabled={validRows.length === 0}
                onClick={handleImport}
              >
                Import Questions
              </Button>
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
};