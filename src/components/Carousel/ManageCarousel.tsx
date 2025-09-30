import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Popconfirm,
  message,
  Upload,
  Progress,
  Spin,
  Select,
  Tag,
} from 'antd';
import {
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig';
import {
  ref as dbRef,
  onValue,
  update,
  remove,
  get,
  query as dbQuery,
  orderByChild,
  equalTo,
} from 'firebase/database';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

const { TextArea } = Input;
const { Dragger } = Upload;

/** ---- Template 4 destination config (same options as Template4) ---- */
type Destination = 'event' | 'question' | 'eventpage' | 'questionpage';
type DestConfig = {
  label: string;
  path: string;
  needsIntent: boolean;
  intentName?: string | null;
  // Optional lookup config (byKey default); extendable to byChild if needed
  lookup?: { basePath: string; strategy?: 'byKey' } | { basePath: string; strategy: 'byChild'; child: string };
};
const DEST_MAP: Record<Destination, DestConfig> = {
  event: {
    label: 'Event Detail',
    path: 'com.bestofluck.engineersataktu.Event.EventDetailActivity',
    needsIntent: true,
    intentName: 'eventId',
    lookup: { basePath: 'version12/Events', strategy: 'byKey' },
  },
  question: {
    label: 'Question Detail',
    path: 'com.bestofluck.engineersataktu.QnA.QuestionDetailActivity',
    needsIntent: true,
    intentName: 'questionId',
    lookup: { basePath: 'version12/QnA', strategy: 'byKey' },
  },
  eventpage: {
    label: 'Event Page',
    path: 'com.bestofluck.engineersataktu.Event.event_list',
    needsIntent: false,
  },
  questionpage: {
    label: 'Question Page',
    path: 'com.bestofluck.engineersataktu.QnA.QnA',
    needsIntent: false,
  },
};
/** --------------------------------------------------------------- */

interface CarouselItem {
  id: string;
  image: string;
  description: string;
  head?: string;
  link?: string;
  rank: number;
  isActive: 1 | 0;              // numeric
  type: 'direct' | 'indirect' | 'default' | 'internal';
  date: string;
  time: string;

  // Template 4 (internal)
  path?: string | null;
  intentName?: string | null;
  intentValue?: string | null; // stored with leading '-' in DB for detail pages
}

const templateMap = {
  direct: 'Template 1',
  indirect: 'Template 2',
  default: 'Template 3',
  internal: 'Template 4',
} as const;

const ManageCarousel: React.FC = () => {
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Description modal
  const [descVisible, setDescVisible] = useState(false);
  const [descContent, setDescContent] = useState('');

  // Image preview modal + spinner
  const [imgPreviewVisible, setImgPreviewVisible] = useState(false);
  const [imgPreviewUrl, setImgPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);

  // Edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<CarouselItem | null>(null);
  const [editImage, setEditImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Template 4 (internal) edit state
  const [dest, setDest] = useState<Destination | null>(null);
  const derived = useMemo(() => (dest ? DEST_MAP[dest] : null), [dest]);

  // Intent input shown WITHOUT leading '-', we add '-' in bg for check/save
  const [intentValueInput, setIntentValueInput] = useState<string>('');

  // Validation state for intent value
  const [intentChecking, setIntentChecking] = useState(false);
  const [intentExists, setIntentExists] = useState<boolean | null>(null);
  const [intentErr, setIntentErr] = useState<string | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const lastQueryRef = useRef<string>('');

  // Load all carousel items, sort by rank
  useEffect(() => {
    const ref = dbRef(db, 'version12/Carousel');
    const unsub = onValue(ref, snap => {
      const data = snap.val() || {};
      const arr = Object.entries(data).map(([id, raw]: any) => ({
        id,
        image: raw.image,
        description: raw.description || '',
        head: raw.head,
        link: raw.link,
        rank: raw.rank,
        isActive: raw.isActive as 1 | 0,
        type: raw.type,
        date: raw.date,
        time: raw.time,
        path: raw.path ?? null,
        intentName: raw.intentName ?? null,
        intentValue: raw.intentValue ?? null,
      })) as CarouselItem[];
      arr.sort((a, b) => a.rank - b.rank);
      setItems(arr);
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleActive = async (item: CarouselItem, val: boolean) => {
    await update(dbRef(db, `version12/Carousel/${item.id}`), {
      isActive: val ? 1 : 0,
    });
    message.success('Status updated');
  };

  const showDescription = (html: string) => {
    setDescContent(html);
    setDescVisible(true);
  };

  const showImagePreview = (url: string) => {
    setPreviewLoading(true);
    setImgPreviewUrl(url);
    setImgPreviewVisible(true);
  };

  // Infer dest from internal item (by path/name)
  function guessDestFromItem(item: CarouselItem): Destination {
    if (!item.path) return 'questionpage';
    if (item.path === DEST_MAP.event.path) return 'event';
    if (item.path === DEST_MAP.question.path) return 'question';
    if (item.path === DEST_MAP.eventpage.path) return 'eventpage';
    if (item.path === DEST_MAP.questionpage.path) return 'questionpage';
    if (item.intentName === 'eventId') return 'event';
    if (item.intentName === 'questionId') return 'question';
    return 'questionpage';
  }

  // Normalize for DB: ensure a single leading '-'
  function normalizeIntent(rawNoDash: string): string {
    const s = (rawNoDash || '').trim();
    if (!s) return '';
    const stripped = s.replace(/^-+/, '');
    return stripped ? `-${stripped}` : '';
  }

  // Debounced validator when editing internal + needsIntent
  useEffect(() => {
    // reset
    setIntentErr(null);
    setIntentExists(null);
    setIntentChecking(false);

    if (!editing || editing.type !== 'internal') return;
    if (!derived?.needsIntent) return;

    const v = normalizeIntent(intentValueInput); // add '-' in bg
    if (!v) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(async () => {
      setIntentChecking(true);
      setIntentErr(null);
      setIntentExists(null);
      lastQueryRef.current = v;

      try {
        const ok = await checkIdExists(derived.lookup, v);
        if (lastQueryRef.current === v) {
          setIntentExists(ok);
          setIntentChecking(false);
        }
      } catch (e: any) {
        if (lastQueryRef.current === v) {
          setIntentErr(e?.message || 'Validation failed');
          setIntentChecking(false);
          setIntentExists(null);
        }
      }
    }, 500);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [intentValueInput, derived?.needsIntent, derived?.lookup, editing]);

  async function checkIdExists(
    lookup: DestConfig['lookup'],
    idWithDash: string
  ): Promise<boolean> {
    if (!lookup) return false;
    if (!('strategy' in lookup) || lookup.strategy === 'byKey') {
      const snap = await get(dbRef(db, `${lookup.basePath}/${idWithDash}`));
      return snap.exists();
    }
    if (lookup.strategy === 'byChild') {
      const q = dbQuery(dbRef(db, lookup.basePath), orderByChild(lookup.child), equalTo(idWithDash));
      const snap = await get(q);
      return snap.exists();
    }
    return false;
    }

  const openEdit = (item: CarouselItem) => {
    setEditing(item);
    // Prime base fields
    editForm.setFieldsValue({
      head: item.head,
      description: item.description,
      link: item.link,
      rank: item.rank,
      isActive: item.isActive === 1,
      // Internal fields
      destination: undefined,
      path: item.path ?? undefined,
      intentName: item.intentName ?? undefined,
      // Show input WITHOUT leading '-' for UX
      intentValue: item.intentValue ? item.intentValue.replace(/^-+/, '') : undefined,
    });

    // Set internal controls state
    if (item.type === 'internal') {
      const d = guessDestFromItem(item);
      setDest(d);
      const cfg = DEST_MAP[d];

      // Set form to reflect dropdown defaults; keep value (minus dash) as is
      editForm.setFieldsValue({
        destination: d,
        path: cfg.path,
        intentName: cfg.needsIntent ? cfg.intentName : undefined,
      });

      // Seed intent input state without dash
      setIntentValueInput(item.intentValue ? item.intentValue.replace(/^-+/, '') : '');
      // Reset validation state
      setIntentChecking(false);
      setIntentExists(null);
      setIntentErr(null);
    } else {
      setDest(null);
      setIntentValueInput('');
    }

    setEditImage(item.image);
    setEditVisible(true);
  };

  const handleImageUpload = (file: File) => {
    setUploading(true);
    const path = `carousels/${file.name}_${Date.now()}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);
    task.on(
      'state_changed',
      snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      () => {
        message.error('Upload failed');
        setUploading(false);
      },
      async () => {
        const url = await getDownloadURL(ref);
        setEditImage(url);
        message.success('Image uploaded');
        setUploading(false);
      }
    );
    return false;
  };

  const handleRemoveImage = async () => {
    if (!editImage) return;
    try {
      const start = editImage.indexOf('/o/') + 3;
      const end = editImage.indexOf('?');
      const path = decodeURIComponent(editImage.substring(start, end));
      await deleteObject(storageRef(storage, path));
      setEditImage('');
      message.success('Image removed');
    } catch {
      message.error('Failed to remove image');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const vals = await editForm.validateFields();

    const updated: any = {
      image: editImage,
      rank: vals.rank,
      isActive: vals.isActive ? 1 : 0,
      date: editing.date,
      time: editing.time,
    };

    if (editing.type === 'direct') {
      updated.link = vals.link;
    }
    if (editing.type === 'indirect') {
      updated.head = vals.head;
      updated.description = vals.description;
    }

    // ---- Template 4 (internal) with dropdown + verification ----
    if (editing.type === 'internal') {
      const d: Destination | undefined = vals.destination;
      if (!d) {
        message.error('Please select a destination.');
        return;
      }
      const cfg = DEST_MAP[d];
      updated.path = cfg.path;

      if (cfg.needsIntent) {
        const normalized = normalizeIntent(intentValueInput);
        if (!normalized) {
          message.error('Please enter the Intent Value (ID).');
          return;
        }
        if (intentChecking) {
          message.warning('Still validating the ID. Please wait.');
          return;
        }
        if (intentExists !== true) {
          message.error('Intent ID not verified. Fix the ID before saving.');
          return;
        }
        // Save with dash, and lock intentName from dropdown
        updated.intentName = cfg.intentName!;
        updated.intentValue = normalized;
      } else {
        // Page routes: strip intents
        updated.intentName = null;
        updated.intentValue = null;
      }
    }

    await update(dbRef(db, `version12/Carousel/${editing.id}`), updated);
    message.success('Saved');
    setEditVisible(false);
  };

  const handleDelete = async (item: CarouselItem) => {
    setLoading(true);
    try {
      const start = item.image.indexOf('/o/') + 3;
      const end = item.image.indexOf('?');
      const path = decodeURIComponent(item.image.substring(start, end));
      await deleteObject(storageRef(storage, path));
    } catch {}
    await remove(dbRef(db, `version12/Carousel/${item.id}`));
    message.success('Deleted');
    setLoading(false);
  };

  const columns = [
    { title: 'Template', dataIndex: 'type', key: 'type', render: (t: keyof typeof templateMap) => templateMap[t] },
    {
      title: 'Image',
      key: 'image',
      render: (_: any, r: CarouselItem) => (
        <Button icon={<EyeOutlined />} onClick={() => showImagePreview(r.image)}>
          Preview
        </Button>
      ),
    },
    {
      title: 'Description',
      key: 'description',
      render: (_: any, r: CarouselItem) =>
        r.type === 'indirect' ? (
          <Button onClick={() => showDescription(r.description)}>View</Button>
        ) : null,
    },
    { title: 'Heading', dataIndex: 'head', key: 'head' },
    {
      title: 'Link',
      dataIndex: 'link',
      key: 'link',
      render: (l: string | undefined) => (l ? <a href={l} target="_blank" rel="noopener">Open</a> : null),
    },
    // Template 4 visibility in list
    { title: 'Path', dataIndex: 'path', key: 'path' },
    {
      title: 'Intent',
      key: 'intent',
      render: (_: any, r: CarouselItem) =>
        r.intentName && r.intentValue ? `${r.intentName}: ${r.intentValue}` : '',
    },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Time', dataIndex: 'time', key: 'time' },
    { title: 'Rank', dataIndex: 'rank', key: 'rank' },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: 1 | 0, r: CarouselItem) => (
        <Switch checked={v === 1} onChange={val => toggleActive(r, val)} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: CarouselItem) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this item?"
            onConfirm={() => handleDelete(r)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Disable Save button when internal + needsIntent and ID not verified yet
  const saveDisabled =
    editing?.type === 'internal' && derived?.needsIntent
      ? (() => {
          const v = normalizeIntent(intentValueInput);
          return !v || intentChecking || intentExists !== true;
        })()
      : false;

  return (
    <div style={{ padding: 24, background: '#fff' }}>
      <h2>Manage Carousel</h2>
      <Table rowKey="id" columns={columns as any} dataSource={items} loading={loading} />

      {/* Description Modal */}
      <Modal
        title="Description"
        open={descVisible}
        footer={null}
        onCancel={() => setDescVisible(false)}
        width={600}
      >
        <div
          dangerouslySetInnerHTML={{ __html: descContent }}
          style={{ maxHeight: '60vh', overflowY: 'auto' }}
        />
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        open={imgPreviewVisible}
        footer={null}
        onCancel={() => setImgPreviewVisible(false)}
        bodyStyle={{ textAlign: 'center' }}
      >
        <Spin spinning={previewLoading}>
          <img
            src={imgPreviewUrl}
            alt="preview"
            style={{ maxWidth: '100%' }}
            onLoad={() => setPreviewLoading(false)}
          />
        </Spin>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit Carousel Item"
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={handleSave}
        okButtonProps={{ disabled: saveDisabled }}
        width={600}
      >
        <Form form={editForm} layout="vertical">
          {editing?.type === 'indirect' && (
            <>
              <Form.Item name="head" label="Heading">
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <TextArea rows={3} />
              </Form.Item>
            </>
          )}

          {editing?.type === 'direct' && (
            <Form.Item name="link" label="Link">
              <Input />
            </Form.Item>
          )}

          {/* ---- Template 4 (internal) with dropdown, verification, read-only path/intentName ---- */}
          {editing?.type === 'internal' && (
            <>
              <Form.Item
                name="destination"
                label="Destination"
                rules={[{ required: true, message: 'Please select a destination' }]}
              >
                <Select<Destination>
                  value={dest ?? undefined}
                  onChange={(v) => {
                    setDest(v);
                    const cfg = DEST_MAP[v];
                    // Auto-fill and lock path & intentName
                    editForm.setFieldsValue({
                      path: cfg.path,
                      intentName: cfg.needsIntent ? cfg.intentName : undefined,
                      // Reset intent value on switch
                      intentValue: undefined,
                    });
                    setIntentValueInput('');
                    setIntentChecking(false);
                    setIntentExists(null);
                    setIntentErr(null);
                  }}
                  options={[
                    { value: 'event', label: DEST_MAP.event.label },
                    { value: 'question', label: DEST_MAP.question.label },
                    { value: 'eventpage', label: DEST_MAP.eventpage.label },
                    { value: 'questionpage', label: DEST_MAP.questionpage.label },
                  ]}
                />
              </Form.Item>

              {/* Read-only since dropdown controls this */}
              <Form.Item name="path" label="Android Activity Path">
                <Input disabled />
              </Form.Item>

              {derived?.needsIntent && (
                <>
                  {/* Read-only name from dropdown */}
                  <Form.Item name="intentName" label="Intent Name">
                    <Input disabled />
                  </Form.Item>

                  <Form.Item
                    name="intentValue"
                    label={
                      <>
                        Intent Value (paste the ID; <code>-</code> is added automatically){' '}
                        {intentChecking && <Tag>validating…</Tag>}
                        {!intentChecking && intentExists === true && <Tag color="green">found</Tag>}
                        {!intentChecking && intentExists === false && <Tag color="red">not found</Tag>}
                      </>
                    }
                    rules={[{ required: true, message: 'Please enter intent value (ID)' }]}
                    validateStatus={
                      intentChecking
                        ? 'validating'
                        : intentExists === false
                        ? 'error'
                        : intentExists === true
                        ? 'success'
                        : undefined
                    }
                    help={
                      intentErr
                        ? intentErr
                        : intentExists === false
                        ? 'ID not found in database.'
                        : intentExists === true
                        ? `Will use: ${normalizeIntent(intentValueInput)}`
                        : undefined
                    }
                  >
                    <Input
                      value={intentValueInput}
                      onChange={(e) => setIntentValueInput(e.target.value)}
                      placeholder="e.g., ORyn1Mu6gqa7siUEErO"
                    />
                  </Form.Item>
                </>
              )}
            </>
          )}
          {/* ------------------------------------------------------------ */}

          <Form.Item name="rank" label="Rank" rules={[{ required: true }]}>
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item name="isActive" label="Is Active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Image">
            {editImage && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img
                  src={editImage}
                  alt="edit"
                  style={{ maxWidth: '100%', borderRadius: 4 }}
                />
                <Button
                  icon={<CloseCircleOutlined />}
                  onClick={handleRemoveImage}
                  type="text"
                  danger
                  style={{ position: 'absolute', top: 8, right: 8 }}
                />
              </div>
            )}
            <Dragger
              beforeUpload={file => handleImageUpload(file as File)}
              showUploadList={false}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p>Click or drag to upload new image</p>
            </Dragger>
            {uploading && <Progress percent={uploadProgress} />}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageCarousel;


// import React, { useEffect, useState } from 'react';
// import {
//   Table,
//   Button,
//   Modal,
//   Form,
//   Input,
//   InputNumber,
//   Switch,
//   Space,
//   Popconfirm,
//   message,
//   Upload,
//   Progress,
//   Spin,
// } from 'antd';
// import {
//   EyeOutlined,
//   EditOutlined,
//   DeleteOutlined,
//   UploadOutlined,
//   CloseCircleOutlined,
// } from '@ant-design/icons';
// import { storage, db } from '../../firebaseConfig';
// import {
//   ref as dbRef,
//   onValue,
//   update,
//   remove,
// } from 'firebase/database';
// import {
//   ref as storageRef,
//   uploadBytesResumable,
//   getDownloadURL,
//   deleteObject,
// } from 'firebase/storage';

// const { TextArea } = Input;
// const { Dragger } = Upload;

// interface CarouselItem {
//   id: string;
//   image: string;
//   description: string;
//   head?: string;
//   link?: string;
//   rank: number;
//   isActive: 1 | 0;              // now numeric
//   type: 'direct' | 'indirect' | 'default';
//   date: string;
//   time: string;
// }

// const templateMap = {
//   direct: 'Template 1',
//   indirect: 'Template 2',
//   default: 'Template 3',
// };

// const ManageCarousel: React.FC = () => {
//   const [items, setItems] = useState<CarouselItem[]>([]);
//   const [loading, setLoading] = useState(true);

//   // Description modal
//   const [descVisible, setDescVisible] = useState(false);
//   const [descContent, setDescContent] = useState('');

//   // Image preview modal + spinner
//   const [imgPreviewVisible, setImgPreviewVisible] = useState(false);
//   const [imgPreviewUrl, setImgPreviewUrl] = useState('');
//   const [previewLoading, setPreviewLoading] = useState(true);

//   // Edit modal
//   const [editVisible, setEditVisible] = useState(false);
//   const [editForm] = Form.useForm();
//   const [editing, setEditing] = useState<CarouselItem | null>(null);
//   const [editImage, setEditImage] = useState('');
//   const [uploading, setUploading] = useState(false);
//   const [uploadProgress, setUploadProgress] = useState(0);

//   // Load all carousel items, sort by rank
//   useEffect(() => {
//     const ref = dbRef(db, 'version12/Carousel');
//     const unsub = onValue(ref, snap => {
//       const data = snap.val() || {};
//       const arr = Object.entries(data).map(([id, raw]: any) => ({
//         id,
//         image: raw.image,
//         description: raw.description || '',
//         head: raw.head,
//         link: raw.link,
//         rank: raw.rank,
//         isActive: raw.isActive as 1 | 0,       // assume numeric in DB
//         type: raw.type,
//         date: raw.date,
//         time: raw.time,
//       })) as CarouselItem[];
//       arr.sort((a, b) => a.rank - b.rank);
//       setItems(arr);
//       setLoading(false);
//     });
//     return unsub;
//   }, []);

//   const toggleActive = async (item: CarouselItem, val: boolean) => {
//     // store as 1 or 0
//     await update(dbRef(db, `version12/Carousel/${item.id}`), {
//       isActive: val ? 1 : 0,
//     });
//     message.success('Status updated');
//   };

//   const showDescription = (html: string) => {
//     setDescContent(html);
//     setDescVisible(true);
//   };

//   const showImagePreview = (url: string) => {
//     setPreviewLoading(true);
//     setImgPreviewUrl(url);
//     setImgPreviewVisible(true);
//   };

//   const openEdit = (item: CarouselItem) => {
//     setEditing(item);
//     editForm.setFieldsValue({
//       head: item.head,
//       description: item.description,
//       link: item.link,
//       rank: item.rank,
//       isActive: item.isActive === 1,       // convert to boolean for Switch
//     });
//     setEditImage(item.image);
//     setEditVisible(true);
//   };

//   const handleImageUpload = (file: File) => {
//     setUploading(true);
//     const path = `carousels/${file.name}_${Date.now()}`;
//     const ref = storageRef(storage, path);
//     const task = uploadBytesResumable(ref, file);
//     task.on(
//       'state_changed',
//       snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
//       () => {
//         message.error('Upload failed');
//         setUploading(false);
//       },
//       async () => {
//         const url = await getDownloadURL(ref);
//         setEditImage(url);
//         message.success('Image uploaded');
//         setUploading(false);
//       }
//     );
//     return false;
//   };

//   const handleRemoveImage = async () => {
//     if (!editImage) return;
//     try {
//       const start = editImage.indexOf('/o/') + 3;
//       const end = editImage.indexOf('?');
//       const path = decodeURIComponent(editImage.substring(start, end));
//       await deleteObject(storageRef(storage, path));
//       setEditImage('');
//       message.success('Image removed');
//     } catch {
//       message.error('Failed to remove image');
//     }
//   };

//   const handleSave = async () => {
//     if (!editing) return;
//     const vals = await editForm.validateFields();
//     const updated: any = {
//       image: editImage,
//       rank: vals.rank,
//       isActive: vals.isActive ? 1 : 0,     // boolean → numeric
//       date: editing.date,
//       time: editing.time,
//     };
//     if (editing.type === 'direct') {
//       updated.link = vals.link;
//     }
//     if (editing.type === 'indirect') {
//       updated.head = vals.head;
//       updated.description = vals.description;
//     }
//     await update(dbRef(db, `version12/Carousel/${editing.id}`), updated);
//     message.success('Saved');
//     setEditVisible(false);
//   };

//   const handleDelete = async (item: CarouselItem) => {
//     setLoading(true);
//     try {
//       const start = item.image.indexOf('/o/') + 3;
//       const end = item.image.indexOf('?');
//       const path = decodeURIComponent(item.image.substring(start, end));
//       await deleteObject(storageRef(storage, path));
//     } catch {}
//     await remove(dbRef(db, `version12/Carousel/${item.id}`));
//     message.success('Deleted');
//     setLoading(false);
//   };

//   const columns = [
//     { title: 'Template', dataIndex: 'type', key: 'type', render: (t: keyof typeof templateMap) => templateMap[t] },
//     {
//       title: 'Image',
//       key: 'image',
//       render: (_: any, r: CarouselItem) => (
//         <Button icon={<EyeOutlined />} onClick={() => showImagePreview(r.image)}>
//           Preview
//         </Button>
//       ),
//     },
//     {
//       title: 'Description',
//       key: 'description',
//       render: (_: any, r: CarouselItem) =>
//         r.type === 'indirect' ? (
//           <Button onClick={() => showDescription(r.description)}>View</Button>
//         ) : null,
//     },
//     { title: 'Heading', dataIndex: 'head', key: 'head' },
//     {
//       title: 'Link',
//       dataIndex: 'link',
//       key: 'link',
//       render: (l: string | undefined) => (l ? <a href={l} target="_blank" rel="noopener">Open</a> : null),
//     },
//     { title: 'Date', dataIndex: 'date', key: 'date' },
//     { title: 'Time', dataIndex: 'time', key: 'time' },
//     { title: 'Rank', dataIndex: 'rank', key: 'rank' },
//     {
//       title: 'Active',
//       dataIndex: 'isActive',
//       key: 'isActive',
//       render: (v: 1 | 0, r: CarouselItem) => (
//         <Switch checked={v === 1} onChange={val => toggleActive(r, val)} />
//       ),
//     },
//     {
//       title: 'Actions',
//       key: 'actions',
//       render: (_: any, r: CarouselItem) => (
//         <Space>
//           <Button icon={<EditOutlined />} onClick={() => openEdit(r)}>
//             Edit
//           </Button>
//           <Popconfirm
//             title="Delete this item?"
//             onConfirm={() => handleDelete(r)}
//             okText="Yes"
//             cancelText="No"
//           >
//             <Button danger icon={<DeleteOutlined />} />
//           </Popconfirm>
//         </Space>
//       ),
//     },
//   ];

//   return (
//     <div style={{ padding: 24, background: '#fff' }}>
//       <h2>Manage Carousel</h2>
//       <Table rowKey="id" columns={columns} dataSource={items} loading={loading} />

//       {/* Description Modal */}
//       <Modal
//         title="Description"
//         open={descVisible}
//         footer={null}
//         onCancel={() => setDescVisible(false)}
//         width={600}
//       >
//         <div
//           dangerouslySetInnerHTML={{ __html: descContent }}
//           style={{ maxHeight: '60vh', overflowY: 'auto' }}
//         />
//       </Modal>

//       {/* Image Preview Modal */}
//       <Modal
//         open={imgPreviewVisible}
//         footer={null}
//         onCancel={() => setImgPreviewVisible(false)}
//         bodyStyle={{ textAlign: 'center' }}
//       >
//         <Spin spinning={previewLoading}>
//           <img
//             src={imgPreviewUrl}
//             alt="preview"
//             style={{ maxWidth: '100%' }}
//             onLoad={() => setPreviewLoading(false)}
//           />
//         </Spin>
//       </Modal>

//       {/* Edit Modal */}
//       <Modal
//         title="Edit Carousel Item"
//         open={editVisible}
//         onCancel={() => setEditVisible(false)}
//         onOk={handleSave}
//         width={600}
//       >
//         <Form form={editForm} layout="vertical">
//           {editing?.type === 'indirect' && (
//             <>
//               <Form.Item name="head" label="Heading">
//                 <Input />
//               </Form.Item>
//               <Form.Item name="description" label="Description">
//                 <TextArea rows={3} />
//               </Form.Item>
//             </>
//           )}
//           {editing?.type === 'direct' && (
//             <Form.Item name="link" label="Link">
//               <Input />
//             </Form.Item>
//           )}
//           <Form.Item name="rank" label="Rank" rules={[{ required: true }]}>
//             <InputNumber min={1} />
//           </Form.Item>
//           <Form.Item name="isActive" label="Is Active" valuePropName="checked">
//             <Switch />
//           </Form.Item>

//           <Form.Item label="Image">
//             {editImage && (
//               <div style={{ position: 'relative', marginBottom: 8 }}>
//                 <img
//                   src={editImage}
//                   alt="edit"
//                   style={{ maxWidth: '100%', borderRadius: 4 }}
//                 />
//                 <Button
//                   icon={<CloseCircleOutlined />}
//                   onClick={handleRemoveImage}
//                   type="text"
//                   danger
//                   style={{ position: 'absolute', top: 8, right: 8 }}
//                 />
//               </div>
//             )}
//             <Dragger
//               beforeUpload={file => handleImageUpload(file as File)}
//               showUploadList={false}
//               disabled={uploading}
//             >
//               <p className="ant-upload-drag-icon">
//                 <UploadOutlined />
//               </p>
//               <p>Click or drag to upload new image</p>
//             </Dragger>
//             {uploading && <Progress percent={uploadProgress} />}
//           </Form.Item>
//         </Form>
//       </Modal>
//     </div>
//   );
// };

// export default ManageCarousel;


