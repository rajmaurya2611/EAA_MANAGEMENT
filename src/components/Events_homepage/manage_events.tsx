import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Space,
  Popconfirm,
  message,
  Upload,
  Progress,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LeftOutlined,
  RightOutlined,
  UploadOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import moment, { Moment } from 'moment';
import CryptoJS from 'crypto-js';
import { storage, db } from '../../firebaseConfig';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { ref as dbRef, onValue, remove, update } from 'firebase/database';

const { TextArea } = Input;
const AES_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

interface Banner {
  url: string;
  path: string; // storage fullPath (events/...)
  ref: any;     // StorageReference
}

interface EventData {
  id: string;
  title: string;
  description: string;
  organizer: string;
  location: string;
  date: string;        // 'DD-MM-YYYY'
  type: string;
  applyLink: string;
  banners: Banner[];
  createdAt: string;   // 'YYYY-MM-DD HH:mm:ss' in IST
}

const decryptAES = (cipher: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_KEY);
    return CryptoJS.AES.decrypt(cipher, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  } catch {
    return cipher;
  }
};

const encryptAES = (plain: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_KEY);
    return CryptoJS.AES.encrypt(plain, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plain;
  }
};

const ManageEvents: React.FC = () => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterLocation, setFilterLocation]   = useState('');
  const [filterType, setFilterType]           = useState('');
  const [filterOrganizer, setFilterOrganizer] = useState('');
  const [filterDate, setFilterDate]           = useState<Moment | null>(null);

  // Preview modal
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrls, setPreviewUrls]       = useState<string[]>([]);
  const [previewIndex, setPreviewIndex]     = useState(0);

  // Description modal
  const [descModalVisible, setDescModalVisible] = useState(false);
  const [descModalContent, setDescModalContent] = useState('');

  // Edit modal
  const [editVisible, setEditVisible]         = useState(false);
  const [editForm]                            = Form.useForm();
  const [editing, setEditing]                 = useState<EventData | null>(null);
  const [editBanners, setEditBanners]         = useState<Banner[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingIndex, setUploadingIndex]   = useState(0);
  const [uploadProgress, setUploadProgress]   = useState(0);
  const [uploading, setUploading]             = useState(false);
 // Lock a single ✕ while deleting (prevents double-click races)
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);

  // Load & decrypt events (assumes new records have bannerPaths)
  useEffect(() => {
    const refEvents = dbRef(db, 'version12/Events');
    const unsub = onValue(refEvents, snap => {
      const data = snap.val() || {};
      const list: EventData[] = Object.entries(data).map(([id, raw]: any) => {
        const decUrls  = Array.isArray(raw.bannerUrls)  ? raw.bannerUrls.map((enc: string)  => decryptAES(enc)) : [];
        const decPaths = Array.isArray(raw.bannerPaths) ? raw.bannerPaths.map((enc: string) => decryptAES(enc)) : [];

        // Index-align url + path
        const banners: Banner[] = decUrls.map((url: string, i: number) => {
          const path = decPaths[i]; // assume same length/order for new data
          const ref  = storageRef(storage, path);
          return { url, path, ref };
        });

        return {
          id,
          title: decryptAES(raw.title),
          description: decryptAES(raw.description),
          organizer: decryptAES(raw.organizer),
          location: decryptAES(raw.location),
          date: decryptAES(raw.date),
          type: decryptAES(raw.type),
          applyLink: decryptAES(raw.applyLink),
          banners,
          createdAt: decryptAES(raw.createdAt || '')
        };
      });

      // Sort by createdAt descending (newest first)
      list.sort((a, b) =>
        moment(b.createdAt, 'YYYY-MM-DD HH:mm:ss').valueOf() -
        moment(a.createdAt, 'YYYY-MM-DD HH:mm:ss').valueOf()
      );

      setEvents(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  //Override CSS
  const isPast = (record: any) =>
  moment(record.date, 'DD-MM-YYYY').isBefore(moment(), 'day');

  // STRICT + DIAGNOSTICS: delete DB only if ALL storage deletions succeed
const handleDelete = async (ev: EventData) => {
  setLoading(true);
  try {
    // 1) Try deleting all blobs
    const results = await Promise.allSettled(
      ev.banners.map(b => deleteObject(b.ref))
    );

    // 2) Collect rejections
    const rejected = results
      .map((r, i) => ({ r, i }))
      .filter(x => x.r.status === 'rejected') as {
        r: PromiseRejectedResult;
        i: number;
      }[];

    // 3) Treat "object-not-found" as success; everything else is a hard fail
    const hardFails = rejected.filter(x => x.r.reason?.code !== 'storage/object-not-found');

    if (hardFails.length > 0) {
      message.error(`Failed to delete ${hardFails.length}/${ev.banners.length} banner(s). Event NOT removed.`);
      // Diagnostics to console: which indices/paths failed and why
      console.error(
        'Banner deletions failed:',
        hardFails.map(({ i, r }) => ({
          index: i,
          path: ev.banners[i]?.path,
          code: r.reason?.code,
          reason: r.reason,
        }))
      );
      return; // STRICT: stop here; do NOT delete DB
    }

    // 4) All good -> remove DB row
    await remove(dbRef(db, `version12/Events/${ev.id}`));
    message.success('Event deleted');
  } catch (err) {
    console.error('Delete failed:', err);
    message.error('Unexpected error during delete. Event NOT removed.');
  } finally {
    setLoading(false);
  }
};


  // Preview images
  const showPreview = (banners: Banner[]) => {
    setPreviewUrls(banners.map(b => b.url));
    setPreviewIndex(0);
    setPreviewVisible(true);
  };

  // Description modal
  const showDescModal = (full: string) => {
    setDescModalContent(full);
    setDescModalVisible(true);
  };

  // Upload in edit (adds new banner with path)
  const startImageUpload = (idx: number, file: File) => {
    setUploading(true);
    const path = `events/${file.name}_${Date.now()}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);

    task.on(
      'state_changed',
      snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      () => { message.error('Upload failed'); setUploading(false); },
      async () => {
        const url = await getDownloadURL(ref);
        // IMPORTANT: capture fullPath for deletion later from Manage UI
        setEditBanners(prev => [...prev, { url, path: ref.fullPath, ref }]);
        message.success(`Image #${idx+1} uploaded`);
        setUploading(false);
        setShowUploadModal(false);
      }
    );
    return false;
  };

const sleep = (ms:number) => new Promise (res => setTimeout(res,ms));

async function deleteWithRetry(ref: any, maxTries = 3): Promise<
  { ok: true; alreadyMissing?: boolean } | { ok: false; code?: string; err?: unknown }
> {
  const backoff = [250, 600, 1200]; // ms
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      await deleteObject(ref);
      return { ok: true };
    } catch (e: any) {
      if (e?.code === 'storage/object-not-found') {
        return { ok: true, alreadyMissing: true }; // fine: already gone
      }
      if (attempt === maxTries - 1) {
        return { ok: false, code: e?.code, err: e };
      }
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
    }
  }
  return { ok: false, code: 'unknown' };
}

  // STRICT per-banner delete in Edit modal
const removeEditBanner = async (i: number) => {
  const b = editBanners[i];
  if (!b || !b.ref) {
    message.error('Invalid banner reference. Not removed.');
    return;
  }

  setRemovingIdx(i);
  try {
    const res = await deleteWithRetry(b.ref);
    if (res.ok) {
      setEditBanners(prev => prev.filter((_, idx) => idx !== i));
      res.alreadyMissing
        ? message.warning('Banner already missing in storage. Cleaned up the record.')
        : message.success('Banner removed');
    } else {
      console.error('Banner delete failed', { index: i, path: b.path, code: res.code, err: res.err });
      message.error('Failed to delete banner from storage. Not removed.');
      // keep in state -> prevents DB/Storage drift
    }
  } finally {
    setRemovingIdx(null);
  }
};


  // Open edit, pre-fill including createdAt
  const openEdit = (ev: EventData) => {
    setEditing(ev);
    editForm.setFieldsValue({
      title: ev.title,
      description: ev.description,
      organizer: ev.organizer,
      location: ev.location,
      date: moment(ev.date, 'DD-MM-YYYY'),
      type: ev.type,
      applyLink: ev.applyLink,
      createdAt: ev.createdAt,  // display only
    });
    setEditBanners(ev.banners); // already normalized with url + path + ref
    setEditVisible(true);
  };

  // Save edits (overwrite both bannerUrls & bannerPaths)
  const handleEditSave = async () => {
    if (!editing) return;
    const vals = await editForm.validateFields();
    const nowIst = moment().utcOffset('+05:30').format('YYYY-MM-DD HH:mm:ss');
    const encryptedCreatedAt = encryptAES(nowIst);

    const data = {
      title: encryptAES(vals.title),
      description: encryptAES(vals.description),
      organizer: encryptAES(vals.organizer),
      location: encryptAES(vals.location),
      date: encryptAES(vals.date.format('DD-MM-YYYY')),
      type: encryptAES(vals.type),
      applyLink: encryptAES(vals.applyLink),
      bannerUrls: editBanners.map(b => encryptAES(b.url)),
      bannerPaths: editBanners.map(b => encryptAES(b.path)),
      createdAt: encryptedCreatedAt,
    };

    try {
      await update(dbRef(db, `version12/Events/${editing.id}`), data);
      message.success('Event updated');
      setEditVisible(false);
    } catch {
      message.error('Update failed');
    }
  };

  // Apply filters
  const filtered = events.filter(e => {
    if (filterLocation   && !e.location.toLowerCase().includes(filterLocation.toLowerCase()))   return false;
    if (filterType       && !e.type.toLowerCase().includes(filterType.toLowerCase()))           return false;
    if (filterOrganizer  && !e.organizer.toLowerCase().includes(filterOrganizer.toLowerCase())) return false;
    if (filterDate       && e.date !== filterDate.format('DD-MM-YYYY'))                         return false;
    return true;
  });

  const columns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => {
        const words = text.split(/\s+/);
        const isLong = words.length > 20;
        const display = isLong ? words.slice(0,20).join(' ') + '...' : text;
        return (
          <>
            {display}
            {isLong && (
              <a style={{ marginLeft: 8, color:'blue'}} onClick={() => showDescModal(text)}>
                Read more
              </a>
            )}
          </>
        );
      },
    },
    { title: 'Organizer', dataIndex: 'organizer', key: 'organizer' },
    { title: 'Location',  dataIndex: 'location',  key: 'location' },
    { title: 'Date',      dataIndex: 'date',      key: 'date' },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (ts: string) =>
        moment(ts, 'YYYY-MM-DD HH:mm:ss').format('DD-MM-YYYY HH:mm:ss'),
    },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Apply Link',
      dataIndex: 'applyLink',
      key: 'applyLink',
      render: (link: string) => (
        <Button type="link" onClick={() => window.open(link, '_blank')}>
          Open Link
        </Button>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, ev: EventData) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => showPreview(ev.banners)} />
          <Button icon={<EditOutlined />} onClick={() => openEdit(ev)} />
          <Popconfirm
            title="Delete this event?"
            onConfirm={() => handleDelete(ev)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#fff' }}>
      <h2>Manage Events</h2>

      {/* Filters */}
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Filter by Location"
          value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
          style={{ width: 160 }} allowClear
        />
        <Input
          placeholder="Filter by Type"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ width: 160 }} allowClear
        />
        <DatePicker
          placeholder="Filter by Date"
          format="DD-MM-YYYY"
          value={filterDate}
          onChange={setFilterDate}
          allowClear
          style={{ width: 160 }}
        />
        <Input
          placeholder="Filter by Organizer"
          value={filterOrganizer}
          onChange={e => setFilterOrganizer(e.target.value)}
          style={{ width: 160 }} allowClear
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        rowClassName={(record) =>(isPast(record)?'past-row': '')}
      />

      {/* Preview Modal */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
      >
        <div style={{ textAlign: 'center' }}>
          <img
            src={previewUrls[previewIndex]}
            alt="banner"
            style={{ maxWidth: '100%' }}
          />
        {previewUrls.length > 1 && (
            <Space style={{ marginTop: 12 }}>
              <Button
                icon={<LeftOutlined />}
                onClick={() =>
                  setPreviewIndex(i => (i === 0 ? previewUrls.length-1 : i-1))
                }
              />
              <Button
                icon={<RightOutlined />}
                onClick={() =>
                  setPreviewIndex(i => (i+1) % previewUrls.length)
                }
              />
            </Space>
          )}
        </div>
      </Modal>

      {/* Description Modal */}
      <Modal
        title="Description"
        open={descModalVisible}
        footer={null}
        onCancel={() => setDescModalVisible(false)}
      >
        <p>{descModalContent}</p>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit Event"
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={handleEditSave}
        width={700}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item name="organizer" label="Organizer" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="location" label="Location" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="createdAt" label="Created At">
            <Input disabled />
          </Form.Item>

          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="applyLink" label="Apply Link" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          {/* Banner Images */}
          <Form.Item label="Banner Images">
            {editBanners.map((b, idx) => (
              <div key={idx} style={{ marginBottom: 8, position: 'relative' }}>
                <img
                  src={b.url}
                  alt={`banner-${idx}`}
                  style={{ maxWidth: '100%', borderRadius: 4 }}
                />
                <Button
  icon={<CloseCircleOutlined />}
  onClick={() => removeEditBanner(idx)}
  type="text"
  danger
  disabled={removingIdx === idx}
  loading={removingIdx === idx}
  style={{ position: 'absolute', top: 8, right: 8 }}
/>

              </div>
            ))}
            <Button
              icon={<UploadOutlined />}
              onClick={() => {
                setUploadingIndex(editBanners.length);
                setShowUploadModal(true);
              }}
            >
              {`Add Banner Image #${editBanners.length + 1}`}
            </Button>
          </Form.Item>
        </Form>

        {/* Upload Modal */}
        <Modal
          title={`Upload Image #${uploadingIndex + 1}`}
          open={showUploadModal}
          footer={null}
          onCancel={() => setShowUploadModal(false)}
          destroyOnClose
        >
          <Upload.Dragger
            beforeUpload={(file: any) =>
              startImageUpload(uploadingIndex, file as File)
            }
            showUploadList={false}
            disabled={uploading}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p>Click or drag to upload</p>
          </Upload.Dragger>
          {uploading && <Progress percent={uploadProgress} />}
        </Modal>
      </Modal>
    </div>
  );
};

