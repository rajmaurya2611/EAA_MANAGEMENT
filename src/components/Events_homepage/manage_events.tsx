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
  ref: any;
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

  // Filter state
  const [filterLocation, setFilterLocation]   = useState<string>('');
  const [filterType, setFilterType]           = useState<string>('');
  const [filterOrganizer, setFilterOrganizer] = useState<string>('');
  const [filterDate, setFilterDate]           = useState<Moment | null>(null);

  // Preview modal
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrls, setPreviewUrls]       = useState<string[]>([]);
  const [previewIndex, setPreviewIndex]     = useState(0);

  // Edit modal
  const [editVisible, setEditVisible]       = useState(false);
  const [editForm]                          = Form.useForm();
  const [editing, setEditing]               = useState<EventData | null>(null);
  const [editBanners, setEditBanners]       = useState<Banner[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading]           = useState(false);

  // Load events
  useEffect(() => {
    const refEvents = dbRef(db, 'version12/Events');
    const unsub = onValue(refEvents, snap => {
      const data = snap.val() || {};
      const list: EventData[] = Object.entries(data).map(([id, raw]: any) => {
        const banners: Banner[] = (raw.bannerUrls || []).map((enc: string) => {
          const url = decryptAES(enc);
          const start = url.indexOf('/o/') + 3;
          const end = url.indexOf('?');
          const path = decodeURIComponent(url.substring(start, end));
          const ref = storageRef(storage, path);
          return { url, ref };
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
        };
      });
      setEvents(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Delete event + its images
  const handleDelete = async (ev: EventData) => {
    setLoading(true);
    try {
      await Promise.all(ev.banners.map(b => deleteObject(b.ref)));
    } catch {}
    await remove(dbRef(db, `version12/Events/${ev.id}`));
    message.success('Event deleted');
    setLoading(false);
  };

  // Preview images
  const showPreview = (banners: Banner[]) => {
    setPreviewUrls(banners.map(b => b.url));
    setPreviewIndex(0);
    setPreviewVisible(true);
  };

  // Start uploading new banner in edit
  const startImageUpload = (idx: number, file: File) => {
    setUploading(true);
    const path = `events/${file.name}_${Date.now()}`;
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
        setEditBanners(prev => [...prev, { url, ref }]);
        message.success(`Image #${idx + 1} uploaded`);
        setUploading(false);
        setShowUploadModal(false);
      }
    );
    return false;
  };

  // Remove a banner in edit
  const removeEditBanner = async (i: number) => {
    const b = editBanners[i];
    try { await deleteObject(b.ref); } catch {}
    setEditBanners(prev => prev.filter((_, idx) => idx !== i));
  };

  // Open edit modal
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
    });
    setEditBanners(ev.banners);
    setEditVisible(true);
  };

  // Save edits
  const handleEditSave = async () => {
    if (!editing) return;
    const vals = await editForm.validateFields();
    const data = {
      title: encryptAES(vals.title),
      description: encryptAES(vals.description),
      organizer: encryptAES(vals.organizer),
      location: encryptAES(vals.location),
      date: encryptAES(vals.date.format('DD-MM-YYYY')),
      type: encryptAES(vals.type),
      applyLink: encryptAES(vals.applyLink),
      bannerUrls: editBanners.map(b => encryptAES(b.url)),
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
    { title: 'Title',       dataIndex: 'title',       key: 'title' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Organizer',   dataIndex: 'organizer',   key: 'organizer' },
    { title: 'Location',    dataIndex: 'location',    key: 'location' },
    { title: 'Date',        dataIndex: 'date',        key: 'date' },
    { title: 'Type',        dataIndex: 'type',        key: 'type' },
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
          <Button icon={<EyeOutlined />} onClick={() => showPreview(ev.banners)}>
            Preview
          </Button>
          <Button icon={<EditOutlined />} onClick={() => openEdit(ev)}>
            Edit
          </Button>
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
          style={{ width: 160 }}
          allowClear
        />
        <Input
          placeholder="Filter by Type"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ width: 160 }}
          allowClear
        />
        <DatePicker
          placeholder="Filter by Date"
          format="DD-MM-YYYY"
          value={filterDate}
          onChange={date => setFilterDate(date)}
          allowClear
          style={{ width: 160 }}
        />
        <Input
          placeholder="Filter by Organizer"
          value={filterOrganizer}
          onChange={e => setFilterOrganizer(e.target.value)}
          style={{ width: 160 }}
          allowClear
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
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
                  setPreviewIndex(i => (i === 0 ? previewUrls.length - 1 : i - 1))
                }
              />
              <Button
                icon={<RightOutlined />}
                onClick={() =>
                  setPreviewIndex(i => (i + 1) % previewUrls.length)
                }
              />
            </Space>
          )}
        </div>
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

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true }]}
          >
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

          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item
            name="applyLink"
            label="Apply Link"
            rules={[{ required: true }]}
          >
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