export default ManageEvents;


// import React, { useEffect, useState } from 'react';
// import {
//   Table,
//   Button,
//   Modal,
//   Form,
//   Input,
//   DatePicker,
//   Space,
//   Popconfirm,
//   message,
//   Upload,
//   Progress,
// } from 'antd';
// import {
//   DeleteOutlined,
//   EditOutlined,
//   EyeOutlined,
//   LeftOutlined,
//   RightOutlined,
//   UploadOutlined,
//   CloseCircleOutlined,
// } from '@ant-design/icons';
// import moment, { Moment } from 'moment';
// import CryptoJS from 'crypto-js';
// import { storage, db } from '../../firebaseConfig';
// import {
//   ref as storageRef,
//   uploadBytesResumable,
//   getDownloadURL,
//   deleteObject,
// } from 'firebase/storage';
// import { ref as dbRef, onValue, remove, update } from 'firebase/database';

// const { TextArea } = Input;
// const AES_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// interface Banner {
//   url: string;
//   ref: any;
// }

// interface EventData {
//   id: string;
//   title: string;
//   description: string;
//   organizer: string;
//   location: string;
//   date: string;        // 'DD-MM-YYYY'
//   type: string;
//   applyLink: string;
//   banners: Banner[];
//   createdAt: string;   // 'YYYY-MM-DD HH:mm:ss' in IST
// }

// const decryptAES = (cipher: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(AES_KEY);
//     return CryptoJS.AES.decrypt(cipher, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     }).toString(CryptoJS.enc.Utf8);
//   } catch {
//     return cipher;
//   }
// };

// const encryptAES = (plain: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(AES_KEY);
//     return CryptoJS.AES.encrypt(plain, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     }).toString();
//   } catch {
//     return plain;
//   }
// };

// const ManageEvents: React.FC = () => {
//   const [events, setEvents] = useState<EventData[]>([]);
//   const [loading, setLoading] = useState(true);

//   // Filters
//   const [filterLocation, setFilterLocation]   = useState('');
//   const [filterType, setFilterType]           = useState('');
//   const [filterOrganizer, setFilterOrganizer] = useState('');
//   const [filterDate, setFilterDate]           = useState<Moment | null>(null);

//   // Preview modal
//   const [previewVisible, setPreviewVisible] = useState(false);
//   const [previewUrls, setPreviewUrls]       = useState<string[]>([]);
//   const [previewIndex, setPreviewIndex]     = useState(0);

//   // Description modal
//   const [descModalVisible, setDescModalVisible] = useState(false);
//   const [descModalContent, setDescModalContent] = useState('');

//   // Edit modal
//   const [editVisible, setEditVisible]         = useState(false);
//   const [editForm]                            = Form.useForm();
//   const [editing, setEditing]                 = useState<EventData | null>(null);
//   const [editBanners, setEditBanners]         = useState<Banner[]>([]);
//   const [showUploadModal, setShowUploadModal] = useState(false);
//   const [uploadingIndex, setUploadingIndex]   = useState(0);
//   const [uploadProgress, setUploadProgress]   = useState(0);
//   const [uploading, setUploading]             = useState(false);

//   // Load & decrypt events
//   useEffect(() => {
//     const refEvents = dbRef(db, 'version12/Events');
//     const unsub = onValue(refEvents, snap => {
//       const data = snap.val() || {};
//       const list: EventData[] = Object.entries(data).map(([id, raw]: any) => {
//         const banners: Banner[] = (raw.bannerUrls || []).map((enc: string) => {
//           const url = decryptAES(enc);
//           const start = url.indexOf('/o/') + 3;
//           const end = url.indexOf('?');
//           const path = decodeURIComponent(url.substring(start, end));
//           return { url, ref: storageRef(storage, path) };
//         });
//         return {
//           id,
//           title: decryptAES(raw.title),
//           description: decryptAES(raw.description),
//           organizer: decryptAES(raw.organizer),
//           location: decryptAES(raw.location),
//           date: decryptAES(raw.date),
//           type: decryptAES(raw.type),
//           applyLink: decryptAES(raw.applyLink),
//           banners,
//           createdAt: decryptAES(raw.createdAt || '')
//         };
//       });

//       // Sort by createdAt descending (newest first)
//       list.sort((a, b) =>
//         moment(b.createdAt, 'YYYY-MM-DD HH:mm:ss').valueOf() -
//         moment(a.createdAt, 'YYYY-MM-DD HH:mm:ss').valueOf()
//       );

//       setEvents(list);
//       setLoading(false);
//     });
//     return unsub;
//   }, []);

//   // Delete event + its images
//   const handleDelete = async (ev: EventData) => {
//     setLoading(true);
//     try { await Promise.all(ev.banners.map(b => deleteObject(b.ref))); } catch {}
//     await remove(dbRef(db, `version12/Events/${ev.id}`));
//     message.success('Event deleted');
//     setLoading(false);
//   };

//   // Preview images
//   const showPreview = (banners: Banner[]) => {
//     setPreviewUrls(banners.map(b => b.url));
//     setPreviewIndex(0);
//     setPreviewVisible(true);
//   };

//   // Description modal
//   const showDescModal = (full: string) => {
//     setDescModalContent(full);
//     setDescModalVisible(true);
//   };

//   // Upload in edit
//   const startImageUpload = (idx: number, file: File) => {
//     setUploading(true);
//     const path = `events/${file.name}_${Date.now()}`;
//     const ref = storageRef(storage, path);
//     const task = uploadBytesResumable(ref, file);
//     task.on(
//       'state_changed',
//       snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
//       () => { message.error('Upload failed'); setUploading(false); },
//       async () => {
//         const url = await getDownloadURL(ref);
//         setEditBanners(prev => [...prev, { url, ref }]);
//         message.success(`Image #${idx+1} uploaded`);
//         setUploading(false);
//         setShowUploadModal(false);
//       }
//     );
//     return false;
//   };
//   const removeEditBanner = async (i: number) => {
//     const b = editBanners[i];
//     try { await deleteObject(b.ref); } catch {}
//     setEditBanners(prev => prev.filter((_, idx) => idx !== i));
//   };

//   // Open edit, pre-fill including createdAt
//   const openEdit = (ev: EventData) => {
//     setEditing(ev);
//     editForm.setFieldsValue({
//       title: ev.title,
//       description: ev.description,
//       organizer: ev.organizer,
//       location: ev.location,
//       date: moment(ev.date, 'DD-MM-YYYY'),
//       type: ev.type,
//       applyLink: ev.applyLink,
//       createdAt: ev.createdAt,  // show here
//     });
//     setEditBanners(ev.banners);
//     setEditVisible(true);
//   };

//   // Save edits (update createdAt)
//   const handleEditSave = async () => {
//     if (!editing) return;
//     const vals = await editForm.validateFields();
//     const nowIst = moment().utcOffset('+05:30').format('YYYY-MM-DD HH:mm:ss');
//     const encryptedCreatedAt = encryptAES(nowIst);
//     const data = {
//       title: encryptAES(vals.title),
//       description: encryptAES(vals.description),
//       organizer: encryptAES(vals.organizer),
//       location: encryptAES(vals.location),
//       date: encryptAES(vals.date.format('DD-MM-YYYY')),
//       type: encryptAES(vals.type),
//       applyLink: encryptAES(vals.applyLink),
//       bannerUrls: editBanners.map(b => encryptAES(b.url)),
//       createdAt: encryptedCreatedAt,
//     };
//     try {
//       await update(dbRef(db, `version12/Events/${editing.id}`), data);
//       message.success('Event updated');
//       setEditVisible(false);
//     } catch {
//       message.error('Update failed');
//     }
//   };

//   // Apply filters
//   const filtered = events.filter(e => {
//     if (filterLocation   && !e.location.toLowerCase().includes(filterLocation.toLowerCase()))   return false;
//     if (filterType       && !e.type.toLowerCase().includes(filterType.toLowerCase()))           return false;
//     if (filterOrganizer  && !e.organizer.toLowerCase().includes(filterOrganizer.toLowerCase())) return false;
//     if (filterDate       && e.date !== filterDate.format('DD-MM-YYYY'))                         return false;
//     return true;
//   });

//   const columns = [
//     { title: 'Title', dataIndex: 'title', key: 'title' },
//     {
//       title: 'Description',
//       dataIndex: 'description',
//       key: 'description',
//       render: (text: string) => {
//         const words = text.split(/\s+/);
//         const isLong = words.length > 20;
//         const display = isLong
//           ? words.slice(0,20).join(' ') + '...'
//           : text;
//         return (
//           <>
//             {display}
//             {isLong && (
//               <a style={{ marginLeft: 8, color:'blue'}} onClick={() => showDescModal(text)}>
//                 Read more
//               </a>
//             )}
//           </>
//         );
//       },
//     },
//     { title: 'Organizer', dataIndex: 'organizer', key: 'organizer' },
//     { title: 'Location',  dataIndex: 'location',  key: 'location' },
//     { title: 'Date',      dataIndex: 'date',      key: 'date' },
//     {
//       title: 'Created At',
//       dataIndex: 'createdAt',
//       key: 'createdAt',
//       render: (ts: string) =>
//         moment(ts, 'YYYY-MM-DD HH:mm:ss').format('DD-MM-YYYY HH:mm:ss'),
//     },
//     { title: 'Type', dataIndex: 'type', key: 'type' },
//     {
//       title: 'Apply Link',
//       dataIndex: 'applyLink',
//       key: 'applyLink',
//       render: (link: string) => (
//         <Button type="link" onClick={() => window.open(link, '_blank')}>
//           Open Link
//         </Button>
//       ),
//     },
//     {
//       title: 'Actions',
//       key: 'actions',
//       render: (_: any, ev: EventData) => (
//         <Space>
//           <Button icon={<EyeOutlined />} onClick={() => showPreview(ev.banners)}>
//           </Button>
//           <Button icon={<EditOutlined />} onClick={() => openEdit(ev)}>
//           </Button>
//           <Popconfirm
//             title="Delete this event?"
//             onConfirm={() => handleDelete(ev)}
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
//       <h2>Manage Events</h2>

//       {/* Filters */}
//       <Space style={{ marginBottom: 16 }}>
//         <Input
//           placeholder="Filter by Location"
//           value={filterLocation}
//           onChange={e => setFilterLocation(e.target.value)}
//           style={{ width: 160 }} allowClear
//         />
//         <Input
//           placeholder="Filter by Type"
//           value={filterType}
//           onChange={e => setFilterType(e.target.value)}
//           style={{ width: 160 }} allowClear
//         />
//         <DatePicker
//           placeholder="Filter by Date"
//           format="DD-MM-YYYY"
//           value={filterDate}
//           onChange={setFilterDate}
//           allowClear
//           style={{ width: 160 }}
//         />
//         <Input
//           placeholder="Filter by Organizer"
//           value={filterOrganizer}
//           onChange={e => setFilterOrganizer(e.target.value)}
//           style={{ width: 160 }} allowClear
//         />
//       </Space>

//       <Table
//         rowKey="id"
//         columns={columns}
//         dataSource={filtered}
//         loading={loading}
//         // grey‑out past events
//         onRow={record => ({
//           style: moment(record.date, 'DD-MM-YYYY').isBefore(moment(), 'day')
//             ? { backgroundColor: '#f0f0f0' }
//             : {},
//         })}
//       />

//       {/* Preview Modal */}
//       <Modal
//         open={previewVisible}
//         footer={null}
//         onCancel={() => setPreviewVisible(false)}
//       >
//         <div style={{ textAlign: 'center' }}>
//           <img
//             src={previewUrls[previewIndex]}
//             alt="banner"
//             style={{ maxWidth: '100%' }}
//           />
//           {previewUrls.length > 1 && (
//             <Space style={{ marginTop: 12 }}>
//               <Button
//                 icon={<LeftOutlined />}
//                 onClick={() =>
//                   setPreviewIndex(i => (i === 0 ? previewUrls.length-1 : i-1))
//                 }
//               />
//               <Button
//                 icon={<RightOutlined />}
//                 onClick={() =>
//                   setPreviewIndex(i => (i+1) % previewUrls.length)
//                 }
//               />
//             </Space>
//           )}
//         </div>
//       </Modal>

//       {/* Description Modal */}
//       <Modal
//         title="Description"
//         open={descModalVisible}
//         footer={null}
//         onCancel={() => setDescModalVisible(false)}
//       >
//         <p>{descModalContent}</p>
//       </Modal>

//       {/* Edit Modal */}
//       <Modal
//         title="Edit Event"
//         open={editVisible}
//         onCancel={() => setEditVisible(false)}
//         onOk={handleEditSave}
//         width={700}
//       >
//         <Form form={editForm} layout="vertical">
//           <Form.Item name="title" label="Title" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>

//           <Form.Item name="description" label="Description" rules={[{ required: true }]}>
//             <TextArea rows={3} />
//           </Form.Item>

//           <Form.Item name="organizer" label="Organizer" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>

//           <Form.Item name="location" label="Location" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>

//           <Form.Item name="date" label="Date" rules={[{ required: true }]}>
//             <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
//           </Form.Item>

//           <Form.Item name="createdAt" label="Created At">
//             <Input disabled />
//           </Form.Item>

//           <Form.Item name="type" label="Type" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>

//           <Form.Item name="applyLink" label="Apply Link" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>

//           {/* Banner Images */}
//           <Form.Item label="Banner Images">
//             {editBanners.map((b, idx) => (
//               <div key={idx} style={{ marginBottom: 8, position: 'relative' }}>
//                 <img
//                   src={b.url}
//                   alt={`banner-${idx}`}
//                   style={{ maxWidth: '100%', borderRadius: 4 }}
//                 />
//                 <Button
//                   icon={<CloseCircleOutlined />}
//                   onClick={() => removeEditBanner(idx)}
//                   type="text"
//                   danger
//                   style={{ position: 'absolute', top: 8, right: 8 }}
//                 />
//               </div>
//             ))}
//             <Button
//               icon={<UploadOutlined />}
//               onClick={() => {
//                 setUploadingIndex(editBanners.length);
//                 setShowUploadModal(true);
//               }}
//             >
//               {`Add Banner Image #${editBanners.length + 1}`}
//             </Button>
//           </Form.Item>
//         </Form>

//         {/* Upload Modal */}
//         <Modal
//           title={`Upload Image #${uploadingIndex + 1}`}
//           open={showUploadModal}
//           footer={null}
//           onCancel={() => setShowUploadModal(false)}
//           destroyOnClose
//         >
//           <Upload.Dragger
//             beforeUpload={(file: any) =>
//               startImageUpload(uploadingIndex, file as File)
//             }
//             showUploadList={false}
//             disabled={uploading}
//           >
//             <p className="ant-upload-drag-icon">
//               <UploadOutlined />
//             </p>
//             <p>Click or drag to upload</p>
//           </Upload.Dragger>
//           {uploading && <Progress percent={uploadProgress} />}
//         </Modal>
//       </Modal>
//     </div>
//   );
// };

// export default ManageEvents;
